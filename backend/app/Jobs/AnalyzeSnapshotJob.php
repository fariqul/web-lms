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

    public int $tries = 2;
    public int $timeout = 30;

    public function __construct(
        private int $snapshotId,
        private int $examId,
        private int $studentId,
        private int $examResultId,
    ) {}

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
                Log::warning("[Proctoring] Service returned {$response->status()}");
                return;
            }

            $result = $response->json();

            // Store analysis result on snapshot
            $snapshot->update([
                'analysis_result' => $result,
            ]);

            // Create alerts for prohibited objects
            if (!empty($result['prohibited_objects'])) {
                foreach ($result['prohibited_objects'] as $obj) {
                    ProctoringAlert::create([
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
                ProctoringAlert::create([
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

            // Update proctoring score
            $this->updateProctoringScore($result);

            // Broadcast alert to monitoring page if risk is high
            $riskScore = $result['risk_score'] ?? 0;
            if ($riskScore >= 30) {
                $severity = $riskScore >= 60 ? 'critical' : 'warning';
                app(SocketBroadcastService::class)->broadcast(
                    "exam.{$this->examId}.proctor-alert",
                    [
                        'student_id' => $this->studentId,
                        'risk_score' => $riskScore,
                        'severity' => $severity,
                        'message' => $result['message'] ?? 'Aktivitas mencurigakan terdeteksi',
                        'snapshot_id' => $this->snapshotId,
                    ]
                );
            }

        } catch (\Exception $e) {
            Log::error("[Proctoring] Analysis failed for snapshot {$this->snapshotId}: {$e->getMessage()}");
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

        // Update multi-person score from YOLO (supplements browser face detection)
        $personCount = $result['person_count'] ?? 0;
        if ($personCount > 1) {
            $score->multi_face_count++;
            $score->multi_face_score = min(100, $score->multi_face_score + 10);
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
}
