<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class ProctoringConfigValidationTest extends TestCase
{
    // ─── Helper: extract rules from UpdateProctoringConfigRequest ────────────

    /**
     * Build a validator using the same rules as UpdateProctoringConfigRequest.
     * The withValidator() after-hooks are reproduced here so we can test the
     * cross-field constraints without bootstrapping a full HTTP request.
     */
    private function validate(array $data): \Illuminate\Validation\Validator
    {
        $rules = [
            'head_yaw_threshold'      => 'sometimes|nullable|numeric|between:11,90',
            'head_pitch_threshold'    => 'sometimes|nullable|numeric|between:11,80',
            'eye_gaze_threshold'      => 'sometimes|nullable|numeric|between:0.1,1.0',
            'face_similarity_threshold' => 'sometimes|nullable|numeric|between:0.3,1.0',
            'confidence_threshold'    => 'sometimes|nullable|numeric|between:0.1,1.0',
            'alert_dedup_window_sec'  => 'sometimes|nullable|integer|between:5,300',
            'score_weights'           => 'sometimes|nullable|array',
            'score_weights.*'         => 'numeric|min:0|max:1',
            'score_increments'        => 'sometimes|nullable|array',
            'score_increments.*'      => 'integer|min:0|max:100',
            'risk_violation_min'      => 'sometimes|nullable|integer|min:0|max:100',
            'risk_alert_any_min'      => 'sometimes|nullable|integer|min:0|max:100',
            'risk_alert_high_min'     => 'sometimes|nullable|integer|min:0|max:100',
            'risk_alert_crit_min'     => 'sometimes|nullable|integer|min:0|max:100',
            'risk_level_medium_min'   => 'sometimes|nullable|integer|min:1|max:100',
            'risk_level_high_min'     => 'sometimes|nullable|integer|min:1|max:100',
            'risk_level_critical_min' => 'sometimes|nullable|integer|min:1|max:100',
            'snapshot_interval_sec'   => 'sometimes|nullable|integer|between:10,300',
            'anomaly_trigger_sec'     => 'sometimes|nullable|integer|between:1,30',
            'anomaly_cooldown_sec'    => 'sometimes|nullable|integer|between:5,120',
            'notes'                   => 'sometimes|nullable|string|max:1000',
        ];

        $validator = Validator::make($data, $rules);

        // Mirror withValidator() after-hooks from UpdateProctoringConfigRequest
        $validator->after(function (\Illuminate\Validation\Validator $v) use ($data) {
            // score_weights sum must be within ±0.01 of 1.0
            if (!empty($data['score_weights']) && is_array($data['score_weights'])) {
                $sum = array_sum($data['score_weights']);
                if (abs($sum - 1.0) > 0.01) {
                    $v->errors()->add(
                        'score_weights',
                        'Total bobot score_weights harus sama dengan 1.0 (total saat ini: ' . round($sum, 3) . ')'
                    );
                }
            }

            // risk_alert ordering: any < high < crit
            $alertAny  = $data['risk_alert_any_min']  ?? null;
            $alertHigh = $data['risk_alert_high_min'] ?? null;
            $alertCrit = $data['risk_alert_crit_min'] ?? null;

            if ($alertAny !== null && $alertHigh !== null && $alertAny >= $alertHigh) {
                $v->errors()->add('risk_alert_any_min', 'risk_alert_any_min harus lebih kecil dari risk_alert_high_min.');
            }

            if ($alertHigh !== null && $alertCrit !== null && $alertHigh >= $alertCrit) {
                $v->errors()->add('risk_alert_high_min', 'risk_alert_high_min harus lebih kecil dari risk_alert_crit_min.');
            }

            // risk_level ordering: medium < high < critical
            $levelMedium   = $data['risk_level_medium_min']   ?? null;
            $levelHigh     = $data['risk_level_high_min']     ?? null;
            $levelCritical = $data['risk_level_critical_min'] ?? null;

            if ($levelMedium !== null && $levelHigh !== null && $levelMedium >= $levelHigh) {
                $v->errors()->add('risk_level_medium_min', 'risk_level_medium_min harus lebih kecil dari risk_level_high_min.');
            }

            if ($levelHigh !== null && $levelCritical !== null && $levelHigh >= $levelCritical) {
                $v->errors()->add('risk_level_high_min', 'risk_level_high_min harus lebih kecil dari risk_level_critical_min.');
            }
        });

        return $validator;
    }

    // ─── score_weights sum tests ─────────────────────────────────────────────

    public function test_sum_weights_exactly_one_is_valid(): void
    {
        $validator = $this->validate([
            'score_weights' => [
                'object'            => 0.25,
                'identity_mismatch' => 0.20,
                'multi_face'        => 0.20,
                'no_face'           => 0.10,
                'head_turn'         => 0.10,
                'eye_gaze'          => 0.05,
                'tab_switch'        => 0.10,
            ],
        ]);

        $this->assertFalse($validator->fails());
    }

    public function test_sum_weights_within_tolerance_is_valid(): void
    {
        // 0.25 + 0.20 + 0.20 + 0.10 + 0.10 + 0.05 + 0.089 = 0.999
        $validator = $this->validate([
            'score_weights' => [
                'object'            => 0.25,
                'identity_mismatch' => 0.20,
                'multi_face'        => 0.20,
                'no_face'           => 0.10,
                'head_turn'         => 0.10,
                'eye_gaze'          => 0.05,
                'tab_switch'        => 0.099,
            ],
        ]);

        $this->assertFalse($validator->fails());
    }

    public function test_sum_weights_out_of_tolerance_is_invalid(): void
    {
        $validator = $this->validate([
            'score_weights' => [
                'object'            => 0.30,
                'identity_mismatch' => 0.30,
                'multi_face'        => 0.20,
            ], // sum = 0.80
        ]);

        $this->assertTrue($validator->fails());
        $this->assertTrue($validator->errors()->has('score_weights'));
    }

    // ─── risk_alert ordering tests ───────────────────────────────────────────

    public function test_risk_ordering_valid(): void
    {
        $validator = $this->validate([
            'risk_alert_any_min'  => 15,
            'risk_alert_high_min' => 30,
            'risk_alert_crit_min' => 60,
        ]);

        $this->assertFalse($validator->fails());
    }

    public function test_risk_ordering_invalid_any_greater_than_high(): void
    {
        $validator = $this->validate([
            'risk_alert_any_min'  => 50,
            'risk_alert_high_min' => 30,
            'risk_alert_crit_min' => 60,
        ]);

        $this->assertTrue($validator->fails());
        $this->assertTrue($validator->errors()->has('risk_alert_any_min'));
    }

    // ─── risk_level ordering tests ───────────────────────────────────────────

    public function test_risk_level_ordering_invalid(): void
    {
        // medium > high → invalid
        $validator = $this->validate([
            'risk_level_medium_min'   => 60,
            'risk_level_high_min'     => 40,
            'risk_level_critical_min' => 80,
        ]);

        $this->assertTrue($validator->fails());
        $this->assertTrue($validator->errors()->has('risk_level_medium_min'));
    }

    // ─── head_yaw_threshold range tests ─────────────────────────────────────

    public function test_head_yaw_threshold_range(): void
    {
        // 10 is below minimum (11) → invalid
        $v1 = $this->validate(['head_yaw_threshold' => 10]);
        $this->assertTrue($v1->fails());
        $this->assertTrue($v1->errors()->has('head_yaw_threshold'));

        // 91 is above maximum (90) → invalid
        $v2 = $this->validate(['head_yaw_threshold' => 91]);
        $this->assertTrue($v2->fails());
        $this->assertTrue($v2->errors()->has('head_yaw_threshold'));

        // 38 is within range → valid
        $v3 = $this->validate(['head_yaw_threshold' => 38]);
        $this->assertFalse($v3->fails());
    }

    // ─── eye_gaze_threshold range tests ─────────────────────────────────────

    public function test_eye_gaze_threshold_range(): void
    {
        // 0.0 is below minimum (0.1) → invalid
        $v1 = $this->validate(['eye_gaze_threshold' => 0.0]);
        $this->assertTrue($v1->fails());
        $this->assertTrue($v1->errors()->has('eye_gaze_threshold'));

        // 0.5 is within range → valid
        $v2 = $this->validate(['eye_gaze_threshold' => 0.5]);
        $this->assertFalse($v2->fails());
    }
}
