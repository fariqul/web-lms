<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentGraduation extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'class_id',
        'status',
        'notes',
        'skl_path',
        'decided_at',
        'decided_by',
    ];

    protected function casts(): array
    {
        return [
            'decided_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Status constants
     */
    public const STATUS_PENDING = 'pending';
    public const STATUS_LULUS = 'lulus';
    public const STATUS_TIDAK_LULUS = 'tidak_lulus';

    public static function getStatusLabel(string $status): string
    {
        return match($status) {
            self::STATUS_PENDING => 'Menunggu Keputusan',
            self::STATUS_LULUS => 'Lulus',
            self::STATUS_TIDAK_LULUS => 'Tidak Lulus',
            default => 'Unknown',
        };
    }

    /**
     * Relationships
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function class(): BelongsTo
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
    }

    public function decidedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /**
     * Scopes
     */
    public function scopeLulus($query)
    {
        return $query->where('status', self::STATUS_LULUS);
    }

    public function scopeTidakLulus($query)
    {
        return $query->where('status', self::STATUS_TIDAK_LULUS);
    }

    public function scopePending($query)
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopeByClass($query, $classId)
    {
        return $query->where('class_id', $classId);
    }

    public function scopeByStudent($query, $studentId)
    {
        return $query->where('student_id', $studentId);
    }
}
