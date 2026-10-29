<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('staff_attendances', function (Blueprint $table) {
            $table->id();

            // Who checked in
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');

            // Date of attendance (one record per user per day)
            $table->date('date');

            // When they tapped the button
            $table->timestamp('checked_in_at')->nullable();

            // GPS coordinates (sent from browser)
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();

            // Network info
            $table->string('ip_address')->nullable();

            // How location was validated: gps | network | manual
            $table->enum('location_method', ['gps', 'network', 'manual'])->default('manual');

            // Whether the location check passed
            $table->boolean('is_location_valid')->default(false);

            // Distance from school in meters (only set when method = gps)
            $table->integer('distance_meters')->nullable();

            // Device fingerprint
            $table->string('device_id')->nullable();

            // Optional note (e.g. "Absen dari luar karena dinas")
            $table->text('notes')->nullable();

            $table->timestamps();

            // One check-in per person per day
            $table->unique(['user_id', 'date']);

            // Index for admin queries by date
            $table->index('date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_attendances');
    }
};
