<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ExamResult extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_id',
        'student_id',
        'total_score',
        'max_score',
        'percentage',
        'score',
        'status',
        'violation_count',
        'total_correct',
        'total_wrong',
        'total_answered',
        'started_at',
        'submitted_at',
        'finished_at',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'submitted_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function violations()
    {
        return $this->hasMany(Violation::class);
    }

    public function calculateScore()
    {
        $answers = Answer::where('exam_id', $this->exam_id)
            ->where('student_id', $this->student_id)
            ->get();

        $this->total_answered = $answers->count();
        $this->total_correct = $answers->where('is_correct', true)->count();
        $this->total_wrong = $answers->where('is_correct', false)->whereNotNull('is_correct')->count();
        
        // Calculate point-based score (includes manually graded essays)
        $this->total_score = $answers->sum(function ($answer) {
            return $answer->score ?? 0;
        });
        $maxScore = $this->exam->questions()->sum('points');
        $this->max_score = $maxScore;
        
        // Calculate percentage based on points
        if ($maxScore > 0) {
            $this->percentage = round(($this->total_score / $maxScore) * 100, 2);
            $this->score = $this->percentage;
        } else {
            $this->percentage = 0;
            $this->score = 0;
        }
        
        $this->save();
    }

    public function getDurationAttribute()
    {
        if ($this->started_at && $this->finished_at) {
            return $this->started_at->diffInMinutes($this->finished_at);
        }
        return null;
    }
}
