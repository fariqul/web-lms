<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * AI-generated proctoring alert.
 *
 * HITL lifecycle:
 *   review_status = 'pending'   → belum direview admin
 *   review_status = 'confirmed' → admin konfirmasi = pelanggaran resmi (violation_id terisi)
 *   review_status = 'dismissed' → admin abaikan = false positive
 */
class ProctoringAlert extends Model
{
    use HasFactory;

    // Review status constants
    const STATUS_PENDING   = 'pending';
    const STATUS_CONFIRMED = 'confirmed';
    const STATUS_DISMISSED = 'dismissed';

    // Map alert type → Violation type string
    const TYPE_TO_VIOLATION = [
        'no_face'           => 'no_face',
        'multi_face'        => 'multiple_face',
        'head_turn'         => 'head_turn',
        'eye_gaze'          => 'eye_gaze',
        'object_detected'   => 'screen_capture',   // closest existing type
        'object_suspicious' => 'screen_capture',
        'identity_mismatch' => 'identity_mismatch',
    ];

    protected $fillable = [
        'exam_id',
        'student_id',
        'snapshot_id',
        'type',
        'severity',
        'description',
        'confidence',
        'details',
        // Legacy acknowledge fields (kept for backward compat)
        'acknowledged',
        'acknowledged_at',
        // HITL review fields
        'review_status',
        'reviewed_by',
        'reviewed_at',
        'admin_note',
        'violation_id',
    ];

    protected $casts = [
        'confidence'      => 'decimal:3',
        'details'         => 'array',
        'acknowledged'    => 'boolean',
        'acknowledged_at' => 'datetime',
        'reviewed_at'     => 'datetime',
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

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function violation()
    {
        return $this->belongsTo(Violation::class);
    }

    // ── Scopes ────────────────────────────────────────────────────────────

    public function scopePending($query)
    {
        return $query->where('review_status', self::STATUS_PENDING);
    }

    public function scopeConfirmed($query)
    {
        return $query->where('review_status', self::STATUS_CONFIRMED);
    }

    public function scopeDismissed($query)
    {
        return $query->where('review_status', self::STATUS_DISMISSED);
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    public function isPending(): bool
    {
        return $this->review_status === self::STATUS_PENDING;
    }

    public function isConfirmed(): bool
    {
        return $this->review_status === self::STATUS_CONFIRMED;
    }

    public function isDismissed(): bool
    {
        return $this->review_status === self::STATUS_DISMISSED;
    }

    /**
     * Resolve the Violation type string for this alert type.
     * Falls back to the raw type string (not a hardcoded wrong type)
     * so the violation record stays meaningful even for unknown types.
     */
    public function violationType(): string
    {
        if (!isset(self::TYPE_TO_VIOLATION[$this->type])) {
            \Illuminate\Support\Facades\Log::warning(
                "[ProctoringAlert] Unknown alert type '{$this->type}' — using raw type as violation type"
            );
        }

        return self::TYPE_TO_VIOLATION[$this->type] ?? $this->type;
    }
}
