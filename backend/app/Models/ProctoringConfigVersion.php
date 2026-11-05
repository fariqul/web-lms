<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProctoringConfigVersion extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'config_scope', 'version_number', 'snapshot', 'changed_by', 'notes',
    ];

    protected $casts = [
        'snapshot'       => 'array',
        'version_number' => 'integer',
    ];

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }

    public static function getLatestVersionNumber(string $scope = 'active'): int
    {
        return (int) self::where('config_scope', $scope)->max('version_number');
    }
}
