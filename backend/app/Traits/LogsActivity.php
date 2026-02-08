<?php

namespace App\Traits;

use App\Models\AuditLog;

trait LogsActivity
{
    /**
     * Log an audit action.
     */
    protected function logAction(
        string $action,
        string $description,
        ?string $targetType = null,
        ?int $targetId = null,
        ?array $oldValues = null,
        ?array $newValues = null,
    ): AuditLog {
        return AuditLog::log($action, $description, $targetType, $targetId, $oldValues, $newValues);
    }
}
