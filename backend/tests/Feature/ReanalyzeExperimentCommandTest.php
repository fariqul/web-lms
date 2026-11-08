<?php

namespace Tests\Feature;

use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ReanalyzeExperimentCommandTest extends TestCase
{
    use RefreshDatabase;

    private string $outputPath;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('experiment_snapshots');
        $this->outputPath = storage_path('app/reanalysis-test-' . uniqid() . '.csv');
    }

    protected function tearDown(): void
    {
        if (is_file($this->outputPath)) {
            unlink($this->outputPath);
        }

        parent::tearDown();
    }

    private function makeSession(): ExperimentSession
    {
        $admin = User::factory()->create(['role' => 'admin']);

        return ExperimentSession::create([
            'name'            => 'Sesi Reanalisis',
            'researcher_name' => 'R',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'active',
            'status'          => 'completed',
            'created_by'      => $admin->id,
        ]);
    }

    private function trial(ExperimentSession $session, int $number, string $path, bool $gtMultiFace): ExperimentTrial
    {
        Storage::disk('experiment_snapshots')->put($path, 'fake-image');

        return ExperimentTrial::create([
            'session_id'     => $session->id,
            'trial_number'   => $number,
            'snapshot_path'  => $path,
            'gt_multi_face'  => $gtMultiFace,
            'captured_at'    => now(),
        ]);
    }

    private function fakeResponse(int $personCount, int $faceCount): array
    {
        return [
            'success'        => true,
            'face_analysis'  => [
                'face_detected'   => true,
                'face_count'      => $faceCount,
                'face_confidence' => 0.9,
                'head_yaw'        => 5.0,
                'head_pitch'      => 3.0,
                'eye_gaze_ratio'  => 0.3,
                'face_distance'   => null,
            ],
            'all_detections'    => [],
            'person_count'      => $personCount,
            'risk_score'        => 10,
            'processing_time_ms' => 120,
        ];
    }

    private function csvRows(): array
    {
        $handle = fopen($this->outputPath, 'r');
        $rows = [];
        while (($row = fgetcsv($handle)) !== false) {
            $rows[] = $row;
        }
        fclose($handle);

        return $rows;
    }

    public function test_writes_both_multi_face_variants_without_touching_frozen_predictions(): void
    {
        $session = $this->makeSession();
        $first = $this->trial($session, 1, "{$session->id}/a.jpg", false);
        $second = $this->trial($session, 2, "{$session->id}/b.jpg", true);

        Http::fake([
            '*/analyze' => Http::sequence()
                ->push($this->fakeResponse(2, 1), 200)
                ->push($this->fakeResponse(2, 2), 200),
        ]);

        $this->artisan('proctoring:reanalyze-experiment', [
            'session'  => $session->id,
            '--output' => $this->outputPath,
        ])
            // Each variant must be scored on its own 2 trials, not a shared 4-trial collection.
            ->expectsOutputToContain('face_only: macro precision 1.000 | recall 1.000 | F1 1.000')
            ->expectsOutputToContain('person_or_face: macro precision 0.500 | recall 1.000 | F1 0.667')
            ->assertExitCode(0);

        $rows = $this->csvRows();
        $this->assertCount(3, $rows, 'Header plus two analyzed trials expected.');

        $header = $rows[0];
        $firstRow = array_combine($header, $rows[1]);
        $secondRow = array_combine($header, $rows[2]);

        // person in frame is not a face: old rule flags it, face-only does not.
        $this->assertSame('2', $firstRow['person_count']);
        $this->assertSame('1', $firstRow['face_count']);
        $this->assertSame('1', $firstRow['pred_multi_face_person_or_face']);
        $this->assertSame('0', $firstRow['pred_multi_face_face_only']);

        // A real second face is flagged by both rules.
        $this->assertSame('2', $secondRow['face_count']);
        $this->assertSame('1', $secondRow['pred_multi_face_person_or_face']);
        $this->assertSame('1', $secondRow['pred_multi_face_face_only']);

        // Frozen rows stay untouched.
        $this->assertNull($first->fresh()->pred_multi_face);
        $this->assertNull($first->fresh()->face_count);
        $this->assertNull($second->fresh()->face_count);
    }

    public function test_skips_trials_without_snapshot_file(): void
    {
        $session = $this->makeSession();
        $this->trial($session, 1, "{$session->id}/a.jpg", false);

        ExperimentTrial::create([
            'session_id'    => $session->id,
            'trial_number'  => 2,
            'snapshot_path' => "{$session->id}/missing.jpg",
            'captured_at'   => now(),
        ]);

        Http::fake([
            '*/analyze' => Http::response($this->fakeResponse(1, 1), 200),
        ]);

        $this->artisan('proctoring:reanalyze-experiment', [
            'session'  => $session->id,
            '--output' => $this->outputPath,
        ])
            ->expectsOutputToContain('file hilang: 1')
            ->assertExitCode(0);

        $this->assertCount(2, $this->csvRows(), 'Only the trial with an existing snapshot is analyzed.');
        Http::assertSentCount(1);
    }
}
