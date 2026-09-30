<?php

use Illuminate\Support\Facades\Route;
use Illuminate\Http\Request;

Route::get('/', function () {
    return view('welcome');
});

// ─── Log Viewer Auth ──────────────────────────────────────────────────────────
// Route login ada di /admin/logs-auth/* (di luar prefix /log-viewer/)
// agar tidak di-intercept oleh Log Viewer package.

Route::get('/admin/logs-auth', function () {
    if (session('log_viewer_authed')) {
        return redirect('/log-viewer');
    }
    return view('log-viewer-login');
})->name('log-viewer.login');

Route::post('/admin/logs-auth', function (Request $request) {
    $request->validate([
        'username' => 'required|string',
        'password' => 'required|string',
    ]);

    $validUser = config('services.log_viewer.username');
    $validPass = config('services.log_viewer.password');

    if (
        ! empty($validUser) &&
        ! empty($validPass) &&
        hash_equals($validUser, $request->input('username')) &&
        hash_equals($validPass, $request->input('password'))
    ) {
        $request->session()->put('log_viewer_authed', true);
        $request->session()->regenerate();

        return redirect('/log-viewer');
    }

    return back()
        ->withInput(['username' => $request->input('username')])
        ->with('error', 'Username atau password salah.');
})->name('log-viewer.login.post');

Route::post('/admin/logs-auth/logout', function (Request $request) {
    $request->session()->forget('log_viewer_authed');
    return redirect('/admin/logs-auth');
})->name('log-viewer.logout');
