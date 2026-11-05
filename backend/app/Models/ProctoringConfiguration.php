<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ProctoringConfiguration extends Model
{
    protected $fillable = [
        'scope', 'head_yaw_threshold', 'head_pitch_threshold', 'eye_gaze_threshold',
        'face_similarity_threshold', 'confidence_threshold', 'per_class_confidence',
        'alert_dedup_window_sec', 'score_weights', 'score_increments',
        'risk_violation_min', 'risk_alert_any_min', 'risk_alert_high_min', 'risk_alert_crit_min',
        'risk_level_medium_min', 'risk_level_high_min', 'risk_level_critical_min',
        'snapshot_interval_sec', 'anomaly_trigger_sec', 'anomaly_cooldown_sec',
        'notes', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'head_yaw_threshold'      => 'float',
        'head_pitch_threshold'    => 'float',
        'eye_gaze_threshold'      => 'float',
        'face_similarity_threshold' => 'float',
        'confidence_threshold'    => 'float',
        'per_class_confidence'    => 'array',
        'alert_dedup_window_sec'  => 'integer',
        'score_weights'           => 'array',
        'score_increments'        => 'array',
        'risk_violation_min'      => 'integer',
        'risk_alert_any_min'      => 'integer',
        'risk_alert_high_min'     => 'integer',
        'risk_alert_crit_min'     => 'integer',
        'risk_level_medium_min'   => 'integer',
        'risk_level_high_min'     => 'integer',
        'risk_level_critical_min' => 'integer',
        'snapshot_interval_sec'   => 'integer',
        'anomaly_trigger_sec'     => 'integer',
        'anomaly_cooldown_sec'    => 'integer',
    ];

    private static function cacheKey(string $scope): string
    {
        return "proctoring:config:{$scope}";
    }

    public static function getActive(): array
    {
        $ttl = (int) env('PROCTORING_CONFIG_CACHE_TTL', 300);
        return Cache::remember(self::cacheKey('active'), $ttl, function () {
            try {
                $model = self::where('scope', 'active')->first();
                if ($model) {
                    return self::buildConfigArray($model);
                }
            } catch (\Throwable $e) {
                Log::warning('[ProctoringConfig] Failed to load active config, using defaults: ' . $e->getMessage());
            }
            return self::getDefaults();
        });
    }

    public static function getDraft(): array
    {
        $ttl = (int) env('PROCTORING_CONFIG_CACHE_TTL', 300);
        return Cache::remember(self::cacheKey('draft'), $ttl, function () {
            try {
                $model = self::where('scope', 'draft')->first();
                if ($model) {
                    return self::buildConfigArray($model);
                }
            } catch (\Throwable $e) {
                Log::warning('[ProctoringConfig] Failed to load draft config, using defaults: ' . $e->getMessage());
            }
            return self::getDefaults();
        });
    }

    public static function invalidateCache(string $scope): void
    {
        Cache::forget(self::cacheKey($scope));
    }

    public static function getDefaults(): array
    {
        return [
            'head_yaw_threshold'      => (float) config('proctoring.head_yaw_threshold', 38),
            'head_pitch_threshold'    => (float) config('proctoring.head_pitch_threshold', 33),
            'eye_gaze_threshold'      => (float) config('proctoring.eye_gaze_threshold', 0.48),
            'face_similarity_threshold' => (float) config('proctoring.face_similarity_threshold', 0.6),
            'confidence_threshold'    => (float) config('proctoring.confidence_threshold', 0.45),
            'per_class_confidence'    => null,
            'alert_dedup_window_sec'  => (int) config('proctoring.alert_dedup_window_seconds', 15),
            'score_weights'           => config('proctoring.score_weights'),
            'score_increments'        => config('proctoring.score_increments'),
            'risk_violation_min'      => (int) config('proctoring.risk_score.violation_min', 20),
            'risk_alert_any_min'      => (int) config('proctoring.risk_score.alert_any_min', 15),
            'risk_alert_high_min'     => (int) config('proctoring.risk_score.alert_high_min', 30),
            'risk_alert_crit_min'     => (int) config('proctoring.risk_score.alert_crit_min', 60),
            'risk_level_medium_min'   => (int) config('proctoring.risk_level.medium_min', 26),
            'risk_level_high_min'     => (int) config('proctoring.risk_level.high_min', 51),
            'risk_level_critical_min' => (int) config('proctoring.risk_level.critical_min', 76),
            'snapshot_interval_sec'   => 30,
            'anomaly_trigger_sec'     => 3,
            'anomaly_cooldown_sec'    => 20,
            'notes'                   => null,
        ];
    }

    private static function buildConfigArray(self $model): array
    {
        return [
            'head_yaw_threshold'      => $model->head_yaw_threshold,
            'head_pitch_threshold'    => $model->head_pitch_threshold,
            'eye_gaze_threshold'      => $model->eye_gaze_threshold,
            'face_similarity_threshold' => $model->face_similarity_threshold,
            'confidence_threshold'    => $model->confidence_threshold,
            'per_class_confidence'    => $model->per_class_confidence,
            'alert_dedup_window_sec'  => $model->alert_dedup_window_sec,
            'score_weights'           => $model->score_weights ?? config('proctoring.score_weights'),
            'score_increments'        => $model->score_increments ?? config('proctoring.score_increments'),
            'risk_violation_min'      => $model->risk_violation_min,
            'risk_alert_any_min'      => $model->risk_alert_any_min,
            'risk_alert_high_min'     => $model->risk_alert_high_min,
            'risk_alert_crit_min'     => $model->risk_alert_crit_min,
            'risk_level_medium_min'   => $model->risk_level_medium_min,
            'risk_level_high_min'     => $model->risk_level_high_min,
            'risk_level_critical_min' => $model->risk_level_critical_min,
            'snapshot_interval_sec'   => $model->snapshot_interval_sec,
            'anomaly_trigger_sec'     => $model->anomaly_trigger_sec,
            'anomaly_cooldown_sec'    => $model->anomaly_cooldown_sec,
            'notes'                   => $model->notes,
        ];
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
