<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExperimentSession extends Model
{
    protected $fillable = [
        'name', 'researcher_name', 'lighting', 'device_info', 'distance_cm',
        'notes', 'dataset_split', 'config_scope', 'config_version_id', 'status',
        'started_at', 'completed_at', 'fastapi_device', 'fastapi_model',
        'baseline_embedding', 'baseline_set_at', 'created_by',
    ];

    protected $casts = [
        'lighting'           => 'string',
        'dataset_split'      => 'string',
        'config_scope'       => 'string',
        'status'             => 'string',
        'started_at'         => 'datetime',
        'completed_at'       => 'datetime',
        'baseline_embedding' => 'array',
        'baseline_set_at'    => 'datetime',
    ];

    public function trials(): HasMany
    {
        return $this->hasMany(ExperimentTrial::class, 'session_id');
    }

    public function configVersion(): BelongsTo
    {
        return $this->belongsTo(ProctoringConfigVersion::class, 'config_version_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isRunning(): bool
    {
        return $this->status === 'running';
    }

    public function canCapture(): bool
    {
        return $this->status === 'running';
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['running', 'paused']);
    }
}
