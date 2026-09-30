<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add auto_submit_on_max_violations to exams table.
 *
 * Default false: saat max_violations tercapai, sesi di-freeze.
 * Admin/guru dapat mengaktifkan auto-submit per ujian.
 * Kolom ini diakses oleh ProctoringMonitorController::evaluateAndApplyPolicy().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->boolean('auto_submit_on_max_violations')
                ->default(false)
                ->after('max_violations');
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn('auto_submit_on_max_violations');
        });
    }
};
