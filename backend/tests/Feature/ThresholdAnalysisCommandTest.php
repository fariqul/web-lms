<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

class ThresholdAnalysisCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_threshold_analysis_sweeps_stored_signals(): void
    {
        $outputDir = storage_path('app/threshold-test');
        File::deleteDirectory($outputDir);

        $teacher = User::factory()->create(['role' => 'guru']);
        $student = User::factory()->create(['role' => 'siswa']);

        $classId = DB::table('classes')->insertGetId([
            'name' => 'XII IPA 1',
            'grade_level' => 'XII',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $examId = DB::table('exams')->insertGetId([
            'class_id' => $classId,
            'teacher_id' => $teacher->id,
            'title' => 'Ujian Uji Ambang',
            'subject' => 'Matematika',
            'start_time' => now()->subHour(),
            'end_time' => now(),
            'duration' => 60,
            'total_questions' => 10,
            'status' => 'completed',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $base = now()->subMinutes(30);

        // Head-turn positives: large yaw, measured pose.
        for ($i = 0; $i < 6; $i++) {
            $this->insertLog($examId, $student->id, $base->copy()->addSeconds($i * 5), [
                'head_yaw' => 50.0 + $i * 2,
                'head_pitch' => 5.0,
                'pose_available' => true,
                'raw_detections' => ['head_turn:right'],
                'ai_head_turn' => true,
                'gt_head_turn' => true,
                'risk_score_raw' => 40,
                'ai_is_violation' => true,
                'gt_is_violation' => true,
            ]);
        }

        // Head-turn negatives: small yaw.
        for ($i = 0; $i < 6; $i++) {
            $this->insertLog($examId, $student->id, $base->copy()->addSeconds(100 + $i * 5), [
                'head_yaw' => 10.0,
                'head_pitch' => 5.0,
                'pose_available' => true,
                'raw_detections' => [],
                'ai_head_turn' => false,
                'gt_head_turn' => false,
                'risk_score_raw' => 5,
                'ai_is_violation' => false,
                'gt_is_violation' => false,
            ]);
        }

        // Ground-truth head turns where pose was not measurable: undetectable at any threshold.
        for ($i = 0; $i < 3; $i++) {
            $this->insertLog($examId, $student->id, $base->copy()->addSeconds(200 + $i * 5), [
                'head_yaw' => null,
                'head_pitch' => null,
                'pose_available' => false,
                'raw_detections' => [],
                'ai_head_turn' => false,
                'gt_head_turn' => true,
                'risk_score_raw' => 40,
                'ai_is_violation' => true,
                'gt_is_violation' => true,
            ]);
        }

        // Eye gaze: two measured positives, two negatives, one GT+ without a ratio.
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(300), [
            'eye_gaze_ratio' => 0.70,
            'gt_eye_gaze' => true,
            'ai_eye_gaze' => true,
            'risk_score_raw' => 40,
            'ai_is_violation' => true,
            'gt_is_violation' => true,
        ]);
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(305), [
            'eye_gaze_ratio' => 0.72,
            'gt_eye_gaze' => true,
            'ai_eye_gaze' => true,
            'risk_score_raw' => 40,
            'ai_is_violation' => true,
            'gt_is_violation' => true,
        ]);
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(310), [
            'eye_gaze_ratio' => 0.30,
            'gt_eye_gaze' => false,
            'ai_eye_gaze' => false,
            'risk_score_raw' => 5,
            'ai_is_violation' => false,
            'gt_is_violation' => false,
        ]);
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(315), [
            'eye_gaze_ratio' => 0.32,
            'gt_eye_gaze' => false,
            'ai_eye_gaze' => false,
            'risk_score_raw' => 5,
            'ai_is_violation' => false,
            'gt_is_violation' => false,
        ]);
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(320), [
            'eye_gaze_ratio' => null,
            'gt_eye_gaze' => true,
            'ai_eye_gaze' => false,
            'risk_score_raw' => 40,
            'ai_is_violation' => true,
            'gt_is_violation' => true,
        ]);

        // Multi-face: MediaPipe reports two faces.
        for ($i = 0; $i < 2; $i++) {
            $this->insertLog($examId, $student->id, $base->copy()->addSeconds(400 + $i * 5), [
                'face_count' => 2,
                'raw_detections' => ['multi_face:2'],
                'ai_multi_face' => true,
                'gt_multi_face' => true,
                'risk_score_raw' => 40,
                'ai_is_violation' => true,
                'gt_is_violation' => true,
            ]);
        }
        for ($i = 0; $i < 2; $i++) {
            $this->insertLog($examId, $student->id, $base->copy()->addSeconds(500 + $i * 5), [
                'face_count' => 1,
                'raw_detections' => [],
                'ai_multi_face' => false,
                'gt_multi_face' => false,
                'risk_score_raw' => 5,
                'ai_is_violation' => false,
                'gt_is_violation' => false,
            ]);
        }

        // Object: one prohibited class, one suspicious-only false alarm.
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(600), [
            'raw_detections' => ['prohibited_object:cell phone'],
            'ai_object_detected' => true,
            'gt_object_detected' => true,
            'risk_score_raw' => 40,
            'ai_is_violation' => true,
            'gt_is_violation' => true,
        ]);
        $this->insertLog($examId, $student->id, $base->copy()->addSeconds(605), [
            'raw_detections' => [],
            'ai_object_detected' => true,
            'gt_object_detected' => false,
            'risk_score_raw' => 5,
            'ai_is_violation' => false,
            'gt_is_violation' => false,
        ]);

        $this->artisan('proctoring:threshold-analysis', [
            '--min-positives' => 2,
            '--top' => 3,
            '--step-yaw' => 2,
            '--step-pitch' => 2,
            '--step-gaze' => 0.05,
            '--step-risk' => 5,
            '--output' => 'threshold-test/sweep.csv',
        ])
            ->expectsOutputToContain('HEAD TURN')
            ->expectsOutputToContain('EYE GAZE')
            ->expectsOutputToContain('MULTI-FACE')
            ->expectsOutputToContain('OBJECT DETECTED')
            ->expectsOutputToContain('IDENTITY MISMATCH')
            ->expectsOutputToContain('HEAD_YAW_THRESHOLD')
            ->expectsOutputToContain('HEAD_PITCH_THRESHOLD')
            ->expectsOutputToContain('EYE_GAZE_THRESHOLD')
            ->expectsOutputToContain('PROCTORING_RISK_VIOLATION_MIN')
            ->assertExitCode(0);

        $csvPath = $outputDir . '/sweep.csv';
        $this->assertFileExists($csvPath);

        $handle = fopen($csvPath, 'r');
        $header = fgetcsv($handle);
        $rowCount = 0;
        $sweeps = [];

        while (($line = fgetcsv($handle)) !== false) {
            $rowCount++;
            $sweeps[$line[0]] = true;
        }

        fclose($handle);

        $this->assertSame('sweep', $header[0]);
        $this->assertArrayHasKey('head_turn_yaw', $sweeps);
        $this->assertArrayHasKey('head_turn_pitch', $sweeps);
        $this->assertArrayHasKey('head_turn_joint', $sweeps);
        $this->assertArrayHasKey('eye_gaze', $sweeps);
        $this->assertArrayHasKey('risk_score', $sweeps);
        $this->assertGreaterThan(50, $rowCount);

        File::deleteDirectory($outputDir);
    }

    /**
     * Insert one labeled calibration row with a stored face_analysis JSON.
     */
    private function insertLog(int $examId, int $studentId, $capturedAt, array $data): void
    {
        $faceAnalysis = [
            'face_detected' => true,
            'face_count' => $data['face_count'] ?? 1,
            'face_confidence' => 0.95,
            'head_yaw' => $data['head_yaw'] ?? 10.0,
            'head_pitch' => $data['head_pitch'] ?? 5.0,
            'head_roll' => 0.0,
            'pose_available' => $data['pose_available'] ?? true,
            'is_looking_away' => $data['ai_head_turn'] ?? false,
            'looking_direction' => 'center',
            'eye_gaze_ratio' => $data['eye_gaze_ratio'] ?? null,
            'is_gaze_deviated' => $data['ai_eye_gaze'] ?? false,
        ];

        DB::table('proctoring_calibration_logs')->insert([
            'exam_id' => $examId,
            'student_id' => $studentId,
            'snapshot_id' => null,
            'exam_result_id' => null,
            'risk_score_raw' => $data['risk_score_raw'] ?? 5,
            'ai_no_face' => $data['ai_no_face'] ?? false,
            'ai_multi_face' => $data['ai_multi_face'] ?? false,
            'ai_head_turn' => $data['ai_head_turn'] ?? false,
            'ai_eye_gaze' => $data['ai_eye_gaze'] ?? false,
            'ai_object_detected' => $data['ai_object_detected'] ?? false,
            'ai_identity_mismatch' => false,
            'ai_is_violation' => $data['ai_is_violation'] ?? false,
            'ground_truth_no_face' => $data['gt_no_face'] ?? null,
            'ground_truth_multi_face' => $data['gt_multi_face'] ?? null,
            'ground_truth_head_turn' => $data['gt_head_turn'] ?? null,
            'ground_truth_eye_gaze' => $data['gt_eye_gaze'] ?? null,
            'ground_truth_object_detected' => $data['gt_object_detected'] ?? null,
            'ground_truth_identity_mismatch' => null,
            'ground_truth_is_violation' => $data['gt_is_violation'] ?? false,
            'raw_detections' => json_encode($data['raw_detections'] ?? []),
            'face_analysis' => json_encode($faceAnalysis),
            'captured_at' => $capturedAt,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
