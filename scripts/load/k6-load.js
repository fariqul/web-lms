import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Load test baca-saja untuk LMS. Jangan jalankan terhadap ujian berjalan
// dengan akun siswa asli: login ulang mencabut sesi mereka (DEVICE_LIMIT/force).

const BASE_URL = __ENV.BASE_URL;
if (!BASE_URL) {
  throw new Error('BASE_URL wajib diisi, mis. $env:BASE_URL="http://192.168.1.10"');
}

const EXAM_ID = __ENV.EXAM_ID || '';
const MAX_VUS = 60;
const accounts = JSON.parse(open('./accounts.json'));

export const throttled = new Rate('http_429');

export const options = {
  scenarios: {
    siswa: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '2m', target: MAX_VUS },
        { duration: '2m', target: MAX_VUS },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    http_429: ['rate<0.01'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

export function setup() {
  if (accounts.length < MAX_VUS) {
    console.warn(
      `Hanya ${accounts.length} akun untuk ${MAX_VUS} VU. Token akan dipakai bersama; ` +
        'tambahkan akun uji agar tiap VU punya sesi sendiri.',
    );
  }

  const tokens = accounts.map((account) => {
    const res = http.post(
      `${BASE_URL}/api/login`,
      JSON.stringify({ login: account.login, password: account.password }),
      { headers: JSON_HEADERS, tags: { name: 'login' } },
    );

    const token = res.status === 200 ? res.json('data.token') : null;
    if (!token) {
      throw new Error(`Login gagal untuk ${account.login}: HTTP ${res.status} ${res.body}`);
    }
    return token;
  });

  return { tokens };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };

  const endpoints = [
    ['dashboard', '/api/dashboard/siswa'],
    ['exams', '/api/exams'],
    ['notifications', '/api/notifications/unread-count'],
    ['snapshot-status', '/api/snapshot-monitor/status'],
  ];

  if (EXAM_ID) {
    endpoints.push(['time-sync', `/api/exams/${EXAM_ID}/time-sync`]);
  }

  for (const [name, path] of endpoints) {
    const res = http.get(`${BASE_URL}${path}`, { headers, tags: { name } });
    throttled.add(res.status === 429);

    check(res, {
      [`${name} 200`]: (r) => r.status === 200,
      [`${name} bukan 429`]: (r) => r.status !== 429,
    });

    sleep(0.5 + Math.random());
  }

  sleep(2 + Math.random() * 3);
}
