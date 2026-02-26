<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Creates exam_class pivot table for multi-class exam support.
     * Migrates existing class_id data from exams table to pivot table.
     */
    public function up(): void
    {
        Schema::create('exam_class', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained('exams')->onDelete('cascade');
            $table->foreignId('class_id')->constrained('classes')->onDelete('cascade');
            $table->timestamps();

            $table->unique(['exam_id', 'class_id']);
        });

        // Migrate existing data: copy class_id from exams to pivot table
        $exams = DB::table('exams')->whereNotNull('class_id')->get(['id', 'class_id']);
        foreach ($exams as $exam) {
            DB::table('exam_class')->insert([
                'exam_id' => $exam->id,
                'class_id' => $exam->class_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('exam_class');
    }
};
