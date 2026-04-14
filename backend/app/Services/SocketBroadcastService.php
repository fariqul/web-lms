<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SocketBroadcastService
{
    protected string $url;
    protected string $secret;

    public function __construct()
    {
        $this->url = config('app.socket_server_url', 'http://socket:6001');
        $this->secret = config('app.socket_internal_secret', 'lms-socket-secret-key-2026');
    }

    /**
     * Broadcast an event to a specific room or to all connected clients.
     */
    public function broadcast(string $event, array $data = [], ?string $room = null): bool
    {
        try {
            /** @var \Illuminate\Http\Client\Response $response */
            $response = Http::withToken($this->secret)
                ->timeout(3)
                ->post("{$this->url}/broadcast", [
                    'event' => $event,
                    'room' => $room,
                    'data' => $data,
                ]);

            $status = $response->status();
            return $status >= 200 && $status < 300;
        } catch (\Exception $e) {
            Log::warning("Socket broadcast failed: {$e->getMessage()}", [
                'event' => $event,
                'room' => $room,
            ]);
            return false;
        }
    }

    // ─── Exam Events ────────────────────────────────────────────

    /**
     * Student started an exam.
     */
    public function examStudentJoined(int $examId, array $studentData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.student-joined",
            $studentData,
            "exam.{$examId}"
        );
    }

    /**
     * Student answered a question (progress update).
     */
    public function examAnswerProgress(int $examId, array $progressData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.answer-progress",
            $progressData,
            "exam.{$examId}"
        );
    }

    /**
     * Student submitted/finished the exam.
     */
    public function examStudentSubmitted(int $examId, array $resultData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.student-submitted",
            $resultData,
            "exam.{$examId}"
        );
    }

    /**
     * Anti-cheat violation detected.
     */
    public function examViolation(int $examId, array $violationData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.violation",
            $violationData,
            "exam.{$examId}"
        );
    }

    /**
     * New camera snapshot uploaded.
     */
    public function examSnapshot(int $examId, array $snapshotData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.snapshot",
            $snapshotData,
            "exam.{$examId}"
        );
    }

    /**
     * Exam ended by admin — notify all students to stop.
     */
    public function examEnded(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.ended",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * AI Proctoring alert — suspicious activity detected.
     */
    public function examProctoringAlert(int $examId, array $alertData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.proctor-alert",
            $alertData,
            "exam.{$examId}"
        );
    }

    /**
     * AI Proctoring warning to specific student (browser shows warning).
     */
    public function examProctoringWarning(int $examId, int $studentId, array $warningData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.proctor-warning",
            array_merge($warningData, ['student_id' => $studentId]),
            "exam.{$examId}"
        );
    }

    /**
     * Exam settings updated (duration, title, passing_score, SEB, etc.)
     */
    public function examUpdated(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.updated",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * Exam published (draft → scheduled).
     */
    public function examPublished(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.published",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * Exam deleted.
     */
    public function examDeleted(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.deleted",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * Exam questions locked by admin.
     */
    public function examLocked(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.locked",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * Exam questions unlocked by admin.
     */
    public function examUnlocked(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.unlocked",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * Essay answer graded by teacher.
     */
    public function answerGraded(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.answer-graded",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * Exam result score manually updated by teacher.
     */
    public function resultScoreUpdated(int $examId, array $data): bool
    {
        return $this->broadcast(
            "exam.{$examId}.result-updated",
            $data,
            "exam.{$examId}"
        );
    }

    /**
     * A question was added to an active exam.
     */
    public function examQuestionAdded(int $examId, array $questionData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.question-added",
            $questionData,
            "exam.{$examId}"
        );
    }

    /**
     * A question was updated in an active exam.
     */
    public function examQuestionUpdated(int $examId, array $questionData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.question-updated",
            $questionData,
            "exam.{$examId}"
        );
    }

    /**
     * A question was deleted from an active exam.
     */
    public function examQuestionDeleted(int $examId, array $questionData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.question-deleted",
            $questionData,
            "exam.{$examId}"
        );
    }

    /**
     * Student exam result reactivated by admin (allowed to retry).
     */
    public function examStudentReactivated(int $examId, array $reactivationData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.student-reactivated",
            $reactivationData,
            "exam.{$examId}"
        );
    }

    /**
     * Student removed from exam by admin.
     */
    public function examStudentKicked(int $examId, array $kickData): bool
    {
        return $this->broadcast(
            "exam.{$examId}.student-kicked",
            $kickData,
            "exam.{$examId}"
        );
    }

    // ─── Attendance Events ──────────────────────────────────────

    /**
     * Student scanned QR for attendance.
     */
    public function attendanceScanned(int $sessionId, array $attendanceData): bool
    {
        return $this->broadcast(
            "attendance.{$sessionId}.scanned",
            $attendanceData,
            "attendance.{$sessionId}"
        );
    }

    /**
     * QR code was refreshed.
     */
    public function attendanceQRRefreshed(int $sessionId, array $qrData): bool
    {
        return $this->broadcast(
            "attendance.{$sessionId}.qr-refreshed",
            $qrData,
            "attendance.{$sessionId}"
        );
    }

    /**
     * New device switch request created (student used another student's device).
     */
    public function deviceSwitchRequested(int $sessionId, array $requestData): bool
    {
        return $this->broadcast(
            "attendance.{$sessionId}.device-switch-requested",
            $requestData,
            "attendance.{$sessionId}"
        );
    }

    /**
     * Device switch request handled (approved/rejected by teacher).
     */
    public function deviceSwitchHandled(int $sessionId, array $handleData): bool
    {
        return $this->broadcast(
            "attendance.{$sessionId}.device-switch-handled",
            $handleData,
            "attendance.{$sessionId}"
        );
    }

    // ─── Notification Events ────────────────────────────────────

    /**
     * Send real-time notification to a specific user.
     */
    public function notifyUser(int $userId, array $notificationData): bool
    {
        return $this->broadcast(
            'notification',
            $notificationData,
            "user.{$userId}"
        );
    }

    /**
     * Broadcast global snapshot monitor setting changes.
     */
    public function snapshotMonitorUpdated(array $data): bool
    {
        return $this->broadcast(
            'system.snapshot-monitor.updated',
            $data,
            'system.snapshot-monitor'
        );
    }
}
