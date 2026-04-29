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
        // Guard: tabel mungkin sudah ada jika dibuat manual sebelumnya
        if (!Schema::hasTable('student_graduations')) {
            Schema::create('student_graduations', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('student_id');
                $table->unsignedBigInteger('class_id');
                $table->enum('status', ['pending', 'lulus', 'tidak_lulus'])->default('pending');
                $table->text('notes')->nullable();
                $table->string('skl_path')->nullable();
                $table->timestamp('decided_at')->nullable();
                $table->unsignedBigInteger('decided_by')->nullable();
                $table->timestamps();

                // Foreign keys
                $table->foreign('student_id')->references('id')->on('users')->onDelete('cascade');
                $table->foreign('class_id')->references('id')->on('classes')->onDelete('cascade');
                $table->foreign('decided_by')->references('id')->on('users')->onDelete('set null');

                // Indexes
                $table->index('student_id');
                $table->index('class_id');
                $table->index('status');
                $table->unique(['student_id', 'class_id']);
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('student_graduations');
    }
};
