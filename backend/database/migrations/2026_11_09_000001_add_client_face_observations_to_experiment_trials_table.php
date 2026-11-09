<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('experiment_trials', function (Blueprint $table) {
            // face-api.js output from the browser, stored next to the server
            // measurement so client-only, server-only and combined can be compared.
            $table->boolean('client_face_detected')->nullable()->after('fastapi_detections');
            $table->unsignedTinyInteger('client_face_count')->nullable()->after('client_face_detected');
            $table->float('client_face_confidence')->nullable()->after('client_face_count');
            $table->json('client_face_bbox')->nullable()->after('client_face_confidence');
            $table->string('client_model', 64)->nullable()->after('client_face_bbox');
            $table->integer('client_latency_ms')->nullable()->after('client_model');
            $table->string('client_error', 255)->nullable()->after('client_latency_ms');
        });
    }

    public function down(): void
    {
        Schema::table('experiment_trials', function (Blueprint $table) {
            $table->dropColumn([
                'client_face_detected',
                'client_face_count',
                'client_face_confidence',
                'client_face_bbox',
                'client_model',
                'client_latency_ms',
                'client_error',
            ]);
        });
    }
};
