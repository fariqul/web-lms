<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add retention columns to monitoring_snapshots for the 48-hour file cleanup policy.
 *
 * - expires_at     : when the snapshot file may be deleted (captured_at + 48h for non-violations;
 *                    NULL = keep indefinitely, used for violation snapshots that need admin review).
 * - file_deleted_at: set by the cleanup command when the physical file is actually removed.
 *                    The DB row (metadata) is kept permanently as audit trail.
 *
 * Cleanup logic (enforced by proctoring:cleanup command):
 *   - Non-violation snapshots: expires_at = captured_at + SNAPSHOT_RETENTION_HOURS (default 48)
 *   - Violation snapshots:     expires_at = NULL (never auto-deleted until admin action)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            // When the file should be eligible for deletion. NULL = keep indefinitely.
            $table->timestamp('expires_at')->nullable()->after('captured_at');

            // Timestamp set when the physical file is deleted by the cleanup command.
            // NULL = file still exists (or was never stored).
            $table->timestamp('file_deleted_at')->nullable()->after('expires_at');

            // Index to speed up the cleanup query (WHERE expires_at <= NOW() AND file_deleted_at IS NULL)
            $table->index(['expires_at', 'file_deleted_at'], 'idx_snapshots_retention');
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            $table->dropIndex('idx_snapshots_retention');
            $table->dropColumn(['expires_at', 'file_deleted_at']);
        });
    }
};
