<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ClassRoom;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\Exam;
use App\Models\ExamResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DashboardController extends Controller
{
    /**
     * Get admin dashboard stats - OPTIMIZED
     * Menggunakan single query dengan aggregates dan caching
     */
    public function adminStats()
    {
        // Cache admin stats for 5 minutes
        $data = Cache::remember('admin_dashboard_stats', 300, function () {
            // Single query untuk semua user counts by role
            $userCounts = User::query()
                ->selectRaw("
                    COUNT(*) as total_users,
                    SUM(CASE WHEN role = 'siswa' THEN 1 ELSE 0 END) as total_students,
                    SUM(CASE WHEN role = 'guru' THEN 1 ELSE 0 END) as total_teachers,
                    SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as total_admins
                ")
                ->first();

            // Single query untuk exam counts
            $now = now();
            $examCounts = Exam::query()
                ->selectRaw("
                    COUNT(*) as total_exams,
                    SUM(CASE WHEN status = 'published' AND start_time <= ? AND end_time >= ? THEN 1 ELSE 0 END) as active_exams
                ", [$now, $now])
                ->first();

            $stats = [
                'total_users' => $userCounts->total_users,
                'total_students' => (int) $userCounts->total_students,
                'total_teachers' => (int) $userCounts->total_teachers,
                'total_classes' => ClassRoom::count(),
                'total_exams' => $examCounts->total_exams,
                'active_exams' => (int) $examCounts->active_exams,
            ];

            // Users by role chart data
            $usersByRole = [
                ['name' => 'Siswa', 'value' => $stats['total_students']],
                ['name' => 'Guru', 'value' => $stats['total_teachers']],
                ['name' => 'Admin', 'value' => (int) $userCounts->total_admins],
            ];

            // Students by class - optimized with withCount
            $studentsByClass = ClassRoom::withCount('students')
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn($class) => [
                    'name' => $class->name,
                    'jumlah' => $class->students_count,
                ]);

            return [
                'stats' => $stats,
                'users_by_role' => $usersByRole,
                'students_by_class' => $studentsByClass,
            ];
        });

        // Recent activities - tidak di-cache karena harus real-time
        $recentActivities = $this->getRecentActivitiesOptimized();
        
        // Additional stats - monthly activity, today's schedule, academic performance
        $additionalStats = $this->getAdminAdditionalStats();

        return response()->json([
            'success' => true,
            'data' => array_merge($data, [
                'recent_activities' => $recentActivities,
                'monthly_activity' => $additionalStats['monthly_activity'],
                'today_schedule' => $additionalStats['today_schedule'],
                'academic_performance' => $additionalStats['academic_performance'],
                'weekly_attendance' => $additionalStats['weekly_attendance'],
            ]),
        ]);
    }

    /**
     * Get additional admin stats
     */
    private function getAdminAdditionalStats()
    {
        $now = now();
        $monthStart = $now->copy()->startOfMonth();
        $monthEnd = $now->copy()->endOfMonth();
        $today = today();
        $weekStart = $now->copy()->startOfWeek();
        $weekEnd = $now->copy()->endOfWeek();

        // Monthly Activity
        $monthlySessionCount = AttendanceSession::whereBetween('created_at', [$monthStart, $monthEnd])->count();
        $monthlyExamCount = Exam::whereBetween('created_at', [$monthStart, $monthEnd])->count();
        $monthlyMaterialCount = \App\Models\Material::whereBetween('created_at', [$monthStart, $monthEnd])->count();

        // Today's Schedule
        $dayOfWeek = $today->dayOfWeek; // 0 = Sunday
        $dayOfWeek = $dayOfWeek === 0 ? 7 : $dayOfWeek; // Convert Sunday to 7
        
        $todayScheduleCount = \App\Models\Schedule::where('day', $dayOfWeek)->count();
        $teachingTeachersCount = \App\Models\Schedule::where('day', $dayOfWeek)
            ->distinct('teacher_id')
            ->count('teacher_id');
        $activeClassesCount = \App\Models\Schedule::where('day', $dayOfWeek)
            ->distinct('class_id')
            ->count('class_id');

        // Academic Performance
        $totalAttendances = Attendance::count();
        $hadirCount = Attendance::where('status', 'hadir')->count();
        $attendancePercentage = $totalAttendances > 0 ? round(($hadirCount / $totalAttendances) * 100, 1) : 0;

        $completedResults = ExamResult::where('status', 'completed')->get();
        $avgScore = $completedResults->count() > 0 ? round($completedResults->avg('percentage'), 1) : 0;
        $passedCount = $completedResults->where('percentage', '>=', 70)->count();
        $passRate = $completedResults->count() > 0 ? round(($passedCount / $completedResults->count()) * 100, 1) : 0;

        // Weekly Attendance Chart
        $dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
        $weeklyAttendance = [];
        
        for ($i = 0; $i < 5; $i++) {
            $dayDate = $weekStart->copy()->addDays($i);
            
            $daySessions = AttendanceSession::whereDate('created_at', $dayDate)->pluck('id');
            $dayAttendances = Attendance::whereIn('session_id', $daySessions)->get();
            
            $weeklyAttendance[] = [
                'name' => $dayNames[$i],
                'hadir' => $dayAttendances->where('status', 'hadir')->count(),
                'izin' => $dayAttendances->where('status', 'izin')->count(),
                'sakit' => $dayAttendances->where('status', 'sakit')->count(),
                'alpha' => $dayAttendances->where('status', 'alpha')->count(),
            ];
        }

        return [
            'monthly_activity' => [
                'sessions' => $monthlySessionCount,
                'exams' => $monthlyExamCount,
                'materials' => $monthlyMaterialCount,
            ],
            'today_schedule' => [
                'total' => $todayScheduleCount,
                'active_classes' => $activeClassesCount,
                'teaching_teachers' => $teachingTeachersCount,
            ],
            'academic_performance' => [
                'attendance_percentage' => $attendancePercentage,
                'avg_score' => $avgScore,
                'pass_rate' => $passRate,
            ],
            'weekly_attendance' => $weeklyAttendance,
        ];
    }

    /**
     * Get recent activities dengan optimized eager loading
     */
    private function getRecentActivitiesOptimized()
    {
        $recentSessions = AttendanceSession::with('teacher:id,name')
            ->select('id', 'subject', 'teacher_id', 'created_at')
            ->latest()
            ->take(5)
            ->get()
            ->map(fn($s) => [
                'type' => 'attendance',
                'message' => "Sesi absensi {$s->subject} dibuat oleh {$s->teacher->name}",
                'time' => $s->created_at,
            ]);

        $recentExams = Exam::with('teacher:id,name')
            ->select('id', 'title', 'teacher_id', 'created_at')
            ->latest()
            ->take(5)
            ->get()
            ->map(fn($e) => [
                'type' => 'exam',
                'message' => "Ujian {$e->title} dibuat oleh {$e->teacher->name}",
                'time' => $e->created_at,
            ]);

        return $recentSessions->merge($recentExams)
            ->sortByDesc('time')
            ->take(10)
            ->values();
    }

    /**
     * Get teacher dashboard stats - OPTIMIZED
     */
    public function teacherStats(Request $request)
    {
        $user = $request->user();
        $today = Carbon::today();
        $now = now();

        $cacheKey = "teacher_dashboard_{$user->id}";
        
        // Stats dengan single aggregated queries
        $stats = Cache::remember($cacheKey . '_stats', 180, function () use ($user, $today, $now) {
            // Combined session counts - using valid_from instead of date
            $sessionCounts = AttendanceSession::where('teacher_id', $user->id)
                ->selectRaw("
                    SUM(CASE WHEN DATE(valid_from) = ? THEN 1 ELSE 0 END) as today_count,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
                ", [$today->toDateString()])
                ->first();

            // Combined exam counts
            $examCounts = Exam::where('teacher_id', $user->id)
                ->selectRaw("
                    COUNT(*) as total_exams,
                    SUM(CASE WHEN status = 'published' AND start_time <= ? AND end_time >= ? THEN 1 ELSE 0 END) as active_exams
                ", [$now, $now])
                ->first();

            return [
                'total_sessions_today' => (int) ($sessionCounts->today_count ?? 0),
                'active_sessions' => (int) ($sessionCounts->active_count ?? 0),
                'total_exams' => (int) ($examCounts->total_exams ?? 0),
                'active_exams' => (int) ($examCounts->active_exams ?? 0),
            ];
        });

        // Today's sessions - tidak di-cache, using valid_from
        $todaySessions = AttendanceSession::with('class:id,name')
            ->where('teacher_id', $user->id)
            ->whereDate('valid_from', $today)
            ->orderBy('valid_from')
            ->get(['id', 'subject', 'class_id', 'status', 'valid_from', 'valid_until']);

        // Upcoming exams
        $upcomingExams = Exam::with('class:id,name')
            ->where('teacher_id', $user->id)
            ->where('start_time', '>', $now)
            ->orderBy('start_time')
            ->take(5)
            ->get(['id', 'title', 'subject', 'class_id', 'start_time', 'duration']);

        // Active exams with student count - optimized dengan subquery
        $activeExams = Exam::with('class:id,name')
            ->withCount(['results as students_taking' => function ($q) {
                $q->where('status', 'in_progress');
            }])
            ->where('teacher_id', $user->id)
            ->where('status', 'published')
            ->where('start_time', '<=', $now)
            ->where('end_time', '>=', $now)
            ->get(['id', 'title', 'subject', 'class_id', 'start_time', 'end_time']);

        // Attendance chart - 7 days dengan single optimized query
        $attendanceChart = $this->getWeeklyAttendanceChart($user->id);

        return response()->json([
            'success' => true,
            'data' => [
                'stats' => $stats,
                'today_sessions' => $todaySessions,
                'upcoming_exams' => $upcomingExams,
                'active_exams' => $activeExams,
                'attendance_chart' => $attendanceChart,
            ],
        ]);
    }

    /**
     * Get weekly attendance chart dengan single query
     */
    private function getWeeklyAttendanceChart($teacherId)
    {
        $startDate = Carbon::today()->subDays(6);
        $endDate = Carbon::today();

        // Single query untuk semua 7 hari - using valid_from for date filtering
        $results = DB::table('attendances')
            ->join('attendance_sessions', 'attendances.session_id', '=', 'attendance_sessions.id')
            ->where('attendance_sessions.teacher_id', $teacherId)
            ->whereBetween(DB::raw('DATE(attendance_sessions.valid_from)'), [$startDate->toDateString(), $endDate->toDateString()])
            ->selectRaw("
                DATE(attendance_sessions.valid_from) as session_date,
                SUM(CASE WHEN attendances.status = 'hadir' THEN 1 ELSE 0 END) as hadir,
                SUM(CASE WHEN attendances.status = 'alpha' THEN 1 ELSE 0 END) as alpha
            ")
            ->groupBy(DB::raw('DATE(attendance_sessions.valid_from)'))
            ->get()
            ->keyBy('session_date');

        // Build 7-day array
        $chart = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
            $dateStr = $date->toDateString();
            $data = $results[$dateStr] ?? null;
            
            $chart[] = [
                'date' => $date->format('d/m'),
                'hadir' => $data ? (int) $data->hadir : 0,
                'alpha' => $data ? (int) $data->alpha : 0,
            ];
        }

        return collect($chart);
    }

    /**
     * Get student dashboard stats - OPTIMIZED
     */
    public function studentStats(Request $request)
    {
        $user = $request->user();

        $cacheKey = "student_dashboard_{$user->id}";
        
        // Attendance stats dengan single query
        $attendanceData = Cache::remember($cacheKey . '_attendance', 120, function () use ($user) {
            return Attendance::where('student_id', $user->id)
                ->selectRaw("
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'hadir' THEN 1 ELSE 0 END) as hadir,
                    SUM(CASE WHEN status = 'izin' THEN 1 ELSE 0 END) as izin,
                    SUM(CASE WHEN status = 'sakit' THEN 1 ELSE 0 END) as sakit,
                    SUM(CASE WHEN status = 'alpha' THEN 1 ELSE 0 END) as alpha
                ")
                ->first();
        });

        $attendanceStats = [
            'hadir' => (int) $attendanceData->hadir,
            'izin' => (int) $attendanceData->izin,
            'sakit' => (int) $attendanceData->sakit,
            'alpha' => (int) $attendanceData->alpha,
        ];

        $totalAttendances = (int) $attendanceData->total;
        $attendancePercentage = $totalAttendances > 0 
            ? round(($attendanceStats['hadir'] / $totalAttendances) * 100, 1)
            : 0;

        // Exam stats dengan single query
        $examData = ExamResult::where('student_id', $user->id)
            ->selectRaw("
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                AVG(CASE WHEN status = 'completed' THEN score ELSE NULL END) as avg_score
            ")
            ->first();

        $examStats = [
            'total' => (int) $examData->total,
            'completed' => (int) ($examData->completed ?? 0),
            'average_score' => round($examData->avg_score ?? 0, 1),
        ];

        $now = now();
        $today = today();

        // Active attendance sessions - tidak di-cache, using valid_from
        $activeSessions = AttendanceSession::with(['teacher:id,name', 'class:id,name'])
            ->where('class_id', $user->class_id)
            ->where('status', 'active')
            ->whereDate('valid_from', $today)
            ->get(['id', 'subject', 'teacher_id', 'class_id', 'status', 'valid_from']);

        // Upcoming exams
        $upcomingExams = Exam::with(['teacher:id,name', 'class:id,name'])
            ->where('class_id', $user->class_id)
            ->where('status', 'published')
            ->where('start_time', '>', $now)
            ->orderBy('start_time')
            ->take(5)
            ->get(['id', 'title', 'subject', 'teacher_id', 'class_id', 'start_time', 'duration']);

        // Active exams dengan student result - optimized
        $activeExamIds = Exam::where('class_id', $user->class_id)
            ->where('status', 'published')
            ->where('start_time', '<=', $now)
            ->where('end_time', '>=', $now)
            ->pluck('id');

        // Get results in batch
        $myResults = ExamResult::where('student_id', $user->id)
            ->whereIn('exam_id', $activeExamIds)
            ->get(['id', 'exam_id', 'status', 'total_score'])
            ->keyBy('exam_id');

        $activeExams = Exam::with(['teacher:id,name', 'class:id,name'])
            ->whereIn('id', $activeExamIds)
            ->get(['id', 'title', 'subject', 'teacher_id', 'class_id', 'start_time', 'end_time'])
            ->map(function ($exam) use ($myResults) {
                $result = $myResults[$exam->id] ?? null;
                $exam->my_result = $result;
                $exam->can_start = !$result || $result->status === 'in_progress';
                return $exam;
            });

        // Recent exam results
        $recentResults = ExamResult::with('exam:id,title,subject')
            ->where('student_id', $user->id)
            ->where('status', 'submitted')
            ->orWhere('status', 'graded')
            ->where('student_id', $user->id)
            ->orderBy('submitted_at', 'desc')
            ->take(5)
            ->get(['id', 'exam_id', 'total_score', 'percentage', 'submitted_at', 'status']);

        return response()->json([
            'success' => true,
            'data' => [
                'attendance_stats' => $attendanceStats,
                'attendance_percentage' => $attendancePercentage,
                'exam_stats' => $examStats,
                'active_sessions' => $activeSessions,
                'upcoming_exams' => $upcomingExams,
                'active_exams' => $activeExams,
                'recent_results' => $recentResults,
            ],
        ]);
    }

    /**
     * Clear dashboard cache - can be called when data changes
     */
    public function clearCache(Request $request)
    {
        $user = $request->user();
        
        Cache::forget('admin_dashboard_stats');
        Cache::forget("teacher_dashboard_{$user->id}_stats");
        Cache::forget("student_dashboard_{$user->id}_attendance");

        return response()->json([
            'success' => true,
            'message' => 'Dashboard cache cleared',
        ]);
    }
}
