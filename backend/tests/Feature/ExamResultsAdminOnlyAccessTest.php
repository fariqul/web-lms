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

class ExamResultsAdminOnlyAccessTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Results-Access'): int
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

    private function createExamWithResult(User $teacher, User $student, int $classId): Exam
    {
        $exam = Exam::query()->create([
            'type' => 'ujian',
            'class_id' => $classId,
            'teacher_id' => $teacher->id,
            'title' => 'Exam Results Admin Only',
            'description' => 'Access test',
            'subject' => 'Matematika',
            'start_time' => now()->subHour(),
            'end_time' => now()->addHour(),
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

        ExamResult::query()->create([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'completed',
            'started_at' => now()->subMinutes(50),
            'finished_at' => now()->subMinutes(5),
            'submitted_at' => now()->subMinutes(5),
            'total_score' => 80,
            'max_score' => 100,
            'percentage' => 80,
            'violation_count' => 0,
        ]);

        return $exam;
    }

    private function setTeacherExamResultsHidden(bool $hidden): void
    {
        DB::table('system_settings')->updateOrInsert(
            ['setting_key' => 'teacher_exam_results_hidden'],
            ['setting_value' => $hidden ? '1' : '0', 'updated_at' => now(), 'created_at' => now()]
        );
    }

    public function test_teacher_owner_cannot_access_exam_results_when_visibility_toggle_default_on(): void
    {
        $classId = $this->createClassRoom('X-Results-Owner-Default-On');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-owner-default-on');
        $student = $this->createUser('siswa', $classId, 'student-results-owner-default-on');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->getJson("/api/exams/{$exam->id}/results")
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Akses hasil ujian untuk guru sedang dinonaktifkan admin');

        $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Akses hasil ujian untuk guru sedang dinonaktifkan admin');
    }

    public function test_teacher_owner_can_access_exam_results_when_visibility_toggle_off(): void
    {
        $this->setTeacherExamResultsHidden(false);

        $classId = $this->createClassRoom('X-Results-Owner-Off');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-owner-off');
        $student = $this->createUser('siswa', $classId, 'student-results-owner-off');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->getJson("/api/exams/{$exam->id}/results")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_teacher_non_owner_cannot_access_exam_results_list_and_detail(): void
    {
        $this->setTeacherExamResultsHidden(false);

        $classId = $this->createClassRoom('X-Results-NonOwner');
        $ownerTeacher = $this->createUser('guru', $classId, 'teacher-results-owner');
        $nonOwnerTeacher = $this->createUser('guru', $classId, 'teacher-results-non-owner');
        $student = $this->createUser('siswa', $classId, 'student-results-non-owner');
        $exam = $this->createExamWithResult($ownerTeacher, $student, $classId);

        Sanctum::actingAs($nonOwnerTeacher);

        $this->getJson("/api/exams/{$exam->id}/results")
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Anda tidak memiliki akses ke hasil ujian ini');

        $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Anda tidak memiliki akses ke hasil ujian ini');
    }

    public function test_teacher_owner_cannot_export_exam_results(): void
    {
        $classId = $this->createClassRoom('X-Results-Export');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-export');
        $student = $this->createUser('siswa', $classId, 'student-results-export');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->get("/api/export/exam-results/{$exam->id}?format=xlsx")
            ->assertStatus(403);
    }

    public function test_admin_can_access_exam_results_list_and_detail(): void
    {
        $classId = $this->createClassRoom('X-Results-Admin');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-admin');
        $admin = $this->createUser('admin', $classId, 'admin-results-admin');
        $student = $this->createUser('siswa', $classId, 'student-results-admin');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($admin);

        $this->getJson("/api/exams/{$exam->id}/results")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_admin_can_export_exam_results(): void
    {
        $classId = $this->createClassRoom('X-Results-Export-Admin');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-export-admin');
        $admin = $this->createUser('admin', $classId, 'admin-results-export');
        $student = $this->createUser('siswa', $classId, 'student-results-export-admin');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($admin);

        $this->get("/api/export/exam-results/{$exam->id}?format=xlsx")
            ->assertOk();
    }
}
