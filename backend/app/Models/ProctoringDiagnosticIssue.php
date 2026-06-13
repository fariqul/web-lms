<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProctoringDiagnosticIssue extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'test_id',
        'category',
        'severity',
        'issue',
        'description',
        'action',
        'technical_details',
        'related_config',
        'documentation_link',
    ];

    protected $casts = [
        'related_config' => 'array',
        'created_at' => 'datetime',
    ];

    public function test(): BelongsTo
    {
        return $this->belongsTo(ProctoringDiagnosticTest::class, 'test_id');
    }
}
