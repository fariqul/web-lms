<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamClassSchedule;
use App\Models\ExamResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExamAdjustTimeTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Adjust-Time'): int
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

    private function createActiveExam(int $teacherId, int $classId, int $endInMinutes = 45, int $duration = 90): Exam
    {
        $exam = Exam::query()->create([
            'type' => 'ujian',
            'class_id' => $classId,
            'teacher_id' => $teacherId,
            'title' => 'Exam Adjust Time',
            'description' => 'Adjust time test',
            'subject' => 'Matematika',
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addMinutes($endInMinutes),
            'duration' => $duration,
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

    public function test_admin_can_add_time_for_active_exam_and_published_class_schedules(): void
    {
        $classA = $this->createClassRoom('X-Add-A');
        $classB = $this->createClassRoom('X-Add-B');
        $teacher = $this->createUser('guru', $classA, 'teacher-adjust-add');
        $admin = $this->createUser('admin', $classA, 'admin-adjust-add');
        $student = $this->createUser('siswa', $classA, 'student-adjust-add');

        $exam = $this->createActiveExam($teacher->id, $classA, 50, 90);
        $exam->classes()->sync([$classA, $classB]);

        $scheduleA = ExamClassSchedule::query()->create([
            'exam_id' => $exam->id,
            'class_id' => $classA,
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addMinutes(40),
            'is_published' => true,
        ]);
        $scheduleB = ExamClassSchedule::query()->create([
            'exam_id' => $exam->id,
            'class_id' => $classB,
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addMinutes(45),
            'is_published' => true,
        ]);

        ExamResult::query()->create([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinutes(10),
            'violation_count' => 0,
        ]);

        $beforeExamEnd = $exam->end_time->copy();
        $beforeScheduleAEnd = $scheduleA->end_time->copy();
        $beforeScheduleBEnd = $scheduleB->end_time->copy();

        Sanctum::actingAs($admin);

        $this->postJson("/api/exams/{$exam->id}/adjust-time", [
            'delta_minutes' => 15,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.applied_delta_minutes', 15);

        $exam->refresh();
        $scheduleA->refresh();
        $scheduleB->refresh();

        $this->assertSame(105, (int) $exam->duration);
        $this->assertSame(15, (int) abs($beforeExamEnd->diffInMinutes($exam->end_time, false)));
        $this->assertSame(15, (int) abs($beforeScheduleAEnd->diffInMinutes($scheduleA->end_time, false)));
        $this->assertSame(15, (int) abs($beforeScheduleBEnd->diffInMinutes($scheduleB->end_time, false)));
    }

    public function test_reduce_time_is_clamped_to_keep_minimum_remaining_time(): void
    {
        $classId = $this->createClassRoom('X-Reduce');
        $teacher = $this->createUser('guru', $classId, 'teacher-adjust-reduce');
        $admin = $this->createUser('admin', $classId, 'admin-adjust-reduce');
        $student = $this->createUser('siswa', $classId, 'student-adjust-reduce');

        $exam = $this->createActiveExam($teacher->id, $classId, 3, 30);
        ExamClassSchedule::query()->create([
            'exam_id' => $exam->id,
            'class_id' => $classId,
            'start_time' => now()->subMinutes(5),
            'end_time' => now()->addMinutes(3),
            'is_published' => true,
        ]);

        ExamResult::query()->create([
            'exam_id' => $exam->id,
            'student_id' => $student->id,
            'status' => 'in_progress',
            'started_at' => now()->subMinute(),
            'violation_count' => 0,
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/exams/{$exam->id}/adjust-time", [
            'delta_minutes' => -10,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.was_clamped', true);

        $applied = (int) $response->json('data.applied_delta_minutes');
        $this->assertLessThan(0, $applied);
        $this->assertGreaterThan(-10, $applied);

        $exam->refresh();
        $this->assertSame(30 + $applied, (int) $exam->duration);

        Sanctum::actingAs($student);
        $syncResponse = $this->getJson("/api/exams/{$exam->id}/time-sync");
        $syncResponse->assertOk();
        $this->assertGreaterThanOrEqual(50, (int) $syncResponse->json('data.remaining_time'));
    }

    public function test_non_admin_cannot_adjust_active_exam_time(): void
    {
        $classId = $this->createClassRoom('X-Forbidden');
        $teacher = $this->createUser('guru', $classId, 'teacher-adjust-forbidden');
        $exam = $this->createActiveExam($teacher->id, $classId, 20, 60);

        Sanctum::actingAs($teacher);

        $this->postJson("/api/exams/{$exam->id}/adjust-time", [
            'delta_minutes' => 10,
        ])->assertForbidden();
    }

    public function test_admin_can_reduce_time_when_schedule_window_is_running_even_if_exam_status_is_scheduled(): void
    {
        $classId = $this->createClassRoom('X-Schedule-Active');
        $teacher = $this->createUser('guru', $classId, 'teacher-adjust-schedule-active');
        $admin = $this->createUser('admin', $classId, 'admin-adjust-schedule-active');

        $exam = $this->createActiveExam($teacher->id, $classId, 120, 120);
        $exam->update([
            'status' => 'scheduled',
            'start_time' => now()->addHour(),
            'end_time' => now()->addHours(3),
        ]);

        ExamClassSchedule::query()->create([
            'exam_id' => $exam->id,
            'class_id' => $classId,
            'start_time' => now()->subMinutes(10),
            'end_time' => now()->addMinutes(60),
            'is_published' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->postJson("/api/exams/{$exam->id}/adjust-time", [
            'delta_minutes' => -10,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.applied_delta_minutes', -10);

        $exam->refresh();
        $this->assertSame(110, (int) $exam->duration);
        $this->assertSame('active', $exam->status);
    }
}

