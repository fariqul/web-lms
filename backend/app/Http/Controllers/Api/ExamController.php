<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Answer;
use App\Models\ExamResult;
use App\Models\Violation;
use App\Models\MonitoringSnapshot;
use App\Models\User;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Carbon\Carbon;

class ExamController extends Controller
{
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
        $query = Exam::with(['teacher:id,name', 'class:id,name', 'classes:id,name']);

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
                // Flatten SEB config for frontend
                if ($exam->seb_required && is_array($exam->seb_config)) {
                    $exam->seb_allow_quit = $exam->seb_config['allow_quit'] ?? true;
                    $exam->seb_quit_password = $exam->seb_config['quit_password'] ?? '';
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
        $exam->load(['teacher:id,name', 'class:id,name', 'classes:id,name']);

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

        // For teacher: include all questions with answers
        if ($user->role === 'guru' || $user->role === 'admin') {
            $exam->load(['questions' => fn($q) => $q->orderBy('order')]);
            
            // Transform questions to include formatted options
            if ($exam->questions) {
                $exam->questions->transform(function ($question) {
                    // Convert options array to structured format for frontend
                    if ($question->type === 'multiple_choice' && is_array($question->options)) {
                        $question->options = collect($question->options)->map(function ($opt, $idx) use ($question) {
                            // Handle both old format (string) and new format (object with text+image)
                            if (is_string($opt)) {
                                return [
                                    'id' => $idx + 1,
                                    'option_text' => $opt,
                                    'is_correct' => $opt === $question->correct_answer,
                                    'image' => null,
                                ];
                            }
                            return [
                                'id' => $idx + 1,
                                'option_text' => $opt['text'] ?? '',
                                'is_correct' => ($opt['text'] ?? '') === $question->correct_answer,
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
            $exam->seb_quit_password = $exam->seb_config['quit_password'] ?? '';
            $exam->seb_block_screen_capture = $exam->seb_config['block_screen_capture'] ?? true;
            $exam->seb_allow_virtual_machine = $exam->seb_config['allow_virtual_machine'] ?? false;
            $exam->seb_show_taskbar = $exam->seb_config['show_taskbar'] ?? true;
        }

        return response()->json([
            'success' => true,
            'data' => $exam,
        ]);
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
            'end_time' => 'sometimes|date',
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

        $exam->questions()->delete();
        $exam->delete();

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

        $exam->status = 'scheduled';
        $exam->save();

        return response()->json([
            'success' => true,
            'message' => 'Ujian berhasil dipublish',
        ]);
    }

    /**
     * Add question to exam
     */
    public function addQuestion(Request $request, Exam $exam)
    {
        $request->validate([
            'question_text' => 'required|string',
            'question_type' => 'required|in:multiple_choice,essay',
            'passage' => 'nullable|string',
            'options' => 'required_if:question_type,multiple_choice|array',
            'options.*.option_text' => 'nullable|string',
            'options.*.is_correct' => 'required_if:question_type,multiple_choice|boolean',
            'options.*.image' => 'nullable|image|max:5120', // option image max 5MB
            'options.*.image_path' => 'nullable|string', // existing image path to copy
            'points' => 'nullable|integer|min:1',
            'image' => 'nullable|image|max:5120', // max 5MB
            'image_path' => 'nullable|string', // existing question image path to copy
        ]);

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
        
        if ($request->question_type === 'multiple_choice' && $request->options) {
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
                    $correctAnswer = $optText;
                }
            }
        }

        $question = Question::create([
            'exam_id' => $exam->id,
            'passage' => $request->passage,
            'question_text' => $request->question_text,
            'type' => $request->question_type,
            'image' => $imagePath,
            'options' => $optionsArray,
            'correct_answer' => $correctAnswer,
            'points' => $request->points ?? 10,
            'order' => ($exam->questions()->max('order') ?? 0) + 1,
        ]);

        // Update exam total_questions count
        $exam->total_questions = $exam->questions()->count();
        $exam->save();

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
        // Check ownership - only exam creator can update questions
        $exam = $question->exam;
        $user = $request->user();
        
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk mengubah soal ini',
            ], 403);
        }
        
        $request->validate([
            'question_text' => 'sometimes|string',
            'question_type' => 'sometimes|in:multiple_choice,essay',
            'options' => 'sometimes|array',
            'correct_answer' => 'sometimes|string',
            'points' => 'sometimes|integer|min:1',
            'image' => 'nullable|image|max:5120',
        ]);

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
                    $correctAnswer = $optText;
                }
            }
            
            $question->options = $optionsArray;
            if ($correctAnswer) {
                $question->correct_answer = $correctAnswer;
            }
        }

        // Handle direct correct_answer
        if ($request->has('correct_answer') && !$request->has('options')) {
            $question->correct_answer = $request->correct_answer;
        }

        $question->save();

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
        // Check ownership - only exam creator can delete questions
        $exam = $question->exam;
        $user = $request->user();
        
        if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses untuk menghapus soal ini',
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

        // Check existing result
        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->first();

        if ($result && $result->status === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Anda sudah menyelesaikan ujian ini',
            ], 422);
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

        // Get questions (shuffled if enabled)
        $questions = $exam->questions();
        if ($exam->shuffle_questions) {
            $questions = $questions->inRandomOrder();
        } else {
            $questions = $questions->orderBy('order');
        }
        $questions = $questions->get();

        // Shuffle options if enabled
        if ($exam->shuffle_options) {
            $questions->transform(function ($q) {
                if ($q->type === 'multiple_choice' && is_array($q->options)) {
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
            if ($q->type === 'multiple_choice' && is_array($q->options)) {
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

        // Remove correct answer from response
        $questions->makeHidden('correct_answer');

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
                'questions' => $questions,
                'existing_answers' => $existingAnswers,
                'remaining_time' => max(0, now()->diffInSeconds($exam->start_time->addMinutes($exam->duration), false)),
            ],
        ]);
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

        // Check if answer is correct (only auto-grade multiple choice)
        $isCorrect = null;
        $answerScore = 0;
        
        if ($question->type === 'multiple_choice') {
            $isCorrect = strtolower(trim($request->answer)) === strtolower(trim($question->correct_answer));
            $answerScore = $isCorrect ? $question->points : 0;
        }
        // Essay questions: leave is_correct=null and score=null for manual grading

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
                'score' => $question->type === 'essay' ? null : $answerScore,
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
     * Finish exam
     */
    public function finishExam(Request $request, Exam $exam)
    {
        $user = $request->user();

        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
            ->where('status', 'in_progress')
            ->first();

        // If not in_progress, check if already completed (admin ended exam first)
        if (!$result) {
            $alreadyCompleted = ExamResult::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->whereIn('status', ['completed', 'graded', 'submitted'])
                ->first();

            if ($alreadyCompleted) {
                // Already submitted (likely by admin force-finish) — return success
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

                return response()->json($response);
            }

            return response()->json([
                'success' => false,
                'message' => 'Sesi ujian tidak ditemukan',
            ], 422);
        }

        // Calculate score
        $result->finished_at = now();
        $result->submitted_at = now();
        $result->status = 'completed';
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

        // Include result if show_result is enabled
        if ($exam->show_result) {
            $response['data'] = [
                'score' => $result->score,
                'total_correct' => $result->total_correct,
                'total_wrong' => $result->total_wrong,
                'total_questions' => $exam->questions()->count(),
                'passed' => $result->score >= $exam->passing_score,
            ];
        }

        return response()->json($response);
    }

    /**
     * Report violation
     */
    public function reportViolation(Request $request, Exam $exam)
    {
        $request->validate([
            'type' => 'required|string',
            'description' => 'nullable|string',
            'screenshot' => 'nullable|image|max:2048',
        ]);

        $user = $request->user();

        $result = ExamResult::where('exam_id', $exam->id)
            ->where('student_id', $user->id)
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

        if ($lastSnapshot && $lastSnapshot->captured_at && now()->diffInSeconds($lastSnapshot->captured_at) < 3) {
            return response()->json([
                'success' => true,
                'message' => 'Rate limited — too frequent',
                'data' => $lastSnapshot,
            ]);
        }

        $imagePath = $request->file('image')->store('monitoring-snapshots', 'public');

        $snapshot = MonitoringSnapshot::create([
            'exam_result_id' => $result->id,
            'user_id' => $user->id,
            'student_id' => $user->id,
            'exam_id' => $exam->id,
            'image_path' => $imagePath,
            'captured_at' => now(),
        ]);

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
            $expiredResults = ExamResult::where('exam_id', $exam->id)
                ->where('status', 'in_progress')
                ->get();

            foreach ($expiredResults as $expiredResult) {
                $expiredResult->status = 'completed';
                $expiredResult->finished_at = $exam->end_time;
                $expiredResult->submitted_at = $exam->end_time;
                $expiredResult->calculateScore();
            }
        }

        // Get all exam results (refresh after auto-submit)
        $results = ExamResult::with(['student:id,name,nisn'])
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
        $allStudents = User::whereIn('class_id', $examClassIds)
            ->where('role', 'siswa')
            ->whereNotIn('id', $studentIdsWithResults)
            ->select('id', 'name', 'nisn')
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
                ],
            ];
        }

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

        $answers = Answer::with('question:id,question_text,type,correct_answer,points,options')
            ->where('exam_id', $exam->id)
            ->where('student_id', $studentId)
            ->get(['id', 'question_id', 'answer', 'is_correct', 'score', 'feedback', 'graded_by', 'graded_at', 'submitted_at']);

        $snapshots = MonitoringSnapshot::where('exam_id', $exam->id)
            ->where('student_id', $studentId)
            ->orderBy('captured_at')
            ->get(['id', 'image_path', 'captured_at']);

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
            
            if ($ungradedEssays === 0 && $examResult->status === 'completed') {
                $examResult->status = 'graded';
                $examResult->save();
            }
        }

        return response()->json([
            'success' => true,
            'data' => [
                'answer' => $answer,
                'exam_result' => $examResult,
            ],
            'message' => 'Nilai berhasil disimpan',
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
            ->select('id', 'name', 'nisn')
            ->get();

        // Get all exam results
        $results = ExamResult::where('exam_id', $exam->id)
            ->get()
            ->keyBy('student_id');

        // Batch load latest snapshots
        $resultIds = $results->pluck('id');
        $latestSnapshots = MonitoringSnapshot::whereIn('exam_result_id', $resultIds)
            ->orderBy('captured_at', 'desc')
            ->get()
            ->unique('exam_result_id')
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

        // Force-finish all in-progress results
        $inProgressResults = ExamResult::where('exam_id', $exam->id)
            ->where('status', 'in_progress')
            ->get();

        $forceFinishedCount = 0;
        foreach ($inProgressResults as $result) {
            $result->finished_at = now();
            $result->submitted_at = now();
            $result->status = 'completed';
            $result->calculateScore();
            $forceFinishedCount++;

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
}
