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
        //
        // Arsitektur: app ini full SPA (Next.js) + Laravel API, tidak ada web session.
        // Log Viewer diproteksi dengan secret token via query string atau HTTP header.
        //
        // Akses: https://domain/log-viewer?token=<LOG_VIEWER_SECRET>
        //
        // Set LOG_VIEWER_SECRET di .env — minimal 32 karakter acak.
        LogViewer::auth(function ($request) {
            $secret = config('services.log_viewer.secret');

            // Jika secret belum diset, tolak semua akses.
            if (empty($secret)) {
                return false;
            }

            // Cek dari query string: ?token=xxx
            // Simpan ke session agar AJAX internal Log Viewer ikut terautentikasi.
            if ($request->query('token') === $secret) {
                $request->session()->put('log_viewer_authed', true);
                return true;
            }

            // Cek dari HTTP header: X-Log-Viewer-Token: xxx
            if ($request->header('X-Log-Viewer-Token') === $secret) {
                return true;
            }

            // Cek session (untuk AJAX request setelah halaman dimuat)
            if ($request->session()->get('log_viewer_authed') === true) {
                return true;
            }

            return false;
        });
    }
}
