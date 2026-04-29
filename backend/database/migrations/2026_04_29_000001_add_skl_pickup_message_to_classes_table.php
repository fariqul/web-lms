<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('classes', function (Blueprint $table) {
            // Pesan dari admin untuk siswa yang lulus di kelas ini
            // Contoh: "Pengambilan SKL pada tanggal 10 Juni 2026, jam 08.00 WIB, berpakaian rapi"
            $table->text('skl_pickup_message')->nullable()->after('academic_year');
        });
    }

    public function down(): void
    {
        Schema::table('classes', function (Blueprint $table) {
            $table->dropColumn('skl_pickup_message');
        });
    }
};
