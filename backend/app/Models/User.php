<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'jenis_kelamin',
        'nisn',
        'nis',
        'nip',
        'nomor_tes',
        'class_id',
        'photo',
    ];

    /**
     * Fields that should never be mass-assigned.
     */
    protected $guarded_fields = ['role', 'password'];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'class_id' => 'integer',
        ];
    }

    // Relationships
    public function classRoom()
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class, 'student_id');
    }

    public function examResults()
    {
        return $this->hasMany(ExamResult::class, 'student_id');
    }

    public function notifications()
    {
        return $this->hasMany(Notification::class);
    }

    public function auditLogs()
    {
        return $this->hasMany(AuditLog::class);
    }

    /**
     * Get photo URL - dynamically converts old URLs to current APP_URL
     */
    public function getPhotoAttribute($value)
    {
        if (!$value) {
            return null;
        }

        // If it's a full URL with trycloudflare or other domain, extract path and rebuild
        if (str_contains($value, 'http://') || str_contains($value, 'https://')) {
            $parsed = parse_url($value);
            if (isset($parsed['path']) && str_contains($parsed['path'], '/storage/')) {
                // Extract path starting from /storage/
                return url($parsed['path']);
            }
        }

        // If it's just a relative path like 'photos/filename.jpg'
        if (!str_starts_with($value, 'http')) {
            return url('/storage/' . $value);
        }

        return $value;
    }

    // Role helpers
    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function isGuru(): bool
    {
        return $this->role === 'guru';
    }

    public function isSiswa(): bool
    {
        return $this->role === 'siswa';
    }
}
