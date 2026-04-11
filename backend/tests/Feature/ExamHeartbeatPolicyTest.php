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

class ExamHeartbeatPolicyTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Heartbeat'): int
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
            'title' => 'Exam Heartbeat Policy',
            'description' => 'Heartbeat policy test',
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

    public function test_heartbeat_applies_warning_freeze_and_auto_submit_policy(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-heartbeat');
        $student = $this->createUser('siswa', $classId, 'student-heartbeat');
        $exam = $this->createActiveExam($teacher->id, $classId);

        $result = ExamResult::query()->create([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(5),
            'violation_count' => 0,
        ]);

        Sanctum::actingAs($student);

        $this->postJson("/api/exams/{$exam->id}/heartbeat")
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.policy_action', 'none')
            ->assertJsonPath('data.force_submit', false);

        $result->update(['violation_count' => 1]);
        $this->postJson("/api/exams/{$exam->id}/heartbeat")
            ->assertOk()
            ->assertJsonPath('data.policy_action', 'warning')
            ->assertJsonPath('data.force_submit', false);

        $result->refresh();
        $result->update(['violation_count' => 2]);
        $this->postJson("/api/exams/{$exam->id}/heartbeat")
            ->assertOk()
            ->assertJsonPath('data.policy_action', 'freeze')
            ->assertJsonPath('data.force_submit', false);

        $result->refresh();
        $result->update(['violation_count' => 3]);
        $this->postJson("/api/exams/{$exam->id}/heartbeat")
            ->assertOk()
            ->assertJsonPath('data.policy_action', 'auto_submit')
            ->assertJsonPath('data.force_submit', true);

        $this->assertDatabaseHas('exam_results', [
            'id' => $result->id,
            'status' => 'completed',
        ]);
    }
}

