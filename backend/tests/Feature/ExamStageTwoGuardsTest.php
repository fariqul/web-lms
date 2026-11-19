<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamClassSchedule;
use App\Models\ExamResult;
use App\Models\Question;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExamStageTwoGuardsTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'XI',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createUser(string $role, ?int $classId, string $suffix): User
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

    private function createExam(int $teacherId, int $classId, array $overrides = []): Exam
    {
        $exam = Exam::query()->create(array_merge([
            'type' => 'ujian',
            'class_id' => $classId,
            'teacher_id' => $teacherId,
            'title' => 'Exam Stage Two',
            'description' => 'Stage two guard test',
            'subject' => 'Matematika',
            'start_time' => now()->subHours(2),
            'end_time' => now()->addHour(),
            'duration' => 90,
            'status' => 'active',
            'total_questions' => 1,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
        ], $overrides));

        $exam->classes()->sync([$classId]);

        return $exam;
    }

    private function startAttempt(Exam $exam, User $student, array $overrides = []): ExamResult
    {
        return ExamResult::query()->create(array_merge([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(30),
        ], $overrides));
    }

    private function publishClassSchedule(Exam $exam, int $classId, $start, $end): void
    {
        ExamClassSchedule::query()->create([
            'exam_id' => $exam->id,
            'class_id' => $classId,
            'start_time' => $start,
            'end_time' => $end,
            'is_published' => true,
        ]);
    }

    public function test_question_cannot_be_deleted_while_a_student_is_in_progress(): void
    {
        $classId = $this->createClassRoom('XI-Guard');
        $teacher = $this->createUser('guru', $classId, 'teacher-guard');
        $student = $this->createUser('siswa', $classId, 'student-guard');
        $exam = $this->createExam($teacher->id, $classId);
        $question = Question::query()->create([
            'exam_id' => $exam->id,
            'type' => 'essay',
            'question_text' => 'Soal aktif',
            'points' => 10,
            'order' => 1,
        ]);
        $this->startAttempt($exam, $student);

        Sanctum::actingAs($teacher);

        $this->deleteJson("/api/questions/{$question->id}")->assertStatus(422);

        $this->assertDatabaseHas('questions', ['id' => $question->id]);
    }

    public function test_results_completes_attempt_when_the_class_window_has_ended(): void
    {
        $classId = $this->createClassRoom('XI-Window-A');
        $teacher = $this->createUser('guru', $classId, 'teacher-window-a');
        $student = $this->createUser('siswa', $classId, 'student-window-a');
        $admin = $this->createUser('admin', null, 'admin-window-a');
        $exam = $this->createExam($teacher->id, $classId, ['end_time' => now()->addHour()]);
        $result = $this->startAttempt($exam, $student);

        $this->publishClassSchedule($exam, $classId, now()->subHours(2), now()->subMinute());

        Sanctum::actingAs($admin);

        $this->getJson("/api/exams/{$exam->id}/results")->assertOk();

        $this->assertDatabaseHas('exam_results', [
            'id' => $result->id,
            'status' => 'completed',
        ]);
    }

    public function test_results_does_not_cut_off_a_class_window_that_is_still_running(): void
    {
        $classId = $this->createClassRoom('XI-Window-B');
        $teacher = $this->createUser('guru', $classId, 'teacher-window-b');
        $student = $this->createUser('siswa', $classId, 'student-window-b');
        $admin = $this->createUser('admin', null, 'admin-window-b');
        $exam = $this->createExam($teacher->id, $classId, ['end_time' => now()->subMinute()]);
        $result = $this->startAttempt($exam, $student);

        $this->publishClassSchedule($exam, $classId, now()->subMinutes(30), now()->addHour());

        Sanctum::actingAs($admin);

        $this->getJson("/api/exams/{$exam->id}/results")->assertOk();

        $this->assertDatabaseHas('exam_results', [
            'id' => $result->id,
            'status' => 'in_progress',
        ]);
    }

    public function test_summary_passed_only_counts_finished_results(): void
    {
        $classId = $this->createClassRoom('XI-Summary');
        $teacher = $this->createUser('guru', $classId, 'teacher-summary');
        $student = $this->createUser('siswa', $classId, 'student-summary');
        $admin = $this->createUser('admin', null, 'admin-summary');
        $exam = $this->createExam($teacher->id, $classId);
        $this->startAttempt($exam, $student, ['percentage' => 100]);

        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/exams/{$exam->id}/results")->assertOk();

        $response->assertJsonPath('data.summary.passed', 0);
        $response->assertJsonPath('data.summary.in_progress', 1);
    }

    public function test_socket_exam_access_requires_secret_and_class_membership(): void
    {
        $classId = $this->createClassRoom('XI-Socket');
        $otherClassId = $this->createClassRoom('XI-Socket-Other');
        $teacher = $this->createUser('guru', $classId, 'teacher-socket');
        $student = $this->createUser('siswa', $classId, 'student-socket');
        $outsider = $this->createUser('siswa', $otherClassId, 'outsider-socket');
        $exam = $this->createExam($teacher->id, $classId);

        $studentToken = $student->createToken('socket-test')->plainTextToken;
        $outsiderToken = $outsider->createToken('socket-test')->plainTextToken;
        $secretHeader = ['Authorization' => 'Bearer ' . config('app.socket_internal_secret')];

        $this->postJson('/api/internal/socket/exam-access', [
            'token' => $studentToken,
            'exam_id' => $exam->id,
        ])->assertStatus(401);

        $this->postJson('/api/internal/socket/exam-access', [
            'token' => $studentToken,
            'exam_id' => $exam->id,
        ], $secretHeader)->assertOk();

        $this->postJson('/api/internal/socket/exam-access', [
            'token' => $outsiderToken,
            'exam_id' => $exam->id,
        ], $secretHeader)->assertStatus(403);
    }
}
