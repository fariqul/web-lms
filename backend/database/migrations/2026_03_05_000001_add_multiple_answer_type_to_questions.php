<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE questions MODIFY COLUMN type ENUM('multiple_choice', 'essay', 'true_false', 'multiple_answer') DEFAULT 'multiple_choice'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE questions MODIFY COLUMN type ENUM('multiple_choice', 'essay', 'true_false') DEFAULT 'multiple_choice'");
    }
};
