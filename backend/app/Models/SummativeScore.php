<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SummativeScore extends Model
{
    protected $fillable = [
        'class_id',
        'student_id',
        'teacher_id',
        'subject',
        'academic_year',
        'semester',
        'sumatif_items',
        'nilai_sumatif',
        'sumatif_akhir',
        'bobot_70',
        'bobot_30',
        'nilai_rapor',
    ];

    protected $casts = [
        'sumatif_items' => 'array',
        'nilai_sumatif' => 'float',
        'sumatif_akhir' => 'float',
        'bobot_70' => 'float',
        'bobot_30' => 'float',
        'nilai_rapor' => 'float',
    ];

    public function student(): BelongsTo
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    public function classRoom(): BelongsTo
    {
        return $this->belongsTo(ClassRoom::class, 'class_id');
    }
}
