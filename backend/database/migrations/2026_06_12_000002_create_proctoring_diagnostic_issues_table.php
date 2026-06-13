<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proctoring_diagnostic_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_id')->constrained('proctoring_diagnostic_tests')->onDelete('cascade');
            
            $table->enum('category', ['camera', 'network', 'configuration', 'performance']);
            $table->enum('severity', ['critical', 'warning', 'info']);
            
            $table->string('issue', 255);
            $table->text('description');
            $table->text('action');
            
            $table->text('technical_details')->nullable();
            $table->json('related_config')->nullable(); // Array of config keys
            $table->string('documentation_link', 255)->nullable();
            
            $table->timestamp('created_at')->useCurrent();
            
            // Indexes
            $table->index(['test_id', 'severity'], 'idx_test_severity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proctoring_diagnostic_issues');
    }
};
