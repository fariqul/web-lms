<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExamViolationPolicyHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Violation'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createUser(string $role, int $classId, string $suffix): User
    {
        $id = (int) DB::table('users')->insertGetId([
            'name' => "User {$suffix}",
            'email' => "user-{$suffix}@example.com",
            'password' => Hash::make('password123'),
            'role' => $role,
            'class_id' => $classId,
            'nisn' => $role === 'siswa' ? "NISN{$suffix}" : null,
            'nip' => $role === 'guru' ? "NIP{$suffix}" : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::query()->findOrFail($id);
    }

    private function createActiveExam(int $teacherId, int $classId): Exam
    {
        $exam = Exam::query()->create([
            'type' => 'ujian',
            'class_id' => $classId,
            'teacher_id' => $teacherId,
            'title' => 'Exam Violation Policy',
            'description' => 'Violation policy hardening test',
            'subject' => 'Matematika',
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addHours(1),
            'duration' => 90,
            'status' => 'active',
            'total_questions' => 0,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
            'max_violations' => 3,
        ]);

        $exam->classes()->sync([$classId]);

        return $exam;
    }

    private function createInProgressResult(Exam $exam, User $student): ExamResult
    {
        return ExamResult::query()->create([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(5),
            'violation_count' => 0,
        ]);
    }

    public function test_ios_critical_event_is_counted_immediately(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-ios-critical');
        $student = $this->createUser('siswa', $classId, 'student-ios-critical');
        $exam = $this->createActiveExam($teacher->id, $classId);
        $result = $this->createInProgressResult($exam, $student);

        Sanctum::actingAs($student);

        $this->withHeader('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
            ->postJson("/api/exams/{$exam->id}/violation", [
                'type' => 'tab_switch',
                'description' => 'Keluar app iPhone',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.ignored', null)
            ->assertJsonPath('data.violation_count', 1);

        $this->assertDatabaseHas('violations', [
            'exam_result_id' => $result->id,
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'type' => 'tab_switch',
        ]);
    }

    public function test_non_critical_event_requires_consensus_and_respects_cooldown(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-non-critical');
        $student = $this->createUser('siswa', $classId, 'student-non-critical');
        $exam = $this->createActiveExam($teacher->id, $classId);
        $result = $this->createInProgressResult($exam, $student);

        Sanctum::actingAs($student);

        $this->postJson("/api/exams/{$exam->id}/violation", [
            'type' => 'camera_off',
            'description' => 'noise pertama',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.ignored', true)
            ->assertJsonPath('data.violation_count', 0);

        $this->assertDatabaseCount('violations', 0);

        $this->postJson("/api/exams/{$exam->id}/violation", [
            'type' => 'camera_off',
            'description' => 'konfirmasi kedua',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.ignored', null)
            ->assertJsonPath('data.violation_count', 1);

        $this->assertDatabaseHas('violations', [
            'exam_result_id' => $result->id,
            'type' => 'camera_off',
        ]);

        $this->postJson("/api/exams/{$exam->id}/violation", [
            'type' => 'camera_off',
            'description' => 'spam cooldown',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.ignored', true)
            ->assertJsonPath('data.violation_count', 1);

        $this->assertSame(1, DB::table('violations')->where('exam_result_id', $result->id)->where('type', 'camera_off')->count());
    }
}

