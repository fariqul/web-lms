<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MonitoringSnapshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_result_id',
        'user_id',
        'student_id',
        'exam_id',
        'image_path',
        'captured_at',
        'analysis_result',
    ];

    protected $casts = [
        'captured_at' => 'datetime',
        'analysis_result' => 'array',
    ];

    public function examResult()
    {
        return $this->belongsTo(ExamResult::class);
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }
}
