<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private function supportsAlterModify(): bool
    {
        return in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);
    }

    public function up(): void
    {
        // The original violations table has a non-nullable 'timestamp' column,
        // but the model/controller uses 'recorded_at'. Make 'timestamp' nullable
        // so inserts don't fail.
        if ($this->supportsAlterModify() && Schema::hasColumn('violations', 'timestamp')) {
            DB::statement("ALTER TABLE violations MODIFY COLUMN `timestamp` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP");
        }
    }

    public function down(): void
    {
        if ($this->supportsAlterModify() && Schema::hasColumn('violations', 'timestamp')) {
            DB::statement("ALTER TABLE violations MODIFY COLUMN `timestamp` TIMESTAMP NOT NULL");
        }
    }
};
