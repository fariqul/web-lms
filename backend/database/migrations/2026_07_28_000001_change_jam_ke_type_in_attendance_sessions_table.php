<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        try {
            DB::statement("ALTER TABLE attendance_sessions MODIFY jam_ke VARCHAR(50) NULL");
        } catch (\Throwable $e) {
            Schema::table('attendance_sessions', function (Blueprint $table) {
                $table->string('jam_ke', 50)->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        try {
            DB::statement("ALTER TABLE attendance_sessions MODIFY jam_ke TINYINT UNSIGNED NULL");
        } catch (\Throwable $e) {
            Schema::table('attendance_sessions', function (Blueprint $table) {
                $table->unsignedTinyInteger('jam_ke')->nullable()->change();
            });
        }
    }
};
