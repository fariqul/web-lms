<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('exam_class_schedules', function (Blueprint $table) {
            $table->boolean('is_published')->default(false)->after('end_time');
            $table->index(['exam_id', 'class_id', 'is_published']);
        });

        // Keep current behavior for existing overrides: mark old rows as published.
        DB::table('exam_class_schedules')->update(['is_published' => true]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('exam_class_schedules', function (Blueprint $table) {
            $table->dropIndex('exam_class_schedules_exam_id_class_id_is_published_index');
            $table->dropColumn('is_published');
        });
    }
};
