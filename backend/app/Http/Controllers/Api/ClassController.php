<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClassRoom;
use Illuminate\Http\Request;

class ClassController extends Controller
{
    /**
     * Display a listing of classes - OPTIMIZED
     */
    public function index(Request $request)
    {
        $query = ClassRoom::withCount('students');

        // Filter by grade level
        if ($request->has('grade_level')) {
            $query->where('grade_level', $request->grade_level);
        }

        // Search
        if ($request->has('search')) {
            $query->where('name', 'like', "%{$request->search}%");
        }

        $classes = $query->orderBy('grade_level')
            ->orderBy('name')
            ->get(['id', 'name', 'grade_level', 'academic_year']);

        return response()->json([
            'success' => true,
            'data' => $classes,
        ]);
    }

    /**
     * Store a newly created class
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:classes',
            'grade_level' => 'required|in:X,XI,XII',
            'academic_year' => 'required|string',
        ]);

        $class = ClassRoom::create([
            'name' => $request->name,
            'grade_level' => $request->grade_level,
            'academic_year' => $request->academic_year,
        ]);

        return response()->json([
            'success' => true,
            'data' => $class,
            'message' => 'Kelas berhasil ditambahkan',
        ], 201);
    }

    /**
     * Display the specified class - OPTIMIZED
     */
    public function show(ClassRoom $class)
    {
        $class->loadCount('students');
        $class->load(['students:id,class_id,name,nisn,email']);

        return response()->json([
            'success' => true,
            'data' => $class,
        ]);
    }

    /**
     * Update the specified class
     */
    public function update(Request $request, ClassRoom $class)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255|unique:classes,name,' . $class->id,
            'grade_level' => 'sometimes|in:X,XI,XII',
            'academic_year' => 'sometimes|string',
        ]);

        if ($request->has('name')) {
            $class->name = $request->name;
        }
        if ($request->has('grade_level')) {
            $class->grade_level = $request->grade_level;
        }
        if ($request->has('academic_year')) {
            $class->academic_year = $request->academic_year;
        }

        $class->save();

        return response()->json([
            'success' => true,
            'data' => $class,
            'message' => 'Kelas berhasil diupdate',
        ]);
    }

    /**
     * Remove the specified class
     */
    public function destroy(ClassRoom $class)
    {
        // Check if class has students
        if ($class->students()->count() > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus kelas yang masih memiliki siswa',
            ], 422);
        }

        $class->delete();

        return response()->json([
            'success' => true,
            'message' => 'Kelas berhasil dihapus',
        ]);
    }
}
