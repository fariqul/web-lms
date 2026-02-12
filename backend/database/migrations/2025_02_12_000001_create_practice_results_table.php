<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('practice_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->string('subject', 100);
            $table->string('grade_level', 2);
            $table->enum('mode', ['tryout', 'belajar']);
            $table->integer('total_questions');
            $table->integer('correct_answers');
            $table->decimal('score', 5, 2); // 0.00 - 100.00
            $table->integer('time_spent')->default(0); // seconds
            $table->timestamps();

            $table->index(['student_id', 'subject']);
            $table->index('student_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_results');
    }
};
