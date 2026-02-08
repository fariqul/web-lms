<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;

class NotificationService
{
    /**
     * Notify a student about their exam result.
     */
    public static function examResultPublished(int $studentId, string $examTitle, float $score): void
    {
        Notification::send(
            $studentId,
            'exam_result',
            'Hasil Ujian: ' . $examTitle,
            'Nilai ujian Anda untuk "' . $examTitle . '" telah dipublikasikan. Skor: ' . $score . '%',
            ['exam_title' => $examTitle, 'score' => $score]
        );
    }

    /**
     * Notify students about a new exam.
     */
    public static function newExamCreated(array $studentIds, string $examTitle, string $subject, string $startTime): void
    {
        Notification::sendToMany(
            $studentIds,
            'exam',
            'Ujian Baru: ' . $examTitle,
            'Ujian "' . $examTitle . '" (' . $subject . ') dijadwalkan pada ' . $startTime,
            ['exam_title' => $examTitle, 'subject' => $subject, 'start_time' => $startTime]
        );
    }

    /**
     * Notify students about a new assignment.
     */
    public static function newAssignment(array $studentIds, string $assignmentTitle, string $deadline): void
    {
        Notification::sendToMany(
            $studentIds,
            'assignment',
            'Tugas Baru: ' . $assignmentTitle,
            'Tugas baru "' . $assignmentTitle . '" telah ditambahkan. Deadline: ' . $deadline,
            ['assignment_title' => $assignmentTitle, 'deadline' => $deadline]
        );
    }

    /**
     * Notify all users of a specific role about an announcement.
     */
    public static function newAnnouncement(string $title, string $target = 'all'): void
    {
        $query = User::query();
        if ($target !== 'all') {
            $query->where('role', $target);
        }
        $userIds = $query->pluck('id')->toArray();

        Notification::sendToMany(
            $userIds,
            'announcement',
            'Pengumuman: ' . $title,
            'Pengumuman baru telah dipublikasikan: "' . $title . '"',
            ['announcement_title' => $title]
        );
    }

    /**
     * Notify teacher about attendance completion.
     */
    public static function attendanceSessionClosed(int $teacherId, string $className, int $presentCount, int $totalStudents): void
    {
        Notification::send(
            $teacherId,
            'attendance',
            'Sesi Absensi Selesai',
            'Sesi absensi untuk kelas ' . $className . ' telah ditutup. Hadir: ' . $presentCount . '/' . $totalStudents,
            ['class_name' => $className, 'present' => $presentCount, 'total' => $totalStudents]
        );
    }

    /**
     * Send a system notification to a user.
     */
    public static function system(int $userId, string $title, string $message, ?array $data = null): void
    {
        Notification::send($userId, 'system', $title, $message, $data);
    }
}
