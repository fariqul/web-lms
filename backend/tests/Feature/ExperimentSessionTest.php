<?php

namespace Tests\Feature;

use App\Models\ExamResult;
use App\Models\Exam;
use App\Models\ClassRoom;
use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ExperimentSessionTest extends TestCase
{
    use RefreshDatabase;

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private function adminUser(): User
    {
        return User::factory()->create(['role' => 'admin']);
    }

    private function nonAdminUser(): User
    {
        return User::factory()->create(['role' => 'siswa']);
    }

    private function sessionPayload(array $overrides = []): array
    {
        return array_merge([
            'name'            => 'Test Session',
            'researcher_name' => 'Researcher A',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
        ], $overrides);
    }

    private function fakeFastapiResponse(array $overrides = []): array
    {
        $base = [
            'face_analysis' => [
                'face_detected'   => true,
                'face_count'      => 1,
                'face_confidence' => 0.92,
                'head_yaw'        => 5.0,
                'head_pitch'      => 3.0,
                'head_roll'       => 1.0,
                'eye_gaze_ratio'  => 0.3,
                'face_distance'   => null,
            ],
            'all_detections'   => [],
            'person_count'     => 1,
            'risk_score'       => 0,
            'processing_time_ms' => 120,
            'detections'       => [],
        ];

        return array_replace_recursive($base, $overrides);
    }

    private function runningSession(User $admin, array $overrides = []): ExperimentSession
    {
        return ExperimentSession::create(array_merge([
            'name'            => 'Sesi Uji',
            'researcher_name' => 'R',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ], $overrides));
    }

    // ──────────────────────────────────────────────────────────────────────
    // 1. Non-admin cannot access experiment sessions
    // ──────────────────────────────────────────────────────────────────────

    public function test_non_admin_cannot_access_experiment_sessions(): void
    {
        $user = $this->nonAdminUser();

        $response = $this->actingAs($user)->getJson('/api/experiment-sessions');

        $response->assertStatus(403);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. Admin can create session
    // ──────────────────────────────────────────────────────────────────────

    public function test_admin_can_create_session(): void
    {
        $admin = $this->adminUser();

        $response = $this->actingAs($admin)
            ->postJson('/api/experiment-sessions', $this->sessionPayload());

        $response->assertStatus(201)
            ->assertJsonPath('status', 'created')
            ->assertJsonPath('name', 'Test Session');

        $this->assertDatabaseHas('experiment_sessions', [
            'name'       => 'Test Session',
            'created_by' => $admin->id,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Cannot capture if session is not running
    // ──────────────────────────────────────────────────────────────────────

    public function test_cannot_capture_if_session_not_running(): void
    {
        $admin   = $this->adminUser();
        $session = ExperimentSession::create([
            'name'            => 'S1',
            'researcher_name' => 'R1',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'created',
            'created_by'      => $admin->id,
        ]);

        Storage::fake('experiment_snapshots');

        $image = UploadedFile::fake()->image('photo.jpg', 640, 480);

        $response = $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", [
                'image' => $image,
            ]);

        $response->assertStatus(422)
            ->assertJsonFragment(['message' => 'Sesi tidak dalam status running. Mulai sesi terlebih dahulu.']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. Can capture when running (mocked FastAPI)
    // ──────────────────────────────────────────────────────────────────────

    public function test_can_capture_when_running(): void
    {
        $admin = $this->adminUser();

        Http::fake([
            '*/analyze' => Http::response($this->fakeFastapiResponse(), 200),
        ]);

        Storage::fake('experiment_snapshots');

        $session = ExperimentSession::create([
            'name'            => 'S2',
            'researcher_name' => 'R2',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ]);

        $image = UploadedFile::fake()->image('capture.jpg', 640, 480);

        $response = $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", [
                'image' => $image,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.trial_number', 1)
            ->assertJsonStructure(['data' => ['id', 'session_id', 'trial_number', 'face_detected'], 'active_exam_warning']);

        $this->assertDatabaseHas('experiment_trials', [
            'session_id'   => $session->id,
            'trial_number' => 1,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4b. face_count is read from face_analysis (real service response shape)
    // ──────────────────────────────────────────────────────────────────────

    public function test_capture_reads_face_count_from_face_analysis(): void
    {
        $admin = $this->adminUser();

        Http::fake([
            '*/analyze' => Http::response($this->fakeFastapiResponse([
                'face_analysis' => ['face_count' => 2],
                'person_count'  => 1,
            ]), 200),
        ]);

        Storage::fake('experiment_snapshots');

        $session = $this->runningSession($admin);
        $image   = UploadedFile::fake()->image('two-faces.jpg', 640, 480);

        $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", ['image' => $image])
            ->assertStatus(200)
            ->assertJsonPath('data.face_count', 2)
            ->assertJsonPath('data.pred_multi_face', true);

        $this->assertDatabaseHas('experiment_trials', [
            'session_id'       => $session->id,
            'face_count'       => 2,
            'pred_multi_face'  => true,
            'score_multi_face' => 10,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4c. Default rule — second person counts even with one visible face
    // ──────────────────────────────────────────────────────────────────────

    public function test_capture_default_rule_counts_second_person(): void
    {
        $admin = $this->adminUser();

        Http::fake([
            '*/analyze' => Http::response($this->fakeFastapiResponse([
                'face_analysis' => ['face_count' => 1],
                'person_count'  => 2,
            ]), 200),
        ]);

        Storage::fake('experiment_snapshots');

        $session = $this->runningSession($admin);
        $image   = UploadedFile::fake()->image('two-persons.jpg', 640, 480);

        $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", ['image' => $image])
            ->assertStatus(200)
            ->assertJsonPath('data.pred_multi_face', true);

        $this->assertDatabaseHas('experiment_trials', [
            'session_id'       => $session->id,
            'pred_multi_face'  => true,
            'score_multi_face' => 10,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4d. face_only rule — person count ignored and rule sent to service
    // ──────────────────────────────────────────────────────────────────────

    public function test_capture_face_only_rule_ignores_person_count(): void
    {
        config(['proctoring.multi_face_rule' => 'face_only']);

        $admin = $this->adminUser();

        Http::fake([
            '*/analyze' => Http::response($this->fakeFastapiResponse([
                'face_analysis' => ['face_count' => 1],
                'person_count'  => 2,
            ]), 200),
        ]);

        Storage::fake('experiment_snapshots');

        $session = $this->runningSession($admin);
        $image   = UploadedFile::fake()->image('person-only.jpg', 640, 480);

        $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", ['image' => $image])
            ->assertStatus(200)
            ->assertJsonPath('data.face_count', 1)
            ->assertJsonPath('data.pred_multi_face', false);

        $this->assertDatabaseHas('experiment_trials', [
            'session_id'       => $session->id,
            'pred_multi_face'  => false,
            'score_multi_face' => 0,
        ]);

        Http::assertSent(function ($request) {
            $part = collect($request->data())
                ->first(fn ($item) => is_array($item) && ($item['name'] ?? null) === 'threshold_config');

            $data = json_decode($part['contents'] ?? '{}', true);

            return ($data['multi_face_rule'] ?? null) === 'face_only';
        });
    }

    // ──────────────────────────────────────────────────────────────────────
    // 5. Rate limit — capture too fast returns 422
    // ──────────────────────────────────────────────────────────────────────

    public function test_rate_limit_capture_too_fast(): void
    {
        $admin = $this->adminUser();

        Http::fake([
            '*/analyze' => Http::response($this->fakeFastapiResponse(), 200),
        ]);

        Storage::fake('experiment_snapshots');

        $session = ExperimentSession::create([
            'name'            => 'S3',
            'researcher_name' => 'R3',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ]);

        // Simulate "just captured" by putting a recent timestamp in cache
        Cache::put("experiment_capture_last_{$session->id}", microtime(true), 10);

        $image = UploadedFile::fake()->image('c.jpg');

        $response = $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", [
                'image' => $image,
            ]);

        $response->assertStatus(422)
            ->assertJsonFragment(['message' => 'Terlalu cepat. Tunggu sebentar sebelum capture berikutnya.']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 6. Can update ground truth label
    // ──────────────────────────────────────────────────────────────────────

    public function test_can_update_ground_truth_label(): void
    {
        $admin   = $this->adminUser();
        $session = ExperimentSession::create([
            'name'            => 'S4',
            'researcher_name' => 'R4',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ]);

        $trial = ExperimentTrial::create([
            'session_id'   => $session->id,
            'trial_number' => 1,
            'captured_at'  => now(),
            'gt_phone'     => false,
        ]);

        $response = $this->actingAs($admin)
            ->patchJson("/api/experiment-trials/{$trial->id}", [
                'gt_phone' => true,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('gt_phone', true);

        $this->assertDatabaseHas('experiment_trials', [
            'id'       => $trial->id,
            'gt_phone' => true,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 7. Can mark trial invalid
    // ──────────────────────────────────────────────────────────────────────

    public function test_can_mark_trial_invalid(): void
    {
        $admin   = $this->adminUser();
        $session = ExperimentSession::create([
            'name'            => 'S5',
            'researcher_name' => 'R5',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ]);

        $trial = ExperimentTrial::create([
            'session_id'   => $session->id,
            'trial_number' => 1,
            'captured_at'  => now(),
            'is_invalid'   => false,
        ]);

        $response = $this->actingAs($admin)
            ->patchJson("/api/experiment-trials/{$trial->id}", [
                'is_invalid'          => true,
                'invalidation_reason' => 'Blur image',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('is_invalid', true)
            ->assertJsonPath('invalidation_reason', 'Blur image');
    }

    // ──────────────────────────────────────────────────────────────────────
    // 8. Metrics endpoint returns TP/TN/FP/FN structure
    // ──────────────────────────────────────────────────────────────────────

    public function test_metrics_endpoint_returns_tp_tn_fp_fn(): void
    {
        $admin   = $this->adminUser();
        $session = ExperimentSession::create([
            'name'            => 'S6',
            'researcher_name' => 'R6',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'completed',
            'created_by'      => $admin->id,
        ]);

        // TP: gt=true, pred=true
        ExperimentTrial::create([
            'session_id'   => $session->id,
            'trial_number' => 1,
            'captured_at'  => now(),
            'gt_no_face'   => true,
            'pred_no_face' => true,
            'is_invalid'   => false,
        ]);

        // FP: gt=false, pred=true
        ExperimentTrial::create([
            'session_id'   => $session->id,
            'trial_number' => 2,
            'captured_at'  => now(),
            'gt_no_face'   => false,
            'pred_no_face' => true,
            'is_invalid'   => false,
        ]);

        $response = $this->actingAs($admin)
            ->getJson("/api/experiment-sessions/{$session->id}/metrics");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'per_category' => [
                    'no_face' => ['tp', 'tn', 'fp', 'fn', 'accuracy', 'precision', 'recall', 'f1', 'support', 'total'],
                ],
                'overall'           => ['accuracy', 'precision', 'recall', 'f1'],
                'latency'           => ['inference_ms', 'server_total_ms', 'end_to_end_ms'],
                'trial_count',
                'valid_trial_count',
            ]);

        $noFace = $response->json('per_category.no_face');
        $this->assertEquals(1, $noFace['tp']);
        $this->assertEquals(1, $noFace['fp']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 9. Sweep endpoint returns threshold array
    // ──────────────────────────────────────────────────────────────────────

    public function test_sweep_endpoint_returns_threshold_array(): void
    {
        $admin   = $this->adminUser();
        $session = ExperimentSession::create([
            'name'            => 'S7',
            'researcher_name' => 'R7',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'completed',
            'created_by'      => $admin->id,
        ]);

        // Add a few trials with head_yaw data
        for ($i = 1; $i <= 3; $i++) {
            ExperimentTrial::create([
                'session_id'    => $session->id,
                'trial_number'  => $i,
                'captured_at'   => now(),
                'gt_head_turn'  => $i % 2 === 0,
                'pred_head_turn' => $i % 2 === 0,
                'head_yaw'      => $i * 10.0,
                'is_invalid'    => false,
            ]);
        }

        $response = $this->actingAs($admin)
            ->getJson("/api/experiment-sessions/{$session->id}/sweep?param=head_yaw&category=head_turn&min=10&max=50&steps=5");

        $response->assertStatus(200)
            ->assertJsonStructure([
                'param',
                'category',
                'sweep' => [
                    '*' => ['threshold', 'precision', 'recall', 'f1'],
                ],
            ]);

        $this->assertCount(5, $response->json('sweep'));
    }

    // ──────────────────────────────────────────────────────────────────────
    // 10. Export CSV returns file with correct headers and BOM
    // ──────────────────────────────────────────────────────────────────────

    public function test_export_csv_returns_file_with_correct_headers(): void
    {
        $admin   = $this->adminUser();
        $session = ExperimentSession::create([
            'name'            => 'S8',
            'researcher_name' => 'R8',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'completed',
            'created_by'      => $admin->id,
        ]);

        ExperimentTrial::create([
            'session_id'   => $session->id,
            'trial_number' => 1,
            'captured_at'  => now(),
            'is_invalid'   => false,
        ]);

        $response = $this->actingAs($admin)
            ->get("/api/experiment-sessions/{$session->id}/export");

        $response->assertStatus(200);
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment', $response->headers->get('Content-Disposition'));

        // Check BOM
        $content = $response->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF", $content);

        // Check CSV header columns
        $this->assertStringContainsString('trial_number', $content);
        $this->assertStringContainsString('gt_no_face', $content);
        $this->assertStringContainsString('pred_phone', $content);
        $this->assertStringContainsString('config_scope_used', $content);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 11. Delete session removes snapshot files
    // ──────────────────────────────────────────────────────────────────────

    public function test_delete_session_removes_snapshot_files(): void
    {
        $admin = $this->adminUser();

        Storage::fake('experiment_snapshots');

        $session = ExperimentSession::create([
            'name'            => 'S9',
            'researcher_name' => 'R9',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'completed',
            'created_by'      => $admin->id,
        ]);

        // Simulate a stored snapshot
        Storage::disk('experiment_snapshots')->put("{$session->id}/snapshot.jpg", 'fake-image-data');

        $response = $this->actingAs($admin)
            ->deleteJson("/api/experiment-sessions/{$session->id}?confirm=true");

        $response->assertStatus(200);

        $this->assertDatabaseMissing('experiment_sessions', ['id' => $session->id]);
        Storage::disk('experiment_snapshots')->assertDirectoryEmpty((string) $session->id);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 12. Warning if active exam during capture
    // ──────────────────────────────────────────────────────────────────────

    public function test_warning_if_active_exam_during_capture(): void
    {
        $admin = $this->adminUser();

        Http::fake([
            '*/analyze' => Http::response($this->fakeFastapiResponse(), 200),
        ]);

        Storage::fake('experiment_snapshots');

        $session = ExperimentSession::create([
            'name'            => 'S10',
            'researcher_name' => 'R10',
            'lighting'        => 'normal',
            'dataset_split'   => 'calibration',
            'config_scope'    => 'draft',
            'status'          => 'running',
            'created_by'      => $admin->id,
        ]);

        // Create an in-progress exam result to trigger the warning.
        // No ExamResultFactory exists, so build the valid dependency
        // chain (class -> exam -> exam_result) directly.
        $teacher = User::factory()->create(['role' => 'guru']);
        $student = User::factory()->create(['role' => 'siswa']);
        $class = ClassRoom::create([
            'name'          => 'X-1',
            'grade_level'   => 'X',
            'academic_year' => '2026/2027',
        ]);
        $exam = Exam::create([
            'class_id'   => $class->id,
            'teacher_id' => $teacher->id,
            'title'      => 'Test Exam',
            'subject'    => 'Math',
            'start_time' => now(),
            'end_time'   => now()->addHour(),
            'duration'   => 60,
        ]);
        ExamResult::create([
            'exam_id'    => $exam->id,
            'student_id' => $student->id,
            'status'     => 'in_progress',
        ]);

        $image = UploadedFile::fake()->image('w.jpg');

        $response = $this->actingAs($admin)
            ->postJson("/api/experiment-sessions/{$session->id}/capture", [
                'image' => $image,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('active_exam_warning', true);
    }
}
