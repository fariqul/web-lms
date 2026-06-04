<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->string('late_entry_status')->default('none')->after('reactivation_reason');
            $table->timestamp('late_entry_requested_at')->nullable()->after('late_entry_status');
            $table->timestamp('late_entry_approved_at')->nullable()->after('late_entry_requested_at');
            $table->foreignId('late_entry_approved_by')->nullable()->constrained('users')->onDelete('set null')->after('late_entry_approved_at');
        });
    }

    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropConstrainedForeignId('late_entry_approved_by');
            $table->dropColumn(['late_entry_status', 'late_entry_requested_at', 'late_entry_approved_at']);
        });
    }
};
