<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AssignmentSubmission extends Model
{
    protected $fillable = [
        'assignment_id',
        'student_id',
        'content',
        'file_url',
        'score',
        'feedback',
        'status',
        'submitted_at',
        'graded_at',
    ];

    protected $casts = [
        'score' => 'integer',
        'submitted_at' => 'datetime',
        'graded_at' => 'datetime',
    ];

    /**
     * Get the assignment
     */
    public function assignment(): BelongsTo
    {
        return $this->belongsTo(Assignment::class);
    }

    /**
     * Get the student
     */
    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    /**
     * Check if submitted late
     */
    public function isLate(): bool
    {
        return $this->submitted_at->gt($this->assignment->deadline);
    }

    /**
     * Get file URL - dynamically converts old URLs to current APP_URL
     */
    public function getFileUrlAttribute($value)
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
}
