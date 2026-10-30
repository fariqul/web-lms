<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffAttendance;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class StaffAttendanceController extends Controller
{
    // ─── Self check-in (guru / staff) ────────────────────────────────────────

    /**
     * POST /api/staff-attendance/check-in
     */
    public function checkIn(Request $request): JsonResponse
    {
        $request->validate([
            'latitude'  => 'nullable|numeric|between:-90,90',
            'longitude' => 'nullable|numeric|between:-180,180',
            'device_id' => 'nullable|string|max:255',
            'notes'     => 'nullable|string|max:500',
        ]);

        $user = $request->user();

        // 1. Already checked in today?
        $existing = StaffAttendance::where('user_id', $user->id)
            ->whereDate('date', today())
            ->first();

        if ($existing) {
            return response()->json([
                'success'    => false,
                'message'    => 'Anda sudah absen masuk hari ini pukul ' . $existing->checked_in_at?->format('H:i') . '.',
                'error_code' => 'ALREADY_CHECKED_IN',
                'data'       => [
                    'checked_in_at'    => $existing->checked_in_at,
                    'location_method'  => $existing->location_method,
                    'is_location_valid' => $existing->is_location_valid,
                ],
            ], 422);
        }

        // 2. Check-in window (skip if not configured)
        $window = SystemSetting::getStaffCheckInWindow();
        if ($window['start'] && $window['end']) {
            $now   = now()->format('H:i');
            $start = $window['start'];
            $end   = $window['end'];
            if ($now < $start || $now > $end) {
                return response()->json([
                    'success'    => false,
                    'message'    => "Absen masuk hanya bisa dilakukan antara {$start} – {$end}.",
                    'error_code' => 'OUTSIDE_CHECK_IN_WINDOW',
                ], 422);
            }
        }

        // 3. Location validation — GPS only
        $lat       = $request->input('latitude');
        $lng       = $request->input('longitude');
        $coords    = SystemSetting::getSchoolCoordinates();
        $schoolLat = $coords['latitude'];
        $schoolLng = $coords['longitude'];

        $locationMethod  = 'gps';
        $isLocationValid = true;  // default: allow when coordinates not yet configured
        $distanceMeters  = null;

        if ($schoolLat !== null && $schoolLng !== null) {
            // School coordinates configured — enforce GPS radius check
            $radius = SystemSetting::getStaffAttendanceRadius();

            if ($lat !== null && $lng !== null) {
                // GPS available: calculate distance
                $distanceMeters  = (int) round($this->haversineDistance((float)$lat, (float)$lng, $schoolLat, $schoolLng));
                $isLocationValid = $distanceMeters <= $radius;
            } else {
                // GPS not available: reject
                return response()->json([
                    'success'    => false,
                    'message'    => 'Absen masuk memerlukan izin GPS. Aktifkan lokasi di perangkat Anda lalu coba lagi.',
                    'error_code' => 'GPS_REQUIRED',
                ], 422);
            }

            if (!$isLocationValid) {
                return response()->json([
                    'success'         => false,
                    'message'         => "Lokasi tidak valid. Anda berada {$distanceMeters} m dari sekolah (batas {$radius} m).",
                    'error_code'      => 'LOCATION_INVALID',
                    'distance_meters' => $distanceMeters,
                ], 422);
            }
        } elseif ($lat !== null && $lng !== null) {
            // Coordinates not configured yet — GPS data received, save it but skip radius check
            $isLocationValid = true;
        }
        // If GPS not sent and coordinates not configured — allow (unconfigured system)

        // 4. Save
        $record = StaffAttendance::create([
            'user_id'           => $user->id,
            'date'              => today(),
            'checked_in_at'     => now(),
            'latitude'          => $lat,
            'longitude'         => $lng,
            'ip_address'        => $request->ip(),
            'location_method'   => $locationMethod,
            'is_location_valid' => $isLocationValid,
            'distance_meters'   => $distanceMeters,
            'device_id'         => $request->input('device_id'),
            'notes'             => $request->input('notes'),
        ]);

        return response()->json([
            'success'         => true,
            'message'         => 'Absen masuk berhasil dicatat!',
            'data'            => [
                'checked_in_at'    => $record->checked_in_at,
                'location_method'  => $record->location_method,
                'is_location_valid' => $record->is_location_valid,
                'distance_meters'  => $record->distance_meters,
            ],
        ]);
    }

    /**
     * GET /api/staff-attendance/today
     * Check whether the authenticated user has already checked in today.
     */
    public function todayStatus(Request $request): JsonResponse
    {
        $record = StaffAttendance::where('user_id', $request->user()->id)
            ->whereDate('date', today())
            ->first();

        return response()->json([
            'success' => true,
            'data'    => [
                'has_checked_in'    => $record !== null,
                'checked_in_at'     => $record?->checked_in_at,
                'location_method'   => $record?->location_method,
                'is_location_valid' => $record?->is_location_valid,
                'distance_meters'   => $record?->distance_meters,
            ],
        ]);
    }

    /**
     * GET /api/staff-attendance/history
     * Personal attendance history (last 30 days).
     */
    public function myHistory(Request $request): JsonResponse
    {
        $records = StaffAttendance::where('user_id', $request->user()->id)
            ->orderBy('date', 'desc')
            ->limit(30)
            ->get(['date', 'checked_in_at', 'location_method', 'is_location_valid', 'distance_meters']);

        return response()->json([
            'success' => true,
            'data'    => $records,
        ]);
    }

    // ─── Admin endpoints ──────────────────────────────────────────────────────

    /**
     * GET /api/staff-attendance
     * Recap for a given date (default: today) with optional role filter.
     */
    public function adminIndex(Request $request): JsonResponse
    {
        $request->validate([
            'date' => 'nullable|date',
            'role' => 'nullable|in:guru,staff',
        ]);

        $date = $request->input('date', today()->toDateString());

        // All staff/guru users
        $query = User::whereIn('role', ['guru', 'staff'])
            ->select('id', 'name', 'nip', 'jabatan', 'role')
            ->orderBy('name');

        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }

        $users = $query->get();

        // Load attendances for that date
        $attendances = StaffAttendance::whereIn('user_id', $users->pluck('id'))
            ->whereDate('date', $date)
            ->get()
            ->keyBy('user_id');

        $list = $users->map(function (User $u) use ($attendances) {
            $att = $attendances->get($u->id);
            return [
                'user_id'          => $u->id,
                'name'             => $u->name,
                'nip'              => $u->nip ?? '-',
                'jabatan'          => $u->jabatan ?? '-',
                'role'             => $u->role,
                'has_checked_in'   => $att !== null,
                'checked_in_at'    => $att?->checked_in_at?->toIso8601String(),
                'location_method'  => $att?->location_method,
                'is_location_valid' => $att?->is_location_valid,
            ];
        });

        $sudahAbsen  = $list->where('has_checked_in', true)->count();
        $belumAbsen  = $list->where('has_checked_in', false)->count();

        return response()->json([
            'success' => true,
            'data'    => [
                'date'     => $date,
                'summary'  => [
                    'total'        => $list->count(),
                    'sudah_absen'  => $sudahAbsen,
                    'belum_absen'  => $belumAbsen,
                ],
                'list'     => $list->values(),
            ],
        ]);
    }

    /**
     * GET /api/staff-attendance/export
     * Download CSV recap for admin.
     */
    public function adminExportCsv(Request $request)
    {
        $request->validate([
            'date' => 'nullable|date',
            'role' => 'nullable|in:guru,staff',
        ]);

        $date  = $request->input('date', today()->toDateString());
        $query = User::whereIn('role', ['guru', 'staff'])
            ->select('id', 'name', 'nip', 'jabatan', 'role')
            ->orderBy('name');

        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }

        $users       = $query->get();
        $attendances = StaffAttendance::whereIn('user_id', $users->pluck('id'))
            ->whereDate('date', $date)
            ->get()
            ->keyBy('user_id');

        $filename = 'absen-masuk-' . $date . '.csv';
        $headers  = [
            'Content-Type'        => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        $callback = function () use ($users, $attendances, $date) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM for Excel
            fputcsv($out, ['No', 'Nama', 'NIP', 'Jabatan', 'Role', 'Tanggal', 'Jam Masuk', 'Metode Lokasi', 'Status']);

            $i = 1;
            foreach ($users as $u) {
                $att    = $attendances->get($u->id);
                $status = $att ? 'Hadir' : 'Belum Absen';
                fputcsv($out, [
                    $i++,
                    $u->name,
                    $u->nip  ?? '-',
                    $u->jabatan ?? '-',
                    $u->role === 'guru' ? 'Guru' : 'Staff',
                    $date,
                    $att?->checked_in_at?->format('H:i:s') ?? '-',
                    $att?->location_method ?? '-',
                    $status,
                ]);
            }

            fclose($out);
        };

        return response()->stream($callback, 200, $headers);
    }

    /**
     * GET /api/staff-attendance/settings
     */
    public function getSettings(Request $request): JsonResponse
    {
        $coords = SystemSetting::getSchoolCoordinates();
        $window = SystemSetting::getStaffCheckInWindow();

        return response()->json([
            'success' => true,
            'data'    => [
                'school_latitude'   => $coords['latitude'],
                'school_longitude'  => $coords['longitude'],
                'radius_meters'     => SystemSetting::getStaffAttendanceRadius(),
                'check_in_start'    => $window['start'] ?? '06:00',
                'check_in_end'      => $window['end']   ?? '09:00',
            ],
        ]);
    }

    /**
     * POST /api/staff-attendance/settings
     */
    public function updateSettings(Request $request): JsonResponse
    {
        $request->validate([
            'school_latitude'  => 'nullable|numeric|between:-90,90',
            'school_longitude' => 'nullable|numeric|between:-180,180',
            'radius_meters'    => 'nullable|integer|min:50|max:5000',
            'check_in_start'   => 'nullable|date_format:H:i',
            'check_in_end'     => 'nullable|date_format:H:i|after:check_in_start',
        ]);

        SystemSetting::setStaffAttendanceSettings([
            'school_latitude'  => $request->input('school_latitude'),
            'school_longitude' => $request->input('school_longitude'),
            'radius_meters'    => $request->input('radius_meters'),
            'check_in_start'   => $request->input('check_in_start'),
            'check_in_end'     => $request->input('check_in_end'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Pengaturan absen masuk berhasil disimpan.',
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Haversine formula — returns distance in meters between two GPS coordinates.
     */
    private function haversineDistance(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadius = 6371000; // meters

        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) ** 2
           + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;

        return $earthRadius * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }


    // ─── Barcode endpoints ────────────────────────────────────────────────────

    /**
     * POST /api/staff-attendance/barcode/check-in
     * Guru/staff submit token barcode yang discan.
     * Tetap validasi lokasi GPS atau IP jaringan sekolah.
     */
    public function barcodeCheckIn(Request $request): JsonResponse
    {
        $request->validate([
            'barcode_token' => 'required|string',
            'device_id'     => 'nullable|string|max:255',
            'latitude'      => 'nullable|numeric|between:-90,90',
            'longitude'     => 'nullable|numeric|between:-180,180',
        ]);

        $user = $request->user();

        // 1. Validasi token barcode
        $validToken = SystemSetting::getStaffAttendanceBarcodeToken();

        if (!$validToken) {
            return response()->json([
                'success'    => false,
                'message'    => 'Barcode absen belum dibuat. Hubungi admin.',
                'error_code' => 'BARCODE_NOT_CONFIGURED',
            ], 422);
        }

        if ($request->input('barcode_token') !== $validToken) {
            return response()->json([
                'success'    => false,
                'message'    => 'Barcode tidak valid atau sudah diganti oleh admin.',
                'error_code' => 'BARCODE_INVALID',
            ], 422);
        }

        // 2. Validasi lokasi GPS (sama seperti checkIn GPS)
        $lat       = $request->input('latitude');
        $lng       = $request->input('longitude');
        $coords    = SystemSetting::getSchoolCoordinates();
        $schoolLat = $coords['latitude'];
        $schoolLng = $coords['longitude'];

        $distanceMeters = null;

        if ($schoolLat !== null && $schoolLng !== null) {
            $radius = SystemSetting::getStaffAttendanceRadius();

            if ($lat !== null && $lng !== null) {
                $distanceMeters = (int) round($this->haversineDistance(
                    (float) $lat, (float) $lng, $schoolLat, $schoolLng
                ));

                if ($distanceMeters > $radius) {
                    return response()->json([
                        'success'         => false,
                        'message'         => "Lokasi tidak valid. Anda berada {$distanceMeters} m dari sekolah (batas {$radius} m).",
                        'error_code'      => 'LOCATION_INVALID',
                        'distance_meters' => $distanceMeters,
                    ], 422);
                }
            } else {
                // GPS tidak tersedia — tolak
                return response()->json([
                    'success'    => false,
                    'message'    => 'Absen masuk memerlukan izin GPS. Aktifkan lokasi di perangkat Anda lalu coba lagi.',
                    'error_code' => 'GPS_REQUIRED',
                ], 422);
            }
        }

        // 3. Sudah absen hari ini?
        $existing = StaffAttendance::where('user_id', $user->id)
            ->whereDate('date', today())
            ->first();

        if ($existing) {
            return response()->json([
                'success'    => false,
                'message'    => 'Anda sudah absen masuk hari ini pukul ' . $existing->checked_in_at?->format('H:i') . '.',
                'error_code' => 'ALREADY_CHECKED_IN',
                'data'       => [
                    'checked_in_at'   => $existing->checked_in_at,
                    'location_method' => $existing->location_method,
                ],
            ], 422);
        }

        // 4. Cek window jam masuk
        $window = SystemSetting::getStaffCheckInWindow();
        if ($window['start'] && $window['end']) {
            $now = now()->format('H:i');
            if ($now < $window['start'] || $now > $window['end']) {
                return response()->json([
                    'success'    => false,
                    'message'    => "Absen masuk hanya bisa dilakukan antara {$window['start']} – {$window['end']}.",
                    'error_code' => 'OUTSIDE_CHECK_IN_WINDOW',
                ], 422);
            }
        }

        // 5. Simpan
        $record = StaffAttendance::create([
            'user_id'           => $user->id,
            'date'              => today(),
            'checked_in_at'     => now(),
            'latitude'          => $lat,
            'longitude'         => $lng,
            'ip_address'        => $request->ip(),
            'location_method'   => 'barcode',
            'is_location_valid' => true,
            'distance_meters'   => $distanceMeters,
            'device_id'         => $request->input('device_id'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Absen masuk berhasil dicatat!',
            'data'    => [
                'checked_in_at'   => $record->checked_in_at,
                'location_method' => $record->location_method,
                'distance_meters' => $record->distance_meters,
            ],
        ]);
    }

    /**
     * GET /api/staff-attendance/barcode
     * Admin ambil token aktif. Auto-generate jika belum ada.
     */
    public function getBarcodeToken(Request $request): JsonResponse
    {
        $token = SystemSetting::getStaffAttendanceBarcodeToken();

        if (!$token) {
            $token = (string) Str::uuid();
            SystemSetting::setStaffAttendanceBarcodeToken($token);
        }

        return response()->json([
            'success' => true,
            'data'    => ['barcode_token' => $token],
        ]);
    }

    /**
     * POST /api/staff-attendance/barcode/regenerate
     * Admin buat barcode baru — token lama langsung invalid.
     */
    public function regenerateBarcode(Request $request): JsonResponse
    {
        $newToken = (string) Str::uuid();
        SystemSetting::setStaffAttendanceBarcodeToken($newToken);

        return response()->json([
            'success' => true,
            'message' => 'Barcode baru berhasil dibuat. Barcode lama tidak berlaku lagi.',
            'data'    => ['barcode_token' => $newToken],
        ]);
    }
}
