<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Calibration log record for one analyzed snapshot.
 *
 * AI columns (ai_*) are written once by AnalyzeSnapshotJob.
 * Ground truth columns (ground_truth_*) are filled by a human reviewer
 * via the Admin UI or direct DB update, then used for metric calculation.
 */
class ProctoringCalibrationLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_id',
        'student_id',
        'snapshot_id',
        'exam_result_id',

        // Raw scores
        'no_face_raw',
        'multi_face_raw',
        'head_turn_raw',
        'eye_gaze_raw',
        'object_detection_raw',
        'identity_mismatch_raw',
        'risk_score_raw',
        'total_score',

        // AI binary decisions
        'ai_no_face',
        'ai_multi_face',
        'ai_head_turn',
        'ai_eye_gaze',
        'ai_object_detected',
        'ai_identity_mismatch',
        'ai_is_violation',

        // Human ground truth
        'ground_truth_no_face',
        'ground_truth_multi_face',
        'ground_truth_head_turn',
        'ground_truth_eye_gaze',
        'ground_truth_object_detected',
        'ground_truth_identity_mismatch',
        'ground_truth_is_violation',

        // Metadata
        'scenario_label',
        'processing_time_ms',
        'raw_detections',
        'face_analysis',
        'risk_level',
        'captured_at',
    ];

    protected $casts = [
        'ai_no_face'           => 'boolean',
        'ai_multi_face'        => 'boolean',
        'ai_head_turn'         => 'boolean',
        'ai_eye_gaze'          => 'boolean',
        'ai_object_detected'   => 'boolean',
        'ai_identity_mismatch' => 'boolean',
        'ai_is_violation'      => 'boolean',

        'ground_truth_no_face'           => 'boolean',
        'ground_truth_multi_face'        => 'boolean',
        'ground_truth_head_turn'         => 'boolean',
        'ground_truth_eye_gaze'          => 'boolean',
        'ground_truth_object_detected'   => 'boolean',
        'ground_truth_identity_mismatch' => 'boolean',
        'ground_truth_is_violation'      => 'boolean',

        'raw_detections' => 'array',
        'face_analysis'  => 'array',
        'captured_at'    => 'datetime',
    ];

    // ── Relationships ─────────────────────────────────────────────────────

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function snapshot()
    {
        return $this->belongsTo(MonitoringSnapshot::class, 'snapshot_id');
    }

    public function examResult()
    {
        return $this->belongsTo(ExamResult::class);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    /**
     * The five indicator names this system tracks.
     *
     * @return array<string>
     */
    public static function indicators(): array
    {
        return [
            'no_face',
            'multi_face',
            'head_turn',
            'eye_gaze',
            'object_detected',
            'identity_mismatch',
            'is_violation',  // composite
        ];
    }

    /**
     * Compute TP/TN/FP/FN for a single indicator on this row.
     * Returns null if ground truth is not yet labeled.
     *
     * @return array{tp:int,tn:int,fp:int,fn:int}|null
     */
    public function confusionCell(string $indicator): ?array
    {
        $ai    = $this->{"ai_{$indicator}"};
        $truth = $this->{"ground_truth_{$indicator}"};

        if ($truth === null) return null;

        return [
            'tp' => ($ai && $truth)  ? 1 : 0,
            'tn' => (!$ai && !$truth) ? 1 : 0,
            'fp' => ($ai && !$truth) ? 1 : 0,
            'fn' => (!$ai && $truth) ? 1 : 0,
        ];
    }
}
