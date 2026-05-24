<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\ClassRoom;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserBlockTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name, string $gradeLevel): ClassRoom
    {
        $class = new ClassRoom();
        $class->name = $name;
        $class->grade_level = $gradeLevel;
        $class->academic_year = '2026/2027';
        $class->is_active = true;
        $class->save();
        return $class;
    }

    private function createUser(string $name, string $email, string $role, ?int $classId = null): User
    {
        $user = new User();
        $user->name = $name;
        $user->email = $email;
        $user->password = bcrypt('password123');
        $user->role = $role;
        $user->class_id = $classId;
        $user->save();
        return $user;
    }

    public function test_admin_can_toggle_block_students_by_grade_level(): void
    {
        $classX1 = $this->createClassRoom('X IPA 1', 'X');
        $classX2 = $this->createClassRoom('X IPA 2', 'X');
        $classXI = $this->createClassRoom('XI IPA 1', 'XI');

        $admin = $this->createUser('Admin', 'admin@example.com', 'admin');
        
        $studentX1 = $this->createUser('Student X1', 'studentx1@example.com', 'siswa', $classX1->id);
        $studentX2 = $this->createUser('Student X2', 'studentx2@example.com', 'siswa', $classX2->id);
        $studentXI = $this->createUser('Student XI', 'studentxi@example.com', 'siswa', $classXI->id);

        Sanctum::actingAs($admin);

        // Block X students
        $response = $this->postJson('/api/students/toggle-block-by-grade', [
            'grade_level' => 'X',
            'is_blocked' => true,
            'reason' => 'Ujian Akhir Semester',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('affected_count', 2);

        $studentX1->refresh();
        $studentX2->refresh();
        $studentXI->refresh();

        $this->assertTrue($studentX1->is_blocked);
        $this->assertSame('Ujian Akhir Semester', $studentX1->block_reason);
        $this->assertTrue($studentX2->is_blocked);
        $this->assertFalse($studentXI->is_blocked);

        // Unblock X students
        $response = $this->postJson('/api/students/toggle-block-by-grade', [
            'grade_level' => 'X',
            'is_blocked' => false,
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('affected_count', 2);

        $studentX1->refresh();
        $studentX2->refresh();

        $this->assertFalse($studentX1->is_blocked);
        $this->assertNull($studentX1->block_reason);
        $this->assertFalse($studentX2->is_blocked);
    }

    public function test_non_admin_cannot_toggle_block_students_by_grade_level(): void
    {
        $classX = $this->createClassRoom('X IPA 1', 'X');
        $student = $this->createUser('Student', 'student@example.com', 'siswa', $classX->id);

        Sanctum::actingAs($student);

        $response = $this->postJson('/api/students/toggle-block-by-grade', [
            'grade_level' => 'X',
            'is_blocked' => true,
        ]);

        $response->assertStatus(403);
    }
}
