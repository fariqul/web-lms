<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffAttendance extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'date',
        'checked_in_at',
        'latitude',
        'longitude',
        'ip_address',
        'location_method',
        'is_location_valid',
        'distance_meters',
        'device_id',
        'notes',
    ];

    protected $casts = [
        'date'               => 'date',
        'checked_in_at'      => 'datetime',
        'is_location_valid'  => 'boolean',
        'latitude'           => 'float',
        'longitude'          => 'float',
        'distance_meters'    => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
