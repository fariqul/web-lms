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

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $graduation->id,
                'status' => $graduation->status,
                'status_label' => StudentGraduation::getStatusLabel($graduation->status),
                'class' => $graduation->class->name ?? null,
                'decided_at' => $graduation->decided_at,
                'decided_by' => $graduation->decidedBy?->name,
                'notes' => $graduation->notes,
                'can_download_skl' => $graduation->status === StudentGraduation::STATUS_LULUS && $graduation->skl_path,
                'skl_path' => $graduation->status === StudentGraduation::STATUS_LULUS ? $graduation->skl_path : null,
            ]
        ]);
    }

    /**
     * Get all graduations for a class (admin view)
     */
    public function getByClass(Request $request, $classId)
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $class = ClassRoom::findOrFail($classId);
        
        $graduations = StudentGraduation::where('class_id', $classId)
            ->with(['student', 'decidedBy'])
            ->orderBy('status', 'asc')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $graduations->map(function ($g) {
                return [
                    'id' => $g->id,
                    'student' => [
                        'id' => $g->student->id,
                        'name' => $g->student->name,
                        'nisn' => $g->student->nisn,
                        'email' => $g->student->email,
                    ],
                    'status' => $g->status,
                    'status_label' => StudentGraduation::getStatusLabel($g->status),
                    'notes' => $g->notes,
                    'skl_path' => $g->skl_path,
                    'decided_at' => $g->decided_at,
                    'decided_by' => $g->decidedBy?->name,
                ];
            })
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
                'message' => 'SKL tidak tersedia'
            ], 404);
        }

        try {
            return response()->download(
                storage_path("app/public/{$graduation->skl_path}"),
                "SKL_{$student->name}.html"
            );
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to download SKL: ' . $e->getMessage()
            ], 500);
        }
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
