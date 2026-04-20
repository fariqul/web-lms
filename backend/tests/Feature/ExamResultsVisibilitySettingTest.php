<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExamResultsVisibilitySettingTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Exam-Results-Visibility'): int
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

    public function test_admin_can_read_and_update_exam_results_visibility_toggle(): void
    {
        $classId = $this->createClassRoom('X-Exam-Results-Visibility-Admin');
        $admin = $this->createUser('admin', $classId, 'exam-results-visibility-admin');

        Sanctum::actingAs($admin);

        $this->getJson('/api/exam-results-visibility')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.teacher_exam_results_hidden', true);

        $this->putJson('/api/exam-results-visibility', [
            'teacher_exam_results_hidden' => false,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.teacher_exam_results_hidden', false);
    }

    public function test_non_admin_cannot_read_or_update_exam_results_visibility_toggle(): void
    {
        $classId = $this->createClassRoom('X-Exam-Results-Visibility-Teacher');
        $teacher = $this->createUser('guru', $classId, 'exam-results-visibility-teacher');

        Sanctum::actingAs($teacher);

        $this->getJson('/api/exam-results-visibility')
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Anda tidak memiliki akses ke resource ini');

        $this->putJson('/api/exam-results-visibility', [
            'teacher_exam_results_hidden' => false,
        ])
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Anda tidak memiliki akses ke resource ini');
    }
}
