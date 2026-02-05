<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add columns to attendances for device tracking
        Schema::table('attendances', function (Blueprint $table) {
            $table->string('device_id')->nullable()->after('ip_address');
            $table->string('user_agent')->nullable()->after('device_id');
            $table->boolean('is_suspicious')->default(false)->after('user_agent');
            $table->text('suspicious_reason')->nullable()->after('is_suspicious');
        });

        // Add IP whitelist settings to attendance_sessions
        Schema::table('attendance_sessions', function (Blueprint $table) {
            $table->boolean('require_school_network')->default(false)->after('status');
            $table->json('allowed_ip_ranges')->nullable()->after('require_school_network');
        });

        // Create device registry table for tracking
        Schema::create('student_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->string('device_id')->unique();
            $table->string('device_name')->nullable();
            $table->string('user_agent')->nullable();
            $table->string('last_ip')->nullable();
            $table->boolean('is_approved')->default(false);
            $table->foreignId('approved_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
            
            $table->index(['student_id', 'device_id']);
        });

        // Create table for device switch requests (when student tries to use different account on same device)
        Schema::create('device_switch_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('attendance_sessions')->onDelete('cascade');
            $table->foreignId('student_id')->constrained('users')->onDelete('cascade');
            $table->string('device_id');
            $table->foreignId('previous_student_id')->nullable()->constrained('users')->onDelete('set null');
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->foreignId('handled_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('handled_at')->nullable();
            $table->text('reason')->nullable();
            $table->timestamps();
            
            $table->index(['session_id', 'device_id']);
            $table->index(['session_id', 'status']);
        });

        // Add school network settings table
        Schema::create('school_network_settings', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('ip_range'); // e.g., "192.168.1.0/24" or "10.0.0.1-10.0.0.255"
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_switch_requests');
        Schema::dropIfExists('student_devices');
        Schema::dropIfExists('school_network_settings');
        
        Schema::table('attendance_sessions', function (Blueprint $table) {
            $table->dropColumn(['require_school_network', 'allowed_ip_ranges']);
        });
        
        Schema::table('attendances', function (Blueprint $table) {
            $table->dropColumn(['device_id', 'user_agent', 'is_suspicious', 'suspicious_reason']);
        });
    }
};
