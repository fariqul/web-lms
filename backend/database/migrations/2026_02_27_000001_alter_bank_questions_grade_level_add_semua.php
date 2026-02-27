<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        DB::statement("ALTER TABLE bank_questions MODIFY COLUMN grade_level ENUM('10', '11', '12', 'semua') DEFAULT '10'");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement("ALTER TABLE bank_questions MODIFY COLUMN grade_level ENUM('10', '11', '12') DEFAULT '10'");
    }
};
