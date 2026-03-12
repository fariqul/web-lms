<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Login user and create token
     */
    public function login(Request $request)
    {
        $request->validate([
            'login' => 'required|string',
            'password' => 'required',
            'force' => 'sometimes|boolean',
        ]);

        $loginField = trim($request->login);

        // Determine if login is email or NISN
        if (filter_var($loginField, FILTER_VALIDATE_EMAIL)) {
            $user = User::where('email', strtolower($loginField))->first();
        } else {
            // Treat as NISN for student login
            $user = User::where('nisn', $loginField)->first();
        }

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['Email/NIS atau password salah.'],
            ]);
        }

        // Check if user is blocked (only for students)
        if ($user->role === 'siswa' && $user->is_blocked) {
            $reason = $user->block_reason ?: 'Akun Anda diblokir oleh admin.';
            return response()->json([
                'success' => false,
                'message' => $reason,
                'error_code' => 'ACCOUNT_BLOCKED',
            ], 403);
        }

        // Single device enforcement for students
        if ($user->role === 'siswa') {
            $activeTokens = $user->tokens()->count();
            if ($activeTokens > 0) {
                if ($request->boolean('force')) {
                    // Force login: revoke all existing tokens first
                    $user->tokens()->delete();
                } else {
                    return response()->json([
                        'success' => false,
                        'message' => 'Akun sedang login di perangkat lain. Gunakan tombol "Paksa Login" untuk mengeluarkan sesi lain.',
                        'error_code' => 'DEVICE_LIMIT',
                    ], 409);
                }
            }
        }

        // Load relationships
        $user->load('classRoom');

        // Create token
        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'success' => true,
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'nisn' => $user->nisn,
                    'nip' => $user->nip,
                    'class_id' => $user->class_id,
                    'class' => $user->classRoom ? [
                        'id' => $user->classRoom->id,
                        'name' => $user->classRoom->name,
                    ] : null,
                    'photo' => $user->photo,
                ],
                'token' => $token,
            ],
            'message' => 'Login berhasil',
        ]);
    }

    /**
     * Logout user (revoke token)
     */
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'success' => true,
            'message' => 'Logout berhasil',
        ]);
    }

    /**
     * Get current authenticated user
     */
    public function me(Request $request)
    {
        $user = $request->user();
        $user->load('classRoom');

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'jenis_kelamin' => $user->jenis_kelamin,
                'nisn' => $user->nisn,
                'nip' => $user->nip,
                'has_nomor_tes' => !empty($user->nomor_tes),
                'class_id' => $user->class_id,
                'class' => $user->classRoom ? [
                    'id' => $user->classRoom->id,
                    'name' => $user->classRoom->name,
                ] : null,
                'photo' => $user->photo,
            ],
        ]);
    }

    /**
     * Update profile
     */
    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'name' => 'sometimes|string|max:255',
            'nip' => 'sometimes|string|max:50',
            'photo' => 'sometimes|image|max:2048',
        ]);

        // Siswa cannot edit name — only admin can manage student profiles
        if ($request->has('name') && $user->role !== 'siswa') {
            $user->name = $request->name;
        }

        // Guru can update their own NIP
        if ($request->has('nip') && $user->role === 'guru') {
            $user->nip = $request->nip;
        }

        if ($request->hasFile('photo')) {
            $path = $request->file('photo')->store('photos', 'public');
            $user->photo = $path;
        }

        $user->save();

        return response()->json([
            'success' => true,
            'data' => $user,
            'message' => 'Profile berhasil diupdate',
        ]);
    }

    /**
     * Update profile photo
     */
    public function updatePhoto(Request $request)
    {
        $request->validate([
            'photo' => 'required|image|mimes:jpeg,png,jpg,gif|max:2048',
        ]);

        $user = $request->user();

        // Delete old photo if exists and is local
        if ($user->photo && str_contains($user->photo, '/storage/photos/')) {
            $oldPath = str_replace('/storage/', '', parse_url($user->photo, PHP_URL_PATH));
            Storage::disk('public')->delete($oldPath);
        }

        // Store new photo
        $file = $request->file('photo');
        $filename = 'profile_' . $user->id . '_' . time() . '.' . $file->getClientOriginalExtension();
        $path = $file->storeAs('photos', $filename, 'public');
        
        // Store relative path only - accessor will generate full URL dynamically
        $user->photo = $path;
        $user->save();

        $user->load('classRoom');

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'nisn' => $user->nisn,
                'nip' => $user->nip,
                'class_id' => $user->class_id,
                'class' => $user->classRoom ? [
                    'id' => $user->classRoom->id,
                    'name' => $user->classRoom->name,
                ] : null,
                'photo' => $user->photo,
            ],
            'message' => 'Foto profil berhasil diupdate',
        ]);
    }

    /**
     * Change password
     */
    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => 'required',
            'new_password' => [
                'required',
                'min:8',
                'confirmed',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/',
            ],
        ], [
            'new_password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        $user = $request->user();

        if (!Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['Password saat ini salah.'],
            ]);
        }

        $user->password = Hash::make($request->new_password);
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Password berhasil diubah',
        ]);
    }
}
