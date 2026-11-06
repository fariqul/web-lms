<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('experiment_sessions', function (Blueprint $table) {
            $table->timestamp('baseline_set_at')->nullable()->after('baseline_embedding');
        });
    }

    public function down(): void
    {
        Schema::table('experiment_sessions', function (Blueprint $table) {
            $table->dropColumn('baseline_set_at');
        });
    }
};
