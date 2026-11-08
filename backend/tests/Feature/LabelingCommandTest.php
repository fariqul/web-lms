<?php

namespace Tests\Feature;

use App\Models\ProctoringCalibrationLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LabelingCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_export_label_and_import_roundtrip(): void
    {
        Storage::fake('public');

        $dir = storage_path('app/labeling/test-export');
        File::deleteDirectory($dir);

        $teacher = User::factory()->create(['role' => 'guru']);
        $students = User::factory()->count(2)->create(['role' => 'siswa']);

        $classId = DB::table('classes')->insertGetId([
            'name' => 'XII IPA 1',
            'grade_level' => 'XII',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $examId = DB::table('exams')->insertGetId([
            'class_id' => $classId,
            'teacher_id' => $teacher->id,
            'title' => 'Ujian Uji',
            'subject' => 'Matematika',
            'start_time' => now()->subHour(),
            'end_time' => now(),
            'duration' => 60,
            'total_questions' => 10,
            'status' => 'completed',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $base = now()->subMinutes(10);

        foreach ($students as $student) {
            $resultId = DB::table('exam_results')->insertGetId([
                'exam_id' => $examId,
                'student_id' => $student->id,
                'started_at' => $base,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            for ($i = 0; $i < 6; $i++) {
                $path = "monitoring-snapshots/test-{$student->id}-{$i}.jpg";
                Storage::disk('public')->put($path, 'fake-image');

                $snapshotId = DB::table('monitoring_snapshots')->insertGetId([
                    'exam_result_id' => $resultId,
                    'user_id' => $student->id,
                    'student_id' => $student->id,
                    'exam_id' => $examId,
                    'type' => 'exam',
                    'photo_path' => $path,
                    'image_path' => $path,
                    'captured_at' => $base->copy()->addSeconds($i * 20),
                    'is_violation' => $i % 2 === 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                DB::table('proctoring_calibration_logs')->insert([
                    'exam_id' => $examId,
                    'student_id' => $student->id,
                    'snapshot_id' => $snapshotId,
                    'exam_result_id' => $resultId,
                    'ai_is_violation' => $i % 2 === 1,
                    'ai_head_turn' => $i % 2 === 1,
                    'captured_at' => $base->copy()->addSeconds($i * 20),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        // Simulate retention: only 5 of the 12 fake files still exist.
        $stored = Storage::disk('public')->allFiles('monitoring-snapshots');
        foreach (array_slice($stored, 0, 7) as $path) {
            Storage::disk('public')->delete($path);
        }

        $this->artisan('proctoring:export-labeling', [
            '--exam' => [$examId],
            '--limit' => 8,
            '--dedupe-seconds' => 0,
            '--max-per-student' => 5,
            '--seed' => 42,
            '--output' => 'labeling/test-export',
        ])->assertExitCode(0);

        $this->assertFileExists($dir . '/viewer.html');
        $this->assertFileExists($dir . '/labels.csv');
        $this->assertStringContainsString('const ROWS = [', file_get_contents($dir . '/viewer.html'));

        $images = glob($dir . '/images/*.jpg');
        $this->assertCount(5, $images, 'only surviving files are exported');

        $csv = $this->readCsv($dir . '/labels.csv');
        $this->assertCount(6, $csv, 'header + 5 frames');
        $this->assertCount(12, $csv[0]);

        // Edit: row 1 all true, row 2 all false, row 3 left blank.
        $edited = $dir . '/labels-edited.csv';
        $handle = fopen($edited, 'w');
        fputcsv($handle, $csv[0]);

        for ($i = 1; $i < count($csv); $i++) {
            $line = $csv[$i];

            if ($i === 1) {
                for ($c = 6; $c <= 11; $c++) {
                    $line[$c] = '1';
                }
            } elseif ($i === 2) {
                for ($c = 6; $c <= 11; $c++) {
                    $line[$c] = '0';
                }
            }

            fputcsv($handle, $line);
        }

        fclose($handle);

        $this->artisan('proctoring:import-labeling', ['file' => $edited])->assertExitCode(0);

        $positive = ProctoringCalibrationLog::find((int) $csv[1][0]);
        $this->assertTrue($positive->ground_truth_no_face);
        $this->assertTrue($positive->ground_truth_identity_mismatch);
        $this->assertTrue($positive->ground_truth_is_violation);

        $negative = ProctoringCalibrationLog::find((int) $csv[2][0]);
        $this->assertFalse($negative->ground_truth_no_face);
        $this->assertFalse($negative->ground_truth_is_violation);

        $unlabeled = ProctoringCalibrationLog::find((int) $csv[3][0]);
        $this->assertNull($unlabeled->ground_truth_no_face);
        $this->assertNull($unlabeled->ground_truth_is_violation);

        // Re-import must not wipe blank rows and must be idempotent.
        $this->artisan('proctoring:import-labeling', ['file' => $edited])->assertExitCode(0);
        $this->assertTrue($positive->fresh()->ground_truth_no_face);
        $this->assertFalse($negative->fresh()->ground_truth_no_face);

        File::deleteDirectory($dir);
    }

    private function readCsv(string $path): array
    {
        $rows = [];
        $handle = fopen($path, 'r');

        while (($line = fgetcsv($handle)) !== false) {
            $rows[] = $line;
        }

        fclose($handle);

        return $rows;
    }
}
