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
        'checked_out_at',
        'latitude',
        'longitude',
        'check_out_latitude',
        'check_out_longitude',
        'ip_address',
        'check_out_ip',
        'location_method',
        'is_location_valid',
        'distance_meters',
        'check_out_distance_meters',
        'device_id',
        'notes',
    ];

    protected $casts = [
        'date'                     => 'date',
        'checked_in_at'            => 'datetime',
        'checked_out_at'           => 'datetime',
        'is_location_valid'        => 'boolean',
        'latitude'                 => 'float',
        'longitude'                => 'float',
        'check_out_latitude'       => 'float',
        'check_out_longitude'      => 'float',
        'distance_meters'          => 'integer',
        'check_out_distance_meters' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
