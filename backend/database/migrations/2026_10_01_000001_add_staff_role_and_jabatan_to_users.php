<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Extend ENUM role to include 'staff'
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','guru','siswa','staff') DEFAULT 'siswa'");

        // Add jabatan column (position/title) for staff differentiation
        if (!Schema::hasColumn('users', 'jabatan')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('jabatan', 100)->nullable()->after('nip');
            });
        }
    }

    public function down(): void
    {
        // Revert ENUM (remove 'staff')
        DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','guru','siswa') DEFAULT 'siswa'");

        if (Schema::hasColumn('users', 'jabatan')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('jabatan');
            });
        }
    }
};
