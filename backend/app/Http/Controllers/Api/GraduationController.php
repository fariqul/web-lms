<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StudentGraduation;
use App\Models\User;
use App\Models\ClassRoom;
use App\Services\SKLGeneratorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Database\Eloquent\ModelNotFoundException;

class GraduationController extends Controller
{
    /**
     * Get graduation status for student (siswa view)
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
                'data' => [
                    'status' => 'pending',
                    'message' => 'Status kelulusan belum diumumkan',
                ]
            ]);
        }

        $isLulus = $graduation->status === StudentGraduation::STATUS_LULUS;
        $sklExists = $isLulus && $graduation->skl_path 
            && Storage::disk('public')->exists($graduation->skl_path);

        // Auto-regenerate SKL if lulus but file is missing
        if ($isLulus && !$sklExists) {
            try {
                $graduation->loadMissing(['student', 'class', 'decidedBy']);
                $sklPath = SKLGeneratorService::generateSKL($graduation);
                $graduation->skl_path = $sklPath;
                $graduation->save();
                $sklExists = true;
            } catch (\Exception $e) {
                Log::error('SKL auto-regeneration failed: ' . $e->getMessage());
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id'              => $graduation->id,
                'status'          => $graduation->status,
                'status_label'    => StudentGraduation::getStatusLabel($graduation->status),
                'class'           => $graduation->class->name ?? null,
                'decided_at'      => $graduation->decided_at,
                'decided_by'      => $graduation->decidedBy?->name,
                'notes'           => $graduation->notes,
                'can_download_skl' => $sklExists,
                'skl_path'        => $isLulus ? $graduation->skl_path : null,
            ]
        ]);
    }

    /**
     * Get all graduations for a class (admin view)
     * Returns ALL students in the class, with their graduation status (pending if no record)
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

        $data = $students->map(function ($student) use ($graduationRecords, $classId) {
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
                'skl_path'     => $graduation?->skl_path,
                'decided_at'   => $graduation?->decided_at,
                'decided_by'   => $graduation?->decidedBy?->name,
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $data,
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
            'status' => 'required|in:lulus,tidak_lulus',
            'notes' => 'nullable|string|max:500',
        ]);

        $student = User::findOrFail($studentId);
        $class = ClassRoom::findOrFail($classId);

        // Find or create graduation record
        $graduation = StudentGraduation::firstOrCreate(
            ['student_id' => $studentId, 'class_id' => $classId],
            ['status' => 'pending']
        );

        $graduation->status = $validated['status'];
        $graduation->notes = $validated['notes'] ?? null;
        $graduation->decided_at = now();
        $graduation->decided_by = $request->user()->id;

        // Generate SKL jika lulus
        if ($validated['status'] === StudentGraduation::STATUS_LULUS) {
            try {
                $sklPath = SKLGeneratorService::generateSKL($graduation);
                $graduation->skl_path = $sklPath;
            } catch (\Exception $e) {
                Log::error('SKL Generation Error: ' . $e->getMessage());
                // Continue tanpa SKL
            }
        } else {
            // Clear SKL path jika tidak lulus
            $graduation->skl_path = null;
        }

        $graduation->save();

        // Send notification to student
        $this->sendGraduationNotification($student, $graduation);

        return response()->json([
            'success' => true,
            'message' => 'Status kelulusan berhasil diperbarui',
            'data' => [
                'id' => $graduation->id,
                'status' => $graduation->status,
                'status_label' => StudentGraduation::getStatusLabel($graduation->status),
            ]
        ]);
    }

    /**
     * Download SKL for student
     */
    public function downloadSKL(Request $request)
    {
        $student = $request->user();
        
        if ($student->role !== 'siswa') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $graduation = StudentGraduation::where('student_id', $student->id)
            ->where('status', StudentGraduation::STATUS_LULUS)
            ->first();

        if (!$graduation || !$graduation->skl_path) {
            return response()->json([
                'success' => false,
                'message' => 'SKL tidak tersedia',
            ], 404);
        }

        // Check file exists on storage disk
        if (!Storage::disk('public')->exists($graduation->skl_path)) {
            // Try to regenerate
            try {
                $graduation->loadMissing(['student', 'class', 'decidedBy']);
                $sklPath = SKLGeneratorService::generateSKL($graduation);
                $graduation->skl_path = $sklPath;
                $graduation->save();
            } catch (\Exception $e) {
                Log::error('SKL re-generation failed: ' . $e->getMessage());
                return response()->json([
                    'success' => false,
                    'message' => 'File SKL tidak ditemukan dan gagal di-generate ulang',
                ], 404);
            }
        }

        $absolutePath = Storage::disk('public')->path($graduation->skl_path);
        $downloadName = "SKL_{$student->name}.html";

        return response()->download($absolutePath, $downloadName, [
            'Content-Type' => 'text/html; charset=UTF-8',
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
            'class_id' => 'required|integer|exists:class_rooms,id',
            'student_ids' => 'required|array|min:1',
            'student_ids.*' => 'integer|exists:users,id',
            'status' => 'required|in:lulus,tidak_lulus',
            'notes' => 'nullable|string|max:500',
        ]);

        $successCount = 0;
        $failCount = 0;

        foreach ($validated['student_ids'] as $studentId) {
            try {
                $student = User::findOrFail($studentId);
                $graduation = StudentGraduation::firstOrCreate(
                    ['student_id' => $studentId, 'class_id' => $validated['class_id']],
                    ['status' => 'pending']
                );

                $graduation->status = $validated['status'];
                $graduation->notes = $validated['notes'] ?? null;
                $graduation->decided_at = now();
                $graduation->decided_by = $request->user()->id;

                if ($validated['status'] === StudentGraduation::STATUS_LULUS) {
                    try {
                        $sklPath = SKLGeneratorService::generateSKL($graduation);
                        $graduation->skl_path = $sklPath;
                    } catch (\Exception $e) {
                        Log::error('SKL Generation Error: ' . $e->getMessage());
                    }
                } else {
                    $graduation->skl_path = null;
                }

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
            'data' => [
                'success_count' => $successCount,
                'fail_count' => $failCount,
            ]
        ]);
    }

    /**
     * Send notification to student about their graduation status
     */
    private function sendGraduationNotification(User $student, StudentGraduation $graduation)
    {
        try {
            if ($graduation->status === StudentGraduation::STATUS_LULUS) {
                $message = "Selamat! Anda dinyatakan LULUS. Silakan download Surat Keterangan Lulus (SKL) Anda.";
            } else {
                $message = "Status kelulusan Anda adalah TIDAK LULUS.";
            }

            // Broadcast ke sistem notifikasi (jika ada)
            // Database notification atau event-based notification
            Log::info("Graduation notification for student {$student->id}: {$message}");
        } catch (\Exception $e) {
            Log::error('Failed to send graduation notification: ' . $e->getMessage());
        }
    }
}
