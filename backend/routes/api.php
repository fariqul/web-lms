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

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

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
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:200,1'); // 200 attempts per minute (shared IP)

// Password reset (public, rate limited)
Route::post('/forgot-password', [PasswordResetController::class, 'forgotPassword'])->middleware('throttle:3,1');
Route::post('/reset-password', [PasswordResetController::class, 'resetPassword'])->middleware('throttle:5,1');

// Protected routes
Route::middleware(['auth:sanctum', 'throttle:200,1'])->group(function () {
    // Auth - All authenticated users
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/profile', [AuthController::class, 'updateProfile']);
    Route::post('/profile/photo', [AuthController::class, 'updatePhoto']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);

    // Dashboard - Role based
    Route::get('/dashboard/admin', [DashboardController::class, 'adminStats'])->middleware('role:admin');
    Route::get('/dashboard/guru', [DashboardController::class, 'teacherStats'])->middleware('role:guru');
    Route::get('/dashboard/siswa', [DashboardController::class, 'studentStats'])->middleware('role:siswa');

    // ============================================
    // ADMIN ONLY ROUTES
    // ============================================
    Route::middleware(['role:admin', 'audit'])->group(function () {
        // User Management
        Route::apiResource('users', UserController::class);
        Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);
        Route::delete('/users/nomor-tes/clear', [UserController::class, 'clearNomorTes']);
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
        Route::apiResource('school-network-settings', SchoolNetworkController::class);
        
        // Announcements Management
        Route::apiResource('announcements', AnnouncementController::class)->except(['index', 'show']);
        
        // Cache management
        Route::post('/dashboard/clear-cache', [DashboardController::class, 'clearCache']);

        // Exam Publishing & Monitoring (admin only)
        Route::post('/exams/{exam}/publish', [ExamController::class, 'publish']);
        Route::get('/exams/{exam}/monitoring', [ExamController::class, 'monitoring']);
        
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
        
        // Exams Management (create, delete - guru only)
        Route::post('/exams', [ExamController::class, 'store']);
        Route::delete('/exams/{exam}', [ExamController::class, 'destroy']);
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

        // Announcements Management (guru can also create/edit/delete)
        Route::apiResource('announcements', AnnouncementController::class)->except(['index', 'show']);
    });

    // ============================================
    // STUDENT (SISWA) ROUTES
    // ============================================
    Route::middleware('role:siswa')->group(function () {
        // Student Attendance
        Route::post('/attendance/submit', [AttendanceController::class, 'submitAttendance']);
        Route::get('/attendance/history', [AttendanceController::class, 'studentHistory']);
        Route::get('/attendance/active-sessions', [AttendanceController::class, 'activeSessions']);
        Route::get('/my-attendance-stats', [AttendanceController::class, 'myStats']);
        
        // Student Exam
        Route::post('/exams/{exam}/start', [ExamController::class, 'startExam']);
        Route::post('/exams/{exam}/answer', [ExamController::class, 'submitAnswer']);
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
        // Exam update (guru edits content, admin can edit schedule)
        Route::put('/exams/{exam}', [ExamController::class, 'update']);
        // Exam results (guru grades, admin views)
        Route::get('/exams/{exam}/results', [ExamController::class, 'results']);
        Route::get('/exams/{exam}/results/{studentId}', [ExamController::class, 'studentResult']);
        
        // Question management (shared — admin can edit even locked exams)
        Route::post('/exams/{exam}/questions', [ExamController::class, 'addQuestion']);
        Route::put('/questions/{question}', [ExamController::class, 'updateQuestion']);
        Route::delete('/questions/{question}', [ExamController::class, 'deleteQuestion']);
        
        // Grading (both admin and guru can grade essays)
        Route::post('/exams/{exam}/grade-answer/{answerId}', [ExamController::class, 'gradeAnswer']);
        Route::put('/exam-results/{resultId}/score', [ExamController::class, 'updateResultScore']);
        
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
    
    // Student can view exams and materials
    Route::get('/exams', [ExamController::class, 'index']);
    Route::get('/exams/{exam}', [ExamController::class, 'show']);
    Route::get('/materials', [MaterialController::class, 'index']);
    Route::get('/materials/{material}', [MaterialController::class, 'show']);
    Route::get('/materials/{material}/download', [MaterialController::class, 'download']);
    
    // Assignments read access
    Route::get('/assignments', [AssignmentController::class, 'index']);
    Route::get('/assignments/{assignment}', [AssignmentController::class, 'show']);

    // ============================================
    // NOTIFICATIONS (All authenticated users)
    // ============================================
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy']);

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
        Route::get('/export/exam-results/{examId}', [ExportController::class, 'examResults']);
        Route::get('/export/quiz-results/{quizId}', [ExportController::class, 'quizResults']);
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
        Route::post('/quizzes/{quiz}/questions', [QuizController::class, 'addQuestion']);
        Route::put('/quiz-questions/{question}', [QuizController::class, 'updateQuestion']);
        Route::delete('/quiz-questions/{question}', [QuizController::class, 'deleteQuestion']);
        Route::get('/quizzes/{quiz}/results', [QuizController::class, 'results']);
        Route::get('/quizzes/{quiz}/results/{studentId}', [QuizController::class, 'studentResult']);
        Route::post('/quizzes/{quiz}/grade-answer/{answerId}', [QuizController::class, 'gradeAnswer']);
    });

    // Student quiz taking
    Route::middleware('role:siswa')->group(function () {
        Route::post('/quizzes/{quiz}/start', [QuizController::class, 'startQuiz']);
        Route::post('/quizzes/{quiz}/answer', [QuizController::class, 'submitAnswer']);
        Route::post('/quizzes/{quiz}/finish', [QuizController::class, 'finishQuiz']);
    });
});
