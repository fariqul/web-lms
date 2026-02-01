<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AttendanceSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'class_id',
        'teacher_id',
        'subject',
        'qr_token',
        'valid_from',
        'valid_until',
        'status',
    ];

    protected $casts = [
        'class_id' => 'integer',
        'teacher_id' => 'integer',
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
    ];

    public function class()
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
    }

    public function teacher()
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function attendances()
    {
        return $this->hasMany(Attendance::class, 'session_id');
    }

    // Generate unique QR token
    public static function generateQrToken(): string
    {
        return 'QR-' . strtoupper(Str::random(8)) . '-' . time();
    }

    // Check if session is still valid
    public function isValid(): bool
    {
        return $this->status === 'active' && now()->between($this->valid_from, $this->valid_until);
    }

    // Refresh QR token
    public function refreshToken(int $durationMinutes = 5): void
    {
        $this->update([
            'qr_token' => self::generateQrToken(),
            'valid_from' => now(),
            'valid_until' => now()->addMinutes($durationMinutes),
        ]);
    }
}
