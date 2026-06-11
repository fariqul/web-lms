<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Add baseline_face_embedding to exam_results table for identity verification.
     * The first snapshot's face embedding is stored as baseline, then compared
     * with subsequent snapshots to detect person substitution during exam.
     */
    public function up(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            // Store face embedding as JSON (array of floats)
            // Typical size: 128-512 dimensions depending on model
            $table->json('baseline_face_embedding')->nullable()->after('violation_count');
            
            // Track when baseline was captured
            $table->timestamp('baseline_captured_at')->nullable()->after('baseline_face_embedding');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropColumn(['baseline_face_embedding', 'baseline_captured_at']);
        });
    }
};
