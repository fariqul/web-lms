<?php

namespace App\Providers;

use Carbon\Carbon;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;
use Opcodes\LogViewer\Facades\LogViewer;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Keep internal app/database clock in UTC, but serialize API timestamps as WITA ISO8601.
        Carbon::serializeUsing(static function (Carbon $carbon): string {
            return $carbon->copy()->setTimezone('Asia/Makassar')->toIso8601String();
        });

        // Restrict Log Viewer access to admin users only.
        LogViewer::auth(function ($request) {
            $user = $request->user();

            return $user !== null && $user->role === 'admin';
        });
    }
}
