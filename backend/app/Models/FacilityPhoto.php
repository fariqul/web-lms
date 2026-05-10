<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FacilityPhoto extends Model
{
    use HasFactory;

    protected $fillable = [
        'facility_id',
        'path',
        'position',
    ];

    protected $casts = [
        'position' => 'integer',
    ];

    public function facility()
    {
        return $this->belongsTo(Facility::class);
    }
}
