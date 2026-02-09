<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Fix exam_results table — add missing columns and fix status enum
        Schema::table('exam_results', function (Blueprint $table) {
            if (!Schema::hasColumn('exam_results', 'finished_at')) {
                $table->timestamp('finished_at')->nullable()->after('submitted_at');
            }
            if (!Schema::hasColumn('exam_results', 'violation_count')) {
                $table->integer('violation_count')->default(0)->after('percentage');
            }
            if (!Schema::hasColumn('exam_results', 'score')) {
                $table->decimal('score', 5, 2)->nullable()->after('percentage');
            }
            if (!Schema::hasColumn('exam_results', 'total_correct')) {
                $table->integer('total_correct')->default(0)->after('max_score');
            }
            if (!Schema::hasColumn('exam_results', 'total_wrong')) {
                $table->integer('total_wrong')->default(0)->after('total_correct');
            }
            if (!Schema::hasColumn('exam_results', 'total_answered')) {
                $table->integer('total_answered')->default(0)->after('total_wrong');
            }
        });

        // Change status enum to include 'completed'
        // MySQL doesn't allow easy ALTER ENUM, use raw SQL
        DB::statement("ALTER TABLE exam_results MODIFY COLUMN status ENUM('in_progress', 'submitted', 'graded', 'completed') DEFAULT 'in_progress'");

        // Fix violations table — add missing columns
        Schema::table('violations', function (Blueprint $table) {
            if (!Schema::hasColumn('violations', 'exam_result_id')) {
                $table->foreignId('exam_result_id')->nullable()->after('id');
            }
            if (!Schema::hasColumn('violations', 'screenshot')) {
                $table->string('screenshot')->nullable()->after('description');
            }
            if (!Schema::hasColumn('violations', 'recorded_at')) {
                $table->timestamp('recorded_at')->nullable()->after('description');
            }
        });

        // Fix monitoring_snapshots table — add missing columns
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            if (!Schema::hasColumn('monitoring_snapshots', 'exam_result_id')) {
                $table->foreignId('exam_result_id')->nullable()->after('id');
            }
            if (!Schema::hasColumn('monitoring_snapshots', 'student_id')) {
                $table->foreignId('student_id')->nullable()->after('user_id');
            }
            if (!Schema::hasColumn('monitoring_snapshots', 'image_path')) {
                $table->string('image_path')->nullable()->after('photo_path');
            }
            if (!Schema::hasColumn('monitoring_snapshots', 'captured_at')) {
                $table->timestamp('captured_at')->nullable()->after('image_path');
            }
        });

        // Widen violations type enum to accept new violation types
        DB::statement("ALTER TABLE violations MODIFY COLUMN type VARCHAR(50) DEFAULT 'tab_switch'");
    }

    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropColumn(['finished_at', 'violation_count', 'score', 'total_correct', 'total_wrong', 'total_answered']);
        });

        Schema::table('violations', function (Blueprint $table) {
            $table->dropColumn(['exam_result_id', 'screenshot', 'recorded_at']);
        });

        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            $table->dropColumn(['exam_result_id', 'student_id', 'image_path', 'captured_at']);
        });
    }
};
