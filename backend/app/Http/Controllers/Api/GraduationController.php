<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudentGraduation;
use App\Models\User;
use App\Models\ClassRoom;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class GraduationController extends Controller
{
    /**
     * Get graduation status for student (siswa view)
     * Returns status + pickup message from admin if lulus
     */
    public function getMyGraduation(Request $request)
    {
        $student = $request->user();

        if ($student->role !== 'siswa') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $graduation = StudentGraduation::where('student_id', $student->id)
            ->with(['class', 'decidedBy'])
            ->first();

        if (!$graduation) {
            return response()->json([
                'success' => true,
                'data'    => [
                    'status'  => 'pending',
                    'message' => 'Status kelulusan belum diumumkan',
                ],
            ]);
        }

        $isLulus = $graduation->status === StudentGraduation::STATUS_LULUS;

        return response()->json([
            'success' => true,
            'data'    => [
                'id'              => $graduation->id,
                'status'          => $graduation->status,
                'status_label'    => StudentGraduation::getStatusLabel($graduation->status),
                'class'           => $graduation->class->name ?? null,
                'decided_at'      => $graduation->decided_at,
                'decided_by'      => $graduation->decidedBy?->name,
                'notes'           => $graduation->notes,
                // Pesan pengambilan SKL dari admin, hanya tampil jika lulus
                'pickup_message'  => $isLulus ? ($graduation->class->skl_pickup_message ?? null) : null,
            ],
        ]);
    }

    /**
     * Get all graduations for a class (admin view)
     * Returns ALL students + current pickup_message for the class
     */
    public function getByClass(Request $request, $classId)
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $class = ClassRoom::with('students')->findOrFail($classId);

        // Fetch all existing graduation records for this class, keyed by student_id
        $graduationRecords = StudentGraduation::where('class_id', $classId)
            ->with(['decidedBy'])
            ->get()
            ->keyBy('student_id');

        // Get all students in this class (relation already filters by role=siswa)
        $students = $class->students()->orderBy('name')->get();

        $data = $students->map(function ($student) use ($graduationRecords) {
            $graduation = $graduationRecords->get($student->id);

            return [
                'id'           => $graduation?->id ?? 0,
                'student'      => [
                    'id'    => $student->id,
                    'name'  => $student->name,
                    'nisn'  => $student->nisn ?? '-',
                    'email' => $student->email,
                ],
                'status'       => $graduation?->status ?? 'pending',
                'status_label' => StudentGraduation::getStatusLabel($graduation?->status ?? 'pending'),
                'notes'        => $graduation?->notes,
                'decided_at'   => $graduation?->decided_at,
                'decided_by'   => $graduation?->decidedBy?->name,
            ];
        });

        return response()->json([
            'success'         => true,
            'data'            => $data,
            // Admin bisa lihat dan edit pesan ini
            'pickup_message'  => $class->skl_pickup_message,
        ]);
    }

    /**
     * Update pickup message for a class (admin only)
     */
    public function updatePickupMessage(Request $request, $classId)
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'pickup_message' => 'nullable|string|max:1000',
        ]);

        $class = ClassRoom::findOrFail($classId);
        $class->skl_pickup_message = $validated['pickup_message'] ?? null;
        $class->save();

        return response()->json([
            'success' => true,
            'message' => 'Pesan pengambilan SKL berhasil diperbarui',
            'data'    => [
                'pickup_message' => $class->skl_pickup_message,
            ],
        ]);
    }

    /**
     * Set graduation status for a student (admin only)
     */
    public function setGraduationStatus(Request $request, $studentId, $classId)
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'status' => 'required|in:lulus,tidak_lulus,pending',
            'notes'  => 'nullable|string|max:500',
        ]);

        $student = User::findOrFail($studentId);
        ClassRoom::findOrFail($classId); // validate class exists

        $graduation = StudentGraduation::firstOrCreate(
            ['student_id' => $studentId, 'class_id' => $classId],
            ['status'     => 'pending']
        );

        $graduation->status = $validated['status'];
        $graduation->notes  = $validated['notes'] ?? null;

        if ($validated['status'] === 'pending') {
            // Reset — clear decision info
            $graduation->decided_at = null;
            $graduation->decided_by = null;
        } else {
            $graduation->decided_at = now();
            $graduation->decided_by = $request->user()->id;
        }

        $graduation->save();

        $this->sendGraduationNotification($student, $graduation);

        return response()->json([
            'success' => true,
            'message' => 'Status kelulusan berhasil diperbarui',
            'data'    => [
                'id'           => $graduation->id,
                'status'       => $graduation->status,
                'status_label' => StudentGraduation::getStatusLabel($graduation->status),
            ],
        ]);
    }

    /**
     * Bulk set graduation status (admin only)
     */
    public function bulkSetGraduationStatus(Request $request)
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'class_id'      => 'required|integer|exists:classes,id',
            'student_ids'   => 'required|array|min:1',
            'student_ids.*' => 'integer|exists:users,id',
            'status'        => 'required|in:lulus,tidak_lulus',
            'notes'         => 'nullable|string|max:500',
        ]);

        $successCount = 0;
        $failCount    = 0;

        foreach ($validated['student_ids'] as $studentId) {
            try {
                $student = User::findOrFail($studentId);

                $graduation = StudentGraduation::firstOrCreate(
                    ['student_id' => $studentId, 'class_id' => $validated['class_id']],
                    ['status'     => 'pending']
                );

                $graduation->status     = $validated['status'];
                $graduation->notes      = $validated['notes'] ?? null;
                $graduation->decided_at = now();
                $graduation->decided_by = $request->user()->id;
                $graduation->save();

                $this->sendGraduationNotification($student, $graduation);
                $successCount++;
            } catch (\Exception $e) {
                Log::error("Failed to set graduation for student {$studentId}: " . $e->getMessage());
                $failCount++;
            }
        }

        return response()->json([
            'success' => true,
            'message' => "Status kelulusan berhasil diperbarui untuk {$successCount} siswa",
            'data'    => [
                'success_count' => $successCount,
                'fail_count'    => $failCount,
            ],
        ]);
    }

    /**
     * Send notification to student about their graduation status
     */
    private function sendGraduationNotification(User $student, StudentGraduation $graduation)
    {
        try {
            $message = $graduation->status === StudentGraduation::STATUS_LULUS
                ? 'Selamat! Anda dinyatakan LULUS. Silakan cek pengumuman di aplikasi untuk informasi pengambilan SKL.'
                : 'Status kelulusan Anda adalah TIDAK LULUS.';

            Log::info("Graduation notification for student {$student->id}: {$message}");
        } catch (\Exception $e) {
            Log::error('Failed to send graduation notification: ' . $e->getMessage());
        }
    }
}
