<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Answer;
use App\Models\ExamResult;
use App\Models\Violation;
use App\Models\MonitoringSnapshot;
use App\Models\AuditLog;
use App\Models\User;
use App\Support\NomorTes;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class ExamController extends Controller
{
    private const EXAM_SHOW_CACHE_TTL_SECONDS_DEFAULT = 20;

    private function getExamShowCacheTtlSeconds(): int
    {
        $ttl = (int) env('EXAM_SHOW_CACHE_TTL_SECONDS', self::EXAM_SHOW_CACHE_TTL_SECONDS_DEFAULT);
        return max(5, $ttl);
    }

    private function forgetExamShowCache(int $examId): void
    {
        Cache::forget("exam:show:{$examId}:role:guru");
        Cache::forget("exam:show:{$examId}:role:admin");
    }

    /**
     * Get teacher grades summary - all students with exam results
     */
    public function teacherGrades(Request $request)
    {
        $user = $request->user();
        
        // Get all exams by this teacher
        $exams = Exam::where('teacher_id', $user->id)
            ->with('class:id,name')
            ->get();
        
        $examIds = $exams->pluck('id');
        
        // Get all results for these exams
        $results = ExamResult::whereIn('exam_id', $examIds)
            ->whereIn('status', ['completed', 'graded', 'submitted'])
            ->with('student:id,name,nisn,class_id')
            ->get();
        
        // Get all assignments by this teacher
        $assignments = \App\Models\Assignment::where('teacher_id', $user->id)
            ->with('classRoom:id,name')
            ->get();
        
        $assignmentIds = $assignments->pluck('id');
        
        // Get all assignment submissions
        $submissions = \App\Models\AssignmentSubmission::whereIn('assignment_id', $assignmentIds)
            ->with('student:id,name,nisn,class_id')
            ->get();
        
        // Group by student
        $studentMap = [];
        
        // Process exam results
        foreach ($results as $result) {
            $student = $result->student;
            if (!$student) continue;
            
            $sid = $student->id;
            if (!isset($studentMap[$sid])) {
                $studentMap[$sid] = [
                    'id' => $sid,
                    'student_name' => $student->name,
                    'student_nis' => $student->nisn ?? '',
                    'class_name' => $exams->firstWhere('id', $result->exam_id)?->class?->name ?? '',
                    'exams' => [],
                    'assignments' => [],
                ];
            }
            
            $exam = $exams->firstWhere('id', $result->exam_id);
            $studentMap[$sid]['exams'][] = [
                'result_id' => $result->id,
                'exam_name' => $exam?->title ?? '',
                'subject' => $exam?->subject ?? '',
                'score' => $result->total_score ?? 0,
                'max_score' => $result->max_score ?? 0,
                'percentage' => $result->percentage ?? 0,
                'status' => $result->status,
                'submitted_at' => $result->submitted_at?->toISOString() ?? '',
            ];
        }
        
        // Process assignment submissions
        foreach ($submissions as $submission) {
            $student = $submission->student;
            if (!$student) continue;
            
            $sid = $student->id;
            if (!isset($studentMap[$sid])) {
                $studentMap[$sid] = [
                    'id' => $sid,
                    'student_name' => $student->name,
                    'student_nis' => $student->nisn ?? '',
                    'class_name' => $assignments->firstWhere('id', $submission->assignment_id)?->classRoom?->name ?? '',
                    'exams' => [],
                    'assignments' => [],
                ];
            }
            
            $assignment = $assignments->firstWhere('id', $submission->assignment_id);
            $studentMap[$sid]['assignments'][] = [
                'submission_id' => $submission->id,
                'assignment_name' => $assignment?->title ?? '',
                'subject' => $assignment?->subject ?? '',
                'score' => $submission->score,
                'max_score' => $assignment?->max_score ?? 100,
                'percentage' => ($assignment?->max_score > 0 && $submission->score !== null)
                    ? round(($submission->score / $assignment->max_score) * 100, 1)
                    : null,
                'status' => $submission->status,
                'submitted_at' => $submission->submitted_at?->toISOString() ?? '',
            ];
        }
        
        // Calculate averages
        $grades = collect($studentMap)->map(function ($student) {
            $exams = collect($student['exams']);
            $assignments = collect($student['assignments']);
            
            $student['exam_average'] = $exams->count() > 0 
                ? round($exams->avg('percentage'), 1) 
                : 0;
            
            $gradedAssignments = $assignments->whereNotNull('percentage');
            $student['assignment_average'] = $gradedAssignments->count() > 0 
                ? round($gradedAssignments->avg('percentage'), 1) 
                : 0;
            
            // Combined average (exam + assignment)
            $allPercentages = $exams->pluck('percentage')
                ->merge($gradedAssignments->pluck('percentage'));
            $student['average'] = $allPercentages->count() > 0 
                ? round($allPercentages->avg(), 1) 
                : 0;
            
            return $student;
        })->values();
        
        return response()->json([
            'success' => true,
            'data' => $grades,
        ]);
    }

    /**
     * Update exam result score (teacher can edit)
     */
    public function updateResultScore(Request $request, $resultId)
    {
        $user = $request->user();
        
        $result = ExamResult::with('exam')->findOrFail($resultId);
        
        // Only the teacher who owns the exam or admin can edit
        if ($user->role !== 'admin' && $result->exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }
        
        $request->validate([
            'score' => 'required|numeric|min:0',
        ]);
        
        $maxScore = $result->max_score ?: 100;
        $newScore = min($request->score, $maxScore);
        $percentage = round(($newScore / $maxScore) * 100, 1);
        
        $result->update([
            'total_score' => $newScore,
            'percentage' => $percentage,
            'status' => 'graded',
        ]);

        // Broadcast result score updated
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->resultScoreUpdated($result->exam_id, [
                'result_id' => $result->id,
                'student_id' => $result->student_id,
                'total_score' => $newScore,
                'percentage' => $percentage,
                'status' => 'graded',
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast resultScoreUpdated failed: ' . $e->getMessage());
        }
        
        return response()->json([
            'success' => true,
            'message' => 'Nilai berhasil diperbarui',
            'data' => $result,
        ]);
    }

    /**
     * Display a listing of exams - OPTIMIZED
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Exam::where('type', '!=', 'quiz')
            ->with(['teacher:id,name', 'class:id,name', 'classes:id,name', 'lockedByUser:id,name']);

        if ($user->role === 'guru') {
            $query->where('teacher_id', $user->id);
        } elseif ($user->role === 'siswa') {
            $query->where(function ($q) use ($user) {
                $q->where('class_id', $user->class_id)
                  ->orWhereHas('classes', fn($cq) => $cq->where('classes.id', $user->class_id));
            });
            // Only filter by status if not explicitly provided
            if (!$request->has('status')) {
                $query->whereIn('status', ['scheduled', 'active']);
            }
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by class (check both direct class_id and pivot table)
        if ($request->has('class_id')) {
            $reqClassId = $request->class_id;
            $query->where(function ($q) use ($reqClassId) {
                $q->where('class_id', $reqClassId)
                  ->orWhereHas('classes', fn($cq) => $cq->where('classes.id', $reqClassId));
            });
        }

        $exams = $query->orderBy('start_time', 'desc')
            ->paginate(min($request->per_page ?? 15, 100));

        // For students, add their result status using eager loaded data
        if ($user->role === 'siswa') {
            $examIds = $exams->pluck('id');
            $myResults = ExamResult::where('student_id', $user->id)
                ->whereIn('exam_id', $examIds)
                ->get(['id', 'exam_id', 'status', 'submitted_at', 'finished_at'])
                ->keyBy('exam_id');

            $exams->getCollection()->transform(function ($exam) use ($myResults) {
                $exam->my_result = $myResults[$exam->id] ?? null;
                // Flatten SEB config for frontend (without exposing quit password)
                if ($exam->seb_required && is_array($exam->seb_config)) {
                    $exam->seb_allow_quit = $exam->seb_config['allow_quit'] ?? true;
                    $exam->seb_block_screen_capture = $exam->seb_config['block_screen_capture'] ?? true;
                    $exam->seb_allow_virtual_machine = $exam->seb_config['allow_virtual_machine'] ?? false;
                    $exam->seb_show_taskbar = $exam->seb_config['show_taskbar'] ?? true;
                }
                return $exam;
            });
        }

        return response()->json([
            'success' => true,
            'data' => $exams,
        ]);
    }

    /**
     * Store a newly created exam
     */
    public function store(Request $request)
    {
        // Support both single class_id and multiple class_ids
        $rules = [
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'required|string|max:255',
            'duration_minutes' => 'required|integer|min:1',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
        ];

        if ($request->has('class_ids')) {
            $rules['class_ids'] = 'required|array|min:1';
            $rules['class_ids.*'] = 'exists:classes,id';
        } else {
            $rules['class_id'] = 'required|exists:classes,id';
        }

        $request->validate($rules);

        // Determine class IDs
        $classIds = $request->has('class_ids')
            ? $request->class_ids
            : [$request->class_id];

        // Use the first class as the primary class_id (backward compatibility)
        $primaryClassId = $classIds[0];

        $exam = Exam::create([
            'title' => $request->title,
            'description' => $request->description,
            'class_id' => $primaryClassId,
            'teacher_id' => $request->user()->id,
            'subject' => $request->subject,
            'duration' => $request->duration_minutes,
            'start_time' => $request->start_time,
            'end_time' => $request->end_time,
            'status' => 'draft',
        ]);

        // Sync all classes to pivot table
        $exam->classes()->sync($classIds);
        $exam->load('classes:id,name');

        return response()->json([
            'success' => true,
            'data' => $exam,
            'message' => 'Ujian berhasil dibuat',
        ], 201);
    }

    /**
     * Display the specified exam - OPTIMIZED
     */
    public function show(Request $request, Exam $exam)
    {
        $user = $request->user();
        $exam->load(['teacher:id,name', 'class:id,name', 'classes:id,name', 'lockedByUser:id,name']);

        $shouldUseShowCache = in_array($user->role, ['guru', 'admin'], true) && !$request->boolean('no_cache');
        $showCacheKey = "exam:show:{$exam->id}:role:{$user->role}";

        // Students can only view exams for their class (check both direct and pivot)
        if ($user->role === 'siswa') {
            $hasAccess = $exam->class_id === $user->class_id
                || $exam->classes()->where('classes.id', $user->class_id)->exists();
            if (!$hasAccess) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses ke ujian ini',
                ], 403);
            }
        }

        // Teachers can only view their own exams (or admin)
        if ($user->role === 'guru' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke ujian ini',
            ], 403);
        }

        if ($shouldUseShowCache) {
            $cachedPayload = Cache::get($showCacheKey);
            if (is_array($cachedPayload) && array_key_exists('success', $cachedPayload) && array_key_exists('data', $cachedPayload)) {
                return response()->json($cachedPayload);
            }
        }

        // For teacher: include all questions with answers
        if ($user->role === 'guru' || $user->role === 'admin') {
            $exam->load([
                'questions' => fn($q) => $q
                    ->select([
                        'id',
                        'exam_id',
                        'passage',
                        'question_text',
                        'type',
                        'points',
                        'order',
                        'image',
                        'options',
                        'correct_answer',
                        'essay_keywords',
                    ])
                    ->orderBy('order')
            ]);
            
            // Transform questions to include formatted options
            if ($exam->questions) {
                $exam->questions->transform(function ($question) {
                    // Convert options array to structured format for frontend
                    if (in_array($question->type, ['multiple_choice', 'multiple_answer']) && is_array($question->options)) {
                        // For multiple_answer, correct_answer is JSON array of correct texts
                        $correctAnswers = [];
                        if ($question->type === 'multiple_answer') {
                            $decoded = json_decode($question->correct_answer, true);
                            $correctAnswers = is_array($decoded) ? $decoded : [];
                        }

                        $question->options = collect($question->options)->map(function ($opt, $idx) use ($question, $correctAnswers) {
                            // Handle both old format (string) and new format (object with text+image)
                            if (is_string($opt)) {
                                $isCorrect = $question->type === 'multiple_answer'
                                    ? in_array($opt, $correctAnswers)
                                    : $opt === $question->correct_answer;
                                return [
                                    'id' => $idx + 1,
                                    'option_text' => $opt,
                                    'is_correct' => $isCorrect,
                                    'image' => null,
                                ];
                            }
                            $optText = $opt['text'] ?? '';
                            $isCorrect = $question->type === 'multiple_answer'
                                ? in_array($optText, $correctAnswers)
                                : $optText === $question->correct_answer;
                            return [
                                'id' => $idx + 1,
                                'option_text' => $optText,
                                'is_correct' => $isCorrect,
                                'image' => $opt['image'] ?? null,
                            ];
                        })->values()->toArray();
                    }
                    return $question;
                });
            }
        }

        // For students: include questions count and result, but not questions content
        if ($user->role === 'siswa') {
            // Block access to draft exams for students
            if ($exam->status === 'draft') {
                return response()->json([
                    'success' => false,
                    'message' => 'Ujian belum dipublikasikan',
                ], 403);
            }

            // Load question count so frontend knows how many questions
            $exam->loadCount('questions');

            $result = ExamResult::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->first(['id', 'status', 'started_at', 'submitted_at']);
            $exam->my_result = $result;

            // Check if student can access exam
            $now = now();
            if (in_array($exam->status, ['scheduled', 'active']) && 
                $now >= $exam->start_time && 
                $now <= $exam->end_time) {
                $exam->can_start = !$result || $result->status === 'in_progress';
            } else {
                $exam->can_start = false;
            }
        }

        // Flatten seb_config into top-level fields for frontend compatibility
        if ($exam->seb_required && is_array($exam->seb_config)) {
            $exam->seb_allow_quit = $exam->seb_config['allow_quit'] ?? true;
            // Only expose quit password to admin/guru, not students
            if ($user->role !== 'siswa') {
                $exam->seb_quit_password = $exam->seb_config['quit_password'] ?? '';
            }
            $exam->seb_block_screen_capture = $exam->seb_config['block_screen_capture'] ?? true;
            $exam->seb_allow_virtual_machine = $exam->seb_config['allow_virtual_machine'] ?? false;
            $exam->seb_show_taskbar = $exam->seb_config['show_taskbar'] ?? true;
        }

        $payload = [
            'success' => true,
            'data' => $exam->toArray(),
        ];

        if ($shouldUseShowCache) {
            Cache::put($showCacheKey, $payload, now()->addSeconds($this->getExamShowCacheTtlSeconds()));
        }

        return response()->json($payload);
    }

    /**
     * Update the specified exam
     */
    public function update(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Ownership check: only the creator or admin can update
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengubah ujian ini',
            ], 403);
        }

        $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'class_id' => 'sometimes|exists:classes,id',
            'class_ids' => 'sometimes|array|min:1',
            'class_ids.*' => 'exists:classes,id',
            'subject' => 'sometimes|string|max:255',
            'duration' => 'sometimes|integer|min:1',
            'duration_minutes' => 'sometimes|integer|min:1', // alias
            'start_time' => 'sometimes|date',
            'end_time' => 'sometimes|date|after:start_time',
            'passing_score' => 'sometimes|integer|min:0|max:100',
            'shuffle_questions' => 'boolean',
            'shuffle_options' => 'boolean',
            'show_result' => 'boolean',
            'max_violations' => 'sometimes|integer|min:0',
            'seb_required' => 'boolean',
            'seb_config' => 'nullable|array',
        ]);

        // Map duration_minutes to duration if sent from frontend
        if ($request->has('duration_minutes') && !$request->has('duration')) {
            $exam->duration = $request->duration_minutes;
        }

        // Handle SEB settings: store config as JSON
        if ($request->has('seb_required')) {
            $exam->seb_required = $request->boolean('seb_required');
            if ($request->boolean('seb_required')) {
                $exam->seb_config = [
                    'allow_quit' => $request->input('seb_allow_quit', true),
                    'quit_password' => $request->input('seb_quit_password', ''),
                    'block_screen_capture' => $request->input('seb_block_screen_capture', true),
                    'allow_virtual_machine' => $request->input('seb_allow_virtual_machine', false),
                    'show_taskbar' => $request->input('seb_show_taskbar', true),
                ];
            } else {
                $exam->seb_config = null;
            }
        }

        // Status is NOT allowed via fill to prevent manipulation
        $exam->fill($request->only([
            'title', 'description', 'class_id', 'subject', 
            'duration', 'start_time', 'end_time',
            'passing_score', 'shuffle_questions', 'shuffle_options',
            'show_result', 'max_violations'
        ]));

        // Sync multi-class if class_ids provided
        if ($request->has('class_ids')) {
            $classIds = $request->class_ids;
            $exam->class_id = $classIds[0]; // primary class for backward compat
            $exam->classes()->sync($classIds);
        }

        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Broadcast exam settings update to all participants
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->examUpdated($exam->id, [
                'exam_id' => $exam->id,
                'title' => $exam->title,
                'duration' => $exam->duration,
                'passing_score' => $exam->passing_score,
                'max_violations' => $exam->max_violations,
                'shuffle_questions' => $exam->shuffle_questions,
                'shuffle_options' => $exam->shuffle_options,
                'show_result' => $exam->show_result,
                'start_time' => $exam->start_time,
                'end_time' => $exam->end_time,
                'seb_required' => $exam->seb_required,
                'status' => $exam->status,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examUpdated failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'data' => $exam,
            'message' => 'Ujian berhasil diupdate',
        ]);
    }

    /**
     * Remove the specified exam
     */
    public function destroy(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menghapus ujian ini',
            ], 403);
        }

        // Check if exam has results
        if ($exam->results()->count() > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus ujian yang sudah memiliki hasil',
            ], 422);
        }

        // Delete all related data in correct order to avoid orphans
        $examId = $exam->id;
        $classId = $exam->class_id;
        $this->forgetExamShowCache($examId);
        DB::transaction(function () use ($exam) {
            // Delete answers for this exam
            Answer::where('exam_id', $exam->id)->delete();
            // Delete violations for this exam
            Violation::where('exam_id', $exam->id)->delete();
            // Delete monitoring snapshots for this exam
            MonitoringSnapshot::where('exam_id', $exam->id)->each(function ($snap) {
                if ($snap->image_path && Storage::disk('public')->exists($snap->image_path)) {
                    Storage::disk('public')->delete($snap->image_path);
                }
                $snap->delete();
            });
            // Delete exam results
            ExamResult::where('exam_id', $exam->id)->delete();
            // Detach multi-class pivot
            $exam->classes()->detach();
            // Delete questions (with their images)
            $exam->questions()->each(function ($q) {
                if ($q->image && Storage::disk('public')->exists($q->image)) {
                    Storage::disk('public')->delete($q->image);
                }
                $q->delete();
            });
            // Delete exam
            $exam->delete();
        });

        // Broadcast exam deleted
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->examDeleted($examId, [
                'exam_id' => $examId,
                'class_id' => $classId,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examDeleted failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Ujian berhasil dihapus',
        ]);
    }

    /**
     * Publish exam
     */
    public function publish(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mempublish ujian ini',
            ], 403);
        }

        if ($exam->questions()->count() === 0) {
            return response()->json([
                'success' => false,
                'message' => 'Ujian harus memiliki minimal 1 soal',
            ], 422);
        }

        // Only allow publishing from draft status
        if ($exam->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya ujian berstatus draft yang dapat dipublish',
            ], 422);
        }

        $exam->status = 'scheduled';
        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Broadcast exam published
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->examPublished($exam->id, [
                'exam_id' => $exam->id,
                'title' => $exam->title,
                'status' => 'scheduled',
                'start_time' => $exam->start_time,
                'end_time' => $exam->end_time,
                'duration' => $exam->duration,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examPublished failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Ujian berhasil dipublish',
        ]);
    }

    /**
     * Cancel publish exam (scheduled -> draft)
     */
    public function unpublish(Request $request, Exam $exam)
    {
        $user = $request->user();

        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya admin yang dapat membatalkan publish ujian',
            ], 403);
        }

        if ($exam->status !== 'scheduled') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya ujian terjadwal yang dapat dibatalkan publish-nya',
            ], 422);
        }

        $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        $oldStatus = $exam->status;
        $exam->status = 'draft';
        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Log to audit trail
        try {
            AuditLog::create([
                'user_id' => $user->id,
                'action' => 'exam.unpublish',
                'description' => 'Membatalkan publish ujian: ' . $exam->title . ($request->reason ? ' (Alasan: ' . $request->reason . ')' : ''),
                'target_type' => 'Exam',
                'target_id' => $exam->id,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'old_values' => ['status' => $oldStatus],
                'new_values' => ['status' => 'draft', 'reason' => $request->reason],
            ]);
        } catch (\Exception $e) {
            Log::warning('Audit log unpublish failed: ' . $e->getMessage());
        }

        // Broadcast status change to draft
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->examUpdated($exam->id, [
                'exam_id' => $exam->id,
                'title' => $exam->title,
                'status' => 'draft',
                'start_time' => $exam->start_time,
                'end_time' => $exam->end_time,
                'duration' => $exam->duration,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examUpdated (unpublish) failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Publish ujian berhasil dibatalkan. Ujian kembali ke draft.',
        ]);
    }

    /**
     * Cancel publish multiple exams (bulk unpublish)
     */
    public function unpublishMultiple(Request $request)
    {
        $user = $request->user();

        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya admin yang dapat membatalkan publish ujian',
            ], 403);
        }

        $request->validate([
            'exam_ids' => 'required|array|min:1',
            'exam_ids.*' => 'integer|exists:exams,id',
            'reason' => 'nullable|string|max:500',
        ]);

        $examIds = $request->exam_ids;
        $reason = $request->reason;

        // Get all exams
        $exams = Exam::whereIn('id', $examIds)->get();

        // Verify all are scheduled
        $notScheduled = $exams->where('status', '!=', 'scheduled')->pluck('id')->toArray();
        if (!empty($notScheduled)) {
            return response()->json([
                'success' => false,
                'message' => 'Beberapa ujian bukan status terjadwal dan tidak dapat dibatalkan',
                'invalid_ids' => $notScheduled,
            ], 422);
        }

        $successCount = 0;
        $failedExams = [];

        DB::transaction(function () use ($exams, $user, $reason, &$successCount, &$failedExams, $request) {
            foreach ($exams as $exam) {
                try {
                    $oldStatus = $exam->status;
                    $exam->status = 'draft';
                    $exam->save();
                    $this->forgetExamShowCache($exam->id);

                    // Log to audit trail
                    AuditLog::create([
                        'user_id' => $user->id,
                        'action' => 'exam.unpublish',
                        'description' => 'Membatalkan publish ujian (massal): ' . $exam->title . ($reason ? ' (Alasan: ' . $reason . ')' : ''),
                        'target_type' => 'Exam',
                        'target_id' => $exam->id,
                        'ip_address' => $request->ip(),
                        'user_agent' => $request->userAgent(),
                        'old_values' => ['status' => $oldStatus],
                        'new_values' => ['status' => 'draft', 'reason' => $reason],
                    ]);

                    $successCount++;
                } catch (\Exception $e) {
                    Log::warning('Bulk unpublish failed for exam ' . $exam->id . ': ' . $e->getMessage());
                    $failedExams[] = [
                        'id' => $exam->id,
                        'title' => $exam->title,
                        'error' => $e->getMessage(),
                    ];
                }
            }
        });

        // Broadcast all status changes
        foreach ($exams as $exam) {
            if ($exam->status === 'draft') {
                try {
                    $broadcast = app(\App\Services\SocketBroadcastService::class);
                    $broadcast->examUpdated($exam->id, [
                        'exam_id' => $exam->id,
                        'title' => $exam->title,
                        'status' => 'draft',
                        'start_time' => $exam->start_time,
                        'end_time' => $exam->end_time,
                        'duration' => $exam->duration,
                    ]);
                } catch (\Exception $e) {
                    Log::warning('Broadcast examUpdated (bulk unpublish) failed: ' . $e->getMessage());
                }
            }
        }

        return response()->json([
            'success' => true,
            'message' => "$successCount ujian berhasil dibatalkan publish-nya",
            'success_count' => $successCount,
            'failed_exams' => $failedExams,
        ]);
    }

    /**
     * Lock exam - prevent guru from editing questions (admin only)
     */
    public function lockExam(Request $request, Exam $exam)
    {
        $user = $request->user();

        $exam->is_locked = true;
        $exam->locked_by = $user->id;
        $exam->locked_at = now();
        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Broadcast exam locked
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->examLocked($exam->id, [
                'exam_id' => $exam->id,
                'locked_by' => $user->id,
                'locked_by_name' => $user->name,
                'locked_at' => $exam->locked_at,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examLocked failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Soal ujian berhasil dikunci. Guru tidak bisa mengedit soal.',
            'data' => $exam->load('lockedByUser:id,name'),
        ]);
    }

    /**
     * Unlock exam - allow guru to edit questions again (admin only)
     */
    public function unlockExam(Request $request, Exam $exam)
    {
        $exam->is_locked = false;
        $exam->locked_by = null;
        $exam->locked_at = null;
        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Broadcast exam unlocked
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->examUnlocked($exam->id, [
                'exam_id' => $exam->id,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examUnlocked failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Soal ujian berhasil dibuka. Guru bisa mengedit soal kembali.',
            'data' => $exam,
        ]);
    }

    /**
     * Add question to exam
     */
    public function addQuestion(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Ownership check for guru
        if ($user->role === 'guru' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke ujian ini',
            ], 403);
        }

        // Lock check for guru (admin can always edit)
        if ($user->role === 'guru' && $exam->is_locked) {
            return response()->json([
                'success' => false,
                'message' => 'Soal ujian ini telah dikunci oleh admin. Hubungi admin untuk membuka kunci.',
            ], 403);
        }

        $request->validate([
            'question_text' => 'required|string',
            'question_type' => 'required|in:multiple_choice,multiple_answer,essay',
            'passage' => 'nullable|string',
            'options' => 'required_if:question_type,multiple_choice|required_if:question_type,multiple_answer|array',
            'options.*.option_text' => 'nullable|string',
            'options.*.is_correct' => 'required_if:question_type,multiple_choice|required_if:question_type,multiple_answer|boolean',
            'options.*.image' => 'nullable|image|max:5120', // option image max 5MB
            'options.*.image_path' => 'nullable|string', // existing image path to copy
            'points' => 'nullable|integer|min:1',
            'image' => 'nullable|image|max:5120', // max 5MB
            'image_path' => 'nullable|string', // existing question image path to copy
            'essay_keywords' => 'nullable|array',
            'essay_keywords.*' => 'string',
        ]);

        // Note: essay_keywords is optional — essays without keywords won't auto-grade

        // Handle image upload or copy from existing path
        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('question-images', 'public');
        } elseif ($request->image_path && Storage::disk('public')->exists($request->image_path)) {
            $ext = pathinfo($request->image_path, PATHINFO_EXTENSION);
            $newPath = 'question-images/' . uniqid() . '.' . $ext;
            Storage::disk('public')->copy($request->image_path, $newPath);
            $imagePath = $newPath;
        }

        // Convert options to structured format with optional images
        $optionsArray = [];
        $correctAnswer = '';
        $correctAnswers = [];
        
        if (in_array($request->question_type, ['multiple_choice', 'multiple_answer']) && $request->options) {
            foreach ($request->options as $idx => $opt) {
                $optImage = null;
                if ($request->hasFile("options.{$idx}.image")) {
                    $optImage = $request->file("options.{$idx}.image")->store('option-images', 'public');
                } elseif (!empty($opt['image_path']) && Storage::disk('public')->exists($opt['image_path'])) {
                    // Copy existing option image
                    $ext = pathinfo($opt['image_path'], PATHINFO_EXTENSION);
                    $newOptPath = 'option-images/' . uniqid() . '.' . $ext;
                    Storage::disk('public')->copy($opt['image_path'], $newOptPath);
                    $optImage = $newOptPath;
                }
                // If text is empty but has image, use auto-label for answer matching
                $optText = $opt['option_text'] ?? '';
                if (empty(trim($optText)) && $optImage) {
                    $optText = '[Gambar ' . chr(65 + $idx) . ']';
                }
                $optionsArray[] = [
                    'text' => $optText,
                    'image' => $optImage,
                ];
                if ($opt['is_correct']) {
                    $correctAnswers[] = $optText;
                    $correctAnswer = $optText;
                }
            }
        }

        // For multiple_answer, store correct answers as JSON array
        if ($request->question_type === 'multiple_answer') {
            $correctAnswer = json_encode($correctAnswers);
        }

        $question = Question::create([
            'exam_id' => $exam->id,
            'passage' => $request->passage,
            'question_text' => $request->question_text,
            'type' => $request->question_type,
            'image' => $imagePath,
            'options' => $optionsArray,
            'correct_answer' => $correctAnswer,
            'essay_keywords' => $request->question_type === 'essay' ? $request->essay_keywords : null,
            'points' => $request->points ?? 10,
            'order' => ($exam->questions()->max('order') ?? 0) + 1,
        ]);

        // Update exam total_questions count
        $exam->total_questions = $exam->questions()->count();
        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Broadcast question added to active exam students
        app(SocketBroadcastService::class)->examQuestionAdded($exam->id, [
            'question' => [
                'id' => $question->id,
                'question_text' => $question->question_text,
                'type' => $question->type,
                'passage' => $question->passage,
                'options' => $question->options,
                'image' => $question->image,
                'points' => $question->points,
                'order' => $question->order,
            ],
            'total_questions' => $exam->total_questions,
        ]);

        return response()->json([
            'success' => true,
            'data' => $question,
            'message' => 'Soal berhasil ditambahkan',
        ], 201);
    }

    /**
     * Update question
     */
    public function updateQuestion(Request $request, Question $question)
    {
        // Check ownership - only exam creator or admin can update questions
        $exam = $question->exam;
        $user = $request->user();
        
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengubah soal ini',
            ], 403);
        }

        // Lock check for guru (admin can always edit)
        if ($user->role === 'guru' && $exam->is_locked) {
            return response()->json([
                'success' => false,
                'message' => 'Soal ujian ini telah dikunci oleh admin. Hubungi admin untuk membuka kunci.',
            ], 403);
        }
        
        $request->validate([
            'question_text' => 'sometimes|string',
            'question_type' => 'sometimes|in:multiple_choice,multiple_answer,essay',
            'options' => 'sometimes|array',
            'correct_answer' => 'sometimes|string',
            'points' => 'sometimes|integer|min:1',
            'image' => 'nullable|image|max:5120',
            'essay_keywords' => 'nullable|array',
            'essay_keywords.*' => 'string',
        ]);

        // Validate essay must have keywords (only warn, don't block — allows import without keywords)
        $questionType = $request->question_type ?? $question->type;
        if ($questionType === 'essay') {
            // Keywords are optional — essays without keywords won't auto-grade
        }

        // Handle image upload
        if ($request->hasFile('image')) {
            // Delete old image if exists
            if ($question->image) {
                Storage::disk('public')->delete($question->image);
            }
            $question->image = $request->file('image')->store('question-images', 'public');
        }

        // Handle remove image flag
        if ($request->has('remove_image') && $request->remove_image) {
            if ($question->image) {
                Storage::disk('public')->delete($question->image);
            }
            $question->image = null;
        }

        if ($request->has('question_text')) {
            $question->question_text = $request->question_text;
        }

        if ($request->has('passage')) {
            $question->passage = $request->passage ?: null;
        }

        if ($request->has('points')) {
            $question->points = $request->points;
        }

        // Handle question_type -> type mapping
        if ($request->has('question_type')) {
            $question->type = $request->question_type;
        }

        // Handle structured options format (from frontend edit modal)
        if ($request->has('options') && is_array($request->options)) {
            // Delete old option images before replacing
            if (is_array($question->options)) {
                foreach ($question->options as $oldOpt) {
                    if (is_array($oldOpt) && !empty($oldOpt['image'])) {
                        Storage::disk('public')->delete($oldOpt['image']);
                    }
                }
            }

            $optionsArray = [];
            $correctAnswer = '';
            $correctAnswers = [];
            $questionType = $request->question_type ?? $question->type;
            
            foreach ($request->options as $idx => $opt) {
                $optText = $opt['option_text'] ?? $opt['text'] ?? '';
                
                // Handle option image
                $optImage = null;
                if ($request->hasFile("options.{$idx}.image")) {
                    $optImage = $request->file("options.{$idx}.image")->store('option-images', 'public');
                } elseif (!empty($opt['existing_image']) && $opt['existing_image'] !== 'null') {
                    // Keep existing image if not replaced
                    $optImage = $opt['existing_image'];
                }
                // Handle remove_image flag per option
                if (!empty($opt['remove_image']) && ($opt['remove_image'] === '1' || $opt['remove_image'] === true)) {
                    $optImage = null;
                }

                // If text is empty but has image, use auto-label for answer matching
                if (empty(trim($optText)) && $optImage) {
                    $optText = '[Gambar ' . chr(65 + $idx) . ']';
                }

                $optionsArray[] = [
                    'text' => $optText,
                    'image' => $optImage,
                ];
                if (!empty($opt['is_correct']) && ($opt['is_correct'] === true || $opt['is_correct'] === '1' || $opt['is_correct'] === 1)) {
                    $correctAnswers[] = $optText;
                    $correctAnswer = $optText;
                }
            }
            
            $question->options = $optionsArray;
            if ($questionType === 'multiple_answer') {
                $question->correct_answer = json_encode($correctAnswers);
            } elseif ($correctAnswer) {
                $question->correct_answer = $correctAnswer;
            }
        }

        // Handle direct correct_answer
        if ($request->has('correct_answer') && !$request->has('options')) {
            $question->correct_answer = $request->correct_answer;
        }

        // Handle essay keywords
        if ($request->has('essay_keywords')) {
            $question->essay_keywords = $request->essay_keywords;
        }

        $question->save();
        $this->forgetExamShowCache($question->exam_id);

        // Broadcast question updated to active exam students
        app(SocketBroadcastService::class)->examQuestionUpdated($question->exam_id, [
            'question' => [
                'id' => $question->id,
                'question_text' => $question->question_text,
                'type' => $question->type,
                'passage' => $question->passage,
                'options' => $question->options,
                'image' => $question->image,
                'points' => $question->points,
                'order' => $question->order,
            ],
        ]);

        return response()->json([
            'success' => true,
            'data' => $question,
            'message' => 'Soal berhasil diupdate',
        ]);
    }

    /**
     * Delete question
     */
    public function deleteQuestion(Request $request, Question $question)
    {
        // Check ownership - only exam creator or admin can delete questions
        $exam = $question->exam;
        $user = $request->user();
        
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menghapus soal ini',
            ], 403);
        }

        // Lock check for guru (admin can always edit)
        if ($user->role === 'guru' && $exam->is_locked) {
            return response()->json([
                'success' => false,
                'message' => 'Soal ujian ini telah dikunci oleh admin. Hubungi admin untuk membuka kunci.',
            ], 403);
        }
        
        $deletedOrder = $question->order;

        // Delete question image
        if ($question->image) {
            Storage::disk('public')->delete($question->image);
        }
        // Delete option images
        if (is_array($question->options)) {
            foreach ($question->options as $opt) {
                if (is_array($opt) && !empty($opt['image'])) {
                    Storage::disk('public')->delete($opt['image']);
                }
            }
        }

        $question->delete();

        // Renumber remaining questions sequentially
        $exam->questions()->where('order', '>', $deletedOrder)
            ->decrement('order');
        
        // Update total_questions count
        $exam->total_questions = $exam->questions()->count();
        $exam->save();
        $this->forgetExamShowCache($exam->id);

        // Broadcast question deleted to active exam students
        app(SocketBroadcastService::class)->examQuestionDeleted($exam->id, [
            'question_id' => $question->id,
            'deleted_order' => $deletedOrder,
            'total_questions' => $exam->total_questions,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Soal berhasil dihapus',
        ]);
    }

    /**
     * Start exam (for student)
     */
    public function startExam(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Validate nomor_tes if student has one assigned
        if ($user->nomor_tes) {
            $request->validate([
                'nomor_tes' => 'required|string',
            ], [
                'nomor_tes.required' => 'Nomor tes wajib diisi untuk memulai ujian.',
            ]);

            if ($request->nomor_tes !== $user->nomor_tes) {
                return response()->json([
                    'success' => false,
                    'message' => 'Nomor tes tidak sesuai dengan akun Anda. Silakan periksa kembali nomor tes yang diberikan.',
                ], 422);
            }
        }

        // Validate exam can be started
        if (!in_array($exam->status, ['scheduled', 'active'])) {
            return response()->json([
                'success' => false,
                'message' => 'Ujian tidak tersedia',
            ], 422);
        }

        $now = now();
        if ($now < $exam->start_time || $now > $exam->end_time) {
            return response()->json([
                'success' => false,
                'message' => 'Ujian tidak dalam waktu pelaksanaan',
            ], 422);
        }

        // SEB enforcement: check User-Agent for Safe Exam Browser
        // Skip SEB check for mobile devices (SEB not available on mobile)
        if ($exam->seb_required) {
            $ua = $request->header('User-Agent', '');
            $isMobile = preg_match('/Android|iPhone|iPad|iPod|Mobile|webOS|Opera Mini/i', $ua);
            
            if (!$isMobile) {
                $isSEB = preg_match('/SEB\/\d|SafeExamBrowser|SEB_iOS|SEB_macOS/i', $ua);
                if (!$isSEB) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Ujian ini wajib menggunakan Safe Exam Browser (SEB). Silakan buka ujian melalui SEB.',
                    ], 403);
                }
            }
        }

        // Check if student belongs to one of the exam's classes
        $examClassIds = $exam->classes()->pluck('classes.id')->toArray();
        if (empty($examClassIds)) {
            $examClassIds = [$exam->class_id];
        }
        if (!in_array($user->class_id, $examClassIds)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak terdaftar di kelas ini',
            ], 422);
        }

        // Check existing result (with lock to prevent race condition on double-click)
        $result = DB::transaction(function () use ($exam, $user) {
            $result = ExamResult::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->lockForUpdate()
                ->first();

            if ($result && $result->status === 'completed') {
                return 'completed';
            }

            // Create or get existing result
            if (!$result) {
                $result = ExamResult::create([
                    'exam_id' => $exam->id,
                    'student_id' => $user->id,
                    'started_at' => now(),
                    'status' => 'in_progress',
                ]);

                // Broadcast: student joined exam
                app(SocketBroadcastService::class)->examStudentJoined($exam->id, [
                    'student_id' => $user->id,
                    'student_name' => $user->name,
                    'started_at' => now()->toISOString(),
                ]);
            }

            return $result;
        });

        if ($result === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Anda sudah menyelesaikan ujian ini',
            ], 422);
        }

        try {

        // Get questions (shuffled if enabled)
        $questions = $exam->questions()->orderBy('order')->get();
        
        if ($exam->shuffle_questions && $questions->isNotEmpty()) {
            try {
                // Separate essay questions (always at the end, not shuffled)
                $mcQuestions = $questions->filter(fn($q) => in_array($q->type, ['multiple_choice', 'multiple_answer']));
                $essayQuestions = $questions->filter(fn($q) => $q->type === 'essay');
                
                // Group questions by passage - questions with same passage stay together
                $passageGroups = []; // passage_text => [questions]
                $noPassageQuestions = []; // questions without passage (each is own group)
                
                foreach ($mcQuestions as $q) {
                    $passageText = trim($q->passage ?? '');
                    if (!empty($passageText)) {
                        // Use md5 hash as key to handle very long passages
                        $key = md5($passageText);
                        if (!isset($passageGroups[$key])) {
                            $passageGroups[$key] = [];
                        }
                        $passageGroups[$key][] = $q;
                    } else {
                        // Each question without passage is its own "group"
                        $noPassageQuestions[] = [$q];
                    }
                }
                
                // Convert passage groups to array and combine with non-passage questions
                $allGroups = array_merge(array_values($passageGroups), $noPassageQuestions);
                
                // Shuffle the groups (not questions within groups)
                shuffle($allGroups);
                
                // Flatten groups back into question list
                $merged = [];
                foreach ($allGroups as $group) {
                    foreach ($group as $item) {
                        $merged[] = $item;
                    }
                }
                
                // Append essay questions at the end (not shuffled)
                foreach ($essayQuestions as $eq) {
                    $merged[] = $eq;
                }
                
                $questions = collect($merged);
            } catch (\Exception $e) {
                Log::error('Shuffle questions failed: ' . $e->getMessage());
                $questions = $exam->questions()->orderBy('order')->get();
            }
        }
        
        // Renumber questions sequentially (1, 2, 3...) regardless of shuffle
        $questions = $questions->values();
        foreach ($questions as $idx => $q) {
            $q->order = $idx + 1;
        }

        // Shuffle options if enabled
        if ($exam->shuffle_options) {
            $questions->transform(function ($q) {
                if (in_array($q->type, ['multiple_choice', 'multiple_answer']) && is_array($q->options)) {
                    $shuffled = $q->options;
                    shuffle($shuffled);
                    $q->options = $shuffled;
                }
                return $q;
            });
        }

        // Normalize options to structured format for student view
        // Handles both old format (flat strings) and new format (objects with text+image)
        $questions->transform(function ($q) {
            if (in_array($q->type, ['multiple_choice', 'multiple_answer']) && is_array($q->options)) {
                $q->options = collect($q->options)->map(function ($opt) {
                    if (is_string($opt)) {
                        return ['text' => $opt, 'image' => null];
                    }
                    return [
                        'text' => $opt['text'] ?? '',
                        'image' => $opt['image'] ?? null,
                    ];
                })->values()->toArray();
            }
            return $q;
        });

        // Remove correct answer and essay_keywords from response
        $questions->each(function ($q) {
            $q->makeHidden(['correct_answer', 'essay_keywords']);
        });

        // Get existing answers
        $existingAnswers = Answer::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->get()
            ->keyBy('question_id');

        return response()->json([
            'success' => true,
            'data' => [
                'exam' => $exam->only(['id', 'title', 'duration', 'max_violations']),
                'result' => $result,
                'questions' => $questions->values(),
                'existing_answers' => $existingAnswers,
                'remaining_time' => max(0, $result->started_at
                    ? now()->diffInSeconds(\Carbon\Carbon::parse($result->started_at)->addMinutes($exam->duration ?? 90), false)
                    : ($exam->duration ?? 90) * 60
                ),
            ],
        ]);

        } catch (\Exception $e) {
            Log::error('startExam error for exam ' . $exam->id . ': ' . $e->getMessage() . ' at ' . $e->getFile() . ':' . $e->getLine());
            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan saat memulai ujian. Silakan coba lagi.',
            ], 500);
        }
    }

    /**
     * Submit answer
     */
    public function submitAnswer(Request $request, Exam $exam)
    {
        $request->validate([
            'question_id' => 'required|exists:questions,id',
            'answer' => 'required|string',
        ]);

        $user = $request->user();

        // Validate exam and result
        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->where('status', 'in_progress')
            ->first();

        if (!$result) {
            return response()->json([
                'success' => false,
                'message' => 'Sesi ujian tidak ditemukan',
            ], 422);
        }

        // Server-side time expiry check
        $now = now();
        
        // Check exam end_time
        if ($exam->end_time && $now->greaterThan(Carbon::parse($exam->end_time)->addSeconds(30))) {
            return response()->json([
                'success' => false,
                'message' => 'Waktu ujian telah berakhir',
            ], 422);
        }
        
        // Check student's personal duration (started_at + duration)
        if ($result->started_at && $exam->duration) {
            $personalDeadline = Carbon::parse($result->started_at)->addMinutes($exam->duration)->addSeconds(30);
            if ($now->greaterThan($personalDeadline)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Waktu pengerjaan Anda telah habis',
                ], 422);
            }
        }

        // Get question
        $question = Question::where('id', $request->question_id)
            ->where('exam_id', $exam->id)
            ->first();

        if (!$question) {
            return response()->json([
                'success' => false,
                'message' => 'Soal tidak ditemukan',
            ], 422);
        }

        // Check if answer is correct (auto-grade)
        $isCorrect = null;
        $answerScore = 0;
        $essayScore = null;
        
        if ($question->type === 'multiple_choice') {
            $isCorrect = strtolower(trim($request->answer)) === strtolower(trim($question->correct_answer));
            $answerScore = $isCorrect ? $question->points : 0;
        } elseif ($question->type === 'multiple_answer') {
            // Multiple answer: compare arrays of selected options
            $studentAnswers = json_decode($request->answer, true);
            $correctAnswers = json_decode($question->correct_answer, true);
            if (is_array($studentAnswers) && is_array($correctAnswers)) {
                $studentNorm = array_map(fn($a) => strtolower(trim($a)), $studentAnswers);
                $correctNorm = array_map(fn($a) => strtolower(trim($a)), $correctAnswers);
                sort($studentNorm);
                sort($correctNorm);
                $isCorrect = $studentNorm === $correctNorm;
                // Partial scoring: correct selections / total correct, minus wrong selections
                $correctCount = count(array_intersect($studentNorm, $correctNorm));
                $wrongCount = count(array_diff($studentNorm, $correctNorm));
                $totalCorrect = count($correctNorm);
                if ($totalCorrect > 0) {
                    $score = max(0, ($correctCount - $wrongCount) / $totalCorrect);
                    $answerScore = (int) round($score * $question->points);
                }
            } else {
                $isCorrect = false;
                $answerScore = 0;
            }
        } elseif ($question->type === 'essay' && !empty($question->essay_keywords)) {
            // Auto-grade essay based on keywords — graduated scoring
            // Score = (matched keywords / total keywords) * points
            $studentAnswer = mb_strtolower(trim($request->answer));
            $keywords = $question->essay_keywords;
            $totalKeywords = count($keywords);
            $matchedCount = 0;
            
            foreach ($keywords as $keyword) {
                if (mb_stripos($studentAnswer, mb_strtolower(trim($keyword))) !== false) {
                    $matchedCount++;
                }
            }
            
            if ($totalKeywords > 0 && $matchedCount > 0) {
                // Graduated scoring: percentage of keywords matched
                $essayScore = round(($matchedCount / $totalKeywords) * $question->points);
                $essayScore = max(1, $essayScore); // minimum 1 point if any match
                $isCorrect = $matchedCount === $totalKeywords; // fully correct only if all match
            } else {
                // No keywords found → 1 point (attempted)
                $essayScore = 1;
                $isCorrect = false;
            }
        }

        // Save or update answer
        $answer = Answer::updateOrCreate(
            [
                'student_id' => $user->id,
                'question_id' => $question->id,
                'exam_id' => $exam->id,
            ],
            [
                'answer' => $request->answer,
                'is_correct' => $isCorrect,
                'score' => $question->type === 'essay' ? $essayScore : $answerScore,
                'submitted_at' => now(),
            ]
        );

        // Broadcast: answer progress
        $answeredCount = Answer::where('exam_id', $exam->id)->where('student_id', $user->id)->count();
        app(SocketBroadcastService::class)->examAnswerProgress($exam->id, [
            'student_id' => $user->id,
            'answered_count' => $answeredCount,
            'total_questions' => $exam->questions()->count(),
        ]);

        return response()->json([
            'success' => true,
            'data' => $answer->only(['id', 'question_id', 'answer', 'submitted_at']),
        ]);
    }

    /**
     * Upload work photo (foto cara kerja) for a specific question answer
     */
    public function uploadWorkPhoto(Request $request, Exam $exam)
    {
        $request->validate([
            'question_id' => 'required|exists:questions,id',
            'photo' => 'required|file|mimetypes:image/jpeg,image/png,image/webp|max:5120',
        ]);

        $user = $request->user();

        // Verify student has active exam session
        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->where('status', 'in_progress')
            ->first();

        if (!$result) {
            return response()->json([
                'success' => false,
                'message' => 'Sesi ujian tidak ditemukan',
            ], 422);
        }

        // Verify question belongs to this exam
        $question = Question::where('id', $request->question_id)
            ->where('exam_id', $exam->id)
            ->first();

        if (!$question) {
            return response()->json([
                'success' => false,
                'message' => 'Soal tidak ditemukan',
            ], 422);
        }

        if ($question->type !== 'essay') {
            return response()->json([
                'success' => false,
                'message' => 'Foto cara kerja hanya tersedia untuk soal essay',
            ], 422);
        }

        // Store the photo
        $path = $request->file('photo')->store(
            "work-photos/exam-{$exam->id}/student-{$user->id}",
            'public'
        );

        // Update the answer record with the work photo path
        $answer = Answer::updateOrCreate(
            [
                'student_id' => $user->id,
                'question_id' => $question->id,
                'exam_id' => $exam->id,
            ],
            [
                'work_photo' => $path,
            ]
        );

        return response()->json([
            'success' => true,
            'data' => [
                'work_photo' => $path,
                'question_id' => $question->id,
            ],
        ]);
    }

    /**
     * Finish exam
     */
    public function finishExam(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Use transaction with lock to prevent double-submit race condition
        $responseData = DB::transaction(function () use ($exam, $user) {
            $result = ExamResult::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->where('status', 'in_progress')
                ->lockForUpdate()
                ->first();

            // If not in_progress, check if already completed (admin ended exam first)
            if (!$result) {
                $alreadyCompleted = ExamResult::where('exam_id', $exam->id)
                    ->where('student_id', $user->id)
                    ->whereIn('status', ['completed', 'graded', 'submitted'])
                    ->first();

                if ($alreadyCompleted) {
                    $response = [
                        'success' => true,
                        'message' => 'Ujian sudah diselesaikan',
                        'already_completed' => true,
                    ];

                    if ($exam->show_result) {
                        $response['data'] = [
                            'score' => $alreadyCompleted->score,
                            'total_correct' => $alreadyCompleted->total_correct,
                            'total_wrong' => $alreadyCompleted->total_wrong,
                            'total_questions' => $exam->questions()->count(),
                            'passed' => $alreadyCompleted->score >= $exam->passing_score,
                        ];
                    }

                    return $response;
                }

                return ['error' => true, 'message' => 'Sesi ujian tidak ditemukan'];
            }

            // Calculate score
            $result->finished_at = now();
            $result->submitted_at = now();
            
            // Check if there are essays without keywords (need manual grading)
            $hasUngradedEssays = Answer::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->whereHas('question', function ($q) {
                    $q->where('type', 'essay')->where(function ($q2) {
                        $q2->whereNull('essay_keywords')->orWhere('essay_keywords', '[]');
                    });
                })
                ->exists();
            
            $result->status = $hasUngradedEssays ? 'submitted' : 'graded';
            $result->calculateScore();

            // Broadcast: student submitted
            app(SocketBroadcastService::class)->examStudentSubmitted($exam->id, [
                'student_id' => $user->id,
                'student_name' => $user->name,
                'score' => $result->score,
                'finished_at' => $result->finished_at->toISOString(),
            ]);

            $response = [
                'success' => true,
                'message' => 'Ujian berhasil diselesaikan',
            ];

            if ($exam->show_result) {
                $response['data'] = [
                    'score' => $result->score,
                    'total_correct' => $result->total_correct,
                    'total_wrong' => $result->total_wrong,
                    'total_questions' => $exam->questions()->count(),
                    'passed' => $result->score >= $exam->passing_score,
                ];
            }

            return $response;
        });

        if (isset($responseData['error'])) {
            return response()->json([
                'success' => false,
                'message' => $responseData['message'],
            ], 422);
        }

        return response()->json($responseData);
    }

    /**
     * Report violation
     */
    public function reportViolation(Request $request, Exam $exam)
    {
        $request->validate([
            'type' => 'required|in:tab_switch,window_blur,copy_paste,right_click,shortcut_key,screen_capture,multiple_face,no_face,split_screen,floating_app,pip_mode,suspicious_resize,screenshot_attempt,virtual_camera,camera_off,fullscreen_exit',
            'description' => 'nullable|string',
            'screenshot' => 'nullable|image|max:2048',
        ]);

        $user = $request->user();

        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->where('status', 'in_progress')
            ->first();

        if (!$result) {
            return response()->json([
                'success' => false,
                'message' => 'Sesi ujian tidak ditemukan',
            ], 422);
        }

        $screenshotPath = null;
        if ($request->hasFile('screenshot')) {
            $screenshotPath = $request->file('screenshot')->store('violation-screenshots', 'public');
        }

        $violation = Violation::create([
            'exam_result_id' => $result->id,
            'student_id' => $user->id,
            'exam_id' => $exam->id,
            'type' => $request->type,
            'description' => $request->description,
            'screenshot' => $screenshotPath,
            'recorded_at' => now(),
            'timestamp' => now(),
        ]);

        // Also save a violation snapshot for admin review (permanent, not cleaned up)
        if ($request->hasFile('screenshot')) {
            $violationImagePath = $request->file('screenshot')->store('monitoring-snapshots', 'public');
            MonitoringSnapshot::create([
                'exam_result_id' => $result->id,
                'user_id' => $user->id,
                'student_id' => $user->id,
                'exam_id' => $exam->id,
                'image_path' => $violationImagePath,
                'photo_path' => $violationImagePath,
                'captured_at' => now(),
                'is_violation' => true,
            ]);
        }

        // Update violation count
        $result->violation_count = $result->violations()->count();
        $result->save();

        // Broadcast: violation reported
        app(SocketBroadcastService::class)->examViolation($exam->id, [
            'student_id' => $user->id,
            'student_name' => $user->name,
            'type' => $request->type,
            'description' => $request->description,
            'violation_count' => $result->violation_count,
            'max_violations' => $exam->max_violations,
        ]);

        // Check if max violations exceeded
        $forceSubmit = false;
        if ($exam->max_violations && $result->violation_count >= $exam->max_violations) {
            $forceSubmit = true;
            $result->finished_at = now();
            $result->submitted_at = now();
            $result->status = 'completed';
            $result->calculateScore();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'violation_count' => $result->violation_count,
                'max_violations' => $exam->max_violations,
                'force_submit' => $forceSubmit,
            ],
        ]);
    }

    /**
     * Upload monitoring snapshot
     */
    public function uploadSnapshot(Request $request, Exam $exam)
    {
        // Use mimetypes (checks actual content) instead of mimes (checks extension mapping)
        // canvas.toBlob() produces valid JPEG content but File() constructor extension mapping
        // can confuse Laravel's mimes rule
        $request->validate([
            'image' => 'required|file|mimetypes:image/jpeg,image/png,image/webp|max:2048',
        ]);

        $user = $request->user();

        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->whereIn('status', ['in_progress', 'started', 'submitted'])
            ->first();

        if (!$result) {
            // Don't return 422 — student may have finished the exam while snapshot was in-flight
            return response()->json([
                'success' => true,
                'message' => 'No active exam session — snapshot skipped',
            ]);
        }

        // Rate limiting: max 1 snapshot per 3 seconds per student
        $lastSnapshot = MonitoringSnapshot::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->orderBy('captured_at', 'desc')
            ->first();

        // Carbon 3 diffInSeconds() returns signed value; use abs() to get absolute diff
        if ($lastSnapshot && $lastSnapshot->captured_at && abs(now()->diffInSeconds($lastSnapshot->captured_at)) < 3) {
            return response()->json([
                'success' => true,
                'message' => 'Rate limited — too frequent',
                'data' => $lastSnapshot,
            ]);
        }

        // Delete previous non-violation snapshots and create new one in a transaction
        $imagePath = $request->file('image')->store('monitoring-snapshots', 'public');

        $snapshot = DB::transaction(function () use ($exam, $user, $result, $imagePath) {
            $oldSnapshots = MonitoringSnapshot::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->where('is_violation', false)
                ->get();

            foreach ($oldSnapshots as $old) {
                if ($old->image_path && \Illuminate\Support\Facades\Storage::disk('public')->exists($old->image_path)) {
                    \Illuminate\Support\Facades\Storage::disk('public')->delete($old->image_path);
                }
                $old->delete();
            }

            return MonitoringSnapshot::create([
                'exam_result_id' => $result->id,
                'user_id' => $user->id,
                'student_id' => $user->id,
                'exam_id' => $exam->id,
                'image_path' => $imagePath,
                'photo_path' => $imagePath,
                'captured_at' => now(),
                'is_violation' => false,
            ]);
        });

        // Broadcast: new snapshot
        app(SocketBroadcastService::class)->examSnapshot($exam->id, [
            'student_id' => $user->id,
            'image_path' => $imagePath,
            'captured_at' => now()->toISOString(),
        ]);

        // Dispatch async AI analysis job (if queue is configured)
        try {
            \App\Jobs\AnalyzeSnapshotJob::dispatch(
                $snapshot->id,
                $exam->id,
                $user->id,
                $result->id,
            );
        } catch (\Exception $e) {
            // Silently ignore if queue not available — AI analysis is optional
            \Illuminate\Support\Facades\Log::debug('[Proctoring] Job dispatch skipped: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'data' => $snapshot,
        ]);
    }

    /**
     * Get exam results (for teacher) - OPTIMIZED
     */
    public function results(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk melihat hasil ujian ini',
            ], 403);
        }

        $examEnded = $exam->end_time && now()->greaterThan($exam->end_time);

        // Auto-submit any in_progress results if exam time has ended
        if ($examEnded) {
            DB::transaction(function () use ($exam) {
                $expiredResults = ExamResult::where('exam_id', $exam->id)
                    ->where('status', 'in_progress')
                    ->lockForUpdate()
                    ->get();

                foreach ($expiredResults as $expiredResult) {
                    $expiredResult->status = 'completed';
                    $expiredResult->finished_at = $exam->end_time;
                    $expiredResult->submitted_at = $exam->end_time;
                    $expiredResult->calculateScore();
                }
            });
        }

        // Get all exam results (refresh after auto-submit)
        $results = ExamResult::with(['student:id,name,nisn,nomor_tes,class_id', 'student.classRoom:id,name'])
            ->where('exam_id', $exam->id)
            ->get();

        // Count essay questions for this exam
        $totalEssayQuestions = Question::where('exam_id', $exam->id)
            ->where('type', 'essay')
            ->count();

        // Get essay grading counts per student (for students who have results)
        $essayGradingByStudent = [];
        if ($totalEssayQuestions > 0) {
            $studentIds = $results->pluck('student_id')->toArray();
            if (!empty($studentIds)) {
                $essayCounts = Answer::where('exam_id', $exam->id)
                    ->whereIn('student_id', $studentIds)
                    ->whereHas('question', function ($q) {
                        $q->where('type', 'essay');
                    })
                    ->selectRaw('student_id, COUNT(*) as total_essays, SUM(CASE WHEN graded_at IS NOT NULL THEN 1 ELSE 0 END) as graded_essays')
                    ->groupBy('student_id')
                    ->get();

                foreach ($essayCounts as $ec) {
                    $essayGradingByStudent[$ec->student_id] = [
                        'total_essays' => (int) $ec->total_essays,
                        'graded_essays' => (int) $ec->graded_essays,
                        'ungraded_essays' => (int) $ec->total_essays - (int) $ec->graded_essays,
                    ];
                }
            }
        }

        // Get all students in the exam's classes who haven't taken the exam
        $studentIdsWithResults = $results->pluck('student_id')->toArray();
        $examClassIds = $exam->classes()->pluck('classes.id')->toArray();
        if (empty($examClassIds)) {
            $examClassIds = [$exam->class_id];
        }
        $allStudents = User::with('classRoom:id,name')
            ->whereIn('class_id', $examClassIds)
            ->where('role', 'siswa')
            ->whereNotIn('id', $studentIdsWithResults)
            ->select('id', 'name', 'nisn', 'nomor_tes', 'class_id')
            ->get();

        // Build combined list: results + students who haven't started
        $allEntries = [];

        foreach ($results as $r) {
            $entry = $r->toArray();
            // Attach essay grading info
            $studentEssay = $essayGradingByStudent[$r->student_id] ?? null;
            $entry['total_essays'] = $studentEssay ? $studentEssay['total_essays'] : 0;
            $entry['graded_essays'] = $studentEssay ? $studentEssay['graded_essays'] : 0;
            $entry['ungraded_essays'] = $studentEssay ? $studentEssay['ungraded_essays'] : 0;
            $allEntries[] = $entry;
        }

        // Determine status for students who never started
        $notStartedStatus = $examEnded ? 'missed' : 'not_started';

        foreach ($allStudents as $student) {
            $allEntries[] = [
                'id' => null,
                'student_id' => $student->id,
                'exam_id' => $exam->id,
                'status' => $notStartedStatus,
                'total_score' => 0,
                'max_score' => 0,
                'percentage' => 0,
                'score' => null,
                'total_correct' => 0,
                'total_wrong' => 0,
                'total_answered' => 0,
                'violation_count' => 0,
                'started_at' => null,
                'finished_at' => null,
                'submitted_at' => null,
                'total_essays' => 0,
                'graded_essays' => 0,
                'ungraded_essays' => 0,
                'student' => [
                    'id' => $student->id,
                    'name' => $student->name,
                    'nisn' => $student->nisn,
                    'nomor_tes' => $student->nomor_tes,
                    'class_id' => $student->class_id,
                    'class_room' => $student->classRoom ? ['id' => $student->classRoom->id, 'name' => $student->classRoom->name] : null,
                ],
            ];
        }

        $allEntries = collect($allEntries)
            ->sortBy(fn (array $entry) => NomorTes::sortKey(
                $entry['student']['nomor_tes'] ?? null,
                $entry['student']['name'] ?? null
            ))
            ->values()
            ->all();

        // Calculate summary
        $finished = $results->whereIn('status', ['completed', 'graded', 'submitted']);
        $inProgress = $results->where('status', 'in_progress');
        $missedCount = $notStartedStatus === 'missed' ? $allStudents->count() : 0;
        $notStartedCount = $notStartedStatus === 'not_started' ? $allStudents->count() : 0;

        // Calculate total ungraded essays across all students
        $totalUngradedEssays = 0;
        $totalStudentsWithUngraded = 0;
        foreach ($essayGradingByStudent as $eg) {
            if ($eg['ungraded_essays'] > 0) {
                $totalUngradedEssays += $eg['ungraded_essays'];
                $totalStudentsWithUngraded++;
            }
        }

        $summary = [
            'total_students' => count($allEntries),
            'completed' => $finished->count(),
            'in_progress' => $inProgress->count(),
            'not_started' => $notStartedCount,
            'missed' => $missedCount,
            'average_score' => $finished->count() > 0 ? $finished->avg('percentage') : null,
            'highest_score' => $finished->count() > 0 ? $finished->max('percentage') : null,
            'lowest_score' => $finished->count() > 0 ? $finished->min('percentage') : null,
            'passed' => $results->where('percentage', '>=', $exam->passing_score)->count(),
            'total_essay_questions' => $totalEssayQuestions,
            'total_ungraded_essays' => $totalUngradedEssays,
            'students_with_ungraded' => $totalStudentsWithUngraded,
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'exam' => [
                    'id' => $exam->id,
                    'title' => $exam->title,
                    'subject' => $exam->subject,
                    'passing_score' => $exam->passing_score,
                    'end_time' => $exam->end_time,
                ],
                'results' => $allEntries,
                'summary' => $summary,
            ],
        ]);
    }

    /**
     * Get student result detail (for teacher) - OPTIMIZED
     */
    public function studentResult(Request $request, Exam $exam, $studentId)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk melihat hasil ujian ini',
            ], 403);
        }

        $result = ExamResult::with(['student:id,name,nisn', 'violations:id,exam_result_id,type,description,recorded_at'])
            ->where('exam_id', $exam->id)
            ->where('student_id', $studentId)
            ->first();

        if (!$result) {
            return response()->json([
                'success' => false,
                'message' => 'Hasil ujian tidak ditemukan',
            ], 404);
        }

        $answers = Answer::with('question:id,question_text,type,correct_answer,points,options,essay_keywords,passage')
            ->where('exam_id', $exam->id)
            ->where('student_id', $studentId)
            ->get(['id', 'question_id', 'answer', 'work_photo', 'is_correct', 'score', 'feedback', 'graded_by', 'graded_at', 'submitted_at']);

        // Snapshots only visible to admin (not guru) to save privacy/storage
        $snapshots = [];
        if ($user->role === 'admin') {
            $snapshots = MonitoringSnapshot::where('exam_id', $exam->id)
                ->where('student_id', $studentId)
                ->where('is_violation', true)
                ->orderBy('captured_at')
                ->get(['id', 'image_path', 'captured_at']);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'result' => $result,
                'answers' => $answers,
                'snapshots' => $snapshots,
            ],
        ]);
    }

    /**
     * Grade an essay answer (for teacher)
     */
    public function gradeAnswer(Request $request, Exam $exam, $answerId)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menilai ujian ini',
            ], 403);
        }

        $request->validate([
            'score' => 'required|numeric|min:0',
            'feedback' => 'nullable|string|max:1000',
        ]);

        $answer = Answer::where('id', $answerId)
            ->where('exam_id', $exam->id)
            ->first();

        if (!$answer) {
            return response()->json([
                'success' => false,
                'message' => 'Jawaban tidak ditemukan',
            ], 404);
        }

        $question = $answer->question;

        // Warn if overriding auto-graded essay (but allow it)
        $wasAutoGraded = $question->type === 'essay' && !empty($question->essay_keywords) && $answer->graded_by === null;
        
        // Cap score to question points
        $score = min($request->score, $question->points);

        $answer->score = $score;
        $answer->is_correct = $score > 0;
        $answer->feedback = $request->feedback;
        $answer->graded_by = $user->id;
        $answer->graded_at = now();
        $answer->save();

        // Recalculate exam result
        $examResult = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $answer->student_id)
            ->first();

        if ($examResult) {
            $examResult->calculateScore();
            
            // Check if all essays are graded
            $ungradedEssays = Answer::where('exam_id', $exam->id)
                ->where('student_id', $answer->student_id)
                ->whereHas('question', function ($q) {
                    $q->where('type', 'essay');
                })
                ->whereNull('graded_at')
                ->count();
            
            if ($ungradedEssays === 0 && in_array($examResult->status, ['completed', 'submitted'], true)) {
                $examResult->status = 'graded';
                $examResult->save();
            }
        }

        // Broadcast answer graded
        try {
            $broadcast = app(\App\Services\SocketBroadcastService::class);
            $broadcast->answerGraded($exam->id, [
                'answer_id' => $answer->id,
                'question_id' => $answer->question_id,
                'student_id' => $answer->student_id,
                'score' => $score,
                'feedback' => $request->feedback,
                'graded_by' => $user->id,
                'graded_by_name' => $user->name,
                'exam_result' => $examResult ? [
                    'id' => $examResult->id,
                    'total_score' => $examResult->total_score,
                    'percentage' => $examResult->percentage,
                    'status' => $examResult->status,
                ] : null,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast answerGraded failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'data' => [
                'answer' => $answer,
                'exam_result' => $examResult,
                'auto_grade_overridden' => $wasAutoGraded,
            ],
            'message' => $wasAutoGraded 
                ? 'Nilai auto-grade berhasil diubah manual' 
                : 'Nilai berhasil disimpan',
        ]);
    }

    /**
     * Get live monitoring data - OPTIMIZED
     * Includes all students in class: not_started, in_progress, and completed
     */
    public function monitoring(Request $request, Exam $exam)
    {
        $user = $request->user();

        // Ownership check
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk memonitor ujian ini',
            ], 403);
        }

        // Load exam with class info
        $exam->load(['class', 'classes:id,name']);
        
        // Get all students in the exam's classes
        $examClassIds = $exam->classes()->pluck('classes.id')->toArray();
        if (empty($examClassIds)) {
            $examClassIds = [$exam->class_id];
        }
        $allStudents = User::where('role', 'siswa')
            ->whereIn('class_id', $examClassIds)
            ->select('id', 'name', 'nisn', 'nomor_tes')
            ->get();

        // Get all exam results
        $results = ExamResult::where('exam_id', $exam->id)
            ->get()
            ->keyBy('student_id');

        // Batch load latest snapshots — use SQL subquery for reliability
        $resultIds = $results->pluck('id');
        $latestSnapshotIds = MonitoringSnapshot::whereIn('exam_result_id', $resultIds)
            ->selectRaw('MAX(id) as id')
            ->groupBy('exam_result_id')
            ->pluck('id');
        $latestSnapshots = MonitoringSnapshot::whereIn('id', $latestSnapshotIds)
            ->get()
            ->keyBy('exam_result_id');

        // Batch load answer counts
        $studentIds = $results->pluck('student_id');
        $answerCounts = Answer::where('exam_id', $exam->id)
            ->whereIn('student_id', $studentIds)
            ->selectRaw('student_id, COUNT(*) as count')
            ->groupBy('student_id')
            ->pluck('count', 'student_id');

        $monitoringData = $allStudents->map(function ($student) use ($results, $latestSnapshots, $answerCounts, $exam) {
            $result = $results->get($student->id);
            
            if (!$result) {
                // Student hasn't started yet
                return [
                    'student' => $student,
                    'result_id' => null,
                    'status' => 'not_started',
                    'started_at' => null,
                    'finished_at' => null,
                    'violation_count' => 0,
                    'answered_count' => 0,
                    'total_questions' => $exam->total_questions,
                    'score' => null,
                    'latest_snapshot' => null,
                ];
            }
            
            return [
                'student' => $student,
                'result_id' => $result->id,
                'status' => $result->status,
                'started_at' => $result->started_at,
                'finished_at' => $result->finished_at,
                'violation_count' => $result->violation_count,
                'answered_count' => $answerCounts[$student->id] ?? 0,
                'total_questions' => $exam->total_questions,
                'score' => $result->status === 'completed' ? $result->percentage : null,
                'latest_snapshot' => $latestSnapshots[$result->id] ?? null,
            ];
        });

        // Summary stats
        $summary = [
            'total_students' => $allStudents->count(),
            'not_started' => $monitoringData->where('status', 'not_started')->count(),
            'in_progress' => $monitoringData->where('status', 'in_progress')->count(),
            'completed' => $monitoringData->where('status', 'completed')->count(),
            'total_violations' => $monitoringData->sum('violation_count'),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'exam' => [
                    'id' => $exam->id,
                    'title' => $exam->title,
                    'duration' => $exam->duration,
                    'total_questions' => $exam->total_questions,
                    'start_time' => $exam->start_time,
                    'end_time' => $exam->end_time,
                ],
                'participants' => $monitoringData,
                'summary' => $summary,
            ],
        ]);
    }

    /**
     * Admin/teacher manually ends an exam — sets status to completed, 
     * forces all in-progress students to finish, and sets end_time to now.
     */
    public function endExam(Request $request, Exam $exam)
    {
        $user = $request->user();

        if (!in_array($user->role, ['admin', 'guru'])) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya admin/guru yang dapat menyelesaikan ujian',
            ], 403);
        }

        // Teachers can only end their own exams
        if ($user->role === 'guru' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke ujian ini',
            ], 403);
        }

        // Only active/scheduled exams can be ended
        if ($exam->status === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Ujian sudah selesai',
            ], 422);
        }

        if ($exam->status === 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Ujian masih draft, tidak bisa diselesaikan',
            ], 422);
        }

        // Force-finish all in-progress results in a transaction
        $forceFinishedCount = DB::transaction(function () use ($exam) {
            $inProgressResults = ExamResult::where('exam_id', $exam->id)
                ->where('status', 'in_progress')
                ->lockForUpdate()
                ->get();

            $count = 0;
            foreach ($inProgressResults as $result) {
                $result->finished_at = now();
                $result->submitted_at = now();
                $result->status = 'completed';
                $result->calculateScore();
                $count++;

                // Broadcast: student submitted (so monitoring page updates)
                app(SocketBroadcastService::class)->examStudentSubmitted($exam->id, [
                    'student_id' => $result->student_id,
                    'student_name' => $result->student->name ?? 'Unknown',
                    'score' => $result->percentage,
                    'force_ended' => true,
                ]);
            }

            // Update exam status and end_time
            $exam->status = 'completed';
            $exam->end_time = now();
            $exam->save();

            return $count;
        });

        // Broadcast exam ended event so student browsers know to stop
        app(SocketBroadcastService::class)->examEnded($exam->id, [
            'exam_id' => $exam->id,
            'message' => 'Ujian telah diselesaikan oleh admin',
            'force_finished_count' => $forceFinishedCount,
        ]);

        // Get final summary
        $allResults = ExamResult::where('exam_id', $exam->id)->get();
        $completed = $allResults->whereIn('status', ['completed', 'graded', 'submitted']);

        return response()->json([
            'success' => true,
            'message' => "Ujian berhasil diselesaikan. {$forceFinishedCount} siswa yang masih mengerjakan telah di-submit otomatis.",
            'data' => [
                'force_finished_count' => $forceFinishedCount,
                'total_completed' => $completed->count(),
                'average_score' => $completed->count() > 0 ? round($completed->avg('percentage'), 1) : null,
            ],
        ]);
    }

    /**
     * Reactivate exam result for student to retry (when ended due to violation)
     */
    public function reactivateResult(Request $request, ExamResult $result)
    {
        $user = $request->user();

        // Only admin can reactivate
        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya admin yang dapat mengaktifkan kembali hasil ujian',
            ], 403);
        }

        $request->validate([
            'reason' => 'nullable|string|max:500',
        ]);

        // Can only reactivate if result is completed AND has violations
        if ($result->status !== 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya hasil ujian dengan status selesai yang dapat diaktifkan kembali',
            ], 422);
        }

        if ($result->violation_count <= 0) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya hasil ujian yang berakhir karena pelanggaran yang dapat direaktivasikan',
            ], 422);
        }

        if (!in_array($result->exam->status, ['scheduled', 'active'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Ujian tidak aktif/terjadwal, siswa tidak dapat diaktifkan kembali',
            ], 422);
        }

        // Reactivate in transaction
        DB::transaction(function () use ($result, $user, $request) {
            // Reset result status to in_progress
            $oldStatus = $result->status;
            $oldViolationCount = $result->violation_count;
            
            $result->status = 'in_progress';
            $result->submitted_at = null;
            $result->finished_at = null;
            $result->total_score = 0;
            $result->max_score = 0;
            $result->percentage = 0;
            $result->reactivation_count = ($result->reactivation_count ?? 0) + 1;
            $result->reactivated_by = $user->id;
            $result->reactivated_at = now();
            $result->reactivation_reason = $request->reason;
            $result->save();

            // Clear all violations for this result
            Violation::where('exam_result_id', $result->id)->delete();
            $result->violation_count = 0;
            $result->save();

            // Clear all answers to let student retry fresh
            Answer::where('exam_id', $result->exam_id)
                ->where('student_id', $result->student_id)
                ->delete();

            // Log to audit trail
            AuditLog::create([
                'user_id' => $user->id,
                'action' => 'exam.result.reactivate',
                'description' => 'Mengaktifkan kembali hasil ujian siswa: ' . $result->student->name . ' (Ujian: ' . $result->exam->title . ')' 
                    . ($request->reason ? ' (Alasan: ' . $request->reason . ')' : ''),
                'target_type' => 'ExamResult',
                'target_id' => $result->id,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'old_values' => [
                    'status' => $oldStatus,
                    'violation_count' => $oldViolationCount,
                ],
                'new_values' => [
                    'status' => 'in_progress',
                    'violation_count' => 0,
                    'reason' => $request->reason,
                ],
            ]);
        });

        // Broadcast to student that they can retry exam
        try {
            $broadcast = app(SocketBroadcastService::class);
            $broadcast->examStudentReactivated($result->exam_id, [
                'exam_id' => $result->exam_id,
                'student_id' => $result->student_id,
                'student_name' => $result->student->name,
                'message' => 'Ujian Anda telah diaktifkan kembali oleh admin. Silakan coba lagi.',
                'reason' => $request->reason,
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast examStudentReactivated failed: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Hasil ujian siswa berhasil diaktifkan kembali. Siswa dapat mengerjakan ujian lagi.',
            'data' => [
                'student_id' => $result->student_id,
                'exam_id' => $result->exam_id,
                'reactivation_count' => $result->reactivation_count,
            ],
        ]);
    }
}
