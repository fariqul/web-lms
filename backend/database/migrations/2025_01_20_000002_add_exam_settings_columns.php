<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            if (!Schema::hasColumn('exams', 'max_violations')) {
                $table->integer('max_violations')->nullable()->default(5)->after('status');
            }
            if (!Schema::hasColumn('exams', 'shuffle_questions')) {
                $table->boolean('shuffle_questions')->default(false)->after('status');
            }
            if (!Schema::hasColumn('exams', 'shuffle_options')) {
                $table->boolean('shuffle_options')->default(false)->after('status');
            }
            if (!Schema::hasColumn('exams', 'show_result')) {
                $table->boolean('show_result')->default(true)->after('status');
            }
            if (!Schema::hasColumn('exams', 'passing_score')) {
                $table->integer('passing_score')->default(60)->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn(['max_violations', 'shuffle_questions', 'shuffle_options', 'show_result', 'passing_score']);
        });
    }
};
