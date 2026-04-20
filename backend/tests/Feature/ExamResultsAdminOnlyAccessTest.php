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

    public function test_teacher_owner_can_access_exam_results_list(): void
    {
        $classId = $this->createClassRoom('X-Results-List');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-list');
        $student = $this->createUser('siswa', $classId, 'student-results-list');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->getJson("/api/exams/{$exam->id}/results")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_teacher_owner_can_access_exam_results_student_detail(): void
    {
        $classId = $this->createClassRoom('X-Results-Detail');
        $teacher = $this->createUser('guru', $classId, 'teacher-results-detail');
        $student = $this->createUser('siswa', $classId, 'student-results-detail');
        $exam = $this->createExamWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_teacher_non_owner_cannot_access_exam_results_list_and_detail(): void
    {
        $classId = $this->createClassRoom('X-Results-NonOwner');
        $ownerTeacher = $this->createUser('guru', $classId, 'teacher-results-owner');
        $nonOwnerTeacher = $this->createUser('guru', $classId, 'teacher-results-non-owner');
        $student = $this->createUser('siswa', $classId, 'student-results-non-owner');
        $exam = $this->createExamWithResult($ownerTeacher, $student, $classId);

        Sanctum::actingAs($nonOwnerTeacher);

        $this->getJson("/api/exams/{$exam->id}/results")
            ->assertStatus(403);

        $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")
            ->assertStatus(403);
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
