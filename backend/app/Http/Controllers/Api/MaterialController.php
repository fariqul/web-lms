<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Material;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class MaterialController extends Controller
{
    /**
     * Display a listing of materials - OPTIMIZED
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Material::with(['teacher:id,name', 'classRoom:id,name']);

        // Filter by class for students
        if ($user->role === 'siswa' && $user->class_id) {
            $query->where('class_id', $user->class_id);
        }

        // Filter by teacher for teachers
        if ($user->role === 'guru') {
            $query->where('teacher_id', $user->id);
        }

        // Filter by class_id parameter
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        // Filter by subject
        if ($request->has('subject')) {
            $query->where('subject', $request->subject);
        }

        // Use pagination for large datasets
        $perPage = $request->per_page ?? 20;
        $materials = $query->orderBy('created_at', 'desc')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $materials,
        ]);
    }

    /**
     * Store a newly created material
     */
    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'required|string|max:100',
            'type' => 'required|in:video,document,link',
            'class_id' => 'required|exists:classes,id',
            'file' => 'nullable|file|max:102400|mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,mp4,mp3,zip,rar,avi,mov,mkv,webm', // 100MB max
            'file_url' => 'nullable|url',
        ]);

        $user = $request->user();
        
        // Only teachers and admins can create materials
        if (!in_array($user->role, ['guru', 'admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $fileUrl = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '', $file->getClientOriginalName());
            $path = $file->storeAs('materials', $filename, 'public');
            $fileUrl = url('/storage/' . $path);
        } elseif ($request->has('file_url')) {
            $fileUrl = $request->file_url;
        }

        $material = Material::create([
            'title' => $request->title,
            'description' => $request->description,
            'subject' => $request->subject,
            'type' => $request->type,
            'file_url' => $fileUrl,
            'teacher_id' => $user->id,
            'class_id' => $request->class_id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Materi berhasil ditambahkan',
            'data' => $material->load(['teacher', 'classRoom']),
        ], 201);
    }

    /**
     * Display the specified material - OPTIMIZED
     */
    public function show(Material $material)
    {
        return response()->json([
            'success' => true,
            'data' => $material->load(['teacher:id,name', 'classRoom:id,name']),
        ]);
    }

    /**
     * Update the specified material
     */
    public function update(Request $request, Material $material)
    {
        $user = $request->user();
        
        // Only owner or admin can update
        if ($user->role !== 'admin' && $material->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'sometimes|string|max:100',
            'type' => 'sometimes|in:video,document,link',
            'class_id' => 'sometimes|exists:classes,id',
            'file' => 'nullable|file|max:51200', // 50MB max
            'file_url' => 'nullable|url',
        ]);

        if ($request->hasFile('file')) {
            // Delete old file if exists and is local
            if ($material->file_url && str_contains($material->file_url, '/storage/materials/')) {
                $oldPath = str_replace(url('/storage/'), '', $material->file_url);
                Storage::disk('public')->delete($oldPath);
            }
            
            $file = $request->file('file');
            $filename = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '', $file->getClientOriginalName());
            $path = $file->storeAs('materials', $filename, 'public');
            $material->file_url = url('/storage/' . $path);
        } elseif ($request->has('file_url')) {
            $material->file_url = $request->file_url;
        }

        $material->fill($request->only(['title', 'description', 'subject', 'type', 'class_id']));
        $material->save();

        return response()->json([
            'success' => true,
            'message' => 'Materi berhasil diperbarui',
            'data' => $material->load(['teacher', 'classRoom']),
        ]);
    }

    /**
     * Remove the specified material
     */
    public function destroy(Material $material)
    {
        $user = request()->user();
        
        // Only owner or admin can delete
        if ($user->role !== 'admin' && $material->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        // Delete file if exists
        if ($material->file_url && !str_starts_with($material->file_url, 'http')) {
            $oldPath = str_replace('/storage/', '', $material->file_url);
            Storage::disk('public')->delete($oldPath);
        }

        $material->delete();

        return response()->json([
            'success' => true,
            'message' => 'Materi berhasil dihapus',
        ]);
    }

    /**
     * Download material file (force download)
     */
    public function download(Material $material)
    {
        if (!$material->file_url) {
            return response()->json([
                'success' => false,
                'message' => 'File tidak tersedia',
            ], 404);
        }

        // Extract relative path from full URL
        // file_url format: http://domain/storage/materials/filename.pdf
        $path = null;
        if (str_contains($material->file_url, '/storage/')) {
            $path = str_replace(url('/storage/'), '', $material->file_url);
            // Also handle if APP_URL differs
            $path = preg_replace('#^.*/storage/#', '', $material->file_url);
        }

        if (!$path || !Storage::disk('public')->exists($path)) {
            return response()->json([
                'success' => false,
                'message' => 'File tidak ditemukan di server',
            ], 404);
        }

        $fullPath = Storage::disk('public')->path($path);
        $filename = basename($path);
        // Remove timestamp prefix for cleaner filename
        $cleanName = preg_replace('/^\d+_/', '', $filename);

        return response()->download($fullPath, $cleanName);
    }
}
