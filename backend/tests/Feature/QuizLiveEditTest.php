<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\Question;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuizLiveEditTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-1'): int
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

    private function createActiveQuiz(int $teacherId, int $classId): Exam
    {
        $quiz = Exam::query()->create([
            'type' => 'quiz',
            'class_id' => $classId,
            'teacher_id' => $teacherId,
            'title' => 'Quiz Live Edit',
            'description' => 'Test quiz',
            'subject' => 'Matematika',
            'start_time' => now()->subMinutes(5),
            'end_time' => now()->addHours(1),
            'duration' => 60,
            'status' => 'active',
            'total_questions' => 1,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
            'max_violations' => 999,
        ]);

        $quiz->classes()->sync([$classId]);

        return $quiz;
    }

    private function createChoiceQuestion(int $quizId): Question
    {
        return Question::query()->create([
            'exam_id' => $quizId,
            'type' => 'multiple_choice',
            'question_text' => 'Soal awal',
            'passage' => null,
            'image' => null,
            'options' => [
                ['text' => 'A', 'image' => null],
                ['text' => 'B', 'image' => null],
                ['text' => 'C', 'image' => null],
                ['text' => 'D', 'image' => null],
            ],
            'correct_answer' => 'A',
            'essay_keywords' => null,
            'points' => 10,
            'order' => 1,
        ]);
    }

    public function test_teacher_can_update_question_content_while_quiz_active(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-active-edit');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $question = $this->createChoiceQuestion($quiz->id);

        Sanctum::actingAs($teacher);

        $response = $this->putJson("/api/quiz-questions/{$question->id}", [
            'question_text' => 'Soal sudah diperbaiki',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('questions', [
            'id' => $question->id,
            'question_text' => 'Soal sudah diperbaiki',
        ]);
    }

    public function test_teacher_cannot_change_question_type_while_quiz_active(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-type-lock');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $question = $this->createChoiceQuestion($quiz->id);

        Sanctum::actingAs($teacher);

        $response = $this->putJson("/api/quiz-questions/{$question->id}", [
            'question_type' => 'essay',
        ]);

        $response->assertStatus(422);
    }

    public function test_student_can_sync_questions_without_refresh_when_in_progress(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-sync');
        $student = $this->createUser('siswa', $classId, 'student-sync');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $question = $this->createChoiceQuestion($quiz->id);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(2),
        ]);

        Sanctum::actingAs($student);

        $response = $this->getJson("/api/quizzes/{$quiz->id}/sync-questions");

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.questions.0.id', $question->id);
    }

    public function test_student_can_resume_quiz_session_with_remaining_time(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-resume');
        $student = $this->createUser('siswa', $classId, 'student-resume');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $this->createChoiceQuestion($quiz->id);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(5),
        ]);

        Sanctum::actingAs($student);

        $response = $this->postJson("/api/quizzes/{$quiz->id}/start");
        $response->assertOk()->assertJsonPath('success', true);

        $remainingTime = (int) data_get($response->json(), 'data.remainingTime', -1);
        $this->assertGreaterThan(0, $remainingTime);
        $this->assertLessThan($quiz->duration * 60, $remainingTime);
    }

    public function test_student_can_submit_answer_and_finish_quiz_flow(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-finish');
        $student = $this->createUser('siswa', $classId, 'student-finish');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $question = $this->createChoiceQuestion($quiz->id);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(1),
        ]);

        Sanctum::actingAs($student);

        $this->postJson("/api/quizzes/{$quiz->id}/answer", [
            'question_id' => $question->id,
            'answer' => 'A',
        ])->assertOk()->assertJsonPath('success', true);

        $this->postJson("/api/quizzes/{$quiz->id}/finish", [
            'answers' => [
                (string) $question->id => 'A',
            ],
            'time_spent' => 60,
        ])->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('answers', [
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'question_id' => $question->id,
            'answer' => 'A',
        ]);

        $this->assertDatabaseHas('exam_results', [
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'graded',
        ]);
    }

    public function test_finish_quiz_ignores_fallback_answers_after_personal_deadline(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-deadline');
        $student = $this->createUser('siswa', $classId, 'student-deadline');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $question = $this->createChoiceQuestion($quiz->id);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes($quiz->duration + 2),
        ]);

        Sanctum::actingAs($student);

        $response = $this->postJson("/api/quizzes/{$quiz->id}/finish", [
            'answers' => [
                (string) $question->id => 'A',
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Quiz berhasil diselesaikan (waktu habis, jawaban terlambat diabaikan)');

        $this->assertDatabaseMissing('answers', [
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'question_id' => $question->id,
        ]);
    }

    public function test_student_cannot_sync_questions_without_active_session(): void
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-sync-closed');
        $student = $this->createUser('siswa', $classId, 'student-sync-closed');
        $quiz = $this->createActiveQuiz($teacher->id, $classId);
        $this->createChoiceQuestion($quiz->id);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'submitted',
            'started_at' => now()->subMinutes(10),
            'submitted_at' => now()->subMinute(),
            'finished_at' => now()->subMinute(),
        ]);

        Sanctum::actingAs($student);

        $this->getJson("/api/quizzes/{$quiz->id}/sync-questions")
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }
}

