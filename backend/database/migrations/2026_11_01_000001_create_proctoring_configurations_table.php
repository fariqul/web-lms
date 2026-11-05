<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proctoring_configurations', function (Blueprint $table) {
            $table->id();
            $table->enum('scope', ['draft', 'active'])->unique();
            $table->float('head_yaw_threshold')->default(38);
            $table->float('head_pitch_threshold')->default(33);
            $table->float('eye_gaze_threshold')->default(0.48);
            $table->float('face_similarity_threshold')->default(0.6);
            $table->float('confidence_threshold')->default(0.45);
            $table->json('per_class_confidence')->nullable();
            $table->integer('alert_dedup_window_sec')->default(15);
            $table->json('score_weights')->nullable();
            $table->json('score_increments')->nullable();
            $table->integer('risk_violation_min')->default(20);
            $table->integer('risk_alert_any_min')->default(15);
            $table->integer('risk_alert_high_min')->default(30);
            $table->integer('risk_alert_crit_min')->default(60);
            $table->integer('risk_level_medium_min')->default(26);
            $table->integer('risk_level_high_min')->default(51);
            $table->integer('risk_level_critical_min')->default(76);
            $table->integer('snapshot_interval_sec')->default(30);
            $table->integer('anomaly_trigger_sec')->default(3);
            $table->integer('anomaly_cooldown_sec')->default(20);
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proctoring_configurations');
    }
};
