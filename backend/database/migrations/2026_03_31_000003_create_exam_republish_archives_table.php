<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('exam_republish_archives', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained('exams')->onDelete('cascade');
            $table->unsignedInteger('session_no');
            $table->foreignId('republished_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->boolean('keep_class_schedules')->default(false);
            $table->timestamp('old_start_time')->nullable();
            $table->timestamp('old_end_time')->nullable();
            $table->timestamp('new_start_time')->nullable();
            $table->timestamp('new_end_time')->nullable();
            $table->json('reset_summary')->nullable();
            $table->json('results_snapshot')->nullable();
            $table->timestamp('archived_at');
            $table->timestamps();

            $table->unique(['exam_id', 'session_no']);
            $table->index(['exam_id', 'archived_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('exam_republish_archives');
    }
};
