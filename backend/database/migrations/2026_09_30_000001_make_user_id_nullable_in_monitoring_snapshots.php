<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fix root cause of SQLSTATE[HY000] 1364 "Field 'user_id' doesn't have a default value".
 *
 * The original migration (2024_01_30_000001) defined user_id as NOT NULL with no default.
 * The modern insert path uses student_id as the canonical FK for proctoring snapshots.
 * Making user_id nullable is safe — existing rows are untouched, new inserts can omit it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            // Drop the FK constraint first so we can change the column definition.
            // The constraint name follows Laravel's convention: table_column_foreign.
            // Use a try/catch in case the constraint was already dropped or named differently.
            try {
                $table->dropForeign(['user_id']);
            } catch (\Throwable) {
                // Constraint may not exist or already dropped — safe to continue.
            }

            // Re-add column as nullable and re-apply FK constraint.
            $table->unsignedBigInteger('user_id')->nullable()->change();
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('monitoring_snapshots', function (Blueprint $table) {
            try {
                $table->dropForeign(['user_id']);
            } catch (\Throwable) {
                //
            }

            $table->unsignedBigInteger('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });
    }
};
