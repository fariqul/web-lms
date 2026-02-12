<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // The original violations table has a non-nullable 'timestamp' column,
        // but the model/controller uses 'recorded_at'. Make 'timestamp' nullable
        // so inserts don't fail.
        if (Schema::hasColumn('violations', 'timestamp')) {
            DB::statement("ALTER TABLE violations MODIFY COLUMN `timestamp` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('violations', 'timestamp')) {
            DB::statement("ALTER TABLE violations MODIFY COLUMN `timestamp` TIMESTAMP NOT NULL");
        }
    }
};
