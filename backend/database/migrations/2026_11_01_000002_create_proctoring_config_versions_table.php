<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('proctoring_config_versions', function (Blueprint $table) {
            $table->id();
            $table->enum('config_scope', ['active'])->default('active');
            $table->integer('version_number');
            $table->json('snapshot');
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['config_scope', 'version_number'], 'idx_scope_version');
            $table->index('created_at', 'idx_created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('proctoring_config_versions');
    }
};
