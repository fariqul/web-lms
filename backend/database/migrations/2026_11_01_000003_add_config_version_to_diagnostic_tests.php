<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            Schema::hasTable('proctoring_diagnostic_tests') &&
            !Schema::hasColumn('proctoring_diagnostic_tests', 'config_version_id')
        ) {
            Schema::table('proctoring_diagnostic_tests', function (Blueprint $table) {
                $table->foreignId('config_version_id')
                    ->nullable()
                    ->constrained('proctoring_config_versions')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (
            Schema::hasTable('proctoring_diagnostic_tests') &&
            Schema::hasColumn('proctoring_diagnostic_tests', 'config_version_id')
        ) {
            Schema::table('proctoring_diagnostic_tests', function (Blueprint $table) {
                $table->dropForeign(['config_version_id']);
                $table->dropColumn('config_version_id');
            });
        }
    }
};
