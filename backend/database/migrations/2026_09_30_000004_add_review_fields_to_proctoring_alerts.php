<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add HITL (Human-in-the-Loop) review fields to proctoring_alerts.
 *
 * Flow:
 *   AI detects anomaly → alert.review_status = 'pending'
 *   Admin reviews snapshot → clicks Konfirmasi or Abaikan
 *     Konfirmasi → review_status = 'confirmed' → Violation::create() called
 *     Abaikan    → review_status = 'dismissed' → no violation created
 *
 * The existing `acknowledged` / `acknowledged_at` columns are kept for
 * backward compatibility but are now superseded by review_status.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('proctoring_alerts', function (Blueprint $table) {
            // Three-state review status. Default 'pending' = not yet reviewed.
            $table->enum('review_status', ['pending', 'confirmed', 'dismissed'])
                ->default('pending')
                ->after('acknowledged_at');

            // Admin who performed the review
            $table->foreignId('reviewed_by')
                ->nullable()
                ->constrained('users')
                ->onDelete('set null')
                ->after('review_status');

            // When the review happened
            $table->timestamp('reviewed_at')
                ->nullable()
                ->after('reviewed_by');

            // Optional note from the reviewer
            $table->string('admin_note', 500)
                ->nullable()
                ->after('reviewed_at');

            // FK to the Violation created when status = confirmed (null if dismissed)
            $table->foreignId('violation_id')
                ->nullable()
                ->constrained('violations')
                ->onDelete('set null')
                ->after('admin_note');

            // Index for the most common dashboard query: pending alerts per exam
            $table->index(['exam_id', 'review_status'], 'idx_alerts_exam_review_status');
        });
    }

    public function down(): void
    {
        // Step 1: Drop foreign key constraints first (separate call to avoid MySQL issues)
        Schema::table('proctoring_alerts', function (Blueprint $table) {
            $table->dropForeign(['reviewed_by']);
            $table->dropForeign(['violation_id']);
            $table->dropIndex('idx_alerts_exam_review_status');
        });

        // Step 2: Drop columns after constraints are gone
        Schema::table('proctoring_alerts', function (Blueprint $table) {
            $table->dropColumn(['review_status', 'reviewed_by', 'reviewed_at', 'admin_note', 'violation_id']);
        });
    }
};
