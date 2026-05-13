<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_enrollments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('class_id')->constrained('classes')->cascadeOnDelete();
            $table->string('academic_year', 20)->nullable();
            $table->unsignedTinyInteger('semester')->nullable();
            $table->date('start_date');
            $table->date('end_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['class_id', 'academic_year']);
            $table->index(['student_id', 'is_active']);
            $table->index(['class_id', 'start_date', 'end_date']);
        });

        $students = DB::table('users')
            ->join('classes', 'classes.id', '=', 'users.class_id')
            ->where('users.role', 'siswa')
            ->whereNotNull('users.class_id')
            ->select('users.id as student_id', 'users.class_id', 'users.created_at', 'classes.academic_year')
            ->get();

        foreach ($students as $student) {
            $startDate = Carbon::parse($student->created_at)->toDateString();
            $month = (int) Carbon::parse($startDate)->format('n');
            $semester = $month >= 7 ? 1 : 2;

            DB::table('student_enrollments')->insert([
                'student_id' => $student->student_id,
                'class_id' => $student->class_id,
                'academic_year' => $student->academic_year,
                'semester' => $semester,
                'start_date' => $startDate,
                'end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('student_enrollments');
    }
};
