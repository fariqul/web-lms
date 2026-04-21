<?php

namespace Tests\Feature;

use App\Models\ClassRoom;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ClassImportExportTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Import-Class'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createAdmin(int $classId, string $suffix = 'import-class-admin'): User
    {
        $id = (int) DB::table('users')->insertGetId([
            'name' => "Admin {$suffix}",
            'email' => "admin-{$suffix}@example.com",
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'class_id' => $classId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::query()->findOrFail($id);
    }

    public function test_admin_can_preview_and_confirm_class_import_upsert(): void
    {
        $existingClassId = $this->createClassRoom('XI IPA 1');
        $adminClass = $this->createClassRoom('X Admin');
        $admin = $this->createAdmin($adminClass);

        Sanctum::actingAs($admin);

        $csv = implode("\n", [
            'name,grade_level,academic_year',
            'XI IPA 1,XI,2027/2028',
            'XII IPA 2,XII,2026/2027',
            'XII IPA 2,XII,2026/2028',
            ',X,2026/2027',
        ]);
        $file = UploadedFile::fake()->createWithContent('classes_import.csv', $csv);

        $preview = $this->post('/api/classes/import/preview', [
            'import_file' => $file,
        ], [
            'Accept' => 'application/json',
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.summary.to_update', 1)
            ->assertJsonPath('data.summary.to_create', 1)
            ->assertJsonPath('data.summary.to_skip', 2);

        $token = (string) $preview->json('data.preview_token');
        $this->assertNotSame('', $token);

        $confirm = $this->postJson('/api/classes/import/confirm', [
            'preview_token' => $token,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.created', 1)
            ->assertJsonPath('data.updated', 1);

        $this->assertSame(2, (int) $confirm->json('data.skipped'));

        $updatedClass = ClassRoom::query()->findOrFail($existingClassId);
        $this->assertSame('2027/2028', $updatedClass->academic_year);
        $this->assertSame('XI', $updatedClass->grade_level);

        $this->assertTrue(ClassRoom::query()->where('name', 'XII IPA 2')->exists());
    }

    public function test_class_import_preview_returns_validation_error_for_invalid_file_content(): void
    {
        $classId = $this->createClassRoom('X Invalid Class File');
        $admin = $this->createAdmin($classId, 'invalid-class-file');
        Sanctum::actingAs($admin);

        $fakeXlsx = UploadedFile::fake()->createWithContent('invalid.xlsx', 'not a real spreadsheet');

        $this->post('/api/classes/import/preview', [
            'import_file' => $fakeXlsx,
        ], [
            'Accept' => 'application/json',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_admin_can_export_classes_as_csv(): void
    {
        $classId = $this->createClassRoom('X Export Class');
        $admin = $this->createAdmin($classId, 'export-class-admin');

        Sanctum::actingAs($admin);

        $this->get('/api/classes/export?format=csv', [
            'Accept' => 'application/json',
        ])
            ->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8');
    }
}

