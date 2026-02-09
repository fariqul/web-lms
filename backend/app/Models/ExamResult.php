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
        $this->total_wrong = $this->total_answered - $this->total_correct;
        
        $totalQuestions = $this->exam->questions()->count();
        if ($totalQuestions > 0) {
            $this->score = round(($this->total_correct / $totalQuestions) * 100, 2);
            $this->percentage = $this->score;
        }
        
        // Calculate point-based score
        $this->total_score = $answers->sum('score');
        $maxScore = $this->exam->questions()->sum('points');
        $this->max_score = $maxScore;
        
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
