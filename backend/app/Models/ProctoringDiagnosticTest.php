<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProctoringDiagnosticTest extends Model
{
    use HasFactory;

    protected $fillable = [
        'admin_id',
        'overall_health_score',
        'overall_status',
        'component_scores',
        'detected_objects',
        'detected_faces',
        'processing_time_ms',
        'image_size_kb',
        'test_type',
        'scenario_name',
    ];

    protected $casts = [
        'component_scores' => 'array',
        'detected_objects' => 'array',
        'detected_faces' => 'array',
        'created_at' => 'datetime',
    ];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    public function issues(): HasMany
    {
        return $this->hasMany(ProctoringDiagnosticIssue::class, 'test_id');
    }

    /**
     * Accessor for formatted timestamp with timezone
     */
    public function getFormattedTimestampAttribute(): string
    {
        return $this->created_at->timezone('Asia/Jakarta')->format('Y-m-d H:i:s T');
    }

    /**
     * Scope for retrieving recent tests
     */
    public function scopeRecent($query, int $limit = 10)
    {
        return $query->orderBy('created_at', 'desc')->limit($limit);
    }
}
