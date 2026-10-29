<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_attendance_schedules', function (Blueprint $table) {
            $table->id();
            $table->string('name');                          // e.g. "Jadwal Reguler"
            $table->json('work_days');                       // e.g. [1,2,3,4,5] (1=Senin..7=Minggu)
            $table->time('check_in_start')->default('06:00'); // Jam mulai absen diterima
            $table->time('check_in_end')->default('09:00');   // Batas akhir absen masuk
            $table->boolean('is_default')->default(false);   // Jadwal aktif/default
            $table->timestamps();
        });

        // Seed satu jadwal default
        DB::table('staff_attendance_schedules')->insert([
            'name'           => 'Jadwal Reguler',
            'work_days'      => json_encode([1, 2, 3, 4, 5]),
            'check_in_start' => '06:00:00',
            'check_in_end'   => '09:00:00',
            'is_default'     => true,
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_attendance_schedules');
    }
};
