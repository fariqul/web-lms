<?php

namespace Tests\Unit;

use App\Jobs\AnalyzeSnapshotJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AnalyzeSnapshotJobQueueTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createStudent(int $classId, string $suffix): int
    {
        return (int) DB::table('users')->insertGetId([
            'name' => "Student {$suffix}",
            'email' => "student-{$suffix}@example.com",
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classId,
            'nisn' => "NISN{$suffix}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createTeacher(int $classId, string $suffix): int
    {
        return (int) DB::table('users')->insertGetId([
            'name' => "Teacher {$suffix}",
            'email' => "teacher-{$suffix}@example.com",
            'password' => Hash::make('password123'),
            'role' => 'guru',
            'class_id' => $classId,
            'nip' => "NIP{$suffix}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createExam(int $teacherId, int $classId, string $suffix): int
    {
        return (int) DB::table('exams')->insertGetId([
            'type' => 'ujian',
            'class_id' => $classId,
            'teacher_id' => $teacherId,
            'title' => "Exam {$suffix}",
            'description' => 'Exam for job dedup test',
            'subject' => 'Matematika',
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addMinutes(50),
            'duration' => 60,
            'status' => 'active',
            'total_questions' => 0,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
            'max_violations' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_analyze_snapshot_job_uses_proctoring_queue(): void
    {
        $job = new AnalyzeSnapshotJob(1, 1, 1, 1);

        $this->assertSame('proctoring', $job->queue);
    }

    public function test_should_emit_alert_returns_false_when_recent_duplicate_exists(): void
    {
        $classId = $this->createClassRoom('X-Job-Dedup-False');
        $teacherId = $this->createTeacher($classId, 'job-dedup-false');
        $studentId = $this->createStudent($classId, 'job-dedup-false');
        $examId = $this->createExam($teacherId, $classId, 'job-dedup-false');
        $job = new AnalyzeSnapshotJob(1, $examId, $studentId, 1);

        DB::table('proctoring_alerts')->insert([
            'exam_id' => $examId,
            'student_id' => $studentId,
            'snapshot_id' => null,
            'type' => 'multi_face',
            'severity' => 'alert',
            'description' => '2 orang terdeteksi oleh AI',
            'confidence' => 0.9,
            'details' => json_encode(['person_count' => 2], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $method = new \ReflectionMethod(AnalyzeSnapshotJob::class, 'shouldEmitAlert');
        $method->setAccessible(true);

        $result = $method->invoke($job, 'multi_face', 15);
        $this->assertFalse($result);
    }

    public function test_should_emit_alert_returns_true_when_duplicate_is_outside_window(): void
    {
        $classId = $this->createClassRoom('X-Job-Dedup-True');
        $teacherId = $this->createTeacher($classId, 'job-dedup-true');
        $studentId = $this->createStudent($classId, 'job-dedup-true');
        $examId = $this->createExam($teacherId, $classId, 'job-dedup-true');
        $job = new AnalyzeSnapshotJob(1, $examId, $studentId, 1);

        DB::table('proctoring_alerts')->insert([
            'exam_id' => $examId,
            'student_id' => $studentId,
            'snapshot_id' => null,
            'type' => 'no_face',
            'severity' => 'warning',
            'description' => 'Wajah tidak terdeteksi',
            'confidence' => 0.8,
            'details' => json_encode(['face_analysis' => ['face_detected' => false]], JSON_UNESCAPED_UNICODE),
            'created_at' => now()->subSeconds(30),
            'updated_at' => now()->subSeconds(30),
        ]);

        $method = new \ReflectionMethod(AnalyzeSnapshotJob::class, 'shouldEmitAlert');
        $method->setAccessible(true);

        $result = $method->invoke($job, 'no_face', 15);
        $this->assertTrue($result);
    }
}
