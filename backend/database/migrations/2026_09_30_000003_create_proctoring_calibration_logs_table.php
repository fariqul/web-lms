<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Calibration log table for AI proctoring evaluation.
 *
 * Every snapshot that is analyzed by the Python microservice writes one row here.
 * This gives you a ground-truth-ready dataset to calculate per-indicator
 * Accuracy, Precision, Recall, and F1 once a human labels the ground_truth column.
 *
 * Workflow:
 *   1. System writes raw AI output for every snapshot (automated).
 *   2. Admin/researcher reviews snapshots and sets ground_truth_* = true/false.
 *   3. Run: php artisan proctoring:export-calibration  → CSV with TP/TN/FP/FN columns.
 *   4. Run: php artisan proctoring:calibration-report  → terminal summary.
 *
 * The table is append-only. Rows are never updated by the system after insert,
 * except for the ground_truth_* columns which are human-authored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proctoring_calibration_logs', function (Blueprint $table) {
            $table->id();

            // ── Source context ──────────────────────────────────────────
            $table->foreignId('exam_id')
                ->constrained('exams')
                ->onDelete('cascade');

            $table->foreignId('student_id')
                ->constrained('users')
                ->onDelete('cascade');

            $table->foreignId('snapshot_id')
                ->nullable()
                ->constrained('monitoring_snapshots')
                ->onDelete('set null');

            $table->foreignId('exam_result_id')
                ->nullable()
                ->constrained('exam_results')
                ->onDelete('set null');

            // ── AI raw scores (all 0–100) ────────────────────────────────
            $table->unsignedTinyInteger('no_face_raw')->default(0);
            $table->unsignedTinyInteger('multi_face_raw')->default(0);
            $table->unsignedTinyInteger('head_turn_raw')->default(0);
            $table->unsignedTinyInteger('eye_gaze_raw')->default(0);
            $table->unsignedTinyInteger('object_detection_raw')->default(0);
            $table->unsignedTinyInteger('identity_mismatch_raw')->default(0);
            $table->unsignedSmallInteger('risk_score_raw')->default(0);  // from Python
            $table->unsignedTinyInteger('total_score')->default(0);      // weighted PHP total

            // ── AI binary decisions ──────────────────────────────────────
            $table->boolean('ai_no_face')->default(false);
            $table->boolean('ai_multi_face')->default(false);
            $table->boolean('ai_head_turn')->default(false);
            $table->boolean('ai_eye_gaze')->default(false);
            $table->boolean('ai_object_detected')->default(false);
            $table->boolean('ai_identity_mismatch')->default(false);
            $table->boolean('ai_is_violation')->default(false);  // composite

            // ── Human ground truth (nullable = not yet labeled) ──────────
            $table->boolean('ground_truth_no_face')->nullable();
            $table->boolean('ground_truth_multi_face')->nullable();
            $table->boolean('ground_truth_head_turn')->nullable();
            $table->boolean('ground_truth_eye_gaze')->nullable();
            $table->boolean('ground_truth_object_detected')->nullable();
            $table->boolean('ground_truth_identity_mismatch')->nullable();
            $table->boolean('ground_truth_is_violation')->nullable();

            // ── Optional scenario label ──────────────────────────────────
            // Set manually when running controlled calibration sessions.
            // Examples: 'normal', 'head_turn_test', 'phone_test', 'multi_person'
            $table->string('scenario_label', 64)->nullable()->index();

            // ── Processing metadata ──────────────────────────────────────
            $table->unsignedSmallInteger('processing_time_ms')->nullable();
            $table->json('raw_detections')->nullable();   // Python "detections" array
            $table->json('face_analysis')->nullable();    // Python face_analysis object
            $table->string('risk_level', 20)->nullable(); // low/medium/high/critical

            $table->timestamp('captured_at')->nullable()->index();
            $table->timestamps();

            // Composite indexes for common query patterns
            $table->index(['exam_id', 'captured_at']);
            $table->index(['exam_id', 'student_id', 'captured_at']);
            $table->index(['scenario_label', 'captured_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proctoring_calibration_logs');
    }
};
