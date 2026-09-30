<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\ProctoringAlert;
use App\Models\ProctoringScore;
use App\Models\MonitoringSnapshot;
use App\Models\Violation;
use App\Services\SocketBroadcastService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Proctoring Monitor Controller
 *
 * HITL endpoints — AI detects, human decides:
 *
 *  GET  /exams/{exam}/proctoring-scores             — skor AI per peserta
 *  GET  /exams/{exam}/proctoring-alerts             — daftar alert + status review
 *  GET  /exams/{exam}/proctoring-alerts/pending-count — jumlah alert belum direview
 *  GET  /exam-results/{result}/proctoring           — detail proctoring satu siswa
 *  POST /proctoring-alerts/{alert}/review           — admin konfirmasi / abaikan
 *  POST /proctoring-alerts/{alert}/acknowledge      — (legacy) mark as seen only
 */
class ProctoringMonitorController extends Controller
{
    // ─────────────────────────────────────────────────────────────────────────
    // READ endpoints
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/exams/{exam}/proctoring-scores
     * Lightweight poll endpoint — returns AI scores keyed by student_id.
     */
    public function scores(Request $request, Exam $exam): JsonResponse
    {
        $user = $request->user();

        if (!$this->canAccessExamProctoring($user, $exam)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $scores = ProctoringScore::where('exam_id', $exam->id)
            ->select([
                'id', 'exam_result_id', 'student_id',
                'total_score', 'risk_level',
                'no_face_score', 'multi_face_score', 'head_turn_score',
                'eye_gaze_score', 'identity_mismatch_score', 'object_detection_score',
                'tab_switch_score',
                'no_face_count', 'multi_face_count', 'head_turn_count',
                'eye_gaze_count', 'identity_mismatch_count', 'object_detected_count',
                'total_snapshots', 'total_analyzed',
                'updated_at',
            ])
            ->get()
            ->keyBy('student_id');

        return response()->json(['success' => true, 'data' => $scores]);
    }

    /**
     * GET /api/exams/{exam}/proctoring-alerts
     *
     * Query params:
     *   student_id, type, severity
     *   review_status = pending|confirmed|dismissed
     *   per_page      (default 50, max 200)
     */
    public function alerts(Request $request, Exam $exam): JsonResponse
    {
        $user = $request->user();

        if (!$this->canAccessExamProctoring($user, $exam)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $query = ProctoringAlert::with([
            'student:id,name,nisn,class_id',
            'snapshot:id,image_path,captured_at,is_violation',
            'reviewer:id,name',
        ])
            ->where('exam_id', $exam->id)
            ->orderBy('created_at', 'desc');

        if ($request->filled('student_id')) {
            $query->where('student_id', (int) $request->student_id);
        }
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }
        if ($request->filled('severity')) {
            $query->where('severity', $request->severity);
        }
        if ($request->filled('review_status')) {
            $query->where('review_status', $request->review_status);
        }
        // Legacy param kept for backward compat
        if ($request->get('unreviewed') === '1') {
            $query->where('review_status', ProctoringAlert::STATUS_PENDING);
        }

        $perPage = min((int) ($request->get('per_page', 50)), 200);
        $alerts  = $query->paginate($perPage);

        return response()->json(['success' => true, 'data' => $alerts]);
    }

    /**
     * GET /api/exams/{exam}/proctoring-alerts/pending-count
     * Badge counter — jumlah alert pending untuk header notifikasi dashboard.
     */
    public function pendingCount(Request $request, Exam $exam): JsonResponse
    {
        $user = $request->user();

        if (!$this->canAccessExamProctoring($user, $exam)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $count = ProctoringAlert::where('exam_id', $exam->id)
            ->where('review_status', ProctoringAlert::STATUS_PENDING)
            ->count();

        return response()->json(['success' => true, 'data' => ['pending_count' => $count]]);
    }

    /**
     * GET /api/exam-results/{result}/proctoring
     * Detail proctoring satu siswa: score + alerts + snapshots.
     */
    public function studentDetail(Request $request, ExamResult $result): JsonResponse
    {
        $user = $request->user();
        $exam = Exam::find($result->exam_id);

        if (!$exam || !$this->canAccessExamProctoring($user, $exam)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $score = ProctoringScore::where('exam_result_id', $result->id)->first();

        $alerts = ProctoringAlert::with([
            'snapshot:id,image_path,captured_at,is_violation',
            'reviewer:id,name',
            'violation:id,type,recorded_at',
        ])
            ->where('exam_id', $result->exam_id)
            ->where('student_id', $result->student_id)
            ->orderBy('created_at', 'desc')
            ->limit(20)
            ->get();

        $snapshots = MonitoringSnapshot::where('exam_result_id', $result->id)
            ->select(['id', 'image_path', 'captured_at', 'is_violation', 'expires_at', 'file_deleted_at', 'analysis_result'])
            ->orderByRaw('is_violation DESC, captured_at DESC')
            ->limit(10)
            ->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'score'     => $score,
                'alerts'    => $alerts,
                'snapshots' => $snapshots,
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HITL REVIEW endpoint
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/proctoring-alerts/{alert}/review
     *
     * The core HITL action. Admin/guru reviews an AI alert and decides:
     *   decision = "confirmed" → create a formal Violation, bump violation_count,
     *                            evaluate policy (freeze / auto_submit)
     *   decision = "dismissed" → mark as false positive, no violation created
     *
     * Body:
     *   decision   : required, "confirmed" or "dismissed"
     *   admin_note : optional string (max 500 chars)
     */
    public function reviewAlert(Request $request, ProctoringAlert $alert): JsonResponse
    {
        $user = $request->user();
        $exam = Exam::find($alert->exam_id);

        if (!$exam || !$this->canAccessExamProctoring($user, $exam)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        // Idempotency: already reviewed
        if (!$alert->isPending()) {
            return response()->json([
                'success' => false,
                'message' => "Alert sudah direview sebelumnya (status: {$alert->review_status})",
            ], 422);
        }

        $request->validate([
            'decision'   => 'required|in:confirmed,dismissed',
            'admin_note' => 'nullable|string|max:500',
        ]);

        $decision  = $request->input('decision');
        $adminNote = $request->input('admin_note');

        if ($decision === ProctoringAlert::STATUS_CONFIRMED) {
            return $this->confirmAlert($alert, $user, $exam, $adminNote);
        }

        return $this->dismissAlert($alert, $user, $adminNote);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LEGACY acknowledge (kept for backward compat with old frontend code)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/proctoring-alerts/{alert}/acknowledge
     * Marks alert as seen without making a formal decision.
     * Use /review instead for actual HITL decisions.
     */
    public function acknowledgeAlert(Request $request, ProctoringAlert $alert): JsonResponse
    {
        $user = $request->user();
        $exam = Exam::find($alert->exam_id);

        if (!$exam || !$this->canAccessExamProctoring($user, $exam)) {
            return response()->json(['success' => false, 'message' => 'Akses ditolak'], 403);
        }

        $alert->update([
            'acknowledged'    => true,
            'acknowledged_at' => now(),
        ]);

        return response()->json(['success' => true, 'message' => 'Alert berhasil di-acknowledge']);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private helpers
    // ─────────────────────────────────────────────────────────────────────────

    private function confirmAlert(
        ProctoringAlert $alert,
        \App\Models\User $user,
        Exam $exam,
        ?string $adminNote,
    ): JsonResponse {
        // Find the active ExamResult for this student
        $examResult = ExamResult::where('exam_id', $alert->exam_id)
            ->where('student_id', $alert->student_id)
            ->latest('id')
            ->first();

        if (!$examResult) {
            return response()->json([
                'success' => false,
                'message' => 'Sesi ujian siswa tidak ditemukan',
            ], 422);
        }

        try {
            DB::transaction(function () use ($alert, $user, $exam, $examResult, $adminNote) {
                // 1. Create the formal Violation
                $violationType = $alert->violationType();

                $violation = Violation::create([
                    'exam_result_id' => $examResult->id,
                    'student_id'     => $alert->student_id,
                    'exam_id'        => $alert->exam_id,
                    'type'           => $violationType,
                    'description'    => "[AI] " . ($alert->description ?? $violationType)
                                        . ($adminNote ? " | Catatan admin: {$adminNote}" : ''),
                    'screenshot'     => $alert->snapshot?->image_path,
                    'recorded_at'    => now(),
                    'timestamp'      => now(),
                ]);

                // 2. Update violation_count on ExamResult
                $examResult->violation_count = $examResult->violations()->count();
                $examResult->save();

                // 3. Mark alert as confirmed + link violation
                $alert->update([
                    'review_status'   => ProctoringAlert::STATUS_CONFIRMED,
                    'reviewed_by'     => $user->id,
                    'reviewed_at'     => now(),
                    'admin_note'      => $adminNote,
                    'violation_id'    => $violation->id,
                    'acknowledged'    => true,
                    'acknowledged_at' => now(),
                ]);

                // 4. Also mark snapshot as confirmed violation
                if ($alert->snapshot_id) {
                    MonitoringSnapshot::where('id', $alert->snapshot_id)
                        ->update(['is_violation' => true, 'expires_at' => null]);
                }

                // 5. Evaluate violation policy (freeze / auto_submit)
                $this->evaluateAndApplyPolicy($exam, $examResult, $user);

                Log::info("[Proctoring HITL] Alert #{$alert->id} confirmed by user #{$user->id} → Violation #{$violation->id}");
            });

            // Reload alert to return fresh data
            $alert->refresh()->load(['reviewer:id,name', 'violation:id,type,recorded_at']);

            // Broadcast updated violation count to monitor dashboard
            $examResult->refresh();
            app(SocketBroadcastService::class)->examViolation($exam->id, [
                'student_id'      => $alert->student_id,
                'student_name'    => $alert->student?->name ?? 'Siswa',
                'type'            => $alert->violationType(),
                'description'     => "[AI confirmed] " . ($alert->description ?? ''),
                'violation_count' => $examResult->violation_count,
                'max_violations'  => $exam->max_violations,
                'policy_action'   => 'none',
                'source'          => 'ai_confirmed',
            ]);

            return response()->json([
                'success'          => true,
                'message'          => 'Pelanggaran dikonfirmasi dan dicatat secara resmi.',
                'data'             => [
                    'alert'           => $alert,
                    'violation_count' => $examResult->violation_count,
                    'policy_action'   => $this->getPolicyAction($exam, $examResult),
                ],
            ]);
        } catch (\Throwable $e) {
            Log::error("[Proctoring HITL] Confirm failed for alert #{$alert->id}: {$e->getMessage()}");
            return response()->json(['success' => false, 'message' => 'Terjadi kesalahan server'], 500);
        }
    }

    private function dismissAlert(
        ProctoringAlert $alert,
        \App\Models\User $user,
        ?string $adminNote,
    ): JsonResponse {
        $alert->update([
            'review_status'   => ProctoringAlert::STATUS_DISMISSED,
            'reviewed_by'     => $user->id,
            'reviewed_at'     => now(),
            'admin_note'      => $adminNote,
            'acknowledged'    => true,
            'acknowledged_at' => now(),
        ]);

        Log::info("[Proctoring HITL] Alert #{$alert->id} dismissed by user #{$user->id}");

        $alert->refresh()->load('reviewer:id,name');

        return response()->json([
            'success' => true,
            'message' => 'Alert diabaikan (false positive).',
            'data'    => ['alert' => $alert],
        ]);
    }

    /**
     * Evaluate violation policy after a new violation is created.
     * Mirrors the logic in ExamController::getViolationPolicyData().
     */
    private function evaluateAndApplyPolicy(Exam $exam, ExamResult $examResult, \App\Models\User $admin): void
    {
        $maxViolations = (int) ($exam->max_violations ?? 3);
        $count         = (int) $examResult->violation_count;

        if ($count < $maxViolations) {
            return;
        }

        // Check if auto_submit is enabled for this exam (default: false)
        $autoSubmitEnabled = (bool) ($exam->auto_submit_on_max_violations ?? false);

        if ($autoSubmitEnabled && $examResult->status === 'in_progress') {
            $examResult->finished_at  = now();
            $examResult->submitted_at = now();
            $examResult->status       = 'completed';
            $examResult->calculateScore();

            Log::info("[Proctoring HITL] Auto-submitted exam_result #{$examResult->id} (max violations reached via HITL)");
        }
        // Otherwise: freeze handled client-side via violation policy broadcast
    }

    /**
     * Return the policy action label for the response body.
     */
    private function getPolicyAction(Exam $exam, ExamResult $examResult): string
    {
        $max   = (int) ($exam->max_violations ?? 3);
        $count = (int) $examResult->violation_count;

        if ($count >= $max) {
            return (bool) ($exam->auto_submit_on_max_violations ?? false) ? 'auto_submit' : 'freeze';
        }
        if ($count >= $max - 1) {
            return 'warning';
        }
        return 'none';
    }

    private function canAccessExamProctoring(\App\Models\User $user, Exam $exam): bool
    {
        if ($user->role === 'admin') return true;

        if ($user->role === 'guru') {
            if ((int) $exam->teacher_id === (int) $user->id) return true;
            if ($exam->teacher_id === null && $exam->type === 'quiz') return true;
        }

        return false;
    }
}
