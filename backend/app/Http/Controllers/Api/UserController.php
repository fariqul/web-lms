<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ClassRoom;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    /**
     * Display a listing of users - OPTIMIZED
     */
    public function index(Request $request)
    {
        $query = User::with('classRoom:id,name');

        // Filter by role
        if ($request->has('role')) {
            $query->where('role', $request->role);
        }

        // Filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        // Search - uses index on name, email
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('nisn', 'like', "%{$search}%")
                    ->orWhere('nip', 'like', "%{$search}%");
            });
        }

        $users = $query->orderBy('name')
            ->paginate($request->per_page ?? 15);

        return response()->json([
            'success' => true,
            'data' => $users,
        ]);
    }

    /**
     * Store a newly created user - OPTIMIZED
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => [
                'required',
                'min:8',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/', // At least 1 lowercase, 1 uppercase, 1 number
            ],
            'role' => 'required|in:admin,guru,siswa',
            'nisn' => 'nullable|string|unique:users',
            'nip' => 'nullable|string|unique:users',
            'class_id' => 'nullable|exists:classes,id',
        ], [
            'password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'role' => $request->role,
            'nisn' => $request->nisn,
            'nip' => $request->nip,
            'class_id' => $request->class_id,
        ]);

        $user->load('classRoom:id,name');

        return response()->json([
            'success' => true,
            'data' => $user,
            'message' => 'User berhasil ditambahkan',
        ], 201);
    }

    /**
     * Display the specified user - OPTIMIZED
     */
    public function show(User $user)
    {
        $user->load('classRoom:id,name');

        return response()->json([
            'success' => true,
            'data' => $user,
        ]);
    }

    /**
     * Update the specified user
     */
    public function update(Request $request, User $user)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => [
                'sometimes',
                'min:8',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/',
            ],
            'role' => 'sometimes|in:admin,guru,siswa',
            'nisn' => ['nullable', 'string', Rule::unique('users')->ignore($user->id)],
            'nip' => ['nullable', 'string', Rule::unique('users')->ignore($user->id)],
            'class_id' => 'nullable|exists:classes,id',
        ], [
            'password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        if ($request->has('name')) {
            $user->name = $request->name;
        }
        if ($request->has('email')) {
            $user->email = $request->email;
        }
        if ($request->has('password')) {
            $user->password = Hash::make($request->password);
        }
        if ($request->has('role')) {
            $user->role = $request->role;
        }
        if ($request->has('nisn')) {
            $user->nisn = $request->nisn;
        }
        if ($request->has('nip')) {
            $user->nip = $request->nip;
        }
        if ($request->has('class_id')) {
            $user->class_id = $request->class_id;
        }

        $user->save();
        $user->load('classRoom:id,name');

        return response()->json([
            'success' => true,
            'data' => $user,
            'message' => 'User berhasil diupdate',
        ]);
    }

    /**
     * Remove the specified user
     */
    public function destroy(User $user)
    {
        $user->delete();

        return response()->json([
            'success' => true,
            'message' => 'User berhasil dihapus',
        ]);
    }

    /**
     * Get students by class
     */
    public function studentsByClass($classId)
    {
        $students = User::where('role', 'siswa')
            ->where('class_id', $classId)
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $students,
        ]);
    }

    /**
     * Get all teachers
     */
    public function teachers()
    {
        $teachers = User::where('role', 'guru')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $teachers,
        ]);
    }

    /**
     * Reset user password (admin only)
     */
    public function resetPassword(Request $request, User $user)
    {
        $request->validate([
            'new_password' => [
                'required',
                'min:8',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/',
            ],
        ], [
            'new_password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        $user->password = Hash::make($request->new_password);
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Password berhasil direset untuk ' . $user->name,
        ]);
    }
}
