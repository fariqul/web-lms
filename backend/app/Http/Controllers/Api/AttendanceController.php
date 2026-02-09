<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceSession;
use App\Models\Attendance;
use App\Models\User;
use App\Models\StudentDevice;
use App\Models\DeviceSwitchRequest;
use App\Models\SchoolNetworkSetting;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Carbon\Carbon;

class AttendanceController extends Controller
{
    /**
     * Get the real client IP, with fallback to forwarded headers
     */
    private function getRealClientIp(Request $request): string
    {
        $ip = $request->ip();
        
        // If we still get a Docker/private IP, manually read forwarded headers
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            $forwarded = $request->header('X-Forwarded-For');
            if ($forwarded) {
                $ips = array_map('trim', explode(',', $forwarded));
                if (!empty($ips[0]) && filter_var($ips[0], FILTER_VALIDATE_IP)) {
                    return $ips[0];
                }
            }
            
            $realIp = $request->header('X-Real-IP');
            if ($realIp && filter_var($realIp, FILTER_VALIDATE_IP)) {
                return $realIp;
            }
        }
        
        return $ip;
    }

    /**
     * Display a listing of attendance sessions - OPTIMIZED
     */
    public function index(Request $request)
    {
        $query = AttendanceSession::with(['teacher:id,name', 'class:id,name']);

        // Filter by teacher (for guru role)
        if ($request->user()->role === 'guru') {
            $query->where('teacher_id', $request->user()->id);
        }

        // Filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        // Filter by date
        if ($request->has('date')) {
            $query->whereDate('created_at', $request->date);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $sessions = $query->orderBy('created_at', 'desc')
            ->paginate(min($request->per_page ?? 15, 100));

        // Add summary for each session
        $sessions->getCollection()->transform(function ($session) {
            $totalStudents = User::where('class_id', $session->class_id)
                ->where('role', 'siswa')
                ->count();
            $totalHadir = Attendance::where('session_id', $session->id)
                ->where('status', 'hadir')
                ->count();
            
            $session->summary = [
                'total' => $totalStudents,
                'hadir' => $totalHadir,
            ];
            return $session;
        });

        return response()->json([
            'success' => true,
            'data' => $sessions,
        ]);
    }

    /**
     * Store a newly created attendance session - OPTIMIZED
     */
    public function store(Request $request)
    {
        $request->validate([
            'class_id' => 'required|exists:classes,id',
            'subject' => 'required|string|max:255',
            'valid_from' => 'required|date',
            'valid_until' => 'required|date|after:valid_from',
            'require_school_network' => 'boolean',
        ]);

        $session = AttendanceSession::create([
            'class_id' => $request->class_id,
            'teacher_id' => $request->user()->id,
            'subject' => $request->subject,
            'qr_token' => Str::random(32),
            'valid_from' => $request->valid_from,
            'valid_until' => $request->valid_until,
            'status' => 'active',
            'require_school_network' => $request->require_school_network ?? false,
        ]);

        $session->load(['teacher:id,name', 'class:id,name']);

        return response()->json([
            'success' => true,
            'data' => $session,
            'message' => 'Sesi absensi berhasil dibuat',
        ], 201);
    }
    
    /**
     * Get sessions for the current teacher
     */
    public function mySessions(Request $request)
    {
        $sessions = AttendanceSession::with(['class:id,name'])
            ->where('teacher_id', $request->user()->id)
            ->orderBy('created_at', 'desc')
            ->limit(50)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $sessions,
        ]);
    }

    /**
     * Display the specified attendance session - OPTIMIZED
     */
    public function show(AttendanceSession $attendanceSession)
    {
        $attendanceSession->load(['teacher:id,name', 'class:id,name']);

        // Load attendances separately for better control
        $attendances = Attendance::where('session_id', $attendanceSession->id)
            ->get(['id', 'session_id', 'student_id', 'status', 'scanned_at'])
            ->keyBy('student_id');

        // Get list of students in the class
        $students = User::where('class_id', $attendanceSession->class_id)
            ->where('role', 'siswa')
            ->orderBy('name')
            ->get(['id', 'name', 'nisn']);

        // Map attendance status for each student
        $studentAttendances = $students->map(function ($student) use ($attendances) {
            $attendance = $attendances->get($student->id);
            return [
                'student' => $student,
                'attendance' => $attendance,
                'status' => $attendance ? $attendance->status : 'belum',
            ];
        });

        // Calculate summary using single pass
        $summary = [
            'total' => $students->count(),
            'hadir' => 0,
            'izin' => 0,
            'sakit' => 0,
            'alpha' => 0,
        ];
        
        foreach ($attendances as $att) {
            if (isset($summary[$att->status])) {
                $summary[$att->status]++;
            }
        }

        // Transform attendances to include student info
        $attendancesWithStudent = Attendance::where('session_id', $attendanceSession->id)
            ->with('student:id,name,nisn')
            ->get(['id', 'session_id', 'student_id', 'status', 'scanned_at']);

        return response()->json([
            'success' => true,
            'data' => array_merge($attendanceSession->toArray(), [
                'student_attendances' => $studentAttendances,
                'attendances' => $attendancesWithStudent,
                'summary' => $summary,
            ]),
        ]);
    }

    /**
     * Update the specified attendance session
     */
    public function update(Request $request, AttendanceSession $attendanceSession)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $attendanceSession->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengubah sesi ini',
            ], 403);
        }

        $request->validate([
            'subject' => 'sometimes|string|max:255',
            'status' => 'sometimes|in:active,closed',
            'token_refresh_interval' => 'sometimes|integer|min:5|max:300',
        ]);

        if ($request->has('subject')) {
            $attendanceSession->subject = $request->subject;
        }
        if ($request->has('status')) {
            $attendanceSession->status = $request->status;
        }
        if ($request->has('token_refresh_interval')) {
            $attendanceSession->token_refresh_interval = $request->token_refresh_interval;
        }

        $attendanceSession->save();

        return response()->json([
            'success' => true,
            'data' => $attendanceSession,
            'message' => 'Sesi absensi berhasil diupdate',
        ]);
    }

    /**
     * Close the attendance session - OPTIMIZED
     */
    public function close(Request $request, AttendanceSession $attendanceSession)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $attendanceSession->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menutup sesi ini',
            ], 403);
        }

        $attendanceSession->status = 'closed';
        $attendanceSession->save();

        // Get attended student IDs efficiently
        $attendedStudentIds = Attendance::where('session_id', $attendanceSession->id)
            ->pluck('student_id')
            ->toArray();
        
        // Get absent students using whereNotIn (uses index)
        $absentStudentIds = User::where('class_id', $attendanceSession->class_id)
            ->where('role', 'siswa')
            ->whereNotIn('id', $attendedStudentIds)
            ->pluck('id');

        // Bulk insert absent students
        if ($absentStudentIds->isNotEmpty()) {
            $insertData = $absentStudentIds->map(fn($id) => [
                'session_id' => $attendanceSession->id,
                'student_id' => $id,
                'status' => 'alpha',
                'created_at' => now(),
                'updated_at' => now(),
            ])->toArray();

            Attendance::insert($insertData);
        }

        return response()->json([
            'success' => true,
            'message' => 'Sesi absensi berhasil ditutup',
        ]);
    }

    /**
     * Refresh QR token
     */
    public function refreshToken(Request $request, AttendanceSession $attendanceSession)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $attendanceSession->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses',
            ], 403);
        }

        if ($attendanceSession->status !== 'active') {
            return response()->json([
                'success' => false,
                'message' => 'Sesi absensi sudah ditutup',
            ], 422);
        }

        $attendanceSession->qr_token = Str::random(32);
        $attendanceSession->save();

        return response()->json([
            'success' => true,
            'data' => [
                'qr_token' => $attendanceSession->qr_token,
                'valid_until' => $attendanceSession->valid_until,
            ],
        ]);
    }

    /**
     * Get current QR token (for display)
     */
    public function getQrToken(Request $request, AttendanceSession $attendanceSession)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $attendanceSession->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'qr_token' => $attendanceSession->qr_token,
                'valid_from' => $attendanceSession->valid_from,
                'valid_until' => $attendanceSession->valid_until,
            ],
        ]);
    }

    /**
     * Submit attendance via QR scan (for students)
     * With anti-cheating measures: IP validation & device tracking
     */
    public function submitAttendance(Request $request)
    {
        $request->validate([
            'qr_token' => 'required|string',
            'photo' => 'nullable|image|max:2048',
            'latitude' => 'nullable|numeric',
            'longitude' => 'nullable|numeric',
            'device_id' => 'nullable|string',
        ]);

        $user = $request->user();
        $clientIp = $this->getRealClientIp($request);
        $userAgent = $request->userAgent();
        $deviceId = $request->device_id ?? $this->generateDeviceId($request);

        // Find active session with valid token
        $session = AttendanceSession::where('qr_token', $request->qr_token)
            ->where('status', 'active')
            ->where('valid_until', '>', now())
            ->first();

        if (!$session) {
            return response()->json([
                'success' => false,
                'message' => 'QR Code tidak valid atau sudah kadaluarsa',
            ], 422);
        }

        // Check if student belongs to the class
        if ((int) $user->class_id !== (int) $session->class_id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak terdaftar di kelas ini',
            ], 422);
        }

        // Check if already attended
        $existingAttendance = Attendance::where('session_id', $session->id)
            ->where('student_id', $user->id)
            ->first();

        if ($existingAttendance) {
            return response()->json([
                'success' => false,
                'message' => 'Anda sudah melakukan absensi',
            ], 422);
        }

        // ===== ANTI-CHEAT: Check school network if required =====
        if ($session->require_school_network) {
            if (!SchoolNetworkSetting::isSchoolNetwork($clientIp)) {
                return response()->json([
                    'success' => false,
                    'message' => "Absensi hanya dapat dilakukan melalui jaringan WiFi sekolah. IP Anda: {$clientIp}",
                    'error_code' => 'NETWORK_NOT_ALLOWED',
                    'detected_ip' => $clientIp,
                ], 422);
            }
        }

        // ===== ANTI-CHEAT: Check device switching =====
        $isSuspicious = false;
        $suspiciousReason = null;
        $needsApproval = false;

        // Check if this device was used by another student in this session
        $deviceUsedBy = Attendance::where('session_id', $session->id)
            ->where('device_id', $deviceId)
            ->where('student_id', '!=', $user->id)
            ->first();

        if ($deviceUsedBy) {
            // Device already used by another student - need teacher approval
            $existingRequest = DeviceSwitchRequest::where('session_id', $session->id)
                ->where('student_id', $user->id)
                ->where('device_id', $deviceId)
                ->first();

            if (!$existingRequest) {
                // Create new approval request
                $newRequest = DeviceSwitchRequest::create([
                    'session_id' => $session->id,
                    'student_id' => $user->id,
                    'device_id' => $deviceId,
                    'previous_student_id' => $deviceUsedBy->student_id,
                    'status' => 'pending',
                ]);

                // Broadcast real-time notification to teacher
                try {
                    $previousStudent = User::find($deviceUsedBy->student_id);
                    app(SocketBroadcastService::class)->deviceSwitchRequested($session->id, [
                        'request_id' => $newRequest->id,
                        'session_id' => $session->id,
                        'student_name' => $user->name,
                        'student_nisn' => $user->nisn ?? '',
                        'previous_student_name' => $previousStudent?->name ?? 'Unknown',
                        'previous_student_nisn' => $previousStudent?->nisn ?? '',
                        'device_id' => $deviceId,
                        'created_at' => $newRequest->created_at->toISOString(),
                    ]);
                } catch (\Exception $e) {
                    \Illuminate\Support\Facades\Log::warning('Failed to broadcast device switch request: ' . $e->getMessage());
                }

                return response()->json([
                    'success' => false,
                    'message' => 'Perangkat ini sudah digunakan siswa lain. Menunggu persetujuan guru.',
                    'error_code' => 'DEVICE_SWITCH_PENDING',
                    'requires_approval' => true,
                ], 422);
            }

            if ($existingRequest->status === 'pending') {
                return response()->json([
                    'success' => false,
                    'message' => 'Permintaan penggunaan perangkat sedang menunggu persetujuan guru.',
                    'error_code' => 'DEVICE_SWITCH_PENDING',
                    'requires_approval' => true,
                ], 422);
            }

            if ($existingRequest->status === 'rejected') {
                return response()->json([
                    'success' => false,
                    'message' => 'Permintaan penggunaan perangkat ditolak oleh guru.',
                    'error_code' => 'DEVICE_SWITCH_REJECTED',
                ], 422);
            }

            // If approved, mark as suspicious but allow
            $isSuspicious = true;
            $suspiciousReason = 'Device digunakan bergantian dengan siswa lain (disetujui guru)';
        }

        // ===== Register/Update device =====
        $studentDevice = StudentDevice::updateOrCreate(
            [
                'student_id' => $user->id,
                'device_id' => $deviceId,
            ],
            [
                'user_agent' => $userAgent,
                'last_ip' => $clientIp,
                'last_used_at' => now(),
            ]
        );

        // Save photo if provided
        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photoPath = $request->file('photo')->store('attendance-photos', 'public');
        }

        // Create attendance record
        $attendance = Attendance::create([
            'session_id' => $session->id,
            'student_id' => $user->id,
            'status' => 'hadir',
            'scanned_at' => now(),
            'photo' => $photoPath,
            'latitude' => $request->latitude,
            'longitude' => $request->longitude,
            'ip_address' => $clientIp,
            'device_id' => $deviceId,
            'user_agent' => $userAgent,
            'is_suspicious' => $isSuspicious,
            'suspicious_reason' => $suspiciousReason,
        ]);

        // Broadcast: student scanned attendance
        app(SocketBroadcastService::class)->attendanceScanned($session->id, [
            'student_id' => $user->id,
            'student_name' => $user->name,
            'status' => 'hadir',
            'scanned_at' => now()->toISOString(),
            'is_suspicious' => $isSuspicious,
        ]);

        return response()->json([
            'success' => true,
            'data' => $attendance,
            'message' => 'Absensi berhasil dicatat',
        ]);
    }

    /**
     * Generate a device identifier from request
     */
    private function generateDeviceId(Request $request): string
    {
        // Create a fingerprint based on available data
        $components = [
            $request->userAgent(),
            $request->header('Accept-Language'),
            $request->header('Accept-Encoding'),
        ];
        
        return hash('sha256', implode('|', $components));
    }

    /**
     * Get pending device switch requests for a session (for teachers)
     */
    public function getDeviceSwitchRequests(Request $request, AttendanceSession $session)
    {
        $requests = DeviceSwitchRequest::with(['student:id,name,nisn', 'previousStudent:id,name,nisn'])
            ->where('session_id', $session->id)
            ->where('status', 'pending')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $requests,
        ]);
    }

    /**
     * Handle device switch request (approve/reject)
     */
    public function handleDeviceSwitchRequest(Request $request, DeviceSwitchRequest $switchRequest)
    {
        $request->validate([
            'action' => 'required|in:approve,reject',
            'reason' => 'nullable|string|max:500',
        ]);

        $switchRequest->update([
            'status' => $request->action === 'approve' ? 'approved' : 'rejected',
            'handled_by' => $request->user()->id,
            'handled_at' => now(),
            'reason' => $request->reason,
        ]);

        // Broadcast real-time update to attendance room
        try {
            app(SocketBroadcastService::class)->deviceSwitchHandled($switchRequest->session_id, [
                'request_id' => $switchRequest->id,
                'session_id' => $switchRequest->session_id,
                'student_id' => $switchRequest->student_id,
                'status' => $switchRequest->status,
                'handled_by' => $request->user()->name,
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning('Failed to broadcast device switch handled: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => $request->action === 'approve' 
                ? 'Permintaan disetujui' 
                : 'Permintaan ditolak',
        ]);
    }

    /**
     * Update individual student attendance status
     */
    public function updateStudentAttendance(Request $request, AttendanceSession $attendanceSession)
    {
        $request->validate([
            'student_id' => 'required|exists:users,id',
            'status' => 'required|in:hadir,izin,sakit,alpha',
        ]);

        $attendance = Attendance::updateOrCreate(
            [
                'session_id' => $attendanceSession->id,
                'student_id' => $request->student_id,
            ],
            [
                'status' => $request->status,
            ]
        );

        return response()->json([
            'success' => true,
            'data' => $attendance,
            'message' => 'Status absensi berhasil diupdate',
        ]);
    }

    /**
     * Get student's attendance history - OPTIMIZED
     */
    public function studentHistory(Request $request)
    {
        $user = $request->user();

        $attendances = Attendance::with([
                'session:id,class_id,teacher_id,subject,created_at,valid_from,valid_until',
                'session.class:id,name', 
                'session.teacher:id,name'
            ])
            ->where('student_id', $user->id)
            ->orderBy('created_at', 'desc')
            ->paginate(min($request->per_page ?? 15, 100));

        return response()->json([
            'success' => true,
            'data' => $attendances,
        ]);
    }

    /**
     * Get active sessions for student's class - OPTIMIZED
     */
    public function activeSessions(Request $request)
    {
        $user = $request->user();

        $sessions = AttendanceSession::with(['teacher:id,name', 'class:id,name'])
            ->where('class_id', $user->class_id)
            ->where('status', 'active')
            ->whereDate('created_at', today())
            ->get(['id', 'class_id', 'teacher_id', 'subject', 'valid_from', 'valid_until', 'status']);

        return response()->json([
            'success' => true,
            'data' => $sessions,
        ]);
    }

    /**
     * Get attendance statistics for the logged-in student
     */
    public function myStats(Request $request)
    {
        $user = $request->user();

        // Get total sessions for this student's class this semester
        $totalSessions = AttendanceSession::where('class_id', (int) $user->class_id)
            ->where('status', '!=', 'cancelled')
            ->count();

        // Get this student's attendance records
        $attendances = Attendance::where('student_id', $user->id)->get();

        $hadirCount = $attendances->where('status', 'hadir')->count();
        $izinCount = $attendances->where('status', 'izin')->count();
        $sakitCount = $attendances->where('status', 'sakit')->count();
        $alphaCount = max(0, $totalSessions - $attendances->count());

        $percentage = $totalSessions > 0 
            ? round(($hadirCount / $totalSessions) * 100, 1)
            : 0;

        // Get weekly attendance data (current week)
        $weekStart = Carbon::now()->startOfWeek();
        $weekEnd = Carbon::now()->endOfWeek();

        $weeklySessions = AttendanceSession::where('class_id', (int) $user->class_id)
            ->whereBetween('created_at', [$weekStart, $weekEnd])
            ->pluck('id');

        $weeklyAttendances = Attendance::where('student_id', $user->id)
            ->whereIn('session_id', $weeklySessions)
            ->get();

        // Map by day of week (1=Monday to 5=Friday)
        $dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
        $weekly = [];
        
        for ($i = 0; $i < 5; $i++) {
            $dayDate = $weekStart->copy()->addDays($i);
            
            // Get sessions for this day
            $daySessions = AttendanceSession::where('class_id', (int) $user->class_id)
                ->whereDate('created_at', $dayDate)
                ->pluck('id');
            
            $dayAttendances = $weeklyAttendances->whereIn('session_id', $daySessions);
            
            $weekly[] = [
                'day' => $dayNames[$i],
                'hadir' => $dayAttendances->where('status', 'hadir')->count(),
                'izin' => $dayAttendances->where('status', 'izin')->count(),
                'sakit' => $dayAttendances->where('status', 'sakit')->count(),
                'alpha' => max(0, $daySessions->count() - $dayAttendances->count()),
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'total_sessions' => $totalSessions,
                'hadir' => $hadirCount,
                'izin' => $izinCount,
                'sakit' => $sakitCount,
                'alpha' => $alphaCount,
                'percentage' => $percentage,
                'weekly' => $weekly,
            ],
        ]);
    }

    /**
     * Get attendance statistics for the logged-in teacher
     */
    public function teacherStats(Request $request)
    {
        $user = $request->user();

        // Get weekly attendance data (current week) for all sessions created by this teacher
        $weekStart = Carbon::now()->startOfWeek();
        $weekEnd = Carbon::now()->endOfWeek();

        $weeklySessions = AttendanceSession::where('teacher_id', $user->id)
            ->whereBetween('created_at', [$weekStart, $weekEnd])
            ->pluck('id');

        $weeklyAttendances = Attendance::whereIn('session_id', $weeklySessions)->get();

        // Map by day of week (1=Monday to 5=Friday)
        $dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum'];
        $weekly = [];
        
        for ($i = 0; $i < 5; $i++) {
            $dayDate = $weekStart->copy()->addDays($i);
            
            // Get sessions for this day
            $daySessions = AttendanceSession::where('teacher_id', $user->id)
                ->whereDate('created_at', $dayDate)
                ->pluck('id');
            
            $dayAttendances = $weeklyAttendances->whereIn('session_id', $daySessions);
            
            $weekly[] = [
                'day' => $dayNames[$i],
                'hadir' => $dayAttendances->where('status', 'hadir')->count(),
                'izin' => $dayAttendances->where('status', 'izin')->count(),
                'sakit' => $dayAttendances->where('status', 'sakit')->count(),
                'alpha' => $dayAttendances->where('status', 'alpha')->count(),
            ];
        }

        // Total stats for this teacher
        $totalSessions = AttendanceSession::where('teacher_id', $user->id)->count();
        $allAttendances = Attendance::whereIn('session_id', function($q) use ($user) {
            $q->select('id')->from('attendance_sessions')->where('teacher_id', $user->id);
        })->get();

        return response()->json([
            'success' => true,
            'data' => [
                'total_sessions' => $totalSessions,
                'total_hadir' => $allAttendances->where('status', 'hadir')->count(),
                'total_izin' => $allAttendances->where('status', 'izin')->count(),
                'total_sakit' => $allAttendances->where('status', 'sakit')->count(),
                'total_alpha' => $allAttendances->where('status', 'alpha')->count(),
                'weekly' => $weekly,
            ],
        ]);
    }

    /**
     * Update student attendance status (for teacher to mark izin/sakit/alpha)
     */
    public function updateStudentStatus(Request $request, AttendanceSession $attendanceSession)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $attendanceSession->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses',
            ], 403);
        }

        $request->validate([
            'student_id' => 'required|exists:users,id',
            'status' => 'required|in:hadir,izin,sakit,alpha',
        ]);

        // Verify the student is in the same class as the session
        $student = User::where('id', $request->student_id)
            ->where('class_id', $attendanceSession->class_id)
            ->where('role', 'siswa')
            ->first();

        if (!$student) {
            return response()->json([
                'success' => false,
                'message' => 'Siswa tidak ditemukan di kelas ini',
            ], 404);
        }

        // Update or create attendance record
        $attendance = Attendance::updateOrCreate(
            [
                'session_id' => $attendanceSession->id,
                'student_id' => $request->student_id,
            ],
            [
                'status' => $request->status,
                'scanned_at' => $request->status === 'hadir' ? now() : null,
            ]
        );

        return response()->json([
            'success' => true,
            'data' => $attendance->load('student:id,name,nisn'),
            'message' => 'Status kehadiran berhasil diupdate',
        ]);
    }

    /**
     * Bulk update student attendance status
     */
    public function bulkUpdateStatus(Request $request, AttendanceSession $attendanceSession)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $attendanceSession->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses',
            ], 403);
        }

        $request->validate([
            'updates' => 'required|array',
            'updates.*.student_id' => 'required|exists:users,id',
            'updates.*.status' => 'required|in:hadir,izin,sakit,alpha',
        ]);

        $results = [];
        foreach ($request->updates as $update) {
            // Verify the student is in the same class
            $student = User::where('id', $update['student_id'])
                ->where('class_id', $attendanceSession->class_id)
                ->where('role', 'siswa')
                ->first();

            if ($student) {
                $attendance = Attendance::updateOrCreate(
                    [
                        'session_id' => $attendanceSession->id,
                        'student_id' => $update['student_id'],
                    ],
                    [
                        'status' => $update['status'],
                        'scanned_at' => $update['status'] === 'hadir' ? now() : null,
                    ]
                );
                $results[] = $attendance;
            }
        }

        return response()->json([
            'success' => true,
            'data' => $results,
            'message' => 'Status kehadiran berhasil diupdate',
        ]);
    }
}
