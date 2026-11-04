<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('experiment_sessions', function (Blueprint $table) {
            $table->id();

            $table->string('name', 255);
            $table->string('researcher_name', 255);

            $table->enum('lighting', ['bright', 'normal', 'dim', 'backlit', 'other'])->default('normal');
            $table->string('device_info', 255)->nullable();
            $table->integer('distance_cm')->nullable();
            $table->text('notes')->nullable();

            $table->enum('dataset_split', ['calibration', 'test'])->default('calibration');
            $table->enum('config_scope', ['draft', 'active'])->default('draft');

            // FK to proctoring_config_versions (nullable, SET NULL on delete)
            $table->unsignedBigInteger('config_version_id')->nullable();
            $table->foreign('config_version_id')
                  ->references('id')->on('proctoring_config_versions')
                  ->onDelete('set null');

            $table->enum('status', ['created', 'running', 'paused', 'completed', 'cancelled'])->default('created');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->string('fastapi_device', 50)->nullable();
            $table->string('fastapi_model', 100)->nullable();
            $table->json('baseline_embedding')->nullable();

            // FK to users (nullable, SET NULL on delete)
            $table->unsignedBigInteger('created_by')->nullable();
            $table->foreign('created_by')
                  ->references('id')->on('users')
                  ->onDelete('set null');

            $table->timestamps();

            $table->index('dataset_split');
            $table->index('status');
            $table->index('created_by');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('experiment_sessions');
    }
};
