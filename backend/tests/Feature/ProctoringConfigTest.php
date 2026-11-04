<?php

namespace Tests\Feature;

use App\Models\ProctoringConfiguration;
use App\Models\ProctoringConfigVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\WithFaker;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProctoringConfigTest extends TestCase
{
    use RefreshDatabase, WithFaker;

    private User $admin;
    private User $siswa;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create(['role' => 'admin']);
        $this->siswa = User::factory()->create(['role' => 'siswa']);
    }

    // ─── Helper: valid draft payload ────────────────────────────────────────

    private function validDraftPayload(): array
    {
        return [
            'head_yaw_threshold'   => 38,
            'head_pitch_threshold' => 33,
            'eye_gaze_threshold'   => 0.48,
            'score_weights'        => [
                'object'            => 0.25,
                'identity_mismatch' => 0.20,
                'multi_face'        => 0.20,
                'no_face'           => 0.10,
                'head_turn'         => 0.10,
                'eye_gaze'          => 0.05,
                'tab_switch'        => 0.10,
            ],
            'score_increments'     => [
                'object_per_item'   => 15,
                'multi_face'        => 10,
                'no_face'           => 15,
                'head_turn'         => 8,
                'eye_gaze'          => 5,
                'identity_base'     => 30,
            ],
            'risk_alert_any_min'   => 15,
            'risk_alert_high_min'  => 30,
            'risk_alert_crit_min'  => 60,
        ];
    }

    // ─── 1. Non-admin 403 on GET ─────────────────────────────────────────────

    public function test_non_admin_gets_403_on_get_config(): void
    {
        Sanctum::actingAs($this->siswa);

        $this->getJson('/api/proctoring-config')
            ->assertStatus(403);
    }

    // ─── 2. Non-admin 403 on POST draft ─────────────────────────────────────

    public function test_non_admin_gets_403_on_update_draft(): void
    {
        Sanctum::actingAs($this->siswa);

        $this->postJson('/api/proctoring-config/draft', $this->validDraftPayload())
            ->assertStatus(403);
    }

    // ─── 3. GET returns defaults when table empty ────────────────────────────

    public function test_get_config_returns_defaults_when_table_empty(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->getJson('/api/proctoring-config')
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $response->assertJsonPath('data.draft.head_yaw_threshold', 38);
        $response->assertJsonPath('data.active.head_yaw_threshold', 38);
    }

    // ─── 4. Update draft with valid data ────────────────────────────────────

    public function test_update_draft_with_valid_data(): void
    {
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/proctoring-config/draft', $this->validDraftPayload())
            ->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    // ─── 5. score_weights sum not 1.0 → 422 ─────────────────────────────────

    public function test_update_draft_fails_when_score_weights_sum_not_one(): void
    {
        Sanctum::actingAs($this->admin);

        $payload = $this->validDraftPayload();
        $payload['score_weights'] = [
            'object'            => 0.30,
            'identity_mismatch' => 0.30,
            'multi_face'        => 0.20,
        ]; // sum = 0.80, not 1.0

        $this->postJson('/api/proctoring-config/draft', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['score_weights']);
    }

    // ─── 6. risk_alert_any_min > risk_alert_high_min → 422 ──────────────────

    public function test_update_draft_fails_when_risk_thresholds_not_monotonic(): void
    {
        Sanctum::actingAs($this->admin);

        $payload = $this->validDraftPayload();
        $payload['risk_alert_any_min']  = 50; // greater than high
        $payload['risk_alert_high_min'] = 30;

        $this->postJson('/api/proctoring-config/draft', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['risk_alert_any_min']);
    }

    // ─── 7. apply → creates version record ──────────────────────────────────

    public function test_apply_to_active_creates_version_record(): void
    {
        // Seed a draft first
        ProctoringConfiguration::create(array_merge(
            ['scope' => 'draft'],
            $this->validDraftPayload()
        ));

        Sanctum::actingAs($this->admin);

        $this->postJson('/api/proctoring-config/apply')
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertSame(1, ProctoringConfigVersion::count());
    }

    // ─── 8. rollback restores config and adds version ────────────────────────

    public function test_rollback_restores_config(): void
    {
        // Seed a version record so we have something to roll back to
        $snapshot = array_merge($this->validDraftPayload(), [
            'face_similarity_threshold' => 0.6,
            'confidence_threshold'      => 0.45,
            'alert_dedup_window_sec'    => 15,
            'risk_violation_min'        => 20,
            'risk_level_medium_min'     => 26,
            'risk_level_high_min'       => 51,
            'risk_level_critical_min'   => 76,
            'snapshot_interval_sec'     => 30,
            'anomaly_trigger_sec'       => 3,
            'anomaly_cooldown_sec'      => 20,
            'notes'                     => null,
            'per_class_confidence'      => null,
        ]);

        $version = ProctoringConfigVersion::create([
            'config_scope'   => 'active',
            'version_number' => 1,
            'snapshot'       => $snapshot,
            'changed_by'     => $this->admin->id,
            'notes'          => 'initial',
        ]);

        $countBefore = ProctoringConfigVersion::count();

        Sanctum::actingAs($this->admin);

        $this->postJson("/api/proctoring-config/rollback/{$version->id}")
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertGreaterThan($countBefore, ProctoringConfigVersion::count());
    }

    // ─── 9. Cache invalidated after update ──────────────────────────────────

    public function test_cache_is_invalidated_after_update(): void
    {
        // Prime the cache by hitting GET first
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/proctoring-config');

        // Now update draft
        $this->postJson('/api/proctoring-config/draft', $this->validDraftPayload())
            ->assertStatus(200);

        $this->assertFalse(Cache::has('proctoring:config:draft'));
    }

    // ─── 10. GET returns 200 with expected top-level keys ────────────────────

    public function test_get_config_returns_200_for_admin(): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/proctoring-config')
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    'draft',
                    'active',
                    'defaults',
                ],
            ]);
    }
}
