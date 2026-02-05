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
        Schema::create('bank_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('class_id')->nullable()->constrained('classes')->onDelete('set null');
            $table->string('subject'); // Mata pelajaran
            $table->enum('type', ['pilihan_ganda', 'essay'])->default('pilihan_ganda');
            $table->text('question'); // Pertanyaan
            $table->json('options')->nullable(); // Pilihan jawaban (untuk pilihan ganda)
            $table->text('correct_answer')->nullable(); // Jawaban benar
            $table->text('explanation')->nullable(); // Pembahasan
            $table->enum('difficulty', ['mudah', 'sedang', 'sulit'])->default('sedang');
            $table->enum('grade_level', ['10', '11', '12'])->default('10'); // Tingkat kelas
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            
            // Indexes
            $table->index(['subject', 'grade_level']);
            $table->index('teacher_id');
            $table->index('is_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('bank_questions');
    }
};
