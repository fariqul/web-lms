<?php

namespace App\Jobs;

use App\Models\MonitoringSnapshot;
use App\Models\ProctoringAlert;
use App\Models\ProctoringCalibrationLog;
use App\Models\ProctoringScore;
use App\Models\ExamResult;
use App\Services\SocketBroadcastService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Primary AI proctoring analysis job.
 *
 * All numeric thresholds, weights, and increments are read from
 * config/proctoring.php (which maps to .env vars) — nothing hardcoded.
 *
 * Queued on the "proctoring" pool so it never blocks exam/answer jobs.
 */
class AnalyzeSnapshotJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries   = 2;
    public int $timeout = 30;

    private bool   $isBaseline  = false;
    private string $baselinePath = '';

    public function __construct(
        private int $snapshotId,
        private int $examId,
        private int $studentId,
        private int $examResultId,
    ) {
        $this->onQueue('proctoring');
    }

    // ─── Named constructor for baseline-only extraction ──────────────────────

    /**
     * Dispatch in baseline mode: call Python, extract face embedding, store on ExamResult.
     * snapshotId is unused (set to 0); no MonitoringSnapshot row is needed.
     */
    public static function forBaseline(
        int    $examId,
        int    $studentId,
        int    $examResultId,
        string $imagePath,
    ): static {
        $job               = new static(0, $examId, $studentId, $examResultId);
        $job->isBaseline   = true;
        $job->baselinePath = $imagePath;
        return $job;
    }

    // ─── handle ──────────────────────────────────────────────────────────────

    public function handle(): void
    {
        $proctoringUrl = config('proctoring.service_url', 'http://proctoring:8001');

        if ($this->isBaseline) {
            $this->handleBaseline($proctoringUrl);
            return;
        }

        $snapshot = MonitoringSnapshot::find($this->snapshotId);
        if (!$snapshot) {
            Log::warning("[Proctoring] Snapshot {$this->snapshotId} not found");
            return;
        }

        try {
            // ── 1. Read image ─────────────────────────────────────────────
            $imagePath = $snapshot->image_path;
            if (!Storage::disk('public')->exists($imagePath)) {
                Log::warning("[Proctoring] Image not found: {$imagePath}");
                return;
            }

            $imageContents = Storage::disk('public')->get($imagePath);
            $ext      = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));
            $mimeMap  = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
            $mimeType = $mimeMap[$ext] ?? 'image/jpeg';

            // ── 2. Call Python microservice ───────────────────────────────
            /** @var \Illuminate\Http\Client\Response $response */
            $response = Http::timeout(20)
                ->attach('image', $imageContents, basename($imagePath), ['Content-Type' => $mimeType])
                ->post("{$proctoringUrl}/analyze");

            if (!$response->successful()) {
                $statusCode = $response->status();
                Log::warning("[Proctoring] Service returned {$statusCode} for snapshot {$this->snapshotId}");
                if ($statusCode >= 500) {
                    throw new \RuntimeException("Proctoring service failure: {$statusCode}");
                }
                return;
            }

            $result = $response->json();

            // ── 3. Persist result + set is_violation ──────────────────────
            $riskScore   = (int) ($result['risk_score'] ?? 0);
            $isViolation = $riskScore >= config('proctoring.risk_score.violation_min', 20);

            $snapshot->update([
                'analysis_result' => $result,
                'is_violation'    => $isViolation,
            ]);

            // ── 4. Create per-type deduplicated ProctoringAlert records ───
            $faceAnalysis = $result['face_analysis'] ?? null;

            // 4a. Prohibited objects
            foreach ($result['prohibited_objects'] ?? [] as $obj) {
                $objectClass = (string) ($obj['class_name'] ?? 'unknown');
                $this->createAlertIfNotDuplicate('object_detected', [
                    'exam_id'     => $this->examId,
                    'student_id'  => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type'        => 'object_detected',
                    'severity'    => 'alert',
                    'description' => "Objek terlarang terdeteksi: {$objectClass}",
                    'confidence'  => $obj['confidence'] ?? 0,
                    'details'     => $obj,
                ], $objectClass);
            }

            // 4a2. Suspicious (non-prohibited) objects — lower severity, for audit trail
            foreach ($result['suspicious_objects'] ?? [] as $obj) {
                // Skip if already captured as prohibited
                $isProhibited = collect($result['prohibited_objects'] ?? [])
                    ->contains(fn ($p) => ($p['class_name'] ?? '') === ($obj['class_name'] ?? ''));
                if ($isProhibited) continue;

                $objectClass = (string) ($obj['class_name'] ?? 'unknown');
                $this->createAlertIfNotDuplicate('object_suspicious', [
                    'exam_id'     => $this->examId,
                    'student_id'  => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type'        => 'object_suspicious',
                    'severity'    => 'info',
                    'description' => "Objek mencurigakan terdeteksi: {$objectClass}",
                    'confidence'  => $obj['confidence'] ?? 0,
                    'details'     => $obj,
                ], 'suspicious_' . $objectClass);
            }

            // 4b. Multiple persons (YOLO)
            if (($result['person_count'] ?? 0) > 1) {
                $this->createAlertIfNotDuplicate('multi_face', [
                    'exam_id'     => $this->examId,
                    'student_id'  => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type'        => 'multi_face',
                    'severity'    => 'alert',
                    'description' => "{$result['person_count']} orang terdeteksi oleh AI",
                    'confidence'  => 0.9,
                    'details'     => ['person_count' => $result['person_count']],
                ]);
            }

            // 4c. No face
            if ($faceAnalysis && !($faceAnalysis['face_detected'] ?? true)) {
                $this->createAlertIfNotDuplicate('no_face', [
                    'exam_id'     => $this->examId,
                    'student_id'  => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type'        => 'no_face',
                    'severity'    => 'warning',
                    'description' => 'Wajah tidak terdeteksi — kamera tertutup atau tidak menghadap kamera',
                    'confidence'  => 0.85,
                    'details'     => ['face_analysis' => $faceAnalysis],
                ]);
            }

            // 4d. Head turning
            if ($faceAnalysis && ($faceAnalysis['is_looking_away'] ?? false)) {
                $direction = $faceAnalysis['looking_direction'] ?? 'unknown';
                $dirLabels = ['left' => 'kiri', 'right' => 'kanan', 'up' => 'atas', 'down' => 'bawah'];
                $dirLabel  = $dirLabels[$direction] ?? $direction;
                $yaw       = $faceAnalysis['head_yaw']   ?? 0;
                $pitch     = $faceAnalysis['head_pitch']  ?? 0;

                $this->createAlertIfNotDuplicate('head_turn', [
                    'exam_id'     => $this->examId,
                    'student_id'  => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type'        => 'head_turn',
                    'severity'    => 'warning',
                    'description' => "Kepala menoleh ke {$dirLabel} (yaw: {$yaw}°, pitch: {$pitch}°)",
                    'confidence'  => 0.8,
                    'details'     => ['direction' => $direction, 'head_yaw' => $yaw, 'head_pitch' => $pitch],
                ]);
            }

            // 4e. Eye gaze deviation
            if ($faceAnalysis && ($faceAnalysis['is_gaze_deviated'] ?? false)) {
                $gazeRatio = $faceAnalysis['eye_gaze_ratio'] ?? 0;
                $this->createAlertIfNotDuplicate('eye_gaze', [
                    'exam_id'     => $this->examId,
                    'student_id'  => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type'        => 'eye_gaze',
                    'severity'    => 'info',
                    'description' => "Pandangan mata menyimpang (deviasi: " . round($gazeRatio * 100) . "%)",
                    'confidence'  => 0.7,
                    'details'     => ['gaze_ratio' => $gazeRatio],
                ]);
            }

            // ── 5. Update cumulative ProctoringScore (all from config) ────
            $this->updateProctoringScore($result);

            // ── 6. Baseline face verification ─────────────────────────────
            $this->checkBaselineFaceMatch($result);

            // ── 7. Write calibration log (for kalibrasi & evaluasi) ───────
            $this->writeCalibrationLog($result, $riskScore, $isViolation, $snapshot);

            // ── 8. Broadcast real-time alert ──────────────────────────────
            $alertAnyMin  = config('proctoring.risk_score.alert_any_min',  15);
            $alertHighMin = config('proctoring.risk_score.alert_high_min', 30);
            $alertCritMin = config('proctoring.risk_score.alert_crit_min', 60);
            $detections   = $result['detections'] ?? [];

            if ($riskScore >= $alertAnyMin || !empty($detections)) {
                $severity = 'info';
                if ($riskScore >= $alertCritMin) {
                    $severity = 'critical';
                } elseif ($riskScore >= $alertHighMin) {
                    $severity = 'warning';
                }

                app(SocketBroadcastService::class)->broadcast(
                    "exam.{$this->examId}.proctor-alert",
                    [
                        'student_id'    => $this->studentId,
                        'risk_score'    => $riskScore,
                        'is_violation'  => $isViolation,
                        'severity'      => $severity,
                        'message'       => $result['message'] ?? 'Aktivitas mencurigakan terdeteksi',
                        'detections'    => $detections,
                        'face_analysis' => $result['face_analysis'] ?? null,
                        'snapshot_id'   => $this->snapshotId,
                    ]
                );
            }

        } catch (\Exception $e) {
            Log::error("[Proctoring] Analysis failed for snapshot {$this->snapshotId}: {$e->getMessage()}");
            throw $e;
        }
    }

    // ─── Baseline extraction ─────────────────────────────────────────────────

    private function handleBaseline(string $proctoringUrl): void
    {
        $imagePath = $this->baselinePath;

        if (!Storage::disk('public')->exists($imagePath)) {
            Log::warning("[Proctoring] Baseline image not found: {$imagePath}");
            return;
        }

        $imageContents = Storage::disk('public')->get($imagePath);
        $ext      = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));
        $mimeMap  = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        $mimeType = $mimeMap[$ext] ?? 'image/jpeg';

        try {
            $response = Http::timeout(20)
                ->attach('image', $imageContents, basename($imagePath), ['Content-Type' => $mimeType])
                ->post("{$proctoringUrl}/analyze");

            if (!$response->successful()) {
                Log::error("[Proctoring] Baseline service error: " . $response->body());
                return;
            }

            $result      = $response->json();
            $faceAnalysis = $result['face_analysis'] ?? [];
            $embedding   = $faceAnalysis['face_embedding'] ?? null;

            $examResult = ExamResult::find($this->examResultId);
            if (!$examResult) return;

            if ($embedding) {
                $examResult->update([
                    'baseline_face_embedding' => json_encode($embedding),
                    'baseline_captured_at'    => now(),
                ]);
                Log::info("[Proctoring] Baseline saved for exam_result {$this->examResultId}");
            } else {
                Log::warning("[Proctoring] No face embedding in baseline for exam_result {$this->examResultId}");
            }
        } catch (\Exception $e) {
            Log::error("[Proctoring] Baseline failed for exam_result {$this->examResultId}: {$e->getMessage()}");
            throw $e;
        }
    }

    // ─── Calibration log ─────────────────────────────────────────────────────

    /**
     * Write one calibration log row for every analyzed snapshot.
     * Fail-safe: errors are caught and logged, never re-thrown.
     * Calibration mode can be disabled via env PROCTORING_CALIBRATION_ENABLED=false.
     */
    private function writeCalibrationLog(
        array             $result,
        int               $riskScore,
        bool              $isViolation,
        MonitoringSnapshot $snapshot,
    ): void {
        // Allow operators to disable calibration logging in production to save space.
        if (!config('proctoring.calibration.enabled', true)) {
            return;
        }

        try {
            $faceAnalysis = $result['face_analysis'] ?? null;
            $inc          = config('proctoring.score_increments');

            // Derive per-indicator binary decisions from result
            $aiNoFace           = $faceAnalysis ? !($faceAnalysis['face_detected'] ?? true) : false;
            $aiMultiFace        = ($result['person_count'] ?? 0) > 1
                                  || (($faceAnalysis['face_count'] ?? 0) > 1);
            $aiHeadTurn         = (bool) ($faceAnalysis['is_looking_away']  ?? false);
            $aiEyeGaze          = (bool) ($faceAnalysis['is_gaze_deviated'] ?? false);
            $aiObjectDetected   = count($result['prohibited_objects'] ?? []) > 0
                                  || count($result['suspicious_objects'] ?? []) > 0;
            $aiIdentityMismatch = in_array('identity_mismatch', $result['detections'] ?? [], true);

            // Per-indicator raw score contribution (not the cumulative ProctoringScore)
            $noFaceRaw           = $aiNoFace           ? (int) ($inc['no_face']         ?? 15) : 0;
            $multiFaceRaw        = $aiMultiFace        ? (int) ($inc['multi_face']       ?? 10) : 0;
            $headTurnRaw         = $aiHeadTurn         ? (int) ($inc['head_turn']        ?? 8)  : 0;
            $eyeGazeRaw          = $aiEyeGaze          ? (int) ($inc['eye_gaze']         ?? 5)  : 0;
            $objectDetectionRaw  = $aiObjectDetected   ? (int) ($inc['object_per_item']  ?? 15) : 0;
            $identityMismatchRaw = $aiIdentityMismatch ? (int) ($inc['identity_base']    ?? 30) : 0;

            ProctoringCalibrationLog::create([
                'exam_id'        => $this->examId,
                'student_id'     => $this->studentId,
                'snapshot_id'    => $this->snapshotId ?: null,
                'exam_result_id' => $this->examResultId,

                'no_face_raw'           => $noFaceRaw,
                'multi_face_raw'        => $multiFaceRaw,
                'head_turn_raw'         => $headTurnRaw,
                'eye_gaze_raw'          => $eyeGazeRaw,
                'object_detection_raw'  => $objectDetectionRaw,
                'identity_mismatch_raw' => $identityMismatchRaw,
                'risk_score_raw'        => $riskScore,
                'total_score'           => $this->calculateTotalScoreFromResult($result),

                'ai_no_face'           => $aiNoFace,
                'ai_multi_face'        => $aiMultiFace,
                'ai_head_turn'         => $aiHeadTurn,
                'ai_eye_gaze'          => $aiEyeGaze,
                'ai_object_detected'   => $aiObjectDetected,
                'ai_identity_mismatch' => $aiIdentityMismatch,
                'ai_is_violation'      => $isViolation,

                // Ground truth starts null — filled later by human reviewer
                'ground_truth_no_face'           => null,
                'ground_truth_multi_face'        => null,
                'ground_truth_head_turn'         => null,
                'ground_truth_eye_gaze'          => null,
                'ground_truth_object_detected'   => null,
                'ground_truth_identity_mismatch' => null,
                'ground_truth_is_violation'      => null,

                'scenario_label'    => null,  // set manually in calibration sessions
                'processing_time_ms' => isset($result['processing_time_ms'])
                                        ? (int) round($result['processing_time_ms'])
                                        : null,
                'raw_detections'    => $result['detections'] ?? [],
                'face_analysis'     => $faceAnalysis,
                'risk_level'        => $this->calculateRiskLevel(
                    $this->calculateTotalScoreFromResult($result)
                ),
                'captured_at'       => $snapshot->captured_at ?? now(),
            ]);
        } catch (\Throwable $e) {
            // Calibration log is supplementary — never fail the main job
            Log::warning("[Proctoring] Failed to write calibration log for snapshot {$this->snapshotId}: {$e->getMessage()}");
        }
    }

    /**
     * Calculate a one-off weighted total score from a raw result array,
     * without needing a ProctoringScore model instance.
     */
    private function calculateTotalScoreFromResult(array $result): int
    {
        $w   = config('proctoring.score_weights');
        $inc = config('proctoring.score_increments');
        $fa  = $result['face_analysis'] ?? null;

        $scores = [
            'object_detection'  => count($result['prohibited_objects'] ?? []) > 0
                                    ? (int) ($inc['object_per_item'] ?? 15) : 0,
            'identity_mismatch' => in_array('identity_mismatch', $result['detections'] ?? [], true)
                                    ? (int) ($inc['identity_base'] ?? 30) : 0,
            'multi_face'        => ($result['person_count'] ?? 0) > 1
                                    ? (int) ($inc['multi_face'] ?? 10) : 0,
            'no_face'           => ($fa && !($fa['face_detected'] ?? true))
                                    ? (int) ($inc['no_face'] ?? 15) : 0,
            'head_turn'         => ($fa && ($fa['is_looking_away'] ?? false))
                                    ? (int) ($inc['head_turn'] ?? 8) : 0,
            'eye_gaze'          => ($fa && ($fa['is_gaze_deviated'] ?? false))
                                    ? (int) ($inc['eye_gaze'] ?? 5) : 0,
            'tab_switch'        => 0,  // not available in snapshot context
        ];

        $total = 0;
        foreach ($scores as $key => $val) {
            $total += $val * (float) ($w[$key] ?? 0);
        }

        return min(100, (int) round($total));
    }

    // ─── ProctoringScore update (all increments from config) ─────────────────

    private function updateProctoringScore(array $result): void
    {
        $score = ProctoringScore::firstOrCreate(
            ['exam_result_id' => $this->examResultId],
            ['student_id' => $this->studentId, 'exam_id' => $this->examId]
        );

        $inc = config('proctoring.score_increments');

        $score->total_snapshots++;
        $score->total_analyzed++;

        // Object detection
        $prohibitedCount = count($result['prohibited_objects'] ?? []);
        if ($prohibitedCount > 0) {
            $score->object_detected_count  += $prohibitedCount;
            $score->object_detection_score  = min(100, $score->object_detection_score + ($prohibitedCount * (int) ($inc['object_per_item'] ?? 15)));
        }

        // Multi-face (YOLO)
        $personCount = $result['person_count'] ?? 0;
        if ($personCount > 1) {
            $score->multi_face_count++;
            $score->multi_face_score = min(100, $score->multi_face_score + (int) ($inc['multi_face'] ?? 10));
        }

        // Face analysis (MediaPipe)
        $faceAnalysis = $result['face_analysis'] ?? null;
        if ($faceAnalysis) {
            if (!($faceAnalysis['face_detected'] ?? true)) {
                $score->no_face_count = ($score->no_face_count ?? 0) + 1;
                $score->no_face_score = min(100, ($score->no_face_score ?? 0) + (int) ($inc['no_face'] ?? 15));
            }

            if ($faceAnalysis['is_looking_away'] ?? false) {
                $score->head_turn_count = ($score->head_turn_count ?? 0) + 1;
                $score->head_turn_score = min(100, ($score->head_turn_score ?? 0) + (int) ($inc['head_turn'] ?? 8));
            }

            if ($faceAnalysis['is_gaze_deviated'] ?? false) {
                $score->eye_gaze_count = ($score->eye_gaze_count ?? 0) + 1;
                $score->eye_gaze_score = min(100, ($score->eye_gaze_score ?? 0) + (int) ($inc['eye_gaze'] ?? 5));
            }

            // Multi-face from MediaPipe (supplements YOLO person_count)
            if (($faceAnalysis['face_count'] ?? 0) > 1 && $personCount <= 1) {
                $score->multi_face_count++;
                $score->multi_face_score = min(100, $score->multi_face_score + (int) ($inc['multi_face'] ?? 10));
            }
        }

        $score->total_score = $this->calculateTotalScore($score);
        $score->risk_level  = $this->calculateRiskLevel($score->total_score);
        $score->save();
    }

    private function calculateTotalScore(ProctoringScore $score): int
    {
        $w = config('proctoring.score_weights');

        $total = 0;
        $total += ($score->object_detection_score  ?? 0) * (float) ($w['object_detection']  ?? 0.25);
        $total += ($score->identity_mismatch_score ?? 0) * (float) ($w['identity_mismatch'] ?? 0.20);
        $total += ($score->multi_face_score        ?? 0) * (float) ($w['multi_face']        ?? 0.20);
        $total += ($score->no_face_score           ?? 0) * (float) ($w['no_face']           ?? 0.10);
        $total += ($score->head_turn_score         ?? 0) * (float) ($w['head_turn']         ?? 0.10);
        $total += ($score->eye_gaze_score          ?? 0) * (float) ($w['eye_gaze']          ?? 0.05);
        $total += ($score->tab_switch_score        ?? 0) * (float) ($w['tab_switch']        ?? 0.10);

        return min(100, (int) round($total));
    }

    private function calculateRiskLevel(int $totalScore): string
    {
        $l = config('proctoring.risk_level');

        if ($totalScore >= (int) ($l['critical_min'] ?? 76)) return 'critical';
        if ($totalScore >= (int) ($l['high_min']     ?? 51)) return 'high';
        if ($totalScore >= (int) ($l['medium_min']   ?? 26)) return 'medium';
        return 'low';
    }

    // ─── Alert deduplication ─────────────────────────────────────────────────

    private function shouldEmitAlert(string $type, string $fingerprint = 'default'): bool
    {
        $windowSeconds = config('proctoring.alert_dedup_window_seconds', 15);
        $cacheKey = 'proctoring:alert:dedup:'
            . "{$this->examId}:{$this->studentId}:{$type}:"
            . md5($fingerprint);

        return Cache::add($cacheKey, true, now()->addSeconds($windowSeconds));
    }

    private function createAlertIfNotDuplicate(string $type, array $payload, string $fingerprint = 'default'): void
    {
        if (!$this->shouldEmitAlert($type, $fingerprint)) return;
        ProctoringAlert::create($payload);
    }

    // ─── Baseline face verification ──────────────────────────────────────────

    private function checkBaselineFaceMatch(array $result): void
    {
        $faceAnalysis = $result['face_analysis'] ?? null;
        if (!$faceAnalysis || !($faceAnalysis['face_detected'] ?? false)) return;

        $currentEmbedding = $faceAnalysis['face_embedding'] ?? null;
        if (!$currentEmbedding || !is_array($currentEmbedding)) return;

        $examResult = ExamResult::find($this->examResultId);
        if (!$examResult) return;

        // Auto-capture first face as baseline
        if (!$examResult->baseline_face_embedding) {
            $examResult->baseline_face_embedding = json_encode($currentEmbedding);
            $examResult->baseline_captured_at    = now();
            $examResult->save();
            Log::info("[Proctoring] Auto-captured baseline for exam_result {$this->examResultId}");
            return;
        }

        $baselineEmbedding = json_decode($examResult->baseline_face_embedding, true);
        if (!is_array($baselineEmbedding)) {
            Log::warning("[Proctoring] Invalid baseline for exam_result {$this->examResultId}");
            return;
        }

        $similarity = $this->calculateCosineSimilarity($baselineEmbedding, $currentEmbedding);
        $threshold  = config('proctoring.face_similarity_threshold', 0.6);

        if ($similarity < $threshold) {
            $confidencePct = round((1 - $similarity) * 100, 1);

            $this->createAlertIfNotDuplicate('identity_mismatch', [
                'exam_id'     => $this->examId,
                'student_id'  => $this->studentId,
                'snapshot_id' => $this->snapshotId,
                'type'        => 'identity_mismatch',
                'severity'    => 'critical',
                'description' => "Wajah tidak cocok dengan baseline — kemungkinan pergantian orang ({$confidencePct}% berbeda)",
                'confidence'  => 1 - $similarity,
                'details'     => [
                    'similarity'           => round($similarity, 4),
                    'threshold'            => $threshold,
                    'baseline_captured_at' => $examResult->baseline_captured_at?->toIso8601String(),
                ],
            ], 'identity_' . date('YmdHi'));

            // Bump identity_mismatch_score
            $score = ProctoringScore::where('exam_result_id', $this->examResultId)->first();
            if ($score) {
                $inc = config('proctoring.score_increments.identity_base', 30);
                $score->identity_mismatch_count = ($score->identity_mismatch_count ?? 0) + 1;
                $score->identity_mismatch_score = min(100, ($score->identity_mismatch_score ?? 0) + (int) $inc);
                $score->total_score = $this->calculateTotalScore($score);
                $score->risk_level  = $this->calculateRiskLevel($score->total_score);
                $score->save();
            }

            Log::warning("[Proctoring] Identity mismatch exam_result {$this->examResultId}: similarity={$similarity}");
        }
    }

    private function calculateCosineSimilarity(array $a, array $b): float
    {
        if (count($a) !== count($b)) return 0.0;

        $dot = $mag1 = $mag2 = 0.0;
        foreach ($a as $i => $val) {
            $dot  += $val * $b[$i];
            $mag1 += $val ** 2;
            $mag2 += $b[$i] ** 2;
        }

        $mag1 = sqrt($mag1);
        $mag2 = sqrt($mag2);

        return ($mag1 == 0 || $mag2 == 0) ? 0.0 : $dot / ($mag1 * $mag2);
    }
}
