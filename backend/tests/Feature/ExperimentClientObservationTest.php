<?php

namespace Tests\Feature;

use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ExperimentClientObservationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function runningSession(User $admin): ExperimentSession
    {
        return ExperimentSession::create([
            'name'            => 'Sesi Klien',
            'researcher_name' => 'R',
            'lighting'        => 'normal',
            'dataset_split'   => 'test',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ]);
    }

    private function fakeAnalysis(): array
    {
        return [
            'face_analysis' => [
                'face_detected'   => true,
                'face_count'      => 1,
                'face_confidence' => 0.9,
                'head_yaw'        => 4.0,
                'head_pitch'      => 2.0,
                'head_roll'       => 1.0,
                'eye_gaze_ratio'  => 0.2,
                'face_distance'   => null,
            ],
            'all_detections'     => [],
            'person_count'       => 1,
            'risk_score'         => 0,
            'processing_time_ms' => 90,
            'detections'         => [],
        ];
    }

    public function test_capture_stores_client_observation_and_exports_it(): void
    {
        Http::fake(['*/analyze' => Http::response($this->fakeAnalysis(), 200)]);
        Storage::fake('experiment_snapshots');

        $admin   = $this->admin();
        $session = $this->runningSession($admin);

        $response = $this->actingAs($admin)->postJson(
            "/api/experiment-sessions/{$session->id}/capture",
            [
                'image'                  => UploadedFile::fake()->image('frame.jpg', 640, 480),
                'client_face_detected'   => 1,
                'client_face_count'      => 2,
                'client_face_confidence' => 0.81,
                'client_face_bbox'       => json_encode([10, 20, 110, 140]),
                'client_model'           => 'tiny_face_detector@416',
                'client_latency_ms'      => 42,
            ],
        );

        $response->assertOk()
            ->assertJsonPath('data.client_face_detected', true)
            ->assertJsonPath('data.client_face_count', 2)
            ->assertJsonPath('data.client_model', 'tiny_face_detector@416');

        $trial = ExperimentTrial::firstOrFail();
        $this->assertSame(2, $trial->client_face_count);
        $this->assertSame([10, 20, 110, 140], $trial->client_face_bbox);
        $this->assertSame(42, $trial->client_latency_ms);
        $this->assertFalse($trial->pred_multi_face, 'Server prediction must not depend on the client layer.');

        $csv = $this->actingAs($admin)
            ->get("/api/experiment-sessions/{$session->id}/export")
            ->streamedContent();

        $this->assertStringContainsString('client_face_count', $csv);
        $this->assertStringContainsString('tiny_face_detector@416', $csv);
    }

    public function test_capture_without_client_observation_stores_nulls(): void
    {
        Http::fake(['*/analyze' => Http::response($this->fakeAnalysis(), 200)]);
        Storage::fake('experiment_snapshots');

        $admin   = $this->admin();
        $session = $this->runningSession($admin);

        $this->actingAs($admin)->postJson(
            "/api/experiment-sessions/{$session->id}/capture",
            ['image' => UploadedFile::fake()->image('frame.jpg', 640, 480)],
        )->assertOk();

        $trial = ExperimentTrial::firstOrFail();
        $this->assertNull($trial->client_face_detected);
        $this->assertNull($trial->client_face_count);
        $this->assertNull($trial->client_model);
    }

    public function test_invalid_client_observation_is_rejected(): void
    {
        Http::fake(['*/analyze' => Http::response($this->fakeAnalysis(), 200)]);
        Storage::fake('experiment_snapshots');

        $admin   = $this->admin();
        $session = $this->runningSession($admin);

        $this->actingAs($admin)->postJson(
            "/api/experiment-sessions/{$session->id}/capture",
            [
                'image'            => UploadedFile::fake()->image('frame.jpg', 640, 480),
                'client_face_count' => 25,
                'client_face_bbox'  => 'not-json',
            ],
        )->assertStatus(422)
            ->assertJsonValidationErrors(['client_face_count', 'client_face_bbox']);

        $this->assertSame(0, ExperimentTrial::count());
    }
}
