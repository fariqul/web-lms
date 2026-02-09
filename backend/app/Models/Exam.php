<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Exam extends Model
{
    use HasFactory;

    protected $fillable = [
        'class_id',
        'teacher_id',
        'title',
        'description',
        'subject',
        'start_time',
        'end_time',
        'duration',
        'total_questions',
        'status',
        'max_violations',
        'shuffle_questions',
        'shuffle_options',
        'show_result',
        'passing_score',
    ];

    protected $casts = [
        'start_time' => 'datetime',
        'end_time' => 'datetime',
        'shuffle_questions' => 'boolean',
        'shuffle_options' => 'boolean',
        'show_result' => 'boolean',
    ];

    public function class()
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
    }

    public function teacher()
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function questions()
    {
        return $this->hasMany(Question::class)->orderBy('order');
    }

    public function results()
    {
        return $this->hasMany(ExamResult::class);
    }

    public function violations()
    {
        return $this->hasMany(Violation::class);
    }

    public function answers()
    {
        return $this->hasMany(Answer::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && now()->between($this->start_time, $this->end_time);
    }
}
