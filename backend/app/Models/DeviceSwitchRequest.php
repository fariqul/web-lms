<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DeviceSwitchRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'session_id',
        'student_id',
        'device_id',
        'previous_student_id',
        'status',
        'handled_by',
        'handled_at',
        'reason',
    ];

    protected $casts = [
        'handled_at' => 'datetime',
    ];

    public function session()
    {
        return $this->belongsTo(AttendanceSession::class, 'session_id');
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function previousStudent()
    {
        return $this->belongsTo(User::class, 'previous_student_id');
    }

    public function handler()
    {
        return $this->belongsTo(User::class, 'handled_by');
    }
}
