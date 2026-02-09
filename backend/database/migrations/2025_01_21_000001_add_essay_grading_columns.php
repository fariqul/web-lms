<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('answers', function (Blueprint $table) {
            if (!Schema::hasColumn('answers', 'feedback')) {
                $table->text('feedback')->nullable()->after('score');
            }
            if (!Schema::hasColumn('answers', 'graded_by')) {
                $table->unsignedBigInteger('graded_by')->nullable()->after('feedback');
            }
            if (!Schema::hasColumn('answers', 'graded_at')) {
                $table->timestamp('graded_at')->nullable()->after('graded_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('answers', function (Blueprint $table) {
            $table->dropColumn(['feedback', 'graded_by', 'graded_at']);
        });
    }
};
