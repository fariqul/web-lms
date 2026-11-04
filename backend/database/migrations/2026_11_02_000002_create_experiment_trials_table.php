<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('experiment_trials', function (Blueprint $table) {
            $table->id();

            // FK to experiment_sessions (CASCADE)
            $table->unsignedBigInteger('session_id');
            $table->foreign('session_id')
                  ->references('id')->on('experiment_sessions')
                  ->onDelete('cascade');

            // ── Ground truth labels ──────────────────────────────────────
            $table->string('scenario', 100)->nullable();
            $table->boolean('gt_no_face')->default(false);
            $table->boolean('gt_multi_face')->default(false);
            $table->boolean('gt_phone')->default(false);
            $table->boolean('gt_book')->default(false);
            $table->boolean('gt_head_turn')->default(false);
            $table->boolean('gt_eye_gaze_away')->default(false);
            $table->boolean('gt_identity_mismatch')->default(false);

            // ── Snapshot metadata ────────────────────────────────────────
            $table->string('snapshot_path', 512)->nullable();
            $table->integer('image_width')->nullable();
            $table->integer('image_height')->nullable();
            $table->integer('image_size_kb')->nullable();

            // ── FastAPI raw output ───────────────────────────────────────
            $table->integer('person_count')->nullable();
            $table->integer('face_count')->nullable();
            $table->boolean('face_detected')->nullable();
            $table->float('face_confidence')->nullable();
            $table->json('face_bbox')->nullable();
            $table->float('head_yaw')->nullable();
            $table->float('head_pitch')->nullable();
            $table->float('head_roll')->nullable();
            $table->float('eye_gaze_ratio')->nullable();
            $table->float('face_distance')->nullable();
            $table->json('all_detections')->nullable();
            $table->integer('risk_score_raw')->nullable();
            $table->json('fastapi_detections')->nullable();

            // ── Laravel computed scores ──────────────────────────────────
            $table->integer('score_no_face')->nullable();
            $table->integer('score_multi_face')->nullable();
            $table->integer('score_head_turn')->nullable();
            $table->integer('score_eye_gaze')->nullable();
            $table->integer('score_object_detection')->nullable();
            $table->integer('score_identity_mismatch')->nullable();
            $table->integer('total_score')->nullable();
            $table->string('risk_level', 20)->nullable();

            // ── AI predictions ───────────────────────────────────────────
            $table->boolean('pred_no_face')->nullable();
            $table->boolean('pred_multi_face')->nullable();
            $table->boolean('pred_head_turn')->nullable();
            $table->boolean('pred_eye_gaze_away')->nullable();
            $table->boolean('pred_phone')->nullable();
            $table->boolean('pred_book')->nullable();
            $table->boolean('pred_identity_mismatch')->nullable();

            // ── Config reference ─────────────────────────────────────────
            $table->unsignedBigInteger('config_version_id')->nullable();
            $table->foreign('config_version_id')
                  ->references('id')->on('proctoring_config_versions')
                  ->onDelete('set null');
            $table->enum('config_scope_used', ['draft', 'active'])->nullable();

            // ── Latency ──────────────────────────────────────────────────
            $table->integer('inference_ms')->nullable();
            $table->integer('server_total_ms')->nullable();
            $table->integer('end_to_end_ms')->nullable();

            // ── Quality control ──────────────────────────────────────────
            $table->boolean('is_invalid')->default(false);
            $table->string('invalidation_reason', 255)->nullable();

            // ── Sequence ─────────────────────────────────────────────────
            $table->integer('trial_number')->default(1);
            $table->timestamp('captured_at')->useCurrent();

            $table->timestamps();

            // Indexes
            $table->index(['session_id', 'trial_number']);
            $table->index(['session_id', 'is_invalid']);
            $table->index('captured_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('experiment_trials');
    }
};
