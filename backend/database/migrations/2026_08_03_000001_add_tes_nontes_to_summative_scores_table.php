<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('summative_scores', function (Blueprint $table) {
            $table->decimal('nilai_tes', 6, 2)->nullable()->after('nilai_sumatif');
            $table->decimal('nilai_non_tes', 6, 2)->nullable()->after('nilai_tes');
        });
    }

    public function down(): void
    {
        Schema::table('summative_scores', function (Blueprint $table) {
            $table->dropColumn(['nilai_tes', 'nilai_non_tes']);
        });
    }
};
