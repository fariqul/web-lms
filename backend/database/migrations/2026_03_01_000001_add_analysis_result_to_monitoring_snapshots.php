<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            if (!Schema::hasColumn('monitoring_snapshots', 'analysis_result')) {
                $table->json('analysis_result')->nullable()->after('captured_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            $table->dropColumn('analysis_result');
        });
    }
};
