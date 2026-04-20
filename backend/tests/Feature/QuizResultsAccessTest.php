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

class QuizResultsAccessTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Quiz-Results-Access'): int
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

    private function createQuizWithResult(User $teacher, User $student, int $classId): Exam
    {
        $quiz = Exam::query()->create([
            'type' => 'quiz',
            'class_id' => $classId,
            'teacher_id' => $teacher->id,
            'title' => 'Quiz Results Access',
            'description' => 'Access test',
            'subject' => 'Matematika',
            'start_time' => now()->subHour(),
            'end_time' => now()->addHour(),
            'duration' => 60,
            'status' => 'active',
            'total_questions' => 0,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
            'max_violations' => 3,
        ]);

        $quiz->classes()->sync([$classId]);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'completed',
            'started_at' => now()->subMinutes(30),
            'finished_at' => now()->subMinutes(5),
            'submitted_at' => now()->subMinutes(5),
            'total_score' => 85,
            'max_score' => 100,
            'percentage' => 85,
            'violation_count' => 0,
        ]);

        return $quiz;
    }

    public function test_teacher_owner_can_access_quiz_results_list_and_detail(): void
    {
        $classId = $this->createClassRoom('X-Quiz-Results-Owner');
        $teacher = $this->createUser('guru', $classId, 'teacher-quiz-results-owner');
        $student = $this->createUser('siswa', $classId, 'student-quiz-results-owner');
        $quiz = $this->createQuizWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->getJson("/api/quizzes/{$quiz->id}/results")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->getJson("/api/quizzes/{$quiz->id}/results/{$student->id}")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_teacher_non_owner_cannot_access_quiz_results_list_and_detail(): void
    {
        $classId = $this->createClassRoom('X-Quiz-Results-NonOwner');
        $ownerTeacher = $this->createUser('guru', $classId, 'teacher-quiz-results-owner-2');
        $nonOwnerTeacher = $this->createUser('guru', $classId, 'teacher-quiz-results-non-owner');
        $student = $this->createUser('siswa', $classId, 'student-quiz-results-non-owner');
        $quiz = $this->createQuizWithResult($ownerTeacher, $student, $classId);

        Sanctum::actingAs($nonOwnerTeacher);

        $this->getJson("/api/quizzes/{$quiz->id}/results")
            ->assertStatus(403)
            ->assertJsonPath('message', 'Unauthorized');

        $this->getJson("/api/quizzes/{$quiz->id}/results/{$student->id}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'Unauthorized');
    }

    public function test_admin_can_access_quiz_results_list_and_detail(): void
    {
        $classId = $this->createClassRoom('X-Quiz-Results-Admin');
        $teacher = $this->createUser('guru', $classId, 'teacher-quiz-results-admin');
        $admin = $this->createUser('admin', $classId, 'admin-quiz-results-access');
        $student = $this->createUser('siswa', $classId, 'student-quiz-results-admin');
        $quiz = $this->createQuizWithResult($teacher, $student, $classId);

        Sanctum::actingAs($admin);

        $this->getJson("/api/quizzes/{$quiz->id}/results")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->getJson("/api/quizzes/{$quiz->id}/results/{$student->id}")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_teacher_cannot_export_quiz_results(): void
    {
        $classId = $this->createClassRoom('X-Quiz-Results-Export-Teacher');
        $teacher = $this->createUser('guru', $classId, 'teacher-quiz-results-export');
        $student = $this->createUser('siswa', $classId, 'student-quiz-results-export');
        $quiz = $this->createQuizWithResult($teacher, $student, $classId);

        Sanctum::actingAs($teacher);

        $this->get("/api/export/quiz-results/{$quiz->id}?format=xlsx")
            ->assertStatus(403);
    }

    public function test_admin_can_export_quiz_results(): void
    {
        $classId = $this->createClassRoom('X-Quiz-Results-Export-Admin');
        $teacher = $this->createUser('guru', $classId, 'teacher-quiz-results-export-admin');
        $admin = $this->createUser('admin', $classId, 'admin-quiz-results-export');
        $student = $this->createUser('siswa', $classId, 'student-quiz-results-export-admin');
        $quiz = $this->createQuizWithResult($teacher, $student, $classId);

        Sanctum::actingAs($admin);

        $this->get("/api/export/quiz-results/{$quiz->id}?format=xlsx")
            ->assertOk();
    }
}

