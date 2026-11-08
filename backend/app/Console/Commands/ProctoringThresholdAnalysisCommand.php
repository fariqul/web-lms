<?php

namespace App\Console\Commands;

use App\Models\ProctoringCalibrationLog;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

/**
 * php artisan proctoring:threshold-analysis
 *
 * Read-only threshold analysis on human-labeled calibration rows.
 * Sweeps the continuous signals stored per snapshot (`face_analysis` JSON and
 * `risk_score_raw`) against the ground-truth columns to find the operating
 * point with the best frame-level F1.
 *
 * What can be swept depends on what AnalyzeSnapshotJob persisted:
 *   - head_turn : |head_yaw| / |head_pitch| (degrees)
 *   - eye_gaze  : eye_gaze_ratio (0–1)
 *   - risk_score: composite risk score from the Python service
 * Multi-face and object detection only have binary/rule-level data (detection
 * strings), so those are compared as rule variants, not confidence sweeps.
 * Identity mismatch cannot be evaluated here because face_distance is not
 * written to the calibration log.
 */
class ProctoringThresholdAnalysisCommand extends Command
{
    protected $signature = 'proctoring:threshold-analysis
                            {--exam=*           : Filter by exam_id (repeatable)}
                            {--from=            : captured_at >= DATE (Y-m-d)}
                            {--to=              : captured_at <= DATE (Y-m-d)}
                            {--indicator=*      : Batasi indikator: head_turn, eye_gaze, multi_face, object_detected, no_face, identity_mismatch, risk_score}
                            {--min-positives=5  : Minimum GT+ rows sebelum sweep ambang dijalankan}
                            {--top=5            : Jumlah operating point terbaik yang ditampilkan per sweep}
                            {--step-yaw=1       : Langkah sweep yaw (derajat)}
                            {--step-pitch=1     : Langkah sweep pitch (derajat)}
                            {--step-gaze=0.01   : Langkah sweep rasio gaze}
                            {--step-risk=1      : Langkah sweep risk_score}
                            {--output=          : Simpan semua titik sweep ke CSV (relatif ke storage/app)}';

    protected $description = 'Analisis ambang deteksi dari data calibration log berlabel (yaw/pitch, gaze, multi-face, objek, risk_score)';

    private const KNOWN_INDICATORS = [
        'head_turn',
        'eye_gaze',
        'multi_face',
        'object_detected',
        'no_face',
        'identity_mismatch',
        'risk_score',
    ];

    /** @var array<string, array{value:string, basis:string}> */
    private array $recommendations = [];

    public function handle(): int
    {
        $wanted = $this->wantedIndicators();
        if ($wanted === null) {
            return Command::FAILURE;
        }

        $rows = $this->loadRows();

        if ($rows->isEmpty()) {
            $this->warn('Tidak ada baris berlabel. Jalankan proctoring:import-labeling terlebih dahulu.');
            return Command::SUCCESS;
        }

        $this->printDatasetSummary($rows);

        $csv = [];

        if ($this->wants('head_turn', $wanted)) {
            $csv = array_merge($csv, $this->analyseHeadTurn($rows));
        }
        if ($this->wants('eye_gaze', $wanted)) {
            $csv = array_merge($csv, $this->analyseEyeGaze($rows));
        }
        if ($this->wants('multi_face', $wanted)) {
            $this->analyseMultiFace($rows);
        }
        if ($this->wants('object_detected', $wanted)) {
            $this->analyseObjectDetected($rows);
        }
        if ($this->wants('no_face', $wanted)) {
            $this->analyseNoFace($rows);
        }
        if ($this->wants('identity_mismatch', $wanted)) {
            $this->noteIdentity();
        }
        if ($this->wants('risk_score', $wanted)) {
            $csv = array_merge($csv, $this->analyseRiskScore($rows));
        }

        $this->printRecommendations();

        if ($this->option('output')) {
            $this->writeCsv($csv);
        }

        return Command::SUCCESS;
    }

    // ── Data loading ─────────────────────────────────────────────────────────

    private function loadRows(): Collection
    {
        // Only labeled rows: importing labels always fills the composite column,
        // so this keeps memory bounded on large unlabeled calibration tables.
        $query = ProctoringCalibrationLog::query()
            ->whereNotNull('ground_truth_is_violation');

        $exams = array_values(array_filter(array_map('intval', (array) $this->option('exam'))));
        if ($exams !== []) {
            $query->whereIn('exam_id', $exams);
        }

        if ($this->option('from')) {
            $query->where('captured_at', '>=', $this->option('from') . ' 00:00:00');
        }

        if ($this->option('to')) {
            $query->where('captured_at', '<=', $this->option('to') . ' 23:59:59');
        }

        return $query->orderBy('captured_at')
            ->get()
            ->map(fn (ProctoringCalibrationLog $row) => $this->normalise($row))
            ->values();
    }

    private function normalise(ProctoringCalibrationLog $row): array
    {
        $face = $row->face_analysis ?? [];
        $detections = array_values(array_filter($row->raw_detections ?? [], 'is_string'));

        $yaw = $this->floatOrNull($face['head_yaw'] ?? null);
        $pitch = $this->floatOrNull($face['head_pitch'] ?? null);

        // Logs written before 2026-11-05 have no pose_available key. Back then
        // failed mesh estimation stored 0.0 instead of null, so treat non-null
        // angles as measurable instead of discarding every legacy row.
        $hasPoseFlag = array_key_exists('pose_available', $face);

        return [
            'id' => $row->id,
            'exam_id' => $row->exam_id,
            'student_id' => $row->student_id,
            'captured_at' => $row->captured_at,
            'gt' => [
                'no_face' => $row->ground_truth_no_face,
                'multi_face' => $row->ground_truth_multi_face,
                'head_turn' => $row->ground_truth_head_turn,
                'eye_gaze' => $row->ground_truth_eye_gaze,
                'object_detected' => $row->ground_truth_object_detected,
                'identity_mismatch' => $row->ground_truth_identity_mismatch,
                'is_violation' => $row->ground_truth_is_violation,
            ],
            'ai' => [
                'no_face' => $row->ai_no_face,
                'multi_face' => $row->ai_multi_face,
                'head_turn' => $row->ai_head_turn,
                'eye_gaze' => $row->ai_eye_gaze,
                'object_detected' => $row->ai_object_detected,
                'identity_mismatch' => $row->ai_identity_mismatch,
                'is_violation' => $row->ai_is_violation,
            ],
            'risk_score' => (int) $row->risk_score_raw,
            'face_detected' => (bool) ($face['face_detected'] ?? false),
            'face_count' => (int) ($face['face_count'] ?? 0),
            'pose_available' => $hasPoseFlag
                ? (bool) $face['pose_available']
                : ($yaw !== null && $pitch !== null),
            'legacy_pose' => !$hasPoseFlag,
            'yaw' => $yaw,
            'pitch' => $pitch,
            'gaze_ratio' => $this->floatOrNull($face['eye_gaze_ratio'] ?? null),
            'detections' => $detections,
            'prohibited_names' => $this->prohibitedNames($detections),
            'person_count' => $this->personCount($detections),
        ];
    }

    private function floatOrNull(mixed $value): ?float
    {
        return is_numeric($value) ? (float) $value : null;
    }

    /**
     * @return array<int, string>
     */
    private function prohibitedNames(array $detections): array
    {
        $names = [];

        foreach ($detections as $detection) {
            if (!str_starts_with($detection, 'prohibited_object:')) {
                continue;
            }

            $payload = substr($detection, strlen('prohibited_object:'));
            foreach (explode(',', $payload) as $name) {
                $name = trim($name);
                if ($name !== '') {
                    $names[$name] = true;
                }
            }
        }

        return array_keys($names);
    }

    /**
     * YOLO only emits `multi_person:{n}` when person_count > 1.
     * Returns null when the string is absent (person_count 0 or 1).
     */
    private function personCount(array $detections): ?int
    {
        foreach ($detections as $detection) {
            if (preg_match('/^multi_person:(\d+)$/', $detection, $matches) === 1) {
                return (int) $matches[1];
            }
        }

        return null;
    }

    // ── Dataset summary ──────────────────────────────────────────────────────

    private function printDatasetSummary(Collection $rows): void
    {
        $n = $rows->count();
        $positives = $rows->filter(fn (array $r) => $r['gt']['is_violation'])->count();
        $flagged = $rows->filter(fn (array $r) => $r['ai']['is_violation'])->count();
        $first = $rows->first()['captured_at'];
        $last = $rows->last()['captured_at'];

        $this->newLine();
        $this->line('  <fg=cyan;options=bold>Analisis Ambang — Proctoring Calibration</>');
        $this->line('  ' . str_repeat('─', 64));
        $this->line("  Baris berlabel          : <fg=white>{$n}</> (ground_truth_is_violation terisi)");
        $this->line("  Violation / normal      : <fg=white>{$positives}</> / <fg=white>" . ($n - $positives) . '</>');
        $this->line("  AI flag (ai_is_violation): <fg=white>{$flagged}</> (" . round($flagged / max(1, $n) * 100, 1) . '%) — dataset sampling, bukan populasi');
        $this->line('  Exam                    : <fg=white>' . ($rows->pluck('exam_id')->unique()->sort()->implode(', ') ?: '-') . '</>');
        $this->line('  Siswa unik              : <fg=white>' . $rows->pluck('student_id')->unique()->count() . '</>');
        $this->line('  Rentang waktu           : <fg=white>' . ($first?->format('Y-m-d H:i') ?? '-') . '</> s.d. <fg=white>' . ($last?->format('Y-m-d H:i') ?? '-') . '</>');
        $this->line('  Ambang aktif            : yaw ' . config('proctoring.head_yaw_threshold') . '°, pitch ' . config('proctoring.head_pitch_threshold') . '°, gaze ' . config('proctoring.eye_gaze_threshold') . ', risk ≥ ' . config('proctoring.risk_score.violation_min'));
    }

    // ── Head turn ────────────────────────────────────────────────────────────

    private function analyseHeadTurn(Collection $rows): array
    {
        $labeled = $rows->filter(fn (array $r) => $r['gt']['head_turn'] !== null)->values();
        $n = $labeled->count();
        $positives = $labeled->filter(fn (array $r) => $r['gt']['head_turn'])->count();

        $this->section('HEAD TURN — Kepala Menoleh', $n, $positives);
        if ($n === 0) {
            $this->line('  Tidak ada baris dengan ground_truth_head_turn.');
            return [];
        }

        $stored = $this->evalRule($labeled, fn (array $r) => $r['ai']['head_turn'], 'head_turn');
        $this->printRuleTable([['ai_head_turn (keputusan tersimpan)', $stored]]);

        $anglesAvailable = $labeled->filter(fn (array $r) => $r['yaw'] !== null && $r['pitch'] !== null);
        $anglesAvailablePos = $anglesAvailable->filter(fn (array $r) => $r['gt']['head_turn'])->count();
        $this->line("  Yaw/pitch tersedia      : {$anglesAvailable->count()}/{$n} baris ({$anglesAvailablePos}/{$positives} GT+).");

        $legacy = $labeled->filter(fn (array $r) => $r['legacy_pose']);
        if ($legacy->isNotEmpty()) {
            $this->line("  Skema lama (tanpa pose_available): <fg=yellow>{$legacy->count()}</> baris — yaw/pitch 0.0 berarti pose gagal diukur, jadi pose tidak terukur bisa lebih banyak dari yang terdeteksi.");
        }

        $noPose = $labeled->filter(fn (array $r) => !$r['pose_available'] || $r['yaw'] === null || $r['pitch'] === null);
        if ($noPose->isNotEmpty()) {
            $noPosePos = $noPose->filter(fn (array $r) => $r['gt']['head_turn'])->count();
            $this->line("  Pose tidak terukur      : <fg=yellow>{$noPose->count()}</> baris ({$noPosePos} GT+) — tidak bisa dideteksi pada ambang apa pun.");
        }

        if ($positives < (int) $this->option('min-positives')) {
            $this->line('  <fg=yellow>Sweep dilewati: GT+ (' . $positives . ') di bawah --min-positives.</>');
            return [];
        }

        $points = $labeled->map(fn (array $r) => [
            'truth' => (bool) $r['gt']['head_turn'],
            'pose' => $r['pose_available'] && $r['yaw'] !== null && $r['pitch'] !== null,
            'yaw' => abs((float) ($r['yaw'] ?? 0)),
            'pitch' => abs((float) ($r['pitch'] ?? 0)),
        ])->values()->all();

        $yawCurrent = (float) config('proctoring.head_yaw_threshold', 38);
        $pitchCurrent = (float) config('proctoring.head_pitch_threshold', 33);
        $stepYaw = max(0.5, (float) $this->option('step-yaw'));
        $stepPitch = max(0.5, (float) $this->option('step-pitch'));

        $yawThresholds = $this->thresholds(5, 80, $stepYaw);
        $pitchThresholds = $this->thresholds(5, 75, $stepPitch);

        $yawSweep = $this->sweep(
            $points,
            $yawThresholds,
            fn (array $p, float $t) => $p['pose'] && ($p['yaw'] > $t || $p['pitch'] > $pitchCurrent),
        );
        $this->printSweep("Yaw sweep — pitch tetap {$pitchCurrent}°", $yawSweep, $yawCurrent, 1);

        $pitchSweep = $this->sweep(
            $points,
            $pitchThresholds,
            fn (array $p, float $t) => $p['pose'] && ($p['pitch'] > $t || $p['yaw'] > $yawCurrent),
        );
        $this->printSweep("Pitch sweep — yaw tetap {$yawCurrent}°", $pitchSweep, $pitchCurrent, 1);

        $joint = [];
        foreach ($yawThresholds as $yawThreshold) {
            foreach ($pitchThresholds as $pitchThreshold) {
                $counts = ['tp' => 0, 'tn' => 0, 'fp' => 0, 'fn' => 0];
                foreach ($points as $point) {
                    $predicted = $point['pose'] && ($point['yaw'] > $yawThreshold || $point['pitch'] > $pitchThreshold);
                    $this->tally($counts, $predicted, $point['truth']);
                }
                $joint[] = ['threshold' => $yawThreshold, 'threshold2' => $pitchThreshold] + $this->withMetrics($counts);
            }
        }
        $this->printJointSweep($joint, $yawCurrent, $pitchCurrent);

        $best = $this->bestJointCandidate($joint, $yawCurrent, $pitchCurrent);
        if ($best !== null) {
            $this->recommendations['HEAD_YAW_THRESHOLD'] = [
                'value' => $this->fmtNum($best['threshold'], 1),
                'basis' => $this->basis('head_turn', $best),
            ];
            $this->recommendations['HEAD_PITCH_THRESHOLD'] = [
                'value' => $this->fmtNum($best['threshold2'], 1),
                'basis' => $this->basis('head_turn', $best),
            ];
        }

        return array_merge(
            $this->sweepCsv('head_turn_yaw', $yawSweep),
            $this->sweepCsv('head_turn_pitch', $pitchSweep),
            $this->sweepCsv('head_turn_joint', $joint, true),
        );
    }

    // ── Eye gaze ─────────────────────────────────────────────────────────────

    private function analyseEyeGaze(Collection $rows): array
    {
        $labeled = $rows->filter(fn (array $r) => $r['gt']['eye_gaze'] !== null)->values();
        $n = $labeled->count();
        $positives = $labeled->filter(fn (array $r) => $r['gt']['eye_gaze'])->count();

        $this->section('EYE GAZE — Mata Menyimpang', $n, $positives);
        if ($n === 0) {
            $this->line('  Tidak ada baris dengan ground_truth_eye_gaze.');
            return [];
        }

        $withRatio = $labeled->filter(fn (array $r) => $r['gaze_ratio'] !== null);
        $positivesWithRatio = $withRatio->filter(fn (array $r) => $r['gt']['eye_gaze'])->count();
        $this->line("  Rasio gaze tersedia     : {$withRatio->count()}/{$n} baris ({$positivesWithRatio}/{$positives} GT+ terukur). Baris tanpa rasio tidak bisa dideteksi.");

        $stored = $this->evalRule($labeled, fn (array $r) => $r['ai']['eye_gaze'], 'eye_gaze');
        $this->printRuleTable([['ai_eye_gaze (keputusan tersimpan)', $stored]]);

        if ($positives < (int) $this->option('min-positives')) {
            $this->line('  <fg=yellow>Sweep dilewati: GT+ (' . $positives . ') di bawah --min-positives.</>');
            return [];
        }

        $points = $labeled->map(fn (array $r) => [
            'truth' => (bool) $r['gt']['eye_gaze'],
            'score' => $r['gaze_ratio'] ?? -1.0,
        ])->values()->all();

        $current = (float) config('proctoring.eye_gaze_threshold', 0.48);
        $step = max(0.005, (float) $this->option('step-gaze'));
        $sweep = $this->sweep(
            $points,
            $this->thresholds(0.10, 0.95, $step),
            fn (array $p, float $t) => $p['score'] > $t,
        );
        $this->printSweep('Sweep rasio deviasi gaze', $sweep, $current, 2);

        $best = $this->bestCandidate($sweep, $current);
        if ($best !== null) {
            $this->recommendations['EYE_GAZE_THRESHOLD'] = [
                'value' => $this->fmtNum($best['threshold'], 2),
                'basis' => $this->basis('eye_gaze', $best),
            ];
        }

        return $this->sweepCsv('eye_gaze', $sweep);
    }

    // ── Multi-face ───────────────────────────────────────────────────────────

    private function analyseMultiFace(Collection $rows): void
    {
        $labeled = $rows->filter(fn (array $r) => $r['gt']['multi_face'] !== null)->values();
        $n = $labeled->count();
        $positives = $labeled->filter(fn (array $r) => $r['gt']['multi_face'])->count();

        $this->section('MULTI-FACE — Wajah / Orang Ganda', $n, $positives);
        if ($n === 0) {
            $this->line('  Tidak ada baris dengan ground_truth_multi_face.');
            return;
        }

        $rules = [
            ['ai_multi_face (keputusan tersimpan)', fn (array $r) => $r['ai']['multi_face']],
            ['MediaPipe face_count > 1', fn (array $r) => $r['face_count'] > 1],
            ['MediaPipe face_count > 2', fn (array $r) => $r['face_count'] > 2],
            ['YOLO person_count > 1', fn (array $r) => $r['person_count'] !== null],
            ['face_count > 1 AND person_count > 1', fn (array $r) => $r['face_count'] > 1 && $r['person_count'] !== null],
            ['face_count > 1 OR person_count > 1', fn (array $r) => $r['face_count'] > 1 || $r['person_count'] !== null],
        ];

        $table = [];
        foreach ($rules as [$label, $predicate]) {
            $table[] = [$label, $this->evalRule($labeled, $predicate, 'multi_face')];
        }
        $this->printRuleTable($table);

        $personDetected = $labeled->filter(fn (array $r) => $r['person_count'] !== null)->count();
        $this->line("  YOLO person_count > 1   : {$personDetected} baris. Confidence/bbox tidak tersimpan, jadi sweep ambang confidence tidak bisa dilakukan.");
    }

    // ── Object detection ─────────────────────────────────────────────────────

    private function analyseObjectDetected(Collection $rows): void
    {
        $labeled = $rows->filter(fn (array $r) => $r['gt']['object_detected'] !== null)->values();
        $n = $labeled->count();
        $positives = $labeled->filter(fn (array $r) => $r['gt']['object_detected'])->count();

        $this->section('OBJECT DETECTED — Objek Terlarang / Mencurigakan', $n, $positives);
        if ($n === 0) {
            $this->line('  Tidak ada baris dengan ground_truth_object_detected.');
            return;
        }

        $this->printRuleTable([
            ['ai_object_detected (prohibited ATAU suspicious)', $this->evalRule($labeled, fn (array $r) => $r['ai']['object_detected'], 'object_detected')],
            ['Hanya prohibited_object (nama kelas tersimpan)', $this->evalRule($labeled, fn (array $r) => $r['prohibited_names'] !== [], 'object_detected')],
        ]);

        $suspiciousOnly = $labeled->filter(fn (array $r) => $r['ai']['object_detected'] && $r['prohibited_names'] === []);
        if ($suspiciousOnly->isNotEmpty()) {
            $suspiciousPositives = $suspiciousOnly->filter(fn (array $r) => $r['gt']['object_detected'])->count();
            $verdict = $suspiciousPositives === 0
                ? 'semuanya false positive.'
                : 'sebagian valid.';
            $this->line("  Deteksi suspicious-only (tanpa nama kelas): {$suspiciousOnly->count()} baris, {$suspiciousPositives} GT+ → {$verdict}");
        }

        $stats = [];
        foreach ($labeled as $row) {
            foreach ($row['prohibited_names'] as $name) {
                $stats[$name] ??= ['rows' => 0, 'pos' => 0, 'neg' => 0];
                $stats[$name]['rows']++;
                if ($row['gt']['object_detected']) {
                    $stats[$name]['pos']++;
                } else {
                    $stats[$name]['neg']++;
                }
            }
        }

        if ($stats !== []) {
            uasort($stats, fn (array $a, array $b) => $b['rows'] <=> $a['rows']);

            $classTable = [];
            foreach (array_slice($stats, 0, 15, true) as $name => $stat) {
                $classTable[] = [
                    $name,
                    $stat['rows'],
                    $stat['pos'],
                    $stat['neg'],
                    $this->pct($this->div($stat['pos'], $stat['rows'])),
                ];
            }

            $this->newLine();
            $this->line('  <fg=white;options=bold>Kelas objek yang muncul (prohibited)</>  <fg=gray>(satu baris bisa memuat beberapa kelas)</>');
            $this->table(['Kelas', 'Baris', 'GT+', 'GT−', 'Presisi kelas'], $classTable);
        } else {
            $this->line('  Tidak ada string prohibited_object: di data ini — nama kelas objek tidak tersedia.');
        }

        $this->line('  Catatan: confidence/bbox YOLO tidak disimpan di calibration log, jadi sweep ambang confidence tidak bisa dilakukan dari data ini.');
    }

    // ── No face ──────────────────────────────────────────────────────────────

    private function analyseNoFace(Collection $rows): void
    {
        $labeled = $rows->filter(fn (array $r) => $r['gt']['no_face'] !== null)->values();
        $n = $labeled->count();
        $positives = $labeled->filter(fn (array $r) => $r['gt']['no_face'])->count();

        $this->section('NO FACE — Wajah Tidak Terdeteksi', $n, $positives);
        if ($n === 0) {
            $this->line('  Tidak ada baris dengan ground_truth_no_face.');
            return;
        }

        $this->printRuleTable([
            ['ai_no_face (keputusan tersimpan)', $this->evalRule($labeled, fn (array $r) => $r['ai']['no_face'], 'no_face')],
        ]);
        $this->line('  Aturan ini biner (wajah terdeteksi / tidak) — tidak ada ambang kontinu untuk di-sweep.');
    }

    // ── Identity ─────────────────────────────────────────────────────────────

    private function noteIdentity(): void
    {
        $this->newLine();
        $this->line('  <fg=cyan;options=bold>IDENTITY MISMATCH — Identitas Tidak Cocok</>');
        $this->line('  ' . str_repeat('─', 64));
        $this->line('  <fg=yellow>Dilewati:</> face_distance tidak disimpan di proctoring_calibration_logs.');
        $this->line('  Evaluasi identitas harus lewat eksperimen terkontrol (baseline vs penyusup), bukan snapshot ujian biasa.');
    }

    // ── Composite risk score ─────────────────────────────────────────────────

    private function analyseRiskScore(Collection $rows): array
    {
        $labeled = $rows->filter(fn (array $r) => $r['gt']['is_violation'] !== null)->values();
        $n = $labeled->count();
        $positives = $labeled->filter(fn (array $r) => $r['gt']['is_violation'])->count();

        $this->section('RISK SCORE — Violation Komposit', $n, $positives);
        if ($n === 0) {
            return [];
        }

        $stored = $this->evalRule($labeled, fn (array $r) => $r['ai']['is_violation'], 'is_violation');
        $this->printRuleTable([['ai_is_violation (keputusan tersimpan)', $stored]]);

        if ($positives < (int) $this->option('min-positives')) {
            $this->line('  <fg=yellow>Sweep dilewati: GT+ (' . $positives . ') di bawah --min-positives.</>');
            return [];
        }

        $points = $labeled->map(fn (array $r) => [
            'truth' => (bool) $r['gt']['is_violation'],
            'score' => (float) $r['risk_score'],
        ])->values()->all();

        $current = (float) config('proctoring.risk_score.violation_min', 20);
        $step = max(1.0, (float) $this->option('step-risk'));
        $maxScore = (float) max(array_column($points, 'score'));

        $sweep = $this->sweep(
            $points,
            $this->thresholds(0, max(20, $maxScore), $step),
            fn (array $p, float $t) => $p['score'] >= $t,
        );
        $this->printSweep('Sweep risk_score', $sweep, $current, 0, 'prediksi = risk_score ≥ ambang');

        $best = $this->bestCandidate($sweep, $current);
        if ($best !== null) {
            $this->recommendations['PROCTORING_RISK_VIOLATION_MIN'] = [
                'value' => $this->fmtNum($best['threshold'], 0),
                'basis' => $this->basis('is_violation', $best),
            ];
        }

        $this->line('  Catatan: risk_score dihitung dari ambang indikator saat snapshot dianalisis; jika ambang indikator diubah, distribusi skor ikut berubah.');

        return $this->sweepCsv('risk_score', $sweep);
    }

    // ── Metric helpers ───────────────────────────────────────────────────────

    private function evalRule(Collection $rows, callable $predicate, string $truthKey): array
    {
        $counts = ['tp' => 0, 'tn' => 0, 'fp' => 0, 'fn' => 0];

        foreach ($rows as $row) {
            $truth = $row['gt'][$truthKey];
            if ($truth === null) {
                continue;
            }
            $this->tally($counts, (bool) $predicate($row), $truth);
        }

        return $this->withMetrics($counts);
    }

    private function tally(array &$counts, bool $predicted, bool $truth): void
    {
        if ($predicted && $truth) {
            $counts['tp']++;
        } elseif ($predicted) {
            $counts['fp']++;
        } elseif ($truth) {
            $counts['fn']++;
        } else {
            $counts['tn']++;
        }
    }

    private function withMetrics(array $counts): array
    {
        $counts['n'] = $counts['tp'] + $counts['tn'] + $counts['fp'] + $counts['fn'];
        $counts['accuracy'] = $this->div($counts['tp'] + $counts['tn'], $counts['n']);
        $counts['precision'] = $this->div($counts['tp'], $counts['tp'] + $counts['fp']);
        $counts['recall'] = $this->div($counts['tp'], $counts['tp'] + $counts['fn']);
        $counts['f1'] = $this->div(2 * $counts['precision'] * $counts['recall'], $counts['precision'] + $counts['recall']);

        return $counts;
    }

    /**
     * @param array<int, array{truth:bool, ...}> $points
     * @param array<int, float>                  $thresholds
     */
    private function sweep(array $points, array $thresholds, callable $predicate): array
    {
        $sweep = [];

        foreach ($thresholds as $threshold) {
            $counts = ['tp' => 0, 'tn' => 0, 'fp' => 0, 'fn' => 0];
            foreach ($points as $point) {
                $this->tally($counts, (bool) $predicate($point, $threshold), $point['truth']);
            }
            $sweep[] = ['threshold' => $threshold] + $this->withMetrics($counts);
        }

        return $sweep;
    }

    /**
     * @return array<int, float>
     */
    private function thresholds(float $from, float $to, float $step): array
    {
        if ($step <= 0) {
            $step = 1.0;
        }

        $count = (int) floor(($to - $from) / $step + 1e-9);
        $thresholds = [];

        for ($i = 0; $i <= $count; $i++) {
            $thresholds[] = round($from + $i * $step, 4);
        }

        return $thresholds;
    }

    private function div(float $numerator, float $denominator): float
    {
        return $denominator <= 0 ? 0.0 : $numerator / $denominator;
    }

    // ── Sweep ranking / display ──────────────────────────────────────────────

    /**
     * Collapse thresholds that produce the same confusion matrix into one
     * operating point (median threshold), then rank by F1.
     */
    private function rankSweep(array $sweep): array
    {
        if ($sweep === []) {
            return [];
        }

        $groups = [];
        foreach ($sweep as $row) {
            $groups[$this->signature($row)][] = $row;
        }

        $ranked = [];
        foreach ($groups as $group) {
            $values = array_map(fn (array $r) => (float) $r['threshold'], $group);
            sort($values);

            $row = $group[0];
            $row['threshold'] = $values[intdiv(count($values) - 1, 2)];
            $row['plateau_min'] = $values[0];
            $row['plateau_max'] = $values[count($values) - 1];
            $ranked[] = $row;
        }

        usort($ranked, fn (array $a, array $b) => [
            $b['f1'], $b['precision'], $b['recall'], $a['threshold'],
        ] <=> [
            $a['f1'], $a['precision'], $a['recall'], $b['threshold'],
        ]);

        return $ranked;
    }

    private function rankJoint(array $sweep): array
    {
        if ($sweep === []) {
            return [];
        }

        $groups = [];
        foreach ($sweep as $row) {
            $groups[$this->signature($row)][] = $row;
        }

        $ranked = [];
        foreach ($groups as $group) {
            $yaws = array_map(fn (array $r) => (float) $r['threshold'], $group);
            $pitches = array_map(fn (array $r) => (float) $r['threshold2'], $group);
            sort($yaws);
            sort($pitches);

            $row = $group[0];
            $row['threshold'] = $yaws[intdiv(count($yaws) - 1, 2)];
            $row['threshold2'] = $pitches[intdiv(count($pitches) - 1, 2)];
            $row['plateau_min'] = [$yaws[0], $pitches[0]];
            $row['plateau_max'] = [$yaws[count($yaws) - 1], $pitches[count($pitches) - 1]];
            $ranked[] = $row;
        }

        usort($ranked, fn (array $a, array $b) => [
            $b['f1'], $b['precision'], $b['recall'], $a['threshold'], $a['threshold2'],
        ] <=> [
            $a['f1'], $a['precision'], $a['recall'], $b['threshold'], $b['threshold2'],
        ]);

        return $ranked;
    }

    private function signature(array $row): string
    {
        return $row['tp'] . '|' . $row['tn'] . '|' . $row['fp'] . '|' . $row['fn'];
    }

    /**
     * Pick the best-F1 operating point whose threshold is closest to the
     * current setting. Avoids recommending arbitrary values from a wide plateau.
     */
    private function bestCandidate(array $sweep, float $current): ?array
    {
        $ranked = $this->rankSweep($sweep);
        if ($ranked === []) {
            return null;
        }

        $bestSignature = $this->signature($ranked[0]);
        $candidates = array_values(array_filter(
            $sweep,
            fn (array $row) => $this->signature($row) === $bestSignature,
        ));

        usort($candidates, fn (array $a, array $b) => [
            abs((float) $a['threshold'] - $current), $a['threshold'],
        ] <=> [
            abs((float) $b['threshold'] - $current), $b['threshold'],
        ]);

        return $candidates[0] ?? $ranked[0];
    }

    private function bestJointCandidate(array $joint, float $yawCurrent, float $pitchCurrent): ?array
    {
        $ranked = $this->rankJoint($joint);
        if ($ranked === []) {
            return null;
        }

        $bestSignature = $this->signature($ranked[0]);
        $candidates = array_values(array_filter(
            $joint,
            fn (array $row) => $this->signature($row) === $bestSignature,
        ));

        usort($candidates, fn (array $a, array $b) => [
            abs((float) $a['threshold'] - $yawCurrent) + abs((float) $a['threshold2'] - $pitchCurrent),
            $a['threshold'],
            $a['threshold2'],
        ] <=> [
            abs((float) $b['threshold'] - $yawCurrent) + abs((float) $b['threshold2'] - $pitchCurrent),
            $b['threshold'],
            $b['threshold2'],
        ]);

        return $candidates[0] ?? $ranked[0];
    }

    private function printSweep(
        string $title,
        array $sweep,
        float $current,
        int $decimals,
        string $ruleLabel = 'prediksi = sinyal > ambang',
    ): void {
        $ranked = $this->rankSweep($sweep);
        if ($ranked === []) {
            return;
        }

        $top = max(1, (int) $this->option('top'));

        // Within the best-F1 plateau, keep the threshold closest to the
        // current config so an already-optimal setting is not changed for no gain.
        $best = $this->bestCandidate($sweep, $current) ?? $ranked[0];
        $currentRow = $this->closestThresholdRow($sweep, $current);
        $bestIsCurrent = $currentRow !== null
            && abs((float) $best['threshold'] - $current) < 1e-9
            && $this->signature($best) === $this->signature($currentRow);

        $note = '★ terbaik';
        if ($ranked[0]['plateau_min'] !== $ranked[0]['plateau_max']) {
            $note .= ' (plateau ' . $this->fmtNum((float) $ranked[0]['plateau_min'], $decimals)
                . '–' . $this->fmtNum((float) $ranked[0]['plateau_max'], $decimals) . ')';
        }
        if ($bestIsCurrent) {
            $note .= ' · ambang aktif';
        }

        $table = [$this->sweepTableRow($best, $decimals, $note)];

        foreach (array_slice($ranked, 1, max(0, $top - 1)) as $row) {
            $table[] = $this->sweepTableRow($row, $decimals, '');
        }

        if ($currentRow !== null && !$bestIsCurrent) {
            $currentRow['threshold'] = $current;
            $table[] = $this->sweepTableRow($currentRow, $decimals, 'aktif');
        }

        $this->newLine();
        $this->line('  <fg=white;options=bold>' . $title . '</>  <fg=gray>(' . $ruleLabel . ')</>');
        $this->table(['Ambang', 'TP', 'TN', 'FP', 'FN', 'Presisi', 'Recall', 'F1', 'Catatan'], $table);
    }

    private function printJointSweep(array $joint, float $yawCurrent, float $pitchCurrent): void
    {
        $ranked = $this->rankJoint($joint);
        if ($ranked === []) {
            return;
        }

        $top = max(1, (int) $this->option('top'));

        $best = $this->bestJointCandidate($joint, $yawCurrent, $pitchCurrent) ?? $ranked[0];
        $currentRow = $this->closestJointRow($joint, $yawCurrent, $pitchCurrent);
        $bestIsCurrent = $currentRow !== null
            && abs((float) $best['threshold'] - $yawCurrent) < 1e-9
            && abs((float) $best['threshold2'] - $pitchCurrent) < 1e-9;

        $table = [[
            $this->fmtNum($best['threshold'], 1),
            $this->fmtNum($best['threshold2'], 1),
            $best['tp'],
            $best['tn'],
            $best['fp'],
            $best['fn'],
            $this->pct($best['precision']),
            $this->pct($best['recall']),
            $this->pct($best['f1']),
            $bestIsCurrent ? '★ terbaik · ambang aktif' : '★ terbaik',
        ]];

        foreach (array_slice($ranked, 1, max(0, $top - 1)) as $row) {
            $table[] = [
                $this->fmtNum($row['threshold'], 1),
                $this->fmtNum($row['threshold2'], 1),
                $row['tp'],
                $row['tn'],
                $row['fp'],
                $row['fn'],
                $this->pct($row['precision']),
                $this->pct($row['recall']),
                $this->pct($row['f1']),
                '',
            ];
        }

        if ($currentRow !== null && !$bestIsCurrent) {
            $table[] = [
                $this->fmtNum($yawCurrent, 1),
                $this->fmtNum($pitchCurrent, 1),
                $currentRow['tp'],
                $currentRow['tn'],
                $currentRow['fp'],
                $currentRow['fn'],
                $this->pct($currentRow['precision']),
                $this->pct($currentRow['recall']),
                $this->pct($currentRow['f1']),
                'aktif',
            ];
        }

        $this->newLine();
        $this->line('  <fg=white;options=bold>Joint sweep — yaw × pitch</>  <fg=gray>(prediksi = |yaw| > ambang ATAU |pitch| > ambang)</>');
        $this->table(['Yaw', 'Pitch', 'TP', 'TN', 'FP', 'FN', 'Presisi', 'Recall', 'F1', 'Catatan'], $table);
    }

    private function sweepTableRow(array $row, int $decimals, string $note): array
    {
        return [
            $this->fmtNum((float) $row['threshold'], $decimals),
            $row['tp'],
            $row['tn'],
            $row['fp'],
            $row['fn'],
            $this->pct($row['precision']),
            $this->pct($row['recall']),
            $this->pct($row['f1']),
            $note,
        ];
    }

    private function closestThresholdRow(array $sweep, float $current): ?array
    {
        $closest = null;
        $bestDiff = PHP_FLOAT_MAX;

        foreach ($sweep as $row) {
            $diff = abs((float) $row['threshold'] - $current);
            if ($diff < $bestDiff) {
                $bestDiff = $diff;
                $closest = $row;
            }
        }

        return $closest;
    }

    private function closestJointRow(array $joint, float $yaw, float $pitch): ?array
    {
        $closest = null;
        $bestDiff = PHP_FLOAT_MAX;

        foreach ($joint as $row) {
            $diff = abs((float) $row['threshold'] - $yaw) + abs((float) $row['threshold2'] - $pitch);
            if ($diff < $bestDiff) {
                $bestDiff = $diff;
                $closest = $row;
            }
        }

        return $closest;
    }

    // ── Output helpers ───────────────────────────────────────────────────────

    private function section(string $title, int $n, int $positives): void
    {
        $this->newLine();
        $this->line('  <fg=cyan;options=bold>' . $title . '</>');
        $this->line('  ' . str_repeat('─', 64));
        $this->line("  Baris berlabel: <fg=white>{$n}</>  |  GT positif: <fg=white>{$positives}</>  |  GT negatif: <fg=white>" . ($n - $positives) . '</>');
    }

    /**
     * @param array<int, array{0:string, 1:array}> $rules
     */
    private function printRuleTable(array $rules): void
    {
        $table = [];

        foreach ($rules as [$label, $metrics]) {
            $table[] = [
                $label,
                $metrics['tp'],
                $metrics['tn'],
                $metrics['fp'],
                $metrics['fn'],
                $this->pct($metrics['precision']),
                $this->pct($metrics['recall']),
                $this->pct($metrics['f1']),
                $this->pct($metrics['accuracy']),
            ];
        }

        $this->table(['Aturan', 'TP', 'TN', 'FP', 'FN', 'Presisi', 'Recall', 'F1', 'Akurasi'], $table);
    }

    private function printRecommendations(): void
    {
        if ($this->recommendations === []) {
            return;
        }

        $table = [];
        foreach ($this->recommendations as $key => $recommendation) {
            $table[] = [$key, $recommendation['value'], $recommendation['basis']];
        }

        $this->newLine();
        $this->line('  <fg=cyan;options=bold>Rekomendasi ambang (F1 maksimum pada data ini)</>');
        $this->line('  ' . str_repeat('─', 64));
        $this->table(['ENV', 'Nilai', 'Dasar'], $table);
        $this->line('  <fg=yellow>Peringatan:</> ambang dipilih in-sample pada dataset sampling yang diperkaya. Validasi ulang pada data/hold-out lain sebelum dijadikan default produksi.');
    }

    private function basis(string $label, array $metrics): string
    {
        $basis = sprintf(
            '%s: F1 %.1f%%, presisi %.1f%%, recall %.1f%% (TP %d / FP %d / FN %d, n=%d)',
            $label,
            $metrics['f1'] * 100,
            $metrics['precision'] * 100,
            $metrics['recall'] * 100,
            $metrics['tp'],
            $metrics['fp'],
            $metrics['fn'],
            $metrics['n'],
        );

        if ($metrics['f1'] < 0.5) {
            $basis .= ' ⚠ F1 rendah — sinyal tidak terpisah baik';
        }

        return $basis;
    }

    private function pct(float $value): string
    {
        $percent = round($value * 100, 1);

        if ($percent >= 90) {
            return "<fg=green>{$percent}%</>";
        }
        if ($percent >= 70) {
            return "<fg=yellow>{$percent}%</>";
        }

        return "<fg=red>{$percent}%</>";
    }

    private function fmtNum(float $value, int $decimals): string
    {
        return number_format($value, $decimals, '.', '');
    }

    // ── CSV / option helpers ─────────────────────────────────────────────────

    private function sweepCsv(string $name, array $sweep, bool $joint = false): array
    {
        return array_map(fn (array $row) => [
            'sweep' => $name,
            'threshold' => $row['threshold'],
            'threshold_2' => $joint ? $row['threshold2'] : null,
            'tp' => $row['tp'],
            'tn' => $row['tn'],
            'fp' => $row['fp'],
            'fn' => $row['fn'],
            'accuracy' => $row['accuracy'],
            'precision' => $row['precision'],
            'recall' => $row['recall'],
            'f1' => $row['f1'],
            'n' => $row['n'],
        ], $sweep);
    }

    private function writeCsv(array $rows): void
    {
        $path = (string) $this->option('output');
        $absolute = preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $path) === 1;
        $fullPath = $absolute ? $path : storage_path('app/' . $path);

        $directory = dirname($fullPath);
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $handle = fopen($fullPath, 'w');
        if (!$handle) {
            $this->error("Tidak bisa menulis {$fullPath}");
            return;
        }

        fputcsv($handle, ['sweep', 'threshold', 'threshold_2', 'tp', 'tn', 'fp', 'fn', 'accuracy', 'precision', 'recall', 'f1', 'n']);

        foreach ($rows as $row) {
            fputcsv($handle, [
                $row['sweep'],
                $row['threshold'],
                $row['threshold_2'] ?? '',
                $row['tp'],
                $row['tn'],
                $row['fp'],
                $row['fn'],
                round($row['accuracy'], 4),
                round($row['precision'], 4),
                round($row['recall'], 4),
                round($row['f1'], 4),
                $row['n'],
            ]);
        }

        fclose($handle);

        $this->newLine();
        $this->info('CSV sweep ditulis: ' . ($absolute ? $fullPath : 'storage/app/' . $path) . ' (' . count($rows) . ' baris)');
    }

    /**
     * @return array<int, string>|null null = invalid selection
     */
    private function wantedIndicators(): ?array
    {
        $requested = array_values(array_filter(array_map('strval', (array) $this->option('indicator'))));
        if ($requested === []) {
            return [];
        }

        $valid = [];
        foreach ($requested as $name) {
            if (!in_array($name, self::KNOWN_INDICATORS, true)) {
                $this->warn("Indikator tidak dikenal: {$name}");
                continue;
            }
            $valid[] = $name;
        }

        if ($valid === []) {
            $this->error('Tidak ada indikator valid. Pilihan: ' . implode(', ', self::KNOWN_INDICATORS));
            return null;
        }

        return array_values(array_unique($valid));
    }

    private function wants(string $name, array $wanted): bool
    {
        return $wanted === [] || in_array($name, $wanted, true);
    }
}
