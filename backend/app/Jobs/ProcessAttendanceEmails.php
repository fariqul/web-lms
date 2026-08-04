<?php

namespace App\Jobs;

use App\Mail\ParentAttendanceNotification;
use App\Mail\HomeroomAttendanceNotification;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\ClassRoom;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class ProcessAttendanceEmails implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of times the job may be attempted.
     */
    public int $tries = 3;

    /**
     * The number of seconds to wait before retrying.
     */
    public int $backoff = 10;

    public function __construct(
        private int $sessionId,
    ) {}

    public function handle(): void
    {
        $session = AttendanceSession::with(['class', 'teacher'])->find($this->sessionId);
        if (!$session) {
            Log::warning("ProcessAttendanceEmails: Session {$this->sessionId} not found.");
            return;
        }

        $class = $session->class;
        if (!$class) {
            Log::warning("ProcessAttendanceEmails: Class not found for session {$this->sessionId}.");
            return;
        }

        $date = $session->valid_from
            ? $session->valid_from->format('d/m/Y')
            : $session->created_at->format('d/m/Y');
        $time = $session->valid_from
            ? $session->valid_from->format('H:i')
            : $session->created_at->format('H:i');

        // Get all attendances for this session
        $attendances = Attendance::where('session_id', $session->id)
            ->with('student:id,name,parent_email')
            ->get();

        $studentList = [];
        $sentCount = 0;
        $failedCount = 0;

        foreach ($attendances as $attendance) {
            $student = $attendance->student;
            if (!$student) continue;

            $studentList[] = [
                'name' => $student->name,
                'status' => $attendance->status,
            ];

            // Send email to parent if parent_email is set
            if (!empty($student->parent_email)) {
                try {
                    Mail::to($student->parent_email)->send(
                        new ParentAttendanceNotification(
                            studentName: $student->name,
                            status: $attendance->status,
                            subject: $session->subject ?? 'Umum',
                            className: $class->name ?? '-',
                            date: $date,
                            time: $time,
                        )
                    );
                    $sentCount++;
                } catch (\Throwable $e) {
                    $failedCount++;
                    Log::error("Failed to send parent email for student {$student->id}: {$e->getMessage()}");
                }
            }
        }

        // Sort student list by name for the homeroom email
        usort($studentList, fn($a, $b) => strcmp($a['name'], $b['name']));

        // Send recap email to homeroom teacher (wali kelas) if configured
        $waliKelas = $class->wali_kelas_id ? User::find($class->wali_kelas_id) : null;
        $waliEmail = $waliKelas?->personal_email;

        if ($waliEmail) {
            $summary = [
                'total' => count($studentList),
                'hadir' => collect($studentList)->where('status', 'hadir')->count(),
                'izin' => collect($studentList)->where('status', 'izin')->count(),
                'sakit' => collect($studentList)->where('status', 'sakit')->count(),
                'alpha' => collect($studentList)->where('status', 'alpha')->count(),
            ];

            try {
                Mail::to($waliEmail)->send(
                    new HomeroomAttendanceNotification(
                        teacherName: $waliKelas->name,
                        className: $class->name ?? '-',
                        subjectName: $session->subject ?? 'Umum',
                        date: $date,
                        summary: $summary,
                        studentList: $studentList,
                    )
                );
                $sentCount++;
            } catch (\Throwable $e) {
                $failedCount++;
                Log::error("Failed to send homeroom email for class {$class->id}: {$e->getMessage()}");
            }
        }

        Log::info("ProcessAttendanceEmails: Session {$this->sessionId} done. Sent: {$sentCount}, Failed: {$failedCount}");
    }
}
