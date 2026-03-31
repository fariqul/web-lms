<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ExamRepublishArchive extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_id',
        'session_no',
        'republished_by',
        'reason',
        'keep_class_schedules',
        'old_start_time',
        'old_end_time',
        'new_start_time',
        'new_end_time',
        'reset_summary',
        'results_snapshot',
        'archived_at',
    ];

    protected $casts = [
        'keep_class_schedules' => 'boolean',
        'old_start_time' => 'datetime',
        'old_end_time' => 'datetime',
        'new_start_time' => 'datetime',
        'new_end_time' => 'datetime',
        'reset_summary' => 'array',
        'results_snapshot' => 'array',
        'archived_at' => 'datetime',
    ];

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function republisher()
    {
        return $this->belongsTo(User::class, 'republished_by');
    }
}
