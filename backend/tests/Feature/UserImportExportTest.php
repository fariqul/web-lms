<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserImportExportTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Import-User'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createAdmin(int $classId, string $suffix = 'import-user-admin'): User
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

    public function test_admin_can_preview_and_confirm_user_import_with_upsert_and_skip(): void
    {
        $classA = $this->createClassRoom('X IPA 1');
        $classB = $this->createClassRoom('X IPA 2');
        $admin = $this->createAdmin($classA);

        $existingId = (int) DB::table('users')->insertGetId([
            'name' => 'Siswa Lama',
            'email' => 'siswa.lama@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classA,
            'nisn' => 'NISN-LAMA',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $csv = implode("\n", [
            'nama,email,role,jenis_kelamin,nisn,nis,nip,nomor_tes,class_name',
            'Siswa Lama Update,siswa.lama@example.com,siswa,L,NISN-LAMA-NEW,NIS-01,,TES-01,X IPA 2',
            'Guru Baru,guru.baru@example.com,guru,P,,,NIP-NEW,,',
            'Guru Baru Duplikat,guru.baru@example.com,guru,P,,,NIP-NEW2,,',
            'Baris Tanpa Email,,siswa,L,NISN-INVALID,NIS-02,,,X IPA 1',
        ]);

        $file = UploadedFile::fake()->createWithContent('users_import.csv', $csv);

        $preview = $this->post('/api/users/import/preview', [
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

        $confirm = $this->postJson('/api/users/import/confirm', [
            'preview_token' => $token,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.created', 1)
            ->assertJsonPath('data.updated', 1);

        $this->assertSame(2, (int) $confirm->json('data.skipped'));

        $updatedUser = User::query()->findOrFail($existingId);
        $this->assertSame('Siswa Lama Update', $updatedUser->name);
        $this->assertSame('NISN-LAMA-NEW', $updatedUser->nisn);
        $this->assertSame($classB, (int) $updatedUser->class_id);

        $newTeacher = User::query()->where('email', 'guru.baru@example.com')->first();
        $this->assertNotNull($newTeacher);
        $this->assertSame('guru', $newTeacher->role);
    }

    public function test_user_import_without_optional_columns_preserves_existing_values(): void
    {
        $classA = $this->createClassRoom('X Keep A');
        $classB = $this->createClassRoom('X Keep B');
        $admin = $this->createAdmin($classA, 'import-user-keep');

        $existingId = (int) DB::table('users')->insertGetId([
            'name' => 'Siswa Tetap',
            'email' => 'siswa.tetap@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classB,
            'nisn' => 'NISN-TETAP',
            'nomor_tes' => 'TES-TETAP',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $csv = implode("\n", [
            'nama,email,role',
            'Siswa Tetap Update,siswa.tetap@example.com,siswa',
        ]);
        $file = UploadedFile::fake()->createWithContent('users_keep.csv', $csv);

        $preview = $this->post('/api/users/import/preview', [
            'import_file' => $file,
        ], [
            'Accept' => 'application/json',
        ])->assertOk();

        $token = (string) $preview->json('data.preview_token');
        $this->postJson('/api/users/import/confirm', ['preview_token' => $token])
            ->assertOk()
            ->assertJsonPath('data.updated', 1);

        $updatedUser = User::query()->findOrFail($existingId);
        $this->assertSame('Siswa Tetap Update', $updatedUser->name);
        $this->assertSame($classB, (int) $updatedUser->class_id);
        $this->assertSame('NISN-TETAP', $updatedUser->nisn);
        $this->assertSame('TES-TETAP', $updatedUser->nomor_tes);
    }

    public function test_user_import_preview_returns_validation_error_for_invalid_file_content(): void
    {
        $classId = $this->createClassRoom('X Invalid User File');
        $admin = $this->createAdmin($classId, 'invalid-user-file');
        Sanctum::actingAs($admin);

        $fakeXlsx = UploadedFile::fake()->createWithContent('invalid.xlsx', 'not a real spreadsheet');

        $this->post('/api/users/import/preview', [
            'import_file' => $fakeXlsx,
        ], [
            'Accept' => 'application/json',
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_admin_can_export_users_as_csv(): void
    {
        $classId = $this->createClassRoom('X Export User');
        $admin = $this->createAdmin($classId, 'export-user-admin');

        DB::table('users')->insert([
            'name' => 'Siswa Export',
            'email' => 'siswa.export@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $this->get('/api/users/export?format=csv', [
            'Accept' => 'application/json',
        ])
            ->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8');
    }

    public function test_admin_can_download_user_import_template_as_csv_with_utf8_bom_and_example_row(): void
    {
        $classId = $this->createClassRoom('X Template CSV');
        $admin = $this->createAdmin($classId, 'import-template-csv');
        Sanctum::actingAs($admin);

        $response = $this->get('/api/users/import-template?format=csv');
        $response->assertOk()
            ->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $content = $response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $content);
        $this->assertStringContainsString(
            'nama,email,role,jenis_kelamin,nisn,nis,nip,nomor_tes,class_name,class_id',
            $content
        );

        $lines = preg_split("/\r\n|\n|\r/", trim($content));
        $exampleRow = str_getcsv((string) ($lines[1] ?? ''));
        $this->assertSame(
            ['Contoh Siswa', 'contoh.siswa@example.com', 'siswa', 'L', '1234567890', '12345', '', 'TES-001', 'X IPA 1', '1'],
            $exampleRow
        );
    }

    public function test_admin_can_download_user_import_template_as_xlsx_by_default(): void
    {
        $classId = $this->createClassRoom('X Template XLSX');
        $admin = $this->createAdmin($classId, 'import-template-xlsx');
        Sanctum::actingAs($admin);

        $response = $this->get('/api/users/import-template');
        $response->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->assertStringStartsWith('PK', $response->streamedContent());
    }

    public function test_user_import_template_rejects_invalid_format(): void
    {
        $classId = $this->createClassRoom('X Template Invalid');
        $admin = $this->createAdmin($classId, 'import-template-invalid');
        Sanctum::actingAs($admin);

        $this->getJson('/api/users/import-template?format=pdf')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['format']);
    }

    public function test_admin_can_bulk_import_nomor_tes_by_nisn(): void
    {
        $classId = $this->createClassRoom('X Nomor Tes');
        $admin = $this->createAdmin($classId, 'nomor-tes-admin');

        $student1Id = (int) DB::table('users')->insertGetId([
            'name' => 'Siswa Tes Satu',
            'email' => 'siswa.tes.satu@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classId,
            'nisn' => 'NISN-001',
            'nomor_tes' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $student2Id = (int) DB::table('users')->insertGetId([
            'name' => 'Siswa Tes Dua',
            'email' => 'siswa.tes.dua@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classId,
            'nisn' => 'NISN-002',
            'nomor_tes' => 'TES-OLD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        $csv = implode("\n", [
            'NISN,NO. TES',
            'NISN-001,TES-NEW-001', // Should update
            'NISN-002,TES-NEW-002', // Should update (overwriting TES-OLD)
            'NISN-003,TES-NEW-003', // NISN not found
            'NISN-001,TES-NEW-001', // Duplicate row in file, should skip/report
        ]);

        $file = UploadedFile::fake()->createWithContent('nomor_tes_import.csv', $csv);

        $response = $this->post('/api/users/nomor-tes/import', [
            'import_file' => $file,
        ], [
            'Accept' => 'application/json',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.updated', 2)
            ->assertJsonPath('data.not_found_count', 1)
            ->assertJsonPath('data.not_found_nisn.0', 'NISN-003');

        $student1 = User::find($student1Id);
        $student2 = User::find($student2Id);

        $this->assertSame('TES-NEW-001', $student1->nomor_tes);
        $this->assertSame('TES-NEW-002', $student2->nomor_tes);
    }

    public function test_admin_bulk_import_nomor_tes_validation_and_conflicts(): void
    {
        $classId = $this->createClassRoom('X Nomor Tes Conflict');
        $admin = $this->createAdmin($classId, 'nomor-tes-conflict-admin');

        // Student with existing nomor_tes that will conflict
        DB::table('users')->insert([
            'name' => 'Siswa Tes Lain',
            'email' => 'siswa.tes.lain@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classId,
            'nisn' => 'NISN-EXISTING',
            'nomor_tes' => 'TES-TERPAKAI',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $studentId = (int) DB::table('users')->insertGetId([
            'name' => 'Siswa Tes Target',
            'email' => 'siswa.tes.target@example.com',
            'password' => Hash::make('password123'),
            'role' => 'siswa',
            'class_id' => $classId,
            'nisn' => 'NISN-TARGET',
            'nomor_tes' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($admin);

        // Scenario 1: Import with target trying to use an already taken nomor_tes
        $csvConflict = implode("\n", [
            'nisn,no_tes',
            'NISN-TARGET,TES-TERPAKAI',
        ]);
        $fileConflict = UploadedFile::fake()->createWithContent('conflict.csv', $csvConflict);

        $this->post('/api/users/nomor-tes/import', ['import_file' => $fileConflict], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.updated', 0)
            ->assertJsonPath('data.skipped', 1)
            ->assertJsonCount(1, 'data.conflicts');

        $this->assertNull(User::find($studentId)->nomor_tes);

        // Scenario 2: Bad header columns
        $csvBadHeader = implode("\n", [
            'nama,no_urut',
            'A,1',
        ]);
        $fileBad = UploadedFile::fake()->createWithContent('bad_header.csv', $csvBadHeader);
        $this->post('/api/users/nomor-tes/import', ['import_file' => $fileBad], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }
}

