<?php

namespace App\Providers;

use Carbon\Carbon;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

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
        // Login: batasi per akun+IP agar brute force satu akun tertahan, tanpa
        // memblokir login massal satu sekolah yang berbagi IP publik.
        RateLimiter::for('login', function (Request $request) {
            $login = $request->input('login');
            $identity = is_string($login) ? Str::lower(trim($login)) : 'invalid';

            return [
                Limit::perMinute(5)->by($identity . '|' . $request->ip()),
                Limit::perMinute(300)->by($request->ip()),
            ];
        });

        // Keep internal app/database clock in UTC, but serialize API timestamps as WITA ISO8601.
        Carbon::serializeUsing(static function (Carbon $carbon): string {
            return $carbon->copy()->setTimezone('Asia/Makassar')->toIso8601String();
        });

        // Restrict Log Viewer access (only when the package is installed).
        // Login via /log-viewer/login (username & password dari .env).
        // Setelah login, session 'log_viewer_authed' = true dipakai untuk semua
        // request berikutnya termasuk AJAX internal Log Viewer.
        if (class_exists(\Opcodes\LogViewer\Facades\LogViewer::class)) {
            \Opcodes\LogViewer\Facades\LogViewer::auth(function ($request) {
                // Izinkan akses jika session sudah terautentikasi
                if ($request->session()->get('log_viewer_authed') === true) {
                    return true;
                }

                // Belum login → redirect ke halaman login kita
                if (! $request->expectsJson()) {
                    return redirect('/admin/logs-auth');
                }

                // AJAX request (dari Log Viewer internal) → 403
                return false;
            });
        }
    }
}
