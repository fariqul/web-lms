<?php

namespace Tests\Feature;

use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CompareLayersCommandTest extends TestCase
{
    use RefreshDatabase;

    private string $outputPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->outputPath = storage_path('app/layers-test-' . uniqid() . '.csv');
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
            'name'            => 'Sesi Banding Lapisan',
            'researcher_name' => 'R',
            'lighting'        => 'normal',
            'dataset_split'   => 'test',
            'config_scope'    => 'active',
            'status'          => 'completed',
            'created_by'      => $admin->id,
        ]);
    }

    private function trial(ExperimentSession $session, int $number, array $attributes): ExperimentTrial
    {
        return ExperimentTrial::create(array_merge([
            'session_id'   => $session->id,
            'trial_number' => $number,
            'captured_at'  => now(),
            'image_width'  => 640,
            'image_height' => 480,
        ], $attributes));
    }

    private function csvRow(string $category, string $mode): array
    {
        $handle = fopen($this->outputPath, 'r');
        $header = fgetcsv($handle);
        $found  = null;

        while (($line = fgetcsv($handle)) !== false) {
            $row = array_combine($header, $line);
            if ($row['category'] === $category && $row['mode'] === $mode) {
                $found = $row;
            }
        }

        fclose($handle);

        $this->assertNotNull($found, "Baris {$category}/{$mode} tidak ditemukan di CSV.");

        return $found;
    }

    public function test_compares_client_and_server_for_multi_face(): void
    {
        $session = $this->makeSession();

        // A: both layers agree, true positive.
        $a = $this->trial($session, 1, [
            'gt_multi_face' => true, 'face_count' => 2, 'person_count' => 1,
            'pred_multi_face' => true, 'client_face_count' => 2, 'client_face_detected' => true,
        ]);
        // B: only the client catches the second face.
        $b = $this->trial($session, 2, [
            'gt_multi_face' => true, 'face_count' => 1, 'person_count' => 1,
            'pred_multi_face' => false, 'client_face_count' => 2, 'client_face_detected' => true,
        ]);
        // C: server flags a second person, but there is only one face.
        $this->trial($session, 3, [
            'gt_multi_face' => false, 'face_count' => 1, 'person_count' => 2,
            'pred_multi_face' => true, 'client_face_count' => 1, 'client_face_detected' => true,
        ]);
        // D: client false positive.
        $this->trial($session, 4, [
            'gt_multi_face' => false, 'face_count' => 1, 'person_count' => 1,
            'pred_multi_face' => false, 'client_face_count' => 2, 'client_face_detected' => true,
        ]);
        // E: trial captured before the client layer was recorded.
        $this->trial($session, 5, [
            'gt_multi_face' => false, 'face_count' => 1, 'person_count' => 1,
            'pred_multi_face' => false, 'client_face_count' => null, 'client_face_detected' => null,
        ]);

        $this->artisan('proctoring:compare-layers', [
            'session'  => $session->id,
            '--output' => $this->outputPath,
        ])
            ->expectsOutputToContain('gabungan AND')
            ->expectsOutputToContain('tanpa data klien: 1')
            ->assertExitCode(0);

        $server = $this->csvRow('multi_face', 'server');
        $this->assertSame(['1', '2', '1', '1', '5'], [
            $server['tp'], $server['tn'], $server['fp'], $server['fn'], $server['n'],
        ]);

        $faceOnly = $this->csvRow('multi_face', 'server_wajah');
        $this->assertSame(['1', '3', '0', '1', '5'], [
            $faceOnly['tp'], $faceOnly['tn'], $faceOnly['fp'], $faceOnly['fn'], $faceOnly['n'],
        ]);

        $client = $this->csvRow('multi_face', 'klien');
        $this->assertSame(['2', '1', '1', '0', '4'], [
            $client['tp'], $client['tn'], $client['fp'], $client['fn'], $client['n'],
        ]);

        $or = $this->csvRow('multi_face', 'gabungan_or');
        $this->assertSame(['2', '0', '2', '0', '4'], [
            $or['tp'], $or['tn'], $or['fp'], $or['fn'], $or['n'],
        ]);

        $and = $this->csvRow('multi_face', 'gabungan_and');
        $this->assertSame(['1', '2', '0', '1', '4'], [
            $and['tp'], $and['tn'], $and['fp'], $and['fn'], $and['n'],
        ]);

        // The command must never rewrite frozen predictions.
        $this->assertTrue($a->fresh()->pred_multi_face);
        $this->assertFalse($b->fresh()->pred_multi_face);
    }

    public function test_compares_client_and_server_for_no_face(): void
    {
        $session = $this->makeSession();

        // F: client catches the missing face the server missed.
        $this->trial($session, 1, [
            'gt_no_face' => true, 'pred_no_face' => false,
            'face_detected' => true, 'face_count' => 1,
            'client_face_detected' => false, 'client_face_count' => 0,
        ]);
        // G: server false positive, client correctly sees a face.
        $this->trial($session, 2, [
            'gt_no_face' => false, 'pred_no_face' => true,
            'face_detected' => false, 'face_count' => 0,
            'client_face_detected' => true, 'client_face_count' => 1,
        ]);
        // H: no client data at all.
        $this->trial($session, 3, [
            'gt_no_face' => false, 'pred_no_face' => false,
            'face_detected' => true, 'face_count' => 1,
        ]);

        $this->artisan('proctoring:compare-layers', [
            'session'  => $session->id,
            '--output' => $this->outputPath,
        ])->assertExitCode(0);

        $server = $this->csvRow('no_face', 'server');
        $this->assertSame(['0', '1', '1', '1', '3'], [
            $server['tp'], $server['tn'], $server['fp'], $server['fn'], $server['n'],
        ]);

        $client = $this->csvRow('no_face', 'klien');
        $this->assertSame(['1', '1', '0', '0', '2'], [
            $client['tp'], $client['tn'], $client['fp'], $client['fn'], $client['n'],
        ]);

        $or = $this->csvRow('no_face', 'gabungan_or');
        $this->assertSame(['1', '0', '1', '0', '2'], [
            $or['tp'], $or['tn'], $or['fp'], $or['fn'], $or['n'],
        ]);

        $and = $this->csvRow('no_face', 'gabungan_and');
        $this->assertSame(['0', '1', '0', '1', '2'], [
            $and['tp'], $and['tn'], $and['fp'], $and['fn'], $and['n'],
        ]);
    }
}
