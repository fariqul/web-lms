<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PracticeResult extends Model
{
    use HasFactory;

    protected $table = 'practice_results';

    protected $fillable = [
        'student_id',
        'subject',
        'grade_level',
        'mode',
        'total_questions',
        'correct_answers',
        'score',
        'time_spent',
    ];

    protected $casts = [
        'score' => 'float',
        'total_questions' => 'integer',
        'correct_answers' => 'integer',
        'time_spent' => 'integer',
    ];

    // Relationships
    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }
}
