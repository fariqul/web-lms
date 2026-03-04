<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Update existing exams with default 5 to 3
        DB::table('exams')->where('max_violations', 5)->update(['max_violations' => 3]);

        // Change default for new exams
        Schema::table('exams', function (Blueprint $table) {
            $table->integer('max_violations')->nullable()->default(3)->change();
        });
    }

    public function down(): void
    {
        DB::table('exams')->where('max_violations', 3)->update(['max_violations' => 5]);

        Schema::table('exams', function (Blueprint $table) {
            $table->integer('max_violations')->nullable()->default(5)->change();
        });
    }
};
