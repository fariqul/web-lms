<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proctoring_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_result_id')->constrained('exam_results')->onDelete('cascade');
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('exam_id')->constrained('exams')->onDelete('cascade');
            
            // Individual detection scores (0-100, higher = more suspicious)
            $table->integer('no_face_score')->default(0);
            $table->integer('multi_face_score')->default(0);
            $table->integer('head_turn_score')->default(0);
            $table->integer('eye_gaze_score')->default(0);
            $table->integer('identity_mismatch_score')->default(0);
            $table->integer('object_detection_score')->default(0);
            $table->integer('tab_switch_score')->default(0);
            
            // Aggregated total score (0-100)
            $table->integer('total_score')->default(0);
            
            // Risk level: low, medium, high, critical
            $table->string('risk_level', 20)->default('low');
            
            // Detection counts
            $table->integer('no_face_count')->default(0);
            $table->integer('multi_face_count')->default(0);
            $table->integer('head_turn_count')->default(0);
            $table->integer('eye_gaze_count')->default(0);
            $table->integer('identity_mismatch_count')->default(0);
            $table->integer('object_detected_count')->default(0);
            
            // Total snapshots analyzed
            $table->integer('total_snapshots')->default(0);
            $table->integer('total_analyzed')->default(0);
            
            $table->timestamps();
            
            // Unique constraint: one score record per exam result
            $table->unique('exam_result_id');
        });

        Schema::create('proctoring_alerts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained('exams')->onDelete('cascade');
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('snapshot_id')->nullable()->constrained('monitoring_snapshots')->onDelete('set null');
            
            // Alert type: no_face, multi_face, head_turn, eye_gaze, identity_mismatch, object_detected
            $table->string('type', 50);
            // Severity: warning, alert, critical
            $table->string('severity', 20)->default('warning');
            // Human-readable description
            $table->string('description')->nullable();
            // Detection confidence (0.0-1.0)
            $table->decimal('confidence', 4, 3)->default(0);
            // Raw analysis data
            $table->json('details')->nullable();
            
            $table->boolean('acknowledged')->default(false);
            $table->timestamp('acknowledged_at')->nullable();
            
            $table->timestamps();
            
            $table->index(['exam_id', 'student_id']);
            $table->index(['exam_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proctoring_alerts');
        Schema::dropIfExists('proctoring_scores');
    }
};
