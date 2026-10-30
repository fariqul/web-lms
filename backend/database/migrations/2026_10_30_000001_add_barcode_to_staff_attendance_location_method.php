<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE staff_attendances MODIFY COLUMN location_method ENUM('gps','manual','barcode') DEFAULT 'manual'");
    }

    public function down(): void
    {
        // Convert any 'barcode' rows to 'manual' before shrinking the enum
        DB::table('staff_attendances')->where('location_method', 'barcode')->update(['location_method' => 'manual']);
        DB::statement("ALTER TABLE staff_attendances MODIFY COLUMN location_method ENUM('gps','manual') DEFAULT 'manual'");
    }
};
