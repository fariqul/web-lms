<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\URL;

class MonitoringSnapshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_result_id',
        'user_id',
        'student_id',
        'exam_id',
        'image_path',
        'photo_path',
        'captured_at',
        'expires_at',
        'file_deleted_at',
        'analysis_result',
        'is_violation',
    ];

    protected $casts = [
        'captured_at' => 'datetime',
        'expires_at' => 'datetime',
        'file_deleted_at' => 'datetime',
        'analysis_result' => 'array',
        'is_violation' => 'boolean',
    ];

    protected $appends = ['image_url'];

    /**
     * Snapshot files live on the private disk; clients receive a short-lived
     * signed URL instead of a public /storage path.
     */
    public function getImageUrlAttribute(): ?string
    {
        if (! $this->exists || ! $this->image_path) {
            return null;
        }

        return URL::temporarySignedRoute(
            'monitoring-snapshots.image',
            now()->addMinutes((int) config('proctoring.snapshot_url_ttl_minutes', 60)),
            ['snapshot' => $this->getKey()]
        );
    }

    public function examResult()
    {
        return $this->belongsTo(ExamResult::class);
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }
}
