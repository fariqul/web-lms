<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ClassRoom extends Model
{
    use HasFactory;

    protected $table = 'classes';

    protected $fillable = [
        'name',
        'grade',
        'academic_year',
    ];

    public function students()
    {
        return $this->hasMany(User::class, 'class_id')->where('role', 'siswa');
    }

    public function schedules()
    {
        return $this->hasMany(Schedule::class, 'class_id');
    }

    public function attendanceSessions()
    {
        return $this->hasMany(AttendanceSession::class, 'class_id');
    }

    public function exams()
    {
        return $this->hasMany(Exam::class, 'class_id');
    }

    /**
     * Exams assigned via pivot table (multi-class support)
     */
    public function assignedExams()
    {
        return $this->belongsToMany(Exam::class, 'exam_class', 'class_id', 'exam_id')->withTimestamps();
    }
}
