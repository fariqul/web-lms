<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function supportsAlterModify(): bool
    {
        return in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);
    }

    public function up(): void
    {
        if ($this->supportsAlterModify() && Schema::hasColumn('questions', 'type')) {
            DB::statement("ALTER TABLE questions MODIFY COLUMN type ENUM('multiple_choice', 'essay', 'true_false', 'multiple_answer') DEFAULT 'multiple_choice'");
        }
    }

    public function down(): void
    {
        if ($this->supportsAlterModify() && Schema::hasColumn('questions', 'type')) {
            DB::statement("ALTER TABLE questions MODIFY COLUMN type ENUM('multiple_choice', 'essay', 'true_false') DEFAULT 'multiple_choice'");
        }
    }
};
