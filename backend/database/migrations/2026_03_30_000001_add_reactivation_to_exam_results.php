<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            // Track number of reactivations for this result
            $table->unsignedInteger('reactivation_count')->default(0)->after('violation_count');
            
            // Track last reactivation by admin
            $table->foreignId('reactivated_by')->nullable()->constrained('users')->onDelete('set null')->after('reactivation_count');
            $table->timestamp('reactivated_at')->nullable()->after('reactivated_by');
            
            // Add reason field for reactivation
            $table->text('reactivation_reason')->nullable()->after('reactivated_at');
        });
    }

    public function down(): void
    {
        Schema::table('exam_results', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reactivated_by');
            $table->dropColumn(['reactivation_count', 'reactivated_at', 'reactivation_reason']);
        });
    }
};
