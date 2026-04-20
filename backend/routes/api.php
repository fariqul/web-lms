<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\ClassController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\ExamController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ScheduleController;
use App\Http\Controllers\Api\MaterialController;
use App\Http\Controllers\Api\AssignmentController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\SchoolNetworkController;
use App\Http\Controllers\Api\BankQuestionController;
use App\Http\Controllers\Api\PdfImportController;
use App\Http\Controllers\Api\UrlImportController;
use App\Http\Controllers\Api\PasswordResetController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ProgressController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\QuizController;
use App\Http\Controllers\Api\SummativeScoreController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

$loginThrottle = (string) env('LOGIN_THROTTLE', '1800,1');
$apiThrottle = (string) env('API_THROTTLE', '1400,1');
$dashboardThrottle = (string) env('DASHBOARD_THROTTLE', '120,1');
$notificationThrottle = (string) env('NOTIFICATION_THROTTLE', '240,1');
$examPollingThrottle = (string) env('EXAM_POLLING_THROTTLE', '240,1');

// Health check endpoint for uptime monitoring (keep-alive)
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'timestamp' => now()->toISOString(),
        'service' => 'SMA 15 Makassar LMS API',
    ]);
});

// Public routes with rate limiting for login (prevent brute force)
// High limit because school network shares single public IP — many users login simultaneously
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:' . $loginThrottle);

// Password reset (public, rate limited)
Route::post('/forgot-password', [PasswordResetController::class, 'forgotPassword'])->middleware('throttle:3,1');
Route::post('/reset-password', [PasswordResetController::class, 'resetPassword'])->middleware('throttle:5,1');

// Protected routes
Route::middleware(['auth:sanctum', 'blocked.student', 'throttle:' . $apiThrottle])->group(function () use ($dashboardThrottle, $notificationThrottle, $examPollingThrottle) {
    // Auth - All authenticated users
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/profile', [AuthController::class, 'updateProfile']);
    Route::post('/profile/photo', [AuthController::class, 'updatePhoto']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);

    // Dashboard - Role based
    Route::get('/dashboard/admin', [DashboardController::class, 'adminStats'])->middleware(['role:admin', 'throttle:' . $dashboardThrottle]);
    Route::get('/dashboard/guru', [DashboardController::class, 'teacherStats'])->middleware(['role:guru', 'throttle:' . $dashboardThrottle]);
    Route::get('/dashboard/siswa', [DashboardController::class, 'studentStats'])->middleware(['role:siswa', 'throttle:' . $dashboardThrottle]);

    // ============================================
    // ADMIN ONLY ROUTES
    // ============================================
    Route::middleware(['role:admin', 'audit'])->group(function () {
        // User Management
        Route::apiResource('users', UserController::class);
        Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);
        Route::delete('/users/nomor-tes/clear', [UserController::class, 'clearNomorTes']);
        Route::post('/users/nomor-tes/normalize', [UserController::class, 'normalizeNomorTes']);
        Route::get('/teachers', [UserController::class, 'teachers']);
        Route::get('/students/class/{classId}', [UserController::class, 'studentsByClass']);
        
        // Student Blocking
        Route::post('/users/{user}/toggle-block', [UserController::class, 'toggleBlock']);
        Route::get('/students/blocked', [UserController::class, 'blockedStudents']);
        Route::post('/students/bulk-toggle-block', [UserController::class, 'bulkToggleBlock']);
        Route::post('/students/toggle-block-all', [UserController::class, 'toggleAllStudentsBlock']);
        Route::post('/students/toggle-block-by-class', [UserController::class, 'toggleStudentsBlockByClass']);
        
        // Class Management
        Route::apiResource('classes', ClassController::class)->except(['index', 'show']);
        
        // Schedule Management
        Route::apiResource('schedules', ScheduleController::class)->except(['index', 'show']);
        
        // School Network Settings
        Route::get('/school-network-settings/test-ip', [SchoolNetworkController::class, 'testCurrentIp']);
        Route::get('/school-network-settings/snapshot-monitor', [SchoolNetworkController::class, 'getSnapshotMonitorSetting']);
        Route::put('/school-network-settings/snapshot-monitor', [SchoolNetworkController::class, 'updateSnapshotMonitorSetting']);
        Route::get('/school-network-settings/live-sync-stats', [SchoolNetworkController::class, 'liveSyncStats']);
        Route::apiResource('school-network-settings', SchoolNetworkController::class);
        
        // Cache management
        Route::post('/dashboard/clear-cache', [DashboardController::class, 'clearCache']);

        // Exam Publishing & Monitoring (admin only)
        Route::post('/exams/{exam}/publish', [ExamController::class, 'publish']);
        Route::post('/exams/{exam}/republish', [ExamController::class, 'republish']);
        Route::post('/exams/{exam}/unpublish', [ExamController::class, 'unpublish']);
        Route::post('/exams/unpublish-multiple', [ExamController::class, 'unpublishMultiple']);
        Route::get('/exams/{exam}/monitoring', [ExamController::class, 'monitoring']);
        Route::post('/exams/{exam}/participants/{student}/kick', [ExamController::class, 'kickParticipant']);
        Route::post('/exams/{exam}/adjust-time', [ExamController::class, 'adjustActiveTime']);
        
        // Admin exam lock/unlock
        Route::post('/exams/{exam}/lock', [ExamController::class, 'lockExam']);
        Route::post('/exams/{exam}/unlock', [ExamController::class, 'unlockExam']);
    });

    // ============================================
    // TEACHER (GURU) ROUTES
    // ============================================
    Route::middleware('role:guru')->group(function () {
        // Attendance Sessions
        Route::get('/attendance-sessions/my-sessions', [AttendanceController::class, 'mySessions']);
        Route::apiResource('attendance-sessions', AttendanceController::class);
        Route::post('/attendance-sessions/{attendanceSession}/close', [AttendanceController::class, 'close']);
        Route::get('/attendance-sessions/{attendanceSession}/qr-token', [AttendanceController::class, 'getQrToken']);
        Route::post('/attendance-sessions/{attendanceSession}/refresh-token', [AttendanceController::class, 'refreshToken']);
        Route::post('/attendance-sessions/{attendanceSession}/update-student-status', [AttendanceController::class, 'updateStudentStatus']);
        Route::post('/attendance-sessions/{attendanceSession}/bulk-update-status', [AttendanceController::class, 'bulkUpdateStatus']);
        
        // Device Switch Requests
        Route::get('/attendance-sessions/{session}/device-switch-requests', [AttendanceController::class, 'getDeviceSwitchRequests']);
        Route::post('/device-switch-requests/{switchRequest}/handle', [AttendanceController::class, 'handleDeviceSwitchRequest']);
        
        // Teacher attendance stats
        Route::get('/teacher-attendance-stats', [AttendanceController::class, 'teacherStats']);
        
        // Exams Management (create only for guru)
        Route::post('/exams', [ExamController::class, 'store']);
        Route::get('/teacher-grades', [ExamController::class, 'teacherGrades']);
        
        // Materials Management
        Route::apiResource('materials', MaterialController::class);
        
        // Assignments Management
        Route::apiResource('assignments', AssignmentController::class);
        Route::get('/assignments/{assignment}/submissions', [AssignmentController::class, 'submissions']);
        Route::post('/submissions/{submission}/grade', [AssignmentController::class, 'grade']);
        
        // Teacher Schedule
        Route::get('/teacher-schedule', [ScheduleController::class, 'teacherSchedule']);
        
        // Bank Soal Management
        Route::get('/bank-questions', [BankQuestionController::class, 'index']);
        Route::post('/bank-questions', [BankQuestionController::class, 'store']);
        Route::put('/bank-questions/{id}', [BankQuestionController::class, 'update']);
        Route::delete('/bank-questions/{id}', [BankQuestionController::class, 'destroy']);
        Route::post('/bank-questions/bulk', [BankQuestionController::class, 'bulkStore']);
        Route::post('/bank-questions/{id}/duplicate', [BankQuestionController::class, 'duplicate']);
        
        // PDF Import for Bank Soal
        Route::get('/pdf-import/formats', [PdfImportController::class, 'getFormats']);
        Route::post('/pdf-import/parse', [PdfImportController::class, 'parse']);
        Route::post('/pdf-import/parse-url', [PdfImportController::class, 'parseFromUrl']);
        Route::post('/pdf-import/import', [PdfImportController::class, 'import']);
        
        // URL Import (utbk.or.id)
        Route::post('/url-import/preview', [UrlImportController::class, 'preview']);
        Route::post('/url-import/import', [UrlImportController::class, 'import']);

    });

    // ============================================
    // STUDENT (SISWA) ROUTES
    // ============================================
    Route::middleware('role:siswa')->group(function () use ($examPollingThrottle) {
        // Student Attendance
        Route::post('/attendance/submit', [AttendanceController::class, 'submitAttendance']);
        Route::get('/attendance/history', [AttendanceController::class, 'studentHistory']);
        Route::get('/attendance/active-sessions', [AttendanceController::class, 'activeSessions']);
        Route::get('/my-attendance-stats', [AttendanceController::class, 'myStats']);
        
        // Student Exam
        Route::post('/exams/{exam}/start', [ExamController::class, 'startExam']);
        Route::post('/exams/{exam}/heartbeat', [ExamController::class, 'heartbeat']);
        Route::post('/exams/{exam}/answer', [ExamController::class, 'submitAnswer']);
        Route::post('/exams/{exam}/answers/batch', [ExamController::class, 'submitAnswersBatch']);
        Route::get('/exams/{exam}/time-sync', [ExamController::class, 'timeSync'])->middleware('throttle:' . $examPollingThrottle);
        Route::post('/exams/{exam}/work-photo', [ExamController::class, 'uploadWorkPhoto']);
        Route::post('/exams/{exam}/finish', [ExamController::class, 'finishExam']);
        Route::post('/exams/{exam}/violation', [ExamController::class, 'reportViolation']);
        Route::post('/exams/{exam}/snapshot', [ExamController::class, 'uploadSnapshot']);
        
        // Student Assignments
        Route::post('/assignments/{assignment}/submit', [AssignmentController::class, 'submit']);
        Route::get('/assignments-new-count', [AssignmentController::class, 'newCount']);
        Route::get('/assignments-pending', [AssignmentController::class, 'pending']);
        
        // Student Schedule
        Route::get('/my-schedule', [ScheduleController::class, 'mySchedule']);
        
        // Bank Soal for Students (practice)
        Route::get('/bank-questions/subjects', [BankQuestionController::class, 'subjects']);
        Route::get('/bank-questions/practice', [BankQuestionController::class, 'forStudents']);
        Route::post('/bank-questions/practice-result', [BankQuestionController::class, 'savePracticeResult']);
        Route::get('/bank-questions/practice-stats', [BankQuestionController::class, 'practiceStats']);
    });

    // ============================================
    // ADMIN + GURU SHARED ROUTES
    // ============================================
    Route::middleware('role:admin,guru')->group(function () {
        // Summative scores (input nilai sumatif guru/admin)
        Route::get('/summative-scores/subjects', [SummativeScoreController::class, 'subjects']);
        Route::get('/summative-scores', [SummativeScoreController::class, 'index']);
        Route::post('/summative-scores/bulk', [SummativeScoreController::class, 'bulkUpsert']);
        Route::post('/summative-scores/lock', [SummativeScoreController::class, 'lock']);
        Route::post('/summative-scores/unlock', [SummativeScoreController::class, 'unlock']);

        // Announcements management (shared for admin + guru)
        Route::apiResource('announcements', AnnouncementController::class)->except(['index', 'show']);

        // Exam update (guru edits content, admin can edit schedule)
        Route::put('/exams/{exam}', [ExamController::class, 'update']);
        Route::delete('/exams/{exam}', [ExamController::class, 'destroy']);
        // Exam results (admin + exam owner guru)
        Route::get('/exams/{exam}/results', [ExamController::class, 'results'])->middleware('role:admin,guru');
        Route::get('/exams/{exam}/results/{studentId}', [ExamController::class, 'studentResult'])->middleware('role:admin,guru');
        Route::post('/exams/{exam}/clear-history', [ExamController::class, 'clearHistory']);
        
        // Question management (shared — admin can edit even locked exams)
        Route::post('/exams/{exam}/questions', [ExamController::class, 'addQuestion']);
        Route::put('/questions/{question}', [ExamController::class, 'updateQuestion']);
        Route::delete('/questions/{question}', [ExamController::class, 'deleteQuestion']);
        
        // Grading (both admin and guru can grade essays)
        Route::post('/exams/{exam}/grade-answer/{answerId}', [ExamController::class, 'gradeAnswer']);
        Route::put('/exam-results/{resultId}/score', [ExamController::class, 'updateResultScore']);
        
        // Reactivate exam result (for violations)
        Route::post('/exam-results/{result}/reactivate', [ExamController::class, 'reactivateResult']);
        
        // End exam (force finish all students)
        Route::post('/exams/{exam}/end', [ExamController::class, 'endExam']);
    });

    // ============================================
    // SHARED ROUTES (All authenticated users)
    // ============================================
    // Read-only access to classes
    Route::get('/classes', [ClassController::class, 'index']);
    Route::get('/classes/{class}', [ClassController::class, 'show']);
    
    // Read-only access to schedules
    Route::get('/schedules', [ScheduleController::class, 'index']);
    Route::get('/schedules/{schedule}', [ScheduleController::class, 'show']);
    
    // Read-only access to announcements
    Route::get('/announcements', [AnnouncementController::class, 'index']);
    Route::get('/announcements/{announcement}', [AnnouncementController::class, 'show']);
    Route::get('/announcements-latest', [AnnouncementController::class, 'latest']);
    Route::get('/announcements-unread-count', [AnnouncementController::class, 'unreadCount']);

    // Global snapshot monitoring status (used by active student exam sessions)
    Route::get('/snapshot-monitor/status', [SchoolNetworkController::class, 'getSnapshotMonitorSetting']);
    
    // Student can view exams and materials
    Route::get('/exams', [ExamController::class, 'index'])->middleware('throttle:' . $examPollingThrottle);
    Route::get('/exams/{exam}', [ExamController::class, 'show'])->middleware('throttle:' . $examPollingThrottle);
    Route::get('/materials', [MaterialController::class, 'index']);
    Route::get('/materials/{material}', [MaterialController::class, 'show']);
    Route::get('/materials/{material}/download', [MaterialController::class, 'download']);
    
    // Assignments read access
    Route::get('/assignments', [AssignmentController::class, 'index']);
    Route::get('/assignments/{assignment}', [AssignmentController::class, 'show']);

    // ============================================
    // NOTIFICATIONS (All authenticated users)
    // ============================================
    Route::get('/notifications', [NotificationController::class, 'index'])->middleware('throttle:' . $notificationThrottle);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount'])->middleware('throttle:' . $notificationThrottle);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead'])->middleware('throttle:' . $notificationThrottle);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead'])->middleware('throttle:' . $notificationThrottle);
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy'])->middleware('throttle:' . $notificationThrottle);

    // ============================================
    // PROGRESS REPORTS (All authenticated users)
    // ============================================
    Route::get('/progress/semesters', [ProgressController::class, 'semesters']);
    Route::get('/progress/student/{studentId}', [ProgressController::class, 'studentReport']);
    Route::get('/progress/class/{classId}', [ProgressController::class, 'classReport'])
        ->middleware('role:admin,guru');

    // ============================================
    // EXPORT (Admin & Guru only)
    // ============================================
    Route::middleware('role:admin,guru')->group(function () {
        Route::get('/export/grades', [ExportController::class, 'grades']);
        Route::get('/export/attendance', [ExportController::class, 'attendance']);
        Route::get('/export/student/{studentId}', [ExportController::class, 'studentReport']);
        Route::get('/export/exam-results/{examId}', [ExportController::class, 'examResults'])->middleware('role:admin');
        Route::get('/export/quiz-results/{quizId}', [ExportController::class, 'quizResults'])->middleware('role:admin');
    });

    // ============================================
    // AUDIT LOG (Admin only)
    // ============================================
    Route::middleware('role:admin')->group(function () {
        Route::get('/audit-logs', [AuditLogController::class, 'index']);
        Route::get('/audit-logs/actions', [AuditLogController::class, 'actions']);
    });

    // ============================================
    // QUIZ / UJIAN HARIAN ROUTES
    // ============================================
    
    // Shared: list & show quiz (all authenticated)
    Route::get('/quizzes', [QuizController::class, 'index']);
    Route::get('/quizzes/{quiz}', [QuizController::class, 'show']);

    // Teacher quiz management
    Route::middleware('role:guru')->group(function () {
        Route::post('/quizzes', [QuizController::class, 'store']);
        Route::delete('/quizzes/{quiz}', [QuizController::class, 'destroy']);
    });

    // Teacher + Admin: update, publish, end, questions, results, grading
    Route::middleware('role:admin,guru')->group(function () {
        Route::put('/quizzes/{quiz}', [QuizController::class, 'update']);
        Route::post('/quizzes/{quiz}/publish', [QuizController::class, 'publish']);
        Route::post('/quizzes/{quiz}/end', [QuizController::class, 'endQuiz']);
        Route::post('/quizzes/{quiz}/duplicate-from-exam', [QuizController::class, 'duplicateFromExam']);
        Route::post('/quizzes/{quiz}/questions', [QuizController::class, 'addQuestion']);
        Route::put('/quiz-questions/{question}', [QuizController::class, 'updateQuestion']);
        Route::delete('/quiz-questions/{question}', [QuizController::class, 'deleteQuestion']);
        Route::get('/quizzes/{quiz}/results', [QuizController::class, 'results']);
        Route::get('/quizzes/{quiz}/results/{studentId}', [QuizController::class, 'studentResult']);
        Route::post('/quizzes/{quiz}/grade-answer/{answerId}', [QuizController::class, 'gradeAnswer']);
    });

    // Student quiz taking
    Route::middleware('role:siswa')->group(function () {
        Route::get('/quizzes/{quiz}/sync-questions', [QuizController::class, 'syncQuestions']);
        Route::post('/quizzes/{quiz}/start', [QuizController::class, 'startQuiz']);
        Route::post('/quizzes/{quiz}/answer', [QuizController::class, 'submitAnswer']);
        Route::post('/quizzes/{quiz}/finish', [QuizController::class, 'finishQuiz']);
    });
});
