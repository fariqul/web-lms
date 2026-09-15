<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Make start_time and end_time nullable on the exams table.
 *
 * Quizzes (type = 'quiz') do not have a fixed schedule, so these columns
 * must accept NULL. The original migration defined them as NOT NULL
 * which causes a SQLSTATE[HY000]: 1364 error when creating quizzes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->timestamp('start_time')->nullable()->change();
            $table->timestamp('end_time')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->timestamp('start_time')->nullable(false)->change();
            $table->timestamp('end_time')->nullable(false)->change();
        });
    }
};
