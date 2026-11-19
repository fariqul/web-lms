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

class ExamAnswerBatchAutosaveTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'XI-Autosave'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'XI',
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
            'title' => 'Exam Autosave Batch',
            'description' => 'Batch autosave test',
            'subject' => 'Matematika',
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addHours(1),
            'duration' => 90,
            'status' => 'active',
            'total_questions' => 1,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
        ]);

        $exam->classes()->sync([$classId]);

        return $exam;
    }

    private function createQuestion(Exam $exam): Question
    {
        return Question::query()->create([
            'exam_id' => $exam->id,
            'type' => 'essay',
            'question_text' => 'Jelaskan jawaban Anda',
            'points' => 10,
            'order' => 1,
        ]);
    }

    private function startAttempt(Exam $exam, User $student): ExamResult
    {
        return ExamResult::query()->create([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinute(),
        ]);
    }

    /**
     * @return array{0: Exam, 1: User, 2: Question}
     */
    private function fixture(): array
    {
        $classId = $this->createClassRoom();
        $teacher = $this->createUser('guru', $classId, 'teacher-autosave');
        $student = $this->createUser('siswa', $classId, 'student-autosave');
        $exam = $this->createActiveExam($teacher->id, $classId);
        $question = $this->createQuestion($exam);
        $this->startAttempt($exam, $student);

        Sanctum::actingAs($student);

        return [$exam, $student, $question];
    }

    public function test_empty_answer_deletes_the_previously_saved_answer(): void
    {
        [$exam, $student, $question] = $this->fixture();

        $this->postJson("/api/exams/{$exam->id}/answers/batch", [
            'answers' => [
                ['question_id' => $question->id, 'answer' => 'Jawaban awal'],
            ],
        ])->assertOk();

        $this->assertDatabaseHas('answers', [
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'question_id' => $question->id,
        ]);

        $this->postJson("/api/exams/{$exam->id}/answers/batch", [
            'answers' => [
                ['question_id' => $question->id, 'answer' => ''],
            ],
        ])->assertOk();

        $this->assertDatabaseMissing('answers', [
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'question_id' => $question->id,
        ]);
    }

    public function test_unknown_question_id_does_not_fail_the_whole_batch(): void
    {
        [$exam, $student, $question] = $this->fixture();

        $response = $this->postJson("/api/exams/{$exam->id}/answers/batch", [
            'answers' => [
                ['question_id' => 999999, 'answer' => 'soal sudah dihapus'],
                ['question_id' => $question->id, 'answer' => 'jawaban valid'],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.saved_count', 1);

        $this->assertDatabaseHas('answers', [
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'question_id' => $question->id,
            'answer' => 'jawaban valid',
        ]);
    }

    public function test_batch_rejects_more_than_fifty_answers(): void
    {
        [$exam] = $this->fixture();

        $answers = [];
        for ($i = 1; $i <= 51; $i++) {
            $answers[] = ['question_id' => $i, 'answer' => "jawaban {$i}"];
        }

        $this->postJson("/api/exams/{$exam->id}/answers/batch", [
            'answers' => $answers,
        ])->assertStatus(422);
    }
}
