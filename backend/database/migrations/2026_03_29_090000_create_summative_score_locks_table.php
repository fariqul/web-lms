<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('summative_score_locks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('class_id')->constrained('classes')->cascadeOnDelete();
            $table->string('subject');
            $table->string('academic_year');
            $table->enum('semester', ['ganjil', 'genap']);
            $table->foreignId('locked_by')->constrained('users')->cascadeOnDelete();
            $table->timestamp('locked_at');
            $table->timestamps();

            $table->unique(
                ['class_id', 'subject', 'academic_year', 'semester'],
                'uniq_summative_lock_per_term'
            );
            $table->index(['class_id', 'subject', 'academic_year', 'semester'], 'idx_summative_lock_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('summative_score_locks');
    }
};
