<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('summative_scores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('class_id')->constrained('classes')->cascadeOnDelete();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('subject');
            $table->string('academic_year');
            $table->enum('semester', ['ganjil', 'genap'])->default('ganjil');
            $table->json('sumatif_items')->nullable();
            $table->decimal('nilai_sumatif', 6, 2)->default(0);
            $table->decimal('sumatif_akhir', 6, 2)->default(0);
            $table->decimal('bobot_70', 6, 2)->default(0);
            $table->decimal('bobot_30', 6, 2)->default(0);
            $table->decimal('nilai_rapor', 6, 2)->default(0);
            $table->timestamps();

            $table->unique(
                ['class_id', 'student_id', 'subject', 'academic_year', 'semester'],
                'uniq_summative_per_student_subject_term'
            );
            $table->index(['teacher_id', 'class_id', 'subject'], 'idx_summative_teacher_class_subject');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('summative_scores');
    }
};
