<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('proctoring_configurations', function (Blueprint $table) {
            $table->json('score_weights')->nullable()->change();
            $table->json('score_increments')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('proctoring_configurations', function (Blueprint $table) {
            $table->json('score_weights')->nullable(false)->change();
            $table->json('score_increments')->nullable(false)->change();
        });
    }
};
