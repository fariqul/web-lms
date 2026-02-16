<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class PasswordResetController extends Controller
{
    /**
     * Request password reset via admin notification.
     * POST /api/forgot-password
     */
    public function forgotPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'contact_type' => 'nullable|string|in:whatsapp,email',
            'contact_value' => 'nullable|string|max:100',
            'nama' => 'nullable|string|max:100',
        ]);

        $user = User::where('email', strtolower($request->email))->first();

        if (!$user) {
            // Return success even if user not found to prevent email enumeration
            return response()->json([
                'success' => true,
                'message' => 'Jika email terdaftar, permintaan reset password telah dikirim ke admin.',
            ]);
        }

        // Build contact info string
        $contactInfo = '';
        if ($request->contact_type && $request->contact_value) {
            $contactLabel = $request->contact_type === 'whatsapp' ? 'WhatsApp' : 'Email';
            $contactInfo = "\n📞 Kontak: {$contactLabel} - {$request->contact_value}";
        }

        // Build notification message
        $userName = $request->nama ?: $user->name;
        $roleLabel = match ($user->role) {
            'admin' => 'Admin',
            'guru' => 'Guru',
            'siswa' => 'Siswa',
            default => $user->role,
        };

        $message = "🔑 Permintaan Reset Password\n"
            . "👤 Nama: {$userName}\n"
            . "📧 Email: {$user->email}\n"
            . "🏷️ Role: {$roleLabel}"
            . $contactInfo
            . "\n\nSilakan reset password user ini melalui menu Kelola Akun.";

        // Send notification to ALL admin users
        $admins = User::where('role', 'admin')->get();

        foreach ($admins as $admin) {
            Notification::send(
                $admin->id,
                'password_reset_request',
                'Permintaan Reset Password - ' . $userName,
                $message,
                [
                    'user_id' => $user->id,
                    'user_email' => $user->email,
                    'user_name' => $userName,
                    'user_role' => $user->role,
                    'contact_type' => $request->contact_type,
                    'contact_value' => $request->contact_value,
                ]
            );
        }

        return response()->json([
            'success' => true,
            'message' => 'Permintaan reset password telah dikirim ke admin.',
        ]);
    }

    /**
     * Reset the user's password using a valid token.
     * POST /api/reset-password
     */
    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string|min:6|confirmed',
        ]);

        // Find token record
        $record = DB::table('password_reset_tokens')
            ->where('email', strtolower($request->email))
            ->first();

        if (!$record) {
            return response()->json([
                'success' => false,
                'message' => 'Token reset password tidak valid atau sudah kadaluarsa.',
            ], 400);
        }

        // Verify token
        if (!Hash::check($request->token, $record->token)) {
            return response()->json([
                'success' => false,
                'message' => 'Token reset password tidak valid.',
            ], 400);
        }

        // Check if token is expired (60 minutes)
        if (now()->diffInMinutes($record->created_at) > 60) {
            DB::table('password_reset_tokens')->where('email', strtolower($request->email))->delete();
            return response()->json([
                'success' => false,
                'message' => 'Token reset password sudah kadaluarsa. Silakan request ulang.',
            ], 400);
        }

        // Update password
        $user = User::where('email', strtolower($request->email))->first();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'User tidak ditemukan.',
            ], 404);
        }

        $user->update([
            'password' => Hash::make($request->password),
        ]);

        // Delete used token
        DB::table('password_reset_tokens')->where('email', strtolower($request->email))->delete();

        // Revoke all existing tokens (force re-login)
        $user->tokens()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Password berhasil direset. Silakan login dengan password baru.',
        ]);
    }
}
