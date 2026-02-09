<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Answer extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'question_id',
        'exam_id',
        'answer',
        'is_correct',
        'score',
        'feedback',
        'graded_by',
        'graded_at',
        'submitted_at',
    ];

    protected $casts = [
        'is_correct' => 'boolean',
        'submitted_at' => 'datetime',
        'graded_at' => 'datetime',
    ];

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function question()
    {
        return $this->belongsTo(Question::class);
    }

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function gradedByUser()
    {
        return $this->belongsTo(User::class, 'graded_by');
    }
}
