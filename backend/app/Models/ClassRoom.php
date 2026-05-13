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
        'is_active',
        'skl_pickup_message',
        'wali_kelas_id',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function students()
    {
        return $this->belongsToMany(User::class, 'student_enrollments', 'class_id', 'student_id')
            ->where('users.role', 'siswa')
            ->wherePivot('is_active', true);
    }

    public function studentEnrollments()
    {
        return $this->hasMany(StudentEnrollment::class, 'class_id');
    }

    public function waliKelas()
    {
        return $this->belongsTo(User::class, 'wali_kelas_id');
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
