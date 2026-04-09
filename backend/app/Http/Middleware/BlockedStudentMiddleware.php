<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class BlockedStudentMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Let logout route pass so client can clear current token gracefully.
        if ($request->is('api/logout')) {
            return $next($request);
        }

        if ($user && $user->role === 'siswa' && (bool) $user->is_blocked) {
            $reason = $user->block_reason ?: 'Akun Anda diblokir oleh admin.';

            return response()->json([
                'success' => false,
                'message' => $reason,
                'error_code' => 'ACCOUNT_BLOCKED',
            ], 403);
        }

        return $next($request);
    }
}
