<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('student_devices', function (Blueprint $table) {
            // Drop the unique index on device_id alone
            $table->dropUnique('student_devices_device_id_unique');
            
            // Add composite unique index on student_id + device_id
            $table->unique(['student_id', 'device_id'], 'student_devices_student_device_unique');
        });
    }

    public function down(): void
    {
        Schema::table('student_devices', function (Blueprint $table) {
            $table->dropUnique('student_devices_student_device_unique');
            $table->unique('device_id', 'student_devices_device_id_unique');
        });
    }
};
