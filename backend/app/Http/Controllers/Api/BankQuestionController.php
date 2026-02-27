<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankQuestion;
use App\Models\PracticeResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class BankQuestionController extends Controller
{
    /**
     * Get all questions (for guru - their own questions)
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        
        $query = BankQuestion::with(['teacher:id,name', 'classRoom:id,name']);
        
        // Guru hanya bisa lihat soal miliknya sendiri
        if ($user->role === 'guru') {
            $query->where('teacher_id', $user->id);
        }
        
        // Filter by subject
        if ($request->has('subject') && $request->subject) {
            $query->where('subject', $request->subject);
        }
        
        // Filter by grade
        if ($request->has('grade_level') && $request->grade_level) {
            $query->where('grade_level', $request->grade_level);
        }
        
        // Filter by difficulty
        if ($request->has('difficulty') && $request->difficulty) {
            $query->where('difficulty', $request->difficulty);
        }
        
        // Filter by type
        if ($request->has('type') && $request->type) {
            $query->where('type', $request->type);
        }
        
        // Search
        if ($request->has('search') && $request->search) {
            $query->where('question', 'like', '%' . $request->search . '%');
        }
        
        $questions = $query->orderBy('created_at', 'desc')->get();
        
        return response()->json([
            'success' => true,
            'data' => $questions,
        ]);
    }

    /**
     * Get questions for students (active questions only)
     */
    public function forStudents(Request $request)
    {
        $query = BankQuestion::active()
            ->multipleChoice()
            ->with(['teacher:id,name']);
        
        // Filter by subject (required for students)
        if ($request->has('subject') && $request->subject) {
            $query->where('subject', $request->subject);
        }
        
        // Filter by grade
        if ($request->has('grade_level') && $request->grade_level) {
            $query->where('grade_level', $request->grade_level);
        }
        
        // Filter by difficulty
        if ($request->has('difficulty') && $request->difficulty) {
            $query->where('difficulty', $request->difficulty);
        }
        
        // Limit questions
        $limit = $request->get('limit', 10);
        
        $questions = $query->inRandomOrder()
            ->limit($limit)
            ->get()
            ->map(function ($q) {
                return [
                    'id' => $q->id,
                    'question' => $q->question,
                    'options' => $q->options,
                    'correct_answer' => $q->correct_answer,
                    'explanation' => $q->explanation,
                    'difficulty' => $q->difficulty,
                    'subject' => $q->subject,
                    'teacher_name' => $q->teacher->name ?? 'Unknown',
                ];
            });
        
        return response()->json([
            'success' => true,
            'data' => $questions,
        ]);
    }

    /**
     * Get subjects with question count
     */
    public function subjects(Request $request)
    {
        $gradeLevel = $request->get('grade_level', '10');
        
        $subjects = BankQuestion::active()
            ->where('grade_level', $gradeLevel)
            ->selectRaw('subject, COUNT(*) as total_questions')
            ->groupBy('subject')
            ->get();
        
        return response()->json([
            'success' => true,
            'data' => $subjects,
        ]);
    }

    /**
     * Store a new question
     */
    public function store(Request $request)
    {
        $request->validate([
            'subject' => 'required|string|max:100',
            'type' => 'required|in:pilihan_ganda,essay',
            'question' => 'required|string',
            'options' => 'required_if:type,pilihan_ganda|array|min:2',
            'correct_answer' => 'required|string',
            'explanation' => 'nullable|string',
            'difficulty' => 'required|in:mudah,sedang,sulit',
            'grade_level' => 'required|in:10,11,12,semua',
            'class_id' => 'nullable|exists:classes,id',
        ]);

        $question = BankQuestion::create([
            'teacher_id' => Auth::id(),
            'class_id' => $request->class_id,
            'subject' => $request->subject,
            'type' => $request->type,
            'question' => $request->question,
            'options' => $request->options,
            'correct_answer' => $request->correct_answer,
            'explanation' => $request->explanation,
            'difficulty' => $request->difficulty,
            'grade_level' => $request->grade_level,
            'is_active' => true,
        ]);

        $question->load(['teacher:id,name', 'classRoom:id,name']);

        return response()->json([
            'success' => true,
            'message' => 'Soal berhasil ditambahkan',
            'data' => $question,
        ], 201);
    }

    /**
     * Update a question
     */
    public function update(Request $request, $id)
    {
        $question = BankQuestion::findOrFail($id);
        
        // Check ownership
        if (Auth::user()->role === 'guru' && $question->teacher_id !== Auth::id()) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengedit soal ini',
            ], 403);
        }

        $request->validate([
            'subject' => 'sometimes|required|string|max:100',
            'type' => 'sometimes|required|in:pilihan_ganda,essay',
            'question' => 'sometimes|required|string',
            'options' => 'required_if:type,pilihan_ganda|array|min:2',
            'correct_answer' => 'sometimes|required|string',
            'explanation' => 'nullable|string',
            'difficulty' => 'sometimes|required|in:mudah,sedang,sulit',
            'grade_level' => 'sometimes|required|in:10,11,12,semua',
            'class_id' => 'nullable|exists:classes,id',
            'is_active' => 'sometimes|boolean',
        ]);

        $question->update($request->only([
            'subject', 'type', 'question', 'options', 'correct_answer',
            'explanation', 'difficulty', 'grade_level', 'class_id', 'is_active'
        ]));

        $question->load(['teacher:id,name', 'classRoom:id,name']);

        return response()->json([
            'success' => true,
            'message' => 'Soal berhasil diperbarui',
            'data' => $question,
        ]);
    }

    /**
     * Delete a question
     */
    public function destroy($id)
    {
        $question = BankQuestion::findOrFail($id);
        
        // Check ownership
        if (Auth::user()->role === 'guru' && $question->teacher_id !== Auth::id()) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menghapus soal ini',
            ], 403);
        }

        $question->delete();

        return response()->json([
            'success' => true,
            'message' => 'Soal berhasil dihapus',
        ]);
    }

    /**
     * Bulk import questions (from Open Trivia DB or manual)
     */
    public function bulkStore(Request $request)
    {
        $request->validate([
            'questions' => 'required|array|min:1',
            'questions.*.subject' => 'required|string|max:100',
            'questions.*.type' => 'required|in:pilihan_ganda,essay',
            'questions.*.question' => 'required|string',
            'questions.*.options' => 'required_if:questions.*.type,pilihan_ganda|array',
            'questions.*.correct_answer' => 'required|string',
            'questions.*.explanation' => 'nullable|string',
            'questions.*.difficulty' => 'required|in:mudah,sedang,sulit',
            'questions.*.grade_level' => 'required|in:10,11,12,semua',
        ]);

        $created = [];
        foreach ($request->questions as $q) {
            $created[] = BankQuestion::create([
                'teacher_id' => Auth::id(),
                'class_id' => $q['class_id'] ?? null,
                'subject' => $q['subject'],
                'type' => $q['type'],
                'question' => $q['question'],
                'options' => $q['options'] ?? null,
                'correct_answer' => $q['correct_answer'],
                'explanation' => $q['explanation'] ?? null,
                'difficulty' => $q['difficulty'],
                'grade_level' => $q['grade_level'],
                'is_active' => true,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => count($created) . ' soal berhasil ditambahkan',
            'data' => $created,
        ], 201);
    }

    /**
     * Duplicate a question
     */
    public function duplicate($id)
    {
        $original = BankQuestion::findOrFail($id);
        
        $duplicate = $original->replicate();
        $duplicate->question = $original->question . ' (Copy)';
        $duplicate->teacher_id = Auth::id();
        $duplicate->save();

        $duplicate->load(['teacher:id,name', 'classRoom:id,name']);

        return response()->json([
            'success' => true,
            'message' => 'Soal berhasil diduplikasi',
            'data' => $duplicate,
        ], 201);
    }

    /**
     * Save practice result for a student
     */
    public function savePracticeResult(Request $request)
    {
        $request->validate([
            'subject' => 'required|string|max:100',
            'grade_level' => 'required|in:10,11,12',
            'mode' => 'required|in:tryout,belajar',
            'total_questions' => 'required|integer|min:1',
            'correct_answers' => 'required|integer|min:0',
            'score' => 'required|numeric|min:0|max:100',
            'time_spent' => 'required|integer|min:0',
        ]);

        $result = PracticeResult::create([
            'student_id' => Auth::id(),
            'subject' => $request->subject,
            'grade_level' => $request->grade_level,
            'mode' => $request->mode,
            'total_questions' => $request->total_questions,
            'correct_answers' => $request->correct_answers,
            'score' => $request->score,
            'time_spent' => $request->time_spent,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Hasil latihan berhasil disimpan',
            'data' => $result,
        ], 201);
    }

    /**
     * Get practice stats for the current student
     */
    public function practiceStats()
    {
        $studentId = Auth::id();

        $stats = PracticeResult::where('student_id', $studentId)
            ->selectRaw('COUNT(*) as total_practices')
            ->selectRaw('COALESCE(SUM(time_spent), 0) as total_time_spent')
            ->selectRaw('COALESCE(ROUND(AVG(score), 1), 0) as average_score')
            ->first();

        return response()->json([
            'success' => true,
            'data' => [
                'total_practices' => (int) $stats->total_practices,
                'total_time_spent' => (int) $stats->total_time_spent,
                'average_score' => (float) $stats->average_score,
            ],
        ]);
    }
}
