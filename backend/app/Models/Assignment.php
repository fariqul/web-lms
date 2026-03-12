<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Assignment extends Model
{
    protected $fillable = [
        'title',
        'description',
        'subject',
        'teacher_id',
        'class_id',
        'deadline',
        'max_score',
        'attachment_url',
        'status',
    ];

    protected $casts = [
        'deadline' => 'datetime',
        'max_score' => 'integer',
    ];

    /**
     * Get the teacher that created the assignment
     */
    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    /**
     * Get the class for this assignment
     */
    public function classRoom(): BelongsTo
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
    }

    /**
     * Get all submissions for this assignment
     */
    public function submissions(): HasMany
    {
        return $this->hasMany(AssignmentSubmission::class);
    }

    /**
     * Check if deadline has passed
     */
    public function isOverdue(): bool
    {
        return now()->gt($this->deadline);
    }

    /**
     * Get submission count
     */
    public function getSubmissionCountAttribute(): int
    {
        return $this->submissions()->count();
    }

    /**
     * Get attachment URL - dynamically converts old URLs to current APP_URL
     */
    public function getAttachmentUrlAttribute($value)
    {
        return $this->convertStorageUrl($value);
    }

    /**
     * Convert storage URL to use current APP_URL
     */
    protected function convertStorageUrl($value)
    {
        if (!$value) {
            return null;
        }

        if (str_contains($value, 'http://') || str_contains($value, 'https://')) {
            $parsed = parse_url($value);
            if (isset($parsed['path']) && str_contains($parsed['path'], '/storage/')) {
                return url($parsed['path']);
            }
        }

        if (!str_starts_with($value, 'http')) {
            return url('/storage/' . $value);
        }

        return $value;
    }

    /**
     * Get graded count
     */
    public function getGradedCountAttribute(): int
    {
        return $this->submissions()->where('status', 'graded')->count();
    }
}
