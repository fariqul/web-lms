<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;

class ExamResultVisibilityController extends Controller
{
    public function show()
    {
        return response()->json([
            'success' => true,
            'data' => [
                'teacher_exam_results_hidden' => SystemSetting::getTeacherExamResultsHidden(),
            ],
        ]);
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'teacher_exam_results_hidden' => 'required|boolean',
        ]);

        $hidden = (bool) $validated['teacher_exam_results_hidden'];
        if (! SystemSetting::setTeacherExamResultsHidden($hidden)) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal menyimpan pengaturan visibilitas hasil ujian guru',
            ], 500);
        }

        app(SocketBroadcastService::class)->examResultsVisibilityUpdated([
            'teacher_exam_results_hidden' => $hidden,
            'updated_by' => $request->user()?->id,
            'updated_at' => now()->toISOString(),
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'teacher_exam_results_hidden' => $hidden,
            ],
            'message' => $hidden
                ? 'Akses hasil ujian guru dinonaktifkan'
                : 'Akses hasil ujian guru diaktifkan',
        ]);
    }
}
