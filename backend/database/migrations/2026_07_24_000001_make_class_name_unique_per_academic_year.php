<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Previously, class name was globally unique (only 1 "X.10" allowed in entire system).
     * Now, name is unique per academic_year, so "X.10" can exist in 2025/2026 AND 2026/2027.
     * This allows the same class name to be reused each academic year for new incoming students.
     */
    public function up(): void
    {
        Schema::table('classes', function (Blueprint $table) {


            // Add composite unique: same name allowed in different academic years
            $table->unique(['name', 'academic_year'], 'classes_name_academic_year_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('classes', function (Blueprint $table) {
            $table->dropUnique('classes_name_academic_year_unique');
        });
    }
};
