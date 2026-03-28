<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SummativeScoreLock extends Model
{
    protected $fillable = [
        'class_id',
        'subject',
        'academic_year',
        'semester',
        'locked_by',
        'locked_at',
    ];

    protected $casts = [
        'locked_at' => 'datetime',
    ];

    public function lockedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }
}
