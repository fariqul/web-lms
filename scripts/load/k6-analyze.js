import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Stress test /analyze (proctoring service). Jalankan hanya saat ujian mati:
// service memakai satu uvicorn worker, jadi request konkuren akan mengantre.
//
// 1. Salin ±20 frame ke scripts/load/images/ (JANGAN di-commit).
// 2. Isi scripts/load/analyze-manifest.json (lihat analyze-manifest.example.json).
// 3. Rekam baseline sekali: BASELINE=1 k6 run k6-analyze.js
//    Salin signature yang dicetak ke analyze-manifest.json.
// 4. Jalankan stress test normal.

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) {
  throw new Error('BASE_URL wajib diisi, mis. $env:BASE_URL="http://localhost:8001"');
}

const BASELINE = __ENV.BASELINE === '1';
const manifest = JSON.parse(open('./analyze-manifest.json'));
const images = manifest.images.map((entry) => ({
  file: entry.file,
  name: entry.file.split('/').pop(),
  signature: entry.signature || null,
  data: open('./' + entry.file, 'b'),
}));

if (images.length === 0) {
  throw new Error('analyze-manifest.json tidak berisi gambar.');
}

const hasBaseline = images.some((img) => img.signature !== null);

const decisionMatch = new Rate('decision_match');
const analyzeErrors = new Rate('analyze_errors');
const processingMs = new Trend('analyze_processing_ms');

const loadScenarios = {
  analyze: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 1 },
      { duration: '1m', target: 3 },
      { duration: '1m', target: 6 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
};

const thresholds = {
  checks: ['rate>0.99'],
  http_req_failed: ['rate<0.01'],
  analyze_errors: ['rate<0.01'],
  http_req_duration: ['p(95)<5000'],
};

if (hasBaseline) {
  thresholds.decision_match = ['rate>0.99'];
}

export const options = BASELINE
  ? {
      scenarios: {
        baseline: {
          executor: 'per-vu-iterations',
          vus: 1,
          iterations: 1,
          exec: 'baselineRun',
        },
      },
    }
  : {
      scenarios: loadScenarios,
      thresholds,
    };

function parseBody(res) {
  try {
    return res.json();
  } catch (e) {
    return null;
  }
}

function signature(body) {
  const fa = body.face_analysis || {};
  const detections = (body.detections || []).slice().sort().join(';');
  const prohibited = (body.prohibited_objects || [])
    .map((o) => o.class_name)
    .filter(Boolean)
    .sort()
    .join(';');
  const suspicious = (body.suspicious_objects || [])
    .map((o) => o.class_name)
    .filter(Boolean)
    .sort()
    .join(';');

  return [
    fa.face_detected ? 1 : 0,
    Number(fa.face_count || 0),
    fa.is_looking_away ? 1 : 0,
    fa.is_gaze_deviated ? 1 : 0,
    Number(body.person_count || 0),
    detections,
    prohibited,
    suspicious,
  ].join('|');
}

function analyze(image) {
  const res = http.post(
    `${BASE_URL}/analyze`,
    { image: http.file(image.data, image.name, 'image/jpeg') },
    { tags: { name: 'analyze', image: image.file }, timeout: '90s' },
  );

  const body = res.status === 200 ? parseBody(res) : null;
  const ok = body !== null && body.face_analysis != null;

  analyzeErrors.add(!ok);

  check(res, {
    'analyze 200': (r) => r.status === 200,
    'face_analysis ada': () => ok,
  });

  if (!ok) {
    return;
  }

  if (typeof body.processing_time_ms === 'number') {
    processingMs.add(body.processing_time_ms);
  }

  if (image.signature !== null) {
    decisionMatch.add(signature(body) === image.signature);
  }
}

export function baselineRun() {
  for (const image of images) {
    const res = http.post(
      `${BASE_URL}/analyze`,
      { image: http.file(image.data, image.name, 'image/jpeg') },
      { timeout: '90s' },
    );

    const body = res.status === 200 ? parseBody(res) : null;
    if (body === null) {
      console.error(`${image.file}\tHTTP ${res.status}`);
      continue;
    }

    console.log(`${image.file}\t${signature(body)}`);
  }
}

export default function () {
  const image = images[(__VU - 1 + __ITER) % images.length];

  analyze(image);

  sleep(0.2);
}
