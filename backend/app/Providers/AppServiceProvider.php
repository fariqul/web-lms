<?php

namespace App\Providers;

use Carbon\Carbon;
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

        // Restrict Log Viewer access.
        // Login via /log-viewer/login (username & password dari .env).
        // Setelah login, session 'log_viewer_authed' = true dipakai untuk semua
        // request berikutnya termasuk AJAX internal Log Viewer.
        LogViewer::auth(function ($request) {
            // Izinkan akses jika session sudah terautentikasi
            if ($request->session()->get('log_viewer_authed') === true) {
                return true;
            }

            // Redirect ke halaman login jika belum autentikasi
            // (hanya untuk request non-AJAX)
            if (! $request->expectsJson()) {
                return redirect('/log-viewer/login');
            }

            return false;
        });
    }
}
