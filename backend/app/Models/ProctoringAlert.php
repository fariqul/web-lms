<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProctoringAlert extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_id',
        'student_id',
        'snapshot_id',
        'type',
        'severity',
        'description',
        'confidence',
        'details',
        'acknowledged',
        'acknowledged_at',
    ];

    protected $casts = [
        'confidence' => 'decimal:3',
        'details' => 'array',
        'acknowledged' => 'boolean',
        'acknowledged_at' => 'datetime',
    ];

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
}
