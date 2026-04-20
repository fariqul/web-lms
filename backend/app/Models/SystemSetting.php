<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class SystemSetting extends Model
{
    use HasFactory;

    public const SNAPSHOT_MONITOR_ENABLED_KEY = 'snapshot_monitor_enabled';
    public const TEACHER_EXAM_RESULTS_HIDDEN_KEY = 'teacher_exam_results_hidden';

    protected $fillable = [
        'setting_key',
        'setting_value',
    ];

    private static function cacheKey(string $key): string
    {
        return "system_setting:{$key}";
    }

    public static function getSnapshotMonitorEnabled(): bool
    {
        $cacheKey = self::cacheKey(self::SNAPSHOT_MONITOR_ENABLED_KEY);

        return (bool) Cache::rememberForever($cacheKey, function () {
            try {
                $raw = self::query()
                    ->where('setting_key', self::SNAPSHOT_MONITOR_ENABLED_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                // Fail-safe: if migration is not applied yet, keep snapshot monitoring enabled.
                Log::warning('SystemSetting read failed, fallback to default enabled: ' . $e->getMessage());
                return true;
            }

            if ($raw === null) {
                return true;
            }

            $parsed = filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            return $parsed ?? true;
        });
    }

    public static function setSnapshotMonitorEnabled(bool $enabled): void
    {
        try {
            self::updateOrCreate(
                ['setting_key' => self::SNAPSHOT_MONITOR_ENABLED_KEY],
                ['setting_value' => $enabled ? '1' : '0']
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed, cache only update applied: ' . $e->getMessage());
        }

        Cache::forever(self::cacheKey(self::SNAPSHOT_MONITOR_ENABLED_KEY), $enabled);
    }

    public static function getTeacherExamResultsHidden(): bool
    {
        $cacheKey = self::cacheKey(self::TEACHER_EXAM_RESULTS_HIDDEN_KEY);

        return (bool) Cache::rememberForever($cacheKey, function () {
            try {
                $raw = self::query()
                    ->where('setting_key', self::TEACHER_EXAM_RESULTS_HIDDEN_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                // Fail-safe: hide exam results for teachers if setting read is unavailable.
                Log::warning('SystemSetting read failed, fallback to hidden teacher exam results: ' . $e->getMessage());
                return true;
            }

            if ($raw === null) {
                return true;
            }

            $parsed = filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

            return $parsed ?? true;
        });
    }

    public static function setTeacherExamResultsHidden(bool $hidden): bool
    {
        try {
            self::updateOrCreate(
                ['setting_key' => self::TEACHER_EXAM_RESULTS_HIDDEN_KEY],
                ['setting_value' => $hidden ? '1' : '0']
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed for teacher exam results visibility: ' . $e->getMessage());
            return false;
        }

        Cache::forever(self::cacheKey(self::TEACHER_EXAM_RESULTS_HIDDEN_KEY), $hidden);
        return true;
    }
}
