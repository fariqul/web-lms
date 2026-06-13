<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proctoring_diagnostic_tests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->constrained('users')->onDelete('cascade');
            
            // Overall test results
            $table->integer('overall_health_score'); // 0-100
            $table->enum('overall_status', ['healthy', 'warning', 'critical']);
            
            // Component scores (JSON)
            // Example: {
            //   "object_detection": {"status": "success", "score": 95, "confidence": 0.92},
            //   "face_detection": {"status": "success", "score": 100, "confidence": 0.98},
            //   "head_pose": {"status": "success", "score": 88, "details": {"yaw": 5.2}},
            //   "eye_gaze": {"status": "success", "score": 75, "details": {"left": 0.25}},
            //   "face_embedding": {"status": "success", "score": 100, "dimensions": 128}
            // }
            $table->json('component_scores');
            
            // Detection details (JSON)
            $table->json('detected_objects')->nullable();
            $table->json('detected_faces')->nullable();
            
            // Performance metrics
            $table->integer('processing_time_ms');
            $table->integer('image_size_kb')->nullable();
            
            // Test metadata
            $table->enum('test_type', ['manual', 'scenario'])->default('manual');
            $table->string('scenario_name', 50)->nullable();
            
            $table->timestamp('created_at')->useCurrent();
            
            // Indexes
            $table->index(['admin_id', 'created_at'], 'idx_admin_created');
            $table->index('overall_status', 'idx_status');
            $table->index('created_at', 'idx_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proctoring_diagnostic_tests');
    }
};
