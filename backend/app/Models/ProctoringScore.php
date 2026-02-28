<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ProctoringScore extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_result_id',
        'student_id',
        'exam_id',
        'no_face_score',
        'multi_face_score',
        'head_turn_score',
        'eye_gaze_score',
        'identity_mismatch_score',
        'object_detection_score',
        'tab_switch_score',
        'total_score',
        'risk_level',
        'no_face_count',
        'multi_face_count',
        'head_turn_count',
        'eye_gaze_count',
        'identity_mismatch_count',
        'object_detected_count',
        'total_snapshots',
        'total_analyzed',
    ];

    protected $casts = [
        'no_face_score' => 'integer',
        'multi_face_score' => 'integer',
        'head_turn_score' => 'integer',
        'eye_gaze_score' => 'integer',
        'identity_mismatch_score' => 'integer',
        'object_detection_score' => 'integer',
        'tab_switch_score' => 'integer',
        'total_score' => 'integer',
        'no_face_count' => 'integer',
        'multi_face_count' => 'integer',
        'head_turn_count' => 'integer',
        'eye_gaze_count' => 'integer',
        'identity_mismatch_count' => 'integer',
        'object_detected_count' => 'integer',
        'total_snapshots' => 'integer',
        'total_analyzed' => 'integer',
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
