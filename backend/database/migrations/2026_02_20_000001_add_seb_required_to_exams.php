<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            if (!Schema::hasColumn('exams', 'seb_required')) {
                $table->boolean('seb_required')->default(false)->after('passing_score');
            }
            if (!Schema::hasColumn('exams', 'seb_config')) {
                $table->json('seb_config')->nullable()->after('seb_required');
            }
        });
    }

    public function down(): void
    {
        Schema::table('exams', function (Blueprint $table) {
            $table->dropColumn(['seb_required', 'seb_config']);
        });
    }
};
