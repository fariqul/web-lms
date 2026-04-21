<?php

namespace App\Jobs;

use App\Models\MonitoringSnapshot;
use App\Models\ProctoringAlert;
use App\Models\ProctoringScore;
use App\Services\SocketBroadcastService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class AnalyzeSnapshotJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const ALERT_DEDUP_WINDOW_SECONDS_DEFAULT = 15;

    public int $tries = 2;
    public int $timeout = 30;

    public function __construct(
        private int $snapshotId,
        private int $examId,
        private int $studentId,
        private int $examResultId,
    ) {
        $this->onQueue('proctoring');
    }

    public function handle(): void
    {
        $snapshot = MonitoringSnapshot::find($this->snapshotId);
        if (!$snapshot) {
            Log::warning("[Proctoring] Snapshot {$this->snapshotId} not found");
            return;
        }

        $proctoringUrl = config('services.proctoring.url', 'http://proctoring:8001');

        try {
            // Read the snapshot image from storage
            $imagePath = $snapshot->image_path;
            if (!Storage::disk('public')->exists($imagePath)) {
                Log::warning("[Proctoring] Image file not found: {$imagePath}");
                return;
            }

            $imageContents = Storage::disk('public')->get($imagePath);

            // Determine MIME type from file extension
            $ext = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION));
            $mimeMap = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
            $mimeType = $mimeMap[$ext] ?? 'image/jpeg';

            // Send to YOLO proctoring service
            /** @var \Illuminate\Http\Client\Response $response */
            $response = Http::timeout(20)
                ->attach('image', $imageContents, basename($imagePath), ['Content-Type' => $mimeType])
                ->post("{$proctoringUrl}/analyze");

            if (!$response->successful()) {
                $statusCode = $response->status();
                Log::warning("[Proctoring] Service returned {$statusCode}");

                if ($statusCode >= 500) {
                    throw new \RuntimeException("Proctoring service temporary failure: {$statusCode}");
                }

                return;
            }

            $result = $response->json();

            // Store analysis result on snapshot
            $snapshot->update([
                'analysis_result' => $result,
            ]);

            // Parse the detections array for easy processing
            $detections = $result['detections'] ?? [];

            // Create alerts for prohibited objects
            if (!empty($result['prohibited_objects'])) {
                foreach ($result['prohibited_objects'] as $obj) {
                    $this->createAlertIfNotDuplicate('object_detected', [
                        'exam_id' => $this->examId,
                        'student_id' => $this->studentId,
                        'snapshot_id' => $this->snapshotId,
                        'type' => 'object_detected',
                        'severity' => 'alert',
                        'description' => "Objek terlarang terdeteksi: {$obj['class_name']}",
                        'confidence' => $obj['confidence'] ?? 0,
                        'details' => $obj,
                    ]);
                }
            }

            // Alert for multiple persons
            if (($result['person_count'] ?? 0) > 1) {
                $this->createAlertIfNotDuplicate('multi_face', [
                    'exam_id' => $this->examId,
                    'student_id' => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type' => 'multi_face',
                    'severity' => 'alert',
                    'description' => "{$result['person_count']} orang terdeteksi oleh AI",
                    'confidence' => 0.9,
                    'details' => ['person_count' => $result['person_count']],
                ]);
            }

            // Alert for no face (camera blocked/covered)
            $faceAnalysis = $result['face_analysis'] ?? null;
            if ($faceAnalysis && !($faceAnalysis['face_detected'] ?? true)) {
                $this->createAlertIfNotDuplicate('no_face', [
                    'exam_id' => $this->examId,
                    'student_id' => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type' => 'no_face',
                    'severity' => 'warning',
                    'description' => 'Wajah tidak terdeteksi — kamera tertutup atau tidak menghadap kamera',
                    'confidence' => 0.85,
                    'details' => ['face_analysis' => $faceAnalysis],
                ]);
            }

            // Alert for head turning / looking away
            if ($faceAnalysis && ($faceAnalysis['is_looking_away'] ?? false)) {
                $direction = $faceAnalysis['looking_direction'] ?? 'unknown';
                $dirLabels = ['left' => 'kiri', 'right' => 'kanan', 'up' => 'atas', 'down' => 'bawah'];
                $dirLabel = $dirLabels[$direction] ?? $direction;
                $yaw = $faceAnalysis['head_yaw'] ?? 0;
                $pitch = $faceAnalysis['head_pitch'] ?? 0;

                $this->createAlertIfNotDuplicate('head_turn', [
                    'exam_id' => $this->examId,
                    'student_id' => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type' => 'head_turn',
                    'severity' => 'warning',
                    'description' => "Kepala menoleh ke {$dirLabel} (yaw: {$yaw}°, pitch: {$pitch}°)",
                    'confidence' => 0.8,
                    'details' => [
                        'direction' => $direction,
                        'head_yaw' => $yaw,
                        'head_pitch' => $pitch,
                    ],
                ]);
            }

            // Alert for eye gaze deviation
            if ($faceAnalysis && ($faceAnalysis['is_gaze_deviated'] ?? false)) {
                $gazeRatio = $faceAnalysis['eye_gaze_ratio'] ?? 0;
                $this->createAlertIfNotDuplicate('eye_gaze', [
                    'exam_id' => $this->examId,
                    'student_id' => $this->studentId,
                    'snapshot_id' => $this->snapshotId,
                    'type' => 'eye_gaze',
                    'severity' => 'info',
                    'description' => "Pandangan mata menyimpang (deviasi: " . round($gazeRatio * 100) . "%)",
                    'confidence' => 0.7,
                    'details' => ['gaze_ratio' => $gazeRatio],
                ]);
            }

            // Update proctoring score
            $this->updateProctoringScore($result);

            // Broadcast alert to monitoring page if risk is notable
            $riskScore = $result['risk_score'] ?? 0;
            $detections = $result['detections'] ?? [];
            if ($riskScore >= 15 || !empty($detections)) {
                $severity = 'info';
                if ($riskScore >= 60) $severity = 'critical';
                elseif ($riskScore >= 30) $severity = 'warning';

                app(SocketBroadcastService::class)->broadcast(
                    "exam.{$this->examId}.proctor-alert",
                    [
                        'student_id' => $this->studentId,
                        'risk_score' => $riskScore,
                        'severity' => $severity,
                        'message' => $result['message'] ?? 'Aktivitas mencurigakan terdeteksi',
                        'detections' => $detections,
                        'face_analysis' => $result['face_analysis'] ?? null,
                        'snapshot_id' => $this->snapshotId,
                    ]
                );
            }

        } catch (\Exception $e) {
            Log::error("[Proctoring] Analysis failed for snapshot {$this->snapshotId}: {$e->getMessage()}");
            throw $e;
        }
    }

    private function updateProctoringScore(array $result): void
    {
        $score = ProctoringScore::firstOrCreate(
            ['exam_result_id' => $this->examResultId],
            [
                'student_id' => $this->studentId,
                'exam_id' => $this->examId,
            ]
        );

        $score->total_snapshots++;
        $score->total_analyzed++;

        // Update object detection score
        $prohibitedCount = count($result['prohibited_objects'] ?? []);
        if ($prohibitedCount > 0) {
            $score->object_detected_count += $prohibitedCount;
            $score->object_detection_score = min(100, $score->object_detection_score + ($prohibitedCount * 15));
        }

        // Update multi-person score from YOLO
        $personCount = $result['person_count'] ?? 0;
        if ($personCount > 1) {
            $score->multi_face_count++;
            $score->multi_face_score = min(100, $score->multi_face_score + 10);
        }

        // Face analysis scores (from MediaPipe)
        $faceAnalysis = $result['face_analysis'] ?? null;
        if ($faceAnalysis) {
            // No face / camera blocked
            if (!($faceAnalysis['face_detected'] ?? true)) {
                $score->no_face_count = ($score->no_face_count ?? 0) + 1;
                $score->no_face_score = min(100, ($score->no_face_score ?? 0) + 15);
            }

            // Head turning away
            if ($faceAnalysis['is_looking_away'] ?? false) {
                $score->head_turn_count = ($score->head_turn_count ?? 0) + 1;
                $score->head_turn_score = min(100, ($score->head_turn_score ?? 0) + 8);
            }

            // Eye gaze deviation
            if ($faceAnalysis['is_gaze_deviated'] ?? false) {
                $score->eye_gaze_count = ($score->eye_gaze_count ?? 0) + 1;
                $score->eye_gaze_score = min(100, ($score->eye_gaze_score ?? 0) + 5);
            }

            // Multi-face from MediaPipe (supplements YOLO)
            if (($faceAnalysis['face_count'] ?? 0) > 1 && $personCount <= 1) {
                $score->multi_face_count++;
                $score->multi_face_score = min(100, $score->multi_face_score + 10);
            }
        }

        // Recalculate total score (weighted average)
        $score->total_score = $this->calculateTotalScore($score);
        $score->risk_level = $this->calculateRiskLevel($score->total_score);

        $score->save();
    }

    private function calculateTotalScore(ProctoringScore $score): int
    {
        // Weighted scoring: object detection and identity have highest weight
        $weights = [
            'object_detection' => 0.25,
            'identity_mismatch' => 0.20,
            'multi_face' => 0.20,
            'no_face' => 0.10,
            'head_turn' => 0.10,
            'eye_gaze' => 0.05,
            'tab_switch' => 0.10,
        ];

        $total = 0;
        $total += $score->object_detection_score * $weights['object_detection'];
        $total += $score->identity_mismatch_score * $weights['identity_mismatch'];
        $total += $score->multi_face_score * $weights['multi_face'];
        $total += $score->no_face_score * $weights['no_face'];
        $total += $score->head_turn_score * $weights['head_turn'];
        $total += $score->eye_gaze_score * $weights['eye_gaze'];
        $total += $score->tab_switch_score * $weights['tab_switch'];

        return min(100, (int) round($total));
    }

    private function calculateRiskLevel(int $totalScore): string
    {
        if ($totalScore >= 75) return 'critical';
        if ($totalScore >= 50) return 'high';
        if ($totalScore >= 25) return 'medium';
        return 'low';
    }

    private function getAlertDedupWindowSeconds(): int
    {
        return max(1, (int) env('ALERT_DEDUP_WINDOW_SECONDS', self::ALERT_DEDUP_WINDOW_SECONDS_DEFAULT));
    }

    private function shouldEmitAlert(string $type, ?int $seconds = null): bool
    {
        $windowSeconds = max(1, (int) ($seconds ?? $this->getAlertDedupWindowSeconds()));

        return !ProctoringAlert::query()
            ->where('exam_id', $this->examId)
            ->where('student_id', $this->studentId)
            ->where('type', $type)
            ->where('created_at', '>=', now()->subSeconds($windowSeconds))
            ->exists();
    }

    private function createAlertIfNotDuplicate(string $type, array $payload): void
    {
        if (!$this->shouldEmitAlert($type)) {
            return;
        }

        ProctoringAlert::create($payload);
    }
}
