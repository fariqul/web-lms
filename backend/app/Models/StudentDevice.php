<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StudentDevice extends Model
{
    use HasFactory;

    protected $fillable = [
        'student_id',
        'device_id',
        'device_name',
        'user_agent',
        'last_ip',
        'is_approved',
        'approved_by',
        'approved_at',
        'last_used_at',
    ];

    protected $casts = [
        'is_approved' => 'boolean',
        'approved_at' => 'datetime',
        'last_used_at' => 'datetime',
    ];

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
