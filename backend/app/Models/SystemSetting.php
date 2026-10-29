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

    // ─── Absen Masuk — Staff & Guru ─────────────────────────────────────────
    public const SCHOOL_LATITUDE_KEY               = 'school_latitude';
    public const SCHOOL_LONGITUDE_KEY              = 'school_longitude';
    public const STAFF_ATTENDANCE_RADIUS_KEY        = 'staff_attendance_radius_meters';
    public const STAFF_CHECKIN_START_KEY            = 'staff_attendance_check_in_start';
    public const STAFF_CHECKIN_END_KEY              = 'staff_attendance_check_in_end';

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

    // ─── Graduation Announcement Settings ───

    public const GRADUATION_ANNOUNCEMENT_ACTIVE_KEY = 'graduation_announcement_active';
    public const GRADUATION_ANNOUNCEMENT_DATETIME_KEY = 'graduation_announcement_datetime';

    public static function getGraduationAnnouncementActive(): bool
    {
        $cacheKey = self::cacheKey(self::GRADUATION_ANNOUNCEMENT_ACTIVE_KEY);

        return (bool) Cache::rememberForever($cacheKey, function () {
            try {
                $raw = self::query()
                    ->where('setting_key', self::GRADUATION_ANNOUNCEMENT_ACTIVE_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for graduation active: ' . $e->getMessage());
                return false;
            }

            if ($raw === null) {
                return false;
            }

            return filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? false;
        });
    }

    public static function setGraduationAnnouncementActive(bool $active): void
    {
        try {
            self::updateOrCreate(
                ['setting_key' => self::GRADUATION_ANNOUNCEMENT_ACTIVE_KEY],
                ['setting_value' => $active ? '1' : '0']
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed for graduation active: ' . $e->getMessage());
        }

        Cache::forever(self::cacheKey(self::GRADUATION_ANNOUNCEMENT_ACTIVE_KEY), $active);
    }

    /**
     * Get graduation announcement datetime (UTC ISO 8601 string or null)
     */
    public static function getGraduationAnnouncementDatetime(): ?string
    {
        $cacheKey = self::cacheKey(self::GRADUATION_ANNOUNCEMENT_DATETIME_KEY);

        return Cache::rememberForever($cacheKey, function () {
            try {
                return self::query()
                    ->where('setting_key', self::GRADUATION_ANNOUNCEMENT_DATETIME_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for graduation datetime: ' . $e->getMessage());
                return null;
            }
        });
    }

    public static function setGraduationAnnouncementDatetime(?string $datetime): void
    {
        try {
            self::updateOrCreate(
                ['setting_key' => self::GRADUATION_ANNOUNCEMENT_DATETIME_KEY],
                ['setting_value' => $datetime]
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed for graduation datetime: ' . $e->getMessage());
        }

        Cache::forever(self::cacheKey(self::GRADUATION_ANNOUNCEMENT_DATETIME_KEY), $datetime);
    }

    // ─── Staff Attendance (Absen Masuk) Settings ───

    /**
     * Get school coordinates. Returns ['latitude'=>float|null,'longitude'=>float|null].
     */
    public static function getSchoolCoordinates(): array
    {
        $latitude = Cache::rememberForever(self::cacheKey(self::SCHOOL_LATITUDE_KEY), function () {
            try {
                $raw = self::query()
                    ->where('setting_key', self::SCHOOL_LATITUDE_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for school latitude: ' . $e->getMessage());
                return null;
            }

            return ($raw === null || $raw === '') ? null : (float) $raw;
        });

        $longitude = Cache::rememberForever(self::cacheKey(self::SCHOOL_LONGITUDE_KEY), function () {
            try {
                $raw = self::query()
                    ->where('setting_key', self::SCHOOL_LONGITUDE_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for school longitude: ' . $e->getMessage());
                return null;
            }

            return ($raw === null || $raw === '') ? null : (float) $raw;
        });

        return [
            'latitude' => $latitude,
            'longitude' => $longitude,
        ];
    }

    /**
     * Persist school coordinates. Null stays null; floats stored as strings.
     */
    public static function setSchoolCoordinates(?float $lat, ?float $lng): void
    {
        try {
            self::updateOrCreate(
                ['setting_key' => self::SCHOOL_LATITUDE_KEY],
                ['setting_value' => $lat === null ? null : (string) $lat]
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed for school latitude: ' . $e->getMessage());
        }
        Cache::forever(self::cacheKey(self::SCHOOL_LATITUDE_KEY), $lat);

        try {
            self::updateOrCreate(
                ['setting_key' => self::SCHOOL_LONGITUDE_KEY],
                ['setting_value' => $lng === null ? null : (string) $lng]
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed for school longitude: ' . $e->getMessage());
        }
        Cache::forever(self::cacheKey(self::SCHOOL_LONGITUDE_KEY), $lng);
    }

    /**
     * Get the staff attendance radius in meters. Defaults to 100 when unset/invalid.
     */
    public static function getStaffAttendanceRadius(): int
    {
        return (int) Cache::rememberForever(self::cacheKey(self::STAFF_ATTENDANCE_RADIUS_KEY), function () {
            try {
                $raw = self::query()
                    ->where('setting_key', self::STAFF_ATTENDANCE_RADIUS_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for staff attendance radius: ' . $e->getMessage());
                return 100;
            }

            if ($raw === null || $raw === '') {
                return 100;
            }

            $parsed = (int) $raw;

            return $parsed > 0 ? $parsed : 100;
        });
    }

    public static function setStaffAttendanceRadius(int $meters): void
    {
        try {
            self::updateOrCreate(
                ['setting_key' => self::STAFF_ATTENDANCE_RADIUS_KEY],
                ['setting_value' => (string) $meters]
            );
        } catch (\Throwable $e) {
            Log::warning('SystemSetting write failed for staff attendance radius: ' . $e->getMessage());
        }

        Cache::forever(self::cacheKey(self::STAFF_ATTENDANCE_RADIUS_KEY), $meters);
    }

    /**
     * Get the staff check-in time window. Returns ['start'=>string|null,'end'=>string|null].
     */
    public static function getStaffCheckInWindow(): array
    {
        $start = Cache::rememberForever(self::cacheKey(self::STAFF_CHECKIN_START_KEY), function () {
            try {
                return self::query()
                    ->where('setting_key', self::STAFF_CHECKIN_START_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for staff check-in start: ' . $e->getMessage());
                return null;
            }
        });

        $end = Cache::rememberForever(self::cacheKey(self::STAFF_CHECKIN_END_KEY), function () {
            try {
                return self::query()
                    ->where('setting_key', self::STAFF_CHECKIN_END_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                Log::warning('SystemSetting read failed for staff check-in end: ' . $e->getMessage());
                return null;
            }
        });

        return [
            'start' => $start,
            'end' => $end,
        ];
    }

    /**
     * Combined setter for staff attendance settings. Accepts keys:
     * school_latitude, school_longitude, radius_meters, check_in_start, check_in_end.
     * Calls the individual setters and flushes the affected cache keys.
     */
    public static function setStaffAttendanceSettings(array $data): void
    {
        // Flush stale cached values before persisting fresh ones.
        Cache::forget(self::cacheKey(self::SCHOOL_LATITUDE_KEY));
        Cache::forget(self::cacheKey(self::SCHOOL_LONGITUDE_KEY));
        Cache::forget(self::cacheKey(self::STAFF_ATTENDANCE_RADIUS_KEY));
        Cache::forget(self::cacheKey(self::STAFF_CHECKIN_START_KEY));
        Cache::forget(self::cacheKey(self::STAFF_CHECKIN_END_KEY));

        if (array_key_exists('school_latitude', $data) || array_key_exists('school_longitude', $data)) {
            self::setSchoolCoordinates(
                array_key_exists('school_latitude', $data) ? $data['school_latitude'] : null,
                array_key_exists('school_longitude', $data) ? $data['school_longitude'] : null
            );
        }

        if (array_key_exists('radius_meters', $data) && $data['radius_meters'] !== null) {
            self::setStaffAttendanceRadius((int) $data['radius_meters']);
        }

        if (array_key_exists('check_in_start', $data)) {
            $value = $data['check_in_start'] === '' ? null : $data['check_in_start'];
            try {
                self::updateOrCreate(
                    ['setting_key' => self::STAFF_CHECKIN_START_KEY],
                    ['setting_value' => $value]
                );
            } catch (\Throwable $e) {
                Log::warning('SystemSetting write failed for staff check-in start: ' . $e->getMessage());
            }
            Cache::forever(self::cacheKey(self::STAFF_CHECKIN_START_KEY), $value);
        }

        if (array_key_exists('check_in_end', $data)) {
            $value = $data['check_in_end'] === '' ? null : $data['check_in_end'];
            try {
                self::updateOrCreate(
                    ['setting_key' => self::STAFF_CHECKIN_END_KEY],
                    ['setting_value' => $value]
                );
            } catch (\Throwable $e) {
                Log::warning('SystemSetting write failed for staff check-in end: ' . $e->getMessage());
            }
            Cache::forever(self::cacheKey(self::STAFF_CHECKIN_END_KEY), $value);
        }
    }
}
