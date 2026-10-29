<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffAttendanceSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'work_days',
        'check_in_start',
        'check_in_end',
        'is_default',
    ];

    protected $casts = [
        'work_days'  => 'array',
        'is_default' => 'boolean',
    ];
}
