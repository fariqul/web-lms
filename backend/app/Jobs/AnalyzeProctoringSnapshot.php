<?php

namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use App\Models\ExamResult;
use App\Models\MonitoringSnapshot;
use App\Models\Student;
use App\Services\SocketBroadcastService;

class AnalyzeProctoringSnapshot implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $examId;
    public $studentId;
    public $imagePath;
    public $isBaseline;

    /**
     * Create a new job instance.
     */
    public function __construct($examId, $studentId, $imagePath, $isBaseline = false)
    {
        $this->examId = $examId;
        $this->studentId = $studentId;
        $this->imagePath = $imagePath;
        $this->isBaseline = $isBaseline;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $disk = Storage::disk('public');
        if (!$disk->exists($this->imagePath)) {
            Log::warning("[ProctoringJob] Image not found: {$this->imagePath}");
            return;
        }

        $imageContents = $disk->get($this->imagePath);
        $serviceUrl = env('PROCTORING_SERVICE_URL', 'http://proctoring:8001');

        try {
            $response = Http::timeout(20)->attach(
                'image', 
                $imageContents, 
                'snapshot.jpg'
            )->post("{$serviceUrl}/analyze");

            if (!$response->successful()) {
                Log::error("[ProctoringJob] Python service error: " . $response->body());
                return;
            }

            $resultData = $response->json();
            $faceAnalysis = $resultData['face_analysis'] ?? [];
            $embedding = $faceAnalysis['face_embedding'] ?? null;

            $examResult = ExamResult::where('exam_id', $this->examId)
                ->where('student_id', $this->studentId)
                ->first();

            if (!$examResult) return;

            if ($this->isBaseline) {
                if ($embedding) {
                    $examResult->update([
                        'baseline_face_embedding' => json_encode($embedding),
                        'baseline_captured_at' => now(),
                    ]);
                    Log::info("[ProctoringJob] Baseline embedding saved for student {$this->studentId}");
                } else {
                    Log::warning("[ProctoringJob] No face embedding extracted for baseline.");
                }
                return;
            }

            // Normal Snapshot Analysis
            $riskScore = $resultData['risk_score'] ?? 0;
            $detections = $resultData['detections'] ?? [];
            $message = $resultData['message'] ?? 'Tidak ada aktivitas mencurigakan';

            // Calculate Identity Distance if baseline exists
            $identityMismatch = false;
            if ($embedding && $examResult->baseline_face_embedding) {
                $baseline = json_decode($examResult->baseline_face_embedding, true);
                if (is_array($baseline) && count($baseline) === 128) {
                    $distance = $this->calculateEuclideanDistance($baseline, $embedding);
                    // threshold is usually 0.6 for dlib/face_recognition
                    if ($distance > 0.6) {
                        $identityMismatch = true;
                        $riskScore += 50;
                        $detections[] = 'identity_mismatch';
                        $message .= " | Wajah tidak cocok dengan identitas awal (Distance: " . round($distance, 2) . ")";
                    }
                }
            }

            // Update snapshot record
            $snapshot = MonitoringSnapshot::where('image_path', $this->imagePath)->first();
            if ($snapshot) {
                $isViolation = $riskScore > 20; // Medium or above
                $snapshot->update([
                    'is_violation' => $isViolation,
                    'ai_analysis_result' => json_encode($resultData),
                    // If your DB has risk_score column, add it here, else just rely on ai_analysis_result
                ]);
            }

            // Broadcast Admin Alert if High or Critical
            if ($riskScore >= 51) {
                $student = Student::find($this->studentId);
                $riskLevel = $riskScore >= 81 ? 'Critical' : 'High';
                
                app(SocketBroadcastService::class)->adminAlert($this->examId, [
                    'student_id' => $this->studentId,
                    'student_name' => $student ? $student->name : 'Siswa',
                    'risk_level' => $riskLevel,
                    'risk_score' => $riskScore,
                    'message' => "Pelanggaran {$riskLevel}: {$message}",
                    'image_path' => $this->imagePath,
                ]);
            }

        } catch (\Exception $e) {
            Log::error("[ProctoringJob] Exception: " . $e->getMessage());
        }
    }

    private function calculateEuclideanDistance($arr1, $arr2)
    {
        $sum = 0;
        for ($i = 0; $i < 128; $i++) {
            $sum += pow($arr1[$i] - $arr2[$i], 2);
        }
        return sqrt($sum);
    }
}
