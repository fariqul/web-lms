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

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// Public routes
Route::post('/login', [AuthController::class, 'login']);

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/profile', [AuthController::class, 'updateProfile']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);

    // Dashboard
    Route::get('/dashboard/admin', [DashboardController::class, 'adminStats']);
    Route::get('/dashboard/guru', [DashboardController::class, 'teacherStats']);
    Route::get('/dashboard/siswa', [DashboardController::class, 'studentStats']);

    // Users (Admin only)
    Route::apiResource('users', UserController::class);
    Route::get('/teachers', [UserController::class, 'teachers']);
    Route::get('/students/class/{classId}', [UserController::class, 'studentsByClass']);

    // Classes
    Route::apiResource('classes', ClassController::class);

    // Attendance Sessions
    Route::apiResource('attendance-sessions', AttendanceController::class);
    Route::post('/attendance-sessions/{attendanceSession}/close', [AttendanceController::class, 'close']);
    Route::get('/attendance-sessions/{attendanceSession}/qr-token', [AttendanceController::class, 'getQrToken']);
    Route::post('/attendance-sessions/{attendanceSession}/refresh-token', [AttendanceController::class, 'refreshToken']);
    Route::post('/attendance-sessions/{attendanceSession}/update-student-status', [AttendanceController::class, 'updateStudentStatus']);
    Route::post('/attendance-sessions/{attendanceSession}/bulk-update-status', [AttendanceController::class, 'bulkUpdateStatus']);

    // Student Attendance
    Route::post('/attendance/submit', [AttendanceController::class, 'submitAttendance']);
    Route::get('/attendance/history', [AttendanceController::class, 'studentHistory']);
    Route::get('/attendance/active-sessions', [AttendanceController::class, 'activeSessions']);
    Route::get('/my-attendance-stats', [AttendanceController::class, 'myStats']);
    Route::get('/teacher-attendance-stats', [AttendanceController::class, 'teacherStats']);

    // Exams
    Route::apiResource('exams', ExamController::class);
    Route::post('/exams/{exam}/publish', [ExamController::class, 'publish']);
    Route::post('/exams/{exam}/questions', [ExamController::class, 'addQuestion']);
    Route::put('/questions/{question}', [ExamController::class, 'updateQuestion']);
    Route::delete('/questions/{question}', [ExamController::class, 'deleteQuestion']);

    // Student Exam
    Route::post('/exams/{exam}/start', [ExamController::class, 'startExam']);
    Route::post('/exams/{exam}/answer', [ExamController::class, 'submitAnswer']);
    Route::post('/exams/{exam}/finish', [ExamController::class, 'finishExam']);
    Route::post('/exams/{exam}/violation', [ExamController::class, 'reportViolation']);
    Route::post('/exams/{exam}/snapshot', [ExamController::class, 'uploadSnapshot']);

    // Teacher Exam Monitoring
    Route::get('/exams/{exam}/results', [ExamController::class, 'results']);
    Route::get('/exams/{exam}/results/{studentId}', [ExamController::class, 'studentResult']);
    Route::get('/exams/{exam}/monitoring', [ExamController::class, 'monitoring']);

    // Schedules
    Route::apiResource('schedules', ScheduleController::class);
    Route::get('/my-schedule', [ScheduleController::class, 'mySchedule']);
    Route::get('/teacher-schedule', [ScheduleController::class, 'teacherSchedule']);

    // Materials
    Route::apiResource('materials', MaterialController::class);

    // Cache management
    Route::post('/dashboard/clear-cache', [DashboardController::class, 'clearCache']);
});
