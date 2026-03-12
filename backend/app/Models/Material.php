<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Material extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'subject',
        'type',
        'file_url',
        'teacher_id',
        'class_id',
    ];

    /**
     * Get the teacher that owns the material
     */
    public function teacher()
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    /**
     * Get the class that the material belongs to
     */
    public function classRoom()
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
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
