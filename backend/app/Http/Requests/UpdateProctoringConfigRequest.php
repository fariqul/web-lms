<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateProctoringConfigRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     * Admin check is handled in the controller.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
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
    }

    /**
     * Additional validation after base rules pass.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $data = $this->validated();

            // Validasi total bobot score_weights harus mendekati 1.0 (toleransi ±0.01)
            if (!empty($data['score_weights']) && is_array($data['score_weights'])) {
                $sum = array_sum($data['score_weights']);
                if (abs($sum - 1.0) > 0.01) {
                    $validator->errors()->add(
                        'score_weights',
                        'Total bobot score_weights harus sama dengan 1.0 (total saat ini: ' . round($sum, 3) . ')'
                    );
                }
            }

            // Validasi urutan risk_alert: any < high < crit
            $alertAny  = $data['risk_alert_any_min']  ?? null;
            $alertHigh = $data['risk_alert_high_min'] ?? null;
            $alertCrit = $data['risk_alert_crit_min'] ?? null;

            if ($alertAny !== null && $alertHigh !== null && $alertAny >= $alertHigh) {
                $validator->errors()->add(
                    'risk_alert_any_min',
                    'risk_alert_any_min harus lebih kecil dari risk_alert_high_min.'
                );
            }

            if ($alertHigh !== null && $alertCrit !== null && $alertHigh >= $alertCrit) {
                $validator->errors()->add(
                    'risk_alert_high_min',
                    'risk_alert_high_min harus lebih kecil dari risk_alert_crit_min.'
                );
            }

            // Validasi urutan risk_level: medium < high < critical
            $levelMedium   = $data['risk_level_medium_min']   ?? null;
            $levelHigh     = $data['risk_level_high_min']     ?? null;
            $levelCritical = $data['risk_level_critical_min'] ?? null;

            if ($levelMedium !== null && $levelHigh !== null && $levelMedium >= $levelHigh) {
                $validator->errors()->add(
                    'risk_level_medium_min',
                    'risk_level_medium_min harus lebih kecil dari risk_level_high_min.'
                );
            }

            if ($levelHigh !== null && $levelCritical !== null && $levelHigh >= $levelCritical) {
                $validator->errors()->add(
                    'risk_level_high_min',
                    'risk_level_high_min harus lebih kecil dari risk_level_critical_min.'
                );
            }
        });
    }

    /**
     * Get custom validation messages in Bahasa Indonesia.
     */
    public function messages(): array
    {
        return [
            'head_yaw_threshold.numeric'         => 'Nilai head_yaw_threshold harus berupa angka.',
            'head_yaw_threshold.between'          => 'Nilai head_yaw_threshold harus antara 11 dan 90.',
            'head_pitch_threshold.numeric'        => 'Nilai head_pitch_threshold harus berupa angka.',
            'head_pitch_threshold.between'        => 'Nilai head_pitch_threshold harus antara 11 dan 80.',
            'eye_gaze_threshold.numeric'          => 'Nilai eye_gaze_threshold harus berupa angka.',
            'eye_gaze_threshold.between'          => 'Nilai eye_gaze_threshold harus antara 0.1 dan 1.0.',
            'face_similarity_threshold.numeric'   => 'Nilai face_similarity_threshold harus berupa angka.',
            'face_similarity_threshold.between'   => 'Nilai face_similarity_threshold harus antara 0.3 dan 1.0.',
            'confidence_threshold.numeric'        => 'Nilai confidence_threshold harus berupa angka.',
            'confidence_threshold.between'        => 'Nilai confidence_threshold harus antara 0.1 dan 1.0.',
            'alert_dedup_window_sec.integer'      => 'Nilai alert_dedup_window_sec harus berupa bilangan bulat.',
            'alert_dedup_window_sec.between'      => 'Nilai alert_dedup_window_sec harus antara 5 dan 300.',
            'score_weights.array'                 => 'score_weights harus berupa objek/array.',
            'score_weights.*.numeric'             => 'Setiap bobot dalam score_weights harus berupa angka.',
            'score_weights.*.min'                 => 'Setiap bobot dalam score_weights tidak boleh kurang dari 0.',
            'score_weights.*.max'                 => 'Setiap bobot dalam score_weights tidak boleh lebih dari 1.',
            'score_increments.array'              => 'score_increments harus berupa objek/array.',
            'score_increments.*.integer'          => 'Setiap nilai dalam score_increments harus berupa bilangan bulat.',
            'score_increments.*.min'              => 'Setiap nilai dalam score_increments tidak boleh kurang dari 0.',
            'score_increments.*.max'              => 'Setiap nilai dalam score_increments tidak boleh lebih dari 100.',
            'risk_violation_min.integer'          => 'Nilai risk_violation_min harus berupa bilangan bulat.',
            'risk_violation_min.min'              => 'Nilai risk_violation_min tidak boleh kurang dari 0.',
            'risk_violation_min.max'              => 'Nilai risk_violation_min tidak boleh lebih dari 100.',
            'risk_alert_any_min.integer'          => 'Nilai risk_alert_any_min harus berupa bilangan bulat.',
            'risk_alert_any_min.min'              => 'Nilai risk_alert_any_min tidak boleh kurang dari 0.',
            'risk_alert_any_min.max'              => 'Nilai risk_alert_any_min tidak boleh lebih dari 100.',
            'risk_alert_high_min.integer'         => 'Nilai risk_alert_high_min harus berupa bilangan bulat.',
            'risk_alert_high_min.min'             => 'Nilai risk_alert_high_min tidak boleh kurang dari 0.',
            'risk_alert_high_min.max'             => 'Nilai risk_alert_high_min tidak boleh lebih dari 100.',
            'risk_alert_crit_min.integer'         => 'Nilai risk_alert_crit_min harus berupa bilangan bulat.',
            'risk_alert_crit_min.min'             => 'Nilai risk_alert_crit_min tidak boleh kurang dari 0.',
            'risk_alert_crit_min.max'             => 'Nilai risk_alert_crit_min tidak boleh lebih dari 100.',
            'risk_level_medium_min.integer'       => 'Nilai risk_level_medium_min harus berupa bilangan bulat.',
            'risk_level_medium_min.min'           => 'Nilai risk_level_medium_min tidak boleh kurang dari 1.',
            'risk_level_medium_min.max'           => 'Nilai risk_level_medium_min tidak boleh lebih dari 100.',
            'risk_level_high_min.integer'         => 'Nilai risk_level_high_min harus berupa bilangan bulat.',
            'risk_level_high_min.min'             => 'Nilai risk_level_high_min tidak boleh kurang dari 1.',
            'risk_level_high_min.max'             => 'Nilai risk_level_high_min tidak boleh lebih dari 100.',
            'risk_level_critical_min.integer'     => 'Nilai risk_level_critical_min harus berupa bilangan bulat.',
            'risk_level_critical_min.min'         => 'Nilai risk_level_critical_min tidak boleh kurang dari 1.',
            'risk_level_critical_min.max'         => 'Nilai risk_level_critical_min tidak boleh lebih dari 100.',
            'snapshot_interval_sec.integer'       => 'Nilai snapshot_interval_sec harus berupa bilangan bulat.',
            'snapshot_interval_sec.between'       => 'Nilai snapshot_interval_sec harus antara 10 dan 300.',
            'anomaly_trigger_sec.integer'         => 'Nilai anomaly_trigger_sec harus berupa bilangan bulat.',
            'anomaly_trigger_sec.between'         => 'Nilai anomaly_trigger_sec harus antara 1 dan 30.',
            'anomaly_cooldown_sec.integer'        => 'Nilai anomaly_cooldown_sec harus berupa bilangan bulat.',
            'anomaly_cooldown_sec.between'        => 'Nilai anomaly_cooldown_sec harus antara 5 dan 120.',
            'notes.string'                        => 'Catatan harus berupa teks.',
            'notes.max'                           => 'Catatan tidak boleh lebih dari 1000 karakter.',
        ];
    }
}
