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
        // Assignments table - tugas yang diberikan guru
        Schema::create('assignments', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('subject'); // mata pelajaran
            $table->foreignId('teacher_id')->constrained('users')->onDelete('cascade');
            $table->foreignId('class_id')->constrained('classes')->onDelete('cascade');
            $table->datetime('deadline');
            $table->integer('max_score')->default(100);
            $table->string('attachment_url')->nullable(); // file lampiran tugas
            $table->enum('status', ['active', 'closed'])->default('active');
            $table->timestamps();
        });

        // Assignment submissions table - pengumpulan tugas siswa
        Schema::create('assignment_submissions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('assignment_id')->constrained('assignments')->onDelete('cascade');
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->text('content')->nullable(); // jawaban text
            $table->string('file_url')->nullable(); // file lampiran jawaban
            $table->integer('score')->nullable(); // nilai dari guru
            $table->text('feedback')->nullable(); // feedback dari guru
            $table->enum('status', ['submitted', 'graded', 'late'])->default('submitted');
            $table->datetime('submitted_at');
            $table->datetime('graded_at')->nullable();
            $table->timestamps();

            // Satu siswa hanya bisa submit sekali per tugas
            $table->unique(['assignment_id', 'student_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('assignment_submissions');
        Schema::dropIfExists('assignments');
    }
};
