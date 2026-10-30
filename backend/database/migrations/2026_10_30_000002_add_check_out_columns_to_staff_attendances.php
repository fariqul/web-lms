<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('staff_attendances', function (Blueprint $table) {
            $table->timestamp('checked_out_at')->nullable()->after('checked_in_at');
            $table->decimal('check_out_latitude', 10, 7)->nullable()->after('longitude');
            $table->decimal('check_out_longitude', 10, 7)->nullable()->after('check_out_latitude');
            $table->string('check_out_ip')->nullable()->after('ip_address');
            $table->integer('check_out_distance_meters')->nullable()->after('distance_meters');
        });
    }

    public function down(): void
    {
        Schema::table('staff_attendances', function (Blueprint $table) {
            $table->dropColumn([
                'checked_out_at',
                'check_out_latitude',
                'check_out_longitude',
                'check_out_ip',
                'check_out_distance_meters',
            ]);
        });
    }
};
