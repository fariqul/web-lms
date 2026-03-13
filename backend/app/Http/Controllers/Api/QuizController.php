<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Answer;
use App\Models\ExamResult;
use App\Models\User;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class QuizController extends Controller
{
    /**
     * List quizzes - teacher sees own, student sees class quizzes
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Exam::where('type', 'quiz')
            ->with(['teacher:id,name', 'class:id,name', 'classes:id,name']);

        if ($user->role === 'guru') {
            $query->where('teacher_id', $user->id);
        } elseif ($user->role === 'siswa') {
            $query->where(function ($q) use ($user) {
                $q->where('class_id', $user->class_id)
                  ->orWhereHas('classes', fn($cq) => $cq->where('classes.id', $user->class_id));
            });
            if (!$request->has('status')) {
                $query->whereIn('status', ['scheduled', 'active', 'completed']);
            }
        } elseif ($user->role === 'admin') {
            // Admin sees all quizzes
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $quizzes = $query->orderBy('created_at', 'desc')->paginate(min($request->per_page ?? 20, 100));

        // For students, add their result status
        if ($user->role === 'siswa') {
            $quizIds = $quizzes->pluck('id');
            $myResults = ExamResult::where('student_id', $user->id)
                ->whereIn('exam_id', $quizIds)
                ->get(['id', 'exam_id', 'status', 'total_score', 'max_score', 'percentage', 'submitted_at', 'finished_at'])
                ->keyBy('exam_id');

            $quizzes->getCollection()->transform(function ($quiz) use ($myResults) {
                $quiz->my_result = $myResults[$quiz->id] ?? null;
                return $quiz;
            });
        }

        return response()->json([
            'success' => true,
            'data' => $quizzes,
        ]);
    }

    /**
     * Show quiz detail
     */
    public function show(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();

        // Teacher/admin: show with questions
        if ($user->role === 'guru' || $user->role === 'admin') {
            if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
            $quiz->load(['questions' => fn($q) => $q->orderBy('order'), 'classes:id,name', 'teacher:id,name']);
            return response()->json(['success' => true, 'data' => $quiz]);
        }

        // Student: show without questions (must start first)
        $quiz->load('classes:id,name');
        $result = ExamResult::where('exam_id', $quiz->id)->where('student_id', $user->id)->first();
        $quiz->my_result = $result;

        return response()->json(['success' => true, 'data' => $quiz]);
    }

    /**
     * Create quiz
     */
    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'required|string|max:255',
            'duration_minutes' => 'required|integer|min:1',
            'class_ids' => 'required|array|min:1',
            'class_ids.*' => 'exists:classes,id',
            'show_result' => 'nullable|boolean',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'shuffle_questions' => 'nullable|boolean',
            'shuffle_options' => 'nullable|boolean',
        ]);

        $quiz = Exam::create([
            'type' => 'quiz',
            'title' => $request->title,
            'description' => $request->description,
            'class_id' => $request->class_ids[0],
            'teacher_id' => $request->user()->id,
            'subject' => $request->subject,
            'duration' => $request->duration_minutes,
            'start_time' => now(),
            'end_time' => now()->addYear(), // Quiz doesn't have strict time window
            'status' => 'draft',
            'show_result' => $request->show_result ?? true,
            'passing_score' => $request->passing_score ?? 0,
            'shuffle_questions' => $request->shuffle_questions ?? false,
            'shuffle_options' => $request->shuffle_options ?? false,
            'max_violations' => 999, // No anti-cheat for quiz
        ]);

        $quiz->classes()->sync($request->class_ids);
        $quiz->load('classes:id,name');

        return response()->json([
            'success' => true,
            'data' => $quiz,
            'message' => 'Quiz berhasil dibuat',
        ], 201);
    }

    /**
     * Update quiz
     */
    public function update(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'sometimes|string|max:255',
            'duration_minutes' => 'sometimes|integer|min:1',
            'class_ids' => 'sometimes|array|min:1',
            'class_ids.*' => 'exists:classes,id',
            'show_result' => 'nullable|boolean',
            'passing_score' => 'nullable|integer|min:0|max:100',
            'shuffle_questions' => 'nullable|boolean',
            'shuffle_options' => 'nullable|boolean',
        ]);

        $quiz->update([
            'title' => $request->title ?? $quiz->title,
            'description' => $request->description ?? $quiz->description,
            'subject' => $request->subject ?? $quiz->subject,
            'duration' => $request->duration_minutes ?? $quiz->duration,
            'show_result' => $request->show_result ?? $quiz->show_result,
            'passing_score' => $request->passing_score ?? $quiz->passing_score,
            'shuffle_questions' => $request->shuffle_questions ?? $quiz->shuffle_questions,
            'shuffle_options' => $request->shuffle_options ?? $quiz->shuffle_options,
        ]);

        if ($request->has('class_ids')) {
            $quiz->class_id = $request->class_ids[0];
            $quiz->save();
            $quiz->classes()->sync($request->class_ids);
        }

        $quiz->load('classes:id,name');

        return response()->json([
            'success' => true,
            'data' => $quiz,
            'message' => 'Quiz berhasil diperbarui',
        ]);
    }

    /**
     * Delete quiz
     */
    public function destroy(Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = request()->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Check if quiz has results
        if ($quiz->results()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'Quiz yang sudah memiliki hasil tidak dapat dihapus',
            ], 422);
        }

        $quiz->questions()->delete();
        $quiz->classes()->detach();
        $quiz->delete();

        return response()->json([
            'success' => true,
            'message' => 'Quiz berhasil dihapus',
        ]);
    }

    /**
     * Publish quiz - teacher can publish directly
     */
    public function publish(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($quiz->questions()->count() === 0) {
            return response()->json([
                'success' => false,
                'message' => 'Quiz harus memiliki minimal 1 soal',
            ], 422);
        }

        if ($quiz->status === 'draft') {
            $quiz->status = 'active';
            $quiz->start_time = now();
            $quiz->end_time = now()->addYear();
            $quiz->save();

            return response()->json([
                'success' => true,
                'message' => 'Quiz berhasil dipublish dan aktif',
                'data' => $quiz,
            ]);
        }

        // Toggle: active → draft (unpublish)
        if ($quiz->status === 'active' || $quiz->status === 'scheduled') {
            $quiz->status = 'draft';
            $quiz->save();

            return response()->json([
                'success' => true,
                'message' => 'Quiz dikembalikan ke draft',
                'data' => $quiz,
            ]);
        }

        return response()->json([
            'success' => false,
            'message' => 'Quiz berstatus ' . $quiz->status . ' tidak dapat diubah',
        ], 422);
    }

    /**
     * End quiz - mark as completed
     */
    public function endQuiz(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        // Auto-submit in-progress results
        DB::transaction(function () use ($quiz) {
            $inProgress = ExamResult::where('exam_id', $quiz->id)
                ->where('status', 'in_progress')
                ->lockForUpdate()
                ->get();

            foreach ($inProgress as $result) {
                $result->status = 'completed';
                $result->finished_at = now();
                $result->submitted_at = now();
                $result->calculateScore();
            }
        });

        $quiz->status = 'completed';
        $quiz->end_time = now();
        $quiz->save();

        return response()->json([
            'success' => true,
            'message' => 'Quiz telah diakhiri',
        ]);
    }

    /**
     * Add question to quiz
     */
    public function addQuestion(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'question_text' => 'required|string',
            'question_type' => 'required|in:multiple_choice,multiple_answer,essay',
            'passage' => 'nullable|string',
            'options' => 'required_if:question_type,multiple_choice|required_if:question_type,multiple_answer|array',
            'options.*.option_text' => 'nullable|string',
            'options.*.is_correct' => 'required_if:question_type,multiple_choice|required_if:question_type,multiple_answer|boolean',
            'options.*.image' => 'nullable|image|max:5120',
            'options.*.image_path' => 'nullable|string',
            'points' => 'nullable|integer|min:1',
            'image' => 'nullable|image|max:5120',
            'image_path' => 'nullable|string',
            'essay_keywords' => 'nullable|array',
            'essay_keywords.*' => 'string',
        ]);

        // Handle image upload
        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('question-images', 'public');
        } elseif ($request->image_path && Storage::disk('public')->exists($request->image_path)) {
            $ext = pathinfo($request->image_path, PATHINFO_EXTENSION);
            $newPath = 'question-images/' . uniqid() . '.' . $ext;
            Storage::disk('public')->copy($request->image_path, $newPath);
            $imagePath = $newPath;
        }

        // Process options
        $optionsArray = [];
        $correctAnswer = '';
        $correctAnswers = [];

        if (in_array($request->question_type, ['multiple_choice', 'multiple_answer']) && $request->options) {
            foreach ($request->options as $idx => $opt) {
                $optImage = null;
                if ($request->hasFile("options.{$idx}.image")) {
                    $optImage = $request->file("options.{$idx}.image")->store('option-images', 'public');
                } elseif (!empty($opt['image_path']) && Storage::disk('public')->exists($opt['image_path'])) {
                    $ext = pathinfo($opt['image_path'], PATHINFO_EXTENSION);
                    $newOptPath = 'option-images/' . uniqid() . '.' . $ext;
                    Storage::disk('public')->copy($opt['image_path'], $newOptPath);
                    $optImage = $newOptPath;
                }
                $optText = $opt['option_text'] ?? '';
                if (empty(trim($optText)) && $optImage) {
                    $optText = '[Gambar ' . chr(65 + $idx) . ']';
                }
                $optionsArray[] = [
                    'text' => $optText,
                    'image' => $optImage,
                ];
                if ($opt['is_correct'] ?? false) {
                    $correctAnswers[] = $optText;
                    $correctAnswer = $optText;
                }
            }
        }

        if ($request->question_type === 'multiple_answer') {
            $correctAnswer = json_encode($correctAnswers);
        }

        $question = Question::create([
            'exam_id' => $quiz->id,
            'passage' => $request->passage,
            'question_text' => $request->question_text,
            'type' => $request->question_type,
            'image' => $imagePath,
            'options' => $optionsArray,
            'correct_answer' => $correctAnswer,
            'essay_keywords' => $request->question_type === 'essay' ? $request->essay_keywords : null,
            'points' => $request->points ?? 10,
            'order' => ($quiz->questions()->max('order') ?? 0) + 1,
        ]);

        $quiz->total_questions = $quiz->questions()->count();
        $quiz->save();

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
        $quiz = $question->exam;
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'question_text' => 'sometimes|string',
            'question_type' => 'sometimes|in:multiple_choice,multiple_answer,essay',
            'passage' => 'nullable|string',
            'options' => 'sometimes|array',
            'options.*.option_text' => 'nullable|string',
            'options.*.is_correct' => 'sometimes|boolean',
            'options.*.image' => 'nullable|image|max:5120',
            'options.*.image_path' => 'nullable|string',
            'points' => 'nullable|integer|min:1',
            'image' => 'nullable|image|max:5120',
            'image_path' => 'nullable|string',
            'essay_keywords' => 'nullable|array',
            'essay_keywords.*' => 'string',
        ]);

        $imagePath = $question->image;
        if ($request->hasFile('image')) {
            if ($question->image) Storage::disk('public')->delete($question->image);
            $imagePath = $request->file('image')->store('question-images', 'public');
        } elseif ($request->image_path && Storage::disk('public')->exists($request->image_path)) {
            $ext = pathinfo($request->image_path, PATHINFO_EXTENSION);
            $newPath = 'question-images/' . uniqid() . '.' . $ext;
            Storage::disk('public')->copy($request->image_path, $newPath);
            $imagePath = $newPath;
        }

        $type = $request->question_type ?? $question->type;
        $optionsArray = $question->options;
        $correctAnswer = $question->correct_answer;

        if ($request->has('options') && in_array($type, ['multiple_choice', 'multiple_answer'])) {
            $optionsArray = [];
            $correctAnswers = [];
            $correctAnswer = '';

            foreach ($request->options as $idx => $opt) {
                $optImage = null;
                if ($request->hasFile("options.{$idx}.image")) {
                    $optImage = $request->file("options.{$idx}.image")->store('option-images', 'public');
                } elseif (!empty($opt['image_path']) && Storage::disk('public')->exists($opt['image_path'])) {
                    $ext = pathinfo($opt['image_path'], PATHINFO_EXTENSION);
                    $newOptPath = 'option-images/' . uniqid() . '.' . $ext;
                    Storage::disk('public')->copy($opt['image_path'], $newOptPath);
                    $optImage = $newOptPath;
                }
                $optText = $opt['option_text'] ?? '';
                if (empty(trim($optText)) && $optImage) {
                    $optText = '[Gambar ' . chr(65 + $idx) . ']';
                }
                $optionsArray[] = ['text' => $optText, 'image' => $optImage];
                if ($opt['is_correct'] ?? false) {
                    $correctAnswers[] = $optText;
                    $correctAnswer = $optText;
                }
            }

            if ($type === 'multiple_answer') {
                $correctAnswer = json_encode($correctAnswers);
            }
        }

        $question->update([
            'question_text' => $request->question_text ?? $question->question_text,
            'type' => $type,
            'passage' => $request->passage ?? $question->passage,
            'image' => $imagePath,
            'options' => $optionsArray,
            'correct_answer' => $correctAnswer,
            'essay_keywords' => $type === 'essay' ? ($request->essay_keywords ?? $question->essay_keywords) : null,
            'points' => $request->points ?? $question->points,
        ]);

        return response()->json([
            'success' => true,
            'data' => $question,
            'message' => 'Soal berhasil diperbarui',
        ]);
    }

    /**
     * Delete question
     */
    public function deleteQuestion(Question $question)
    {
        $quiz = $question->exam;
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = request()->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($question->image) Storage::disk('public')->delete($question->image);
        $question->delete();

        $quiz->total_questions = $quiz->questions()->count();
        $quiz->save();

        return response()->json([
            'success' => true,
            'message' => 'Soal berhasil dihapus',
        ]);
    }

    /**
     * Student starts quiz - simplified, no monitoring
     */
    public function startQuiz(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();

        if (!in_array($quiz->status, ['scheduled', 'active'])) {
            return response()->json(['success' => false, 'message' => 'Quiz tidak tersedia'], 422);
        }

        // Check class membership
        $quizClassIds = $quiz->classes()->pluck('classes.id')->toArray();
        if (empty($quizClassIds)) $quizClassIds = [$quiz->class_id];
        if (!in_array($user->class_id, $quizClassIds)) {
            return response()->json(['success' => false, 'message' => 'Anda tidak terdaftar di kelas ini'], 422);
        }

        // Check existing result
        $result = DB::transaction(function () use ($quiz, $user) {
            $result = ExamResult::where('exam_id', $quiz->id)
                ->where('student_id', $user->id)
                ->lockForUpdate()
                ->first();

            if ($result && in_array($result->status, ['completed', 'graded', 'submitted'])) {
                return 'completed';
            }

            if (!$result) {
                $result = ExamResult::create([
                    'exam_id' => $quiz->id,
                    'student_id' => $user->id,
                    'started_at' => now(),
                    'status' => 'in_progress',
                ]);
            }

            return $result;
        });

        if ($result === 'completed') {
            return response()->json(['success' => false, 'message' => 'Anda sudah menyelesaikan quiz ini'], 422);
        }

        // Get questions
        $questions = $quiz->questions()->orderBy('order')->get();

        if ($quiz->shuffle_questions && $questions->isNotEmpty()) {
            // Group questions by passage - questions with same passage stay together
            $mcQuestions = $questions->filter(fn($q) => in_array($q->type, ['multiple_choice', 'multiple_answer']));
            $essayQuestions = $questions->filter(fn($q) => $q->type === 'essay');
            
            $passageGroups = [];
            $noPassageQuestions = [];
            
            foreach ($mcQuestions as $q) {
                $passageText = trim($q->passage ?? '');
                if (!empty($passageText)) {
                    $key = md5($passageText);
                    if (!isset($passageGroups[$key])) {
                        $passageGroups[$key] = [];
                    }
                    $passageGroups[$key][] = $q;
                } else {
                    $noPassageQuestions[] = [$q];
                }
            }
            
            $allGroups = array_merge(array_values($passageGroups), $noPassageQuestions);
            shuffle($allGroups);
            
            $merged = [];
            foreach ($allGroups as $group) {
                foreach ($group as $item) {
                    $merged[] = $item;
                }
            }
            foreach ($essayQuestions as $eq) {
                $merged[] = $eq;
            }
            
            $questions = collect($merged)->values();
        }

        // Shuffle options per question if enabled
        $formattedQuestions = $questions->map(function ($q, $idx) use ($quiz) {
            $opts = $q->options ?? [];
            if ($quiz->shuffle_options && in_array($q->type, ['multiple_choice', 'multiple_answer']) && count($opts) > 0) {
                shuffle($opts);
            }
            return [
                'id' => $q->id,
                'number' => $idx + 1,
                'type' => $q->type,
                'text' => $q->question_text,
                'passage' => $q->passage,
                'options' => $opts,
                'image' => $q->image,
            ];
        });

        // Get existing answers
        $answers = Answer::where('exam_id', $quiz->id)
            ->where('student_id', $user->id)
            ->get()
            ->keyBy('question_id');

        // Calculate remaining time
        $elapsed = now()->diffInSeconds(Carbon::parse($result->started_at));
        $remainingSeconds = max(0, ($quiz->duration * 60) - $elapsed);

        return response()->json([
            'success' => true,
            'data' => [
                'quiz' => [
                    'id' => $quiz->id,
                    'title' => $quiz->title,
                    'subject' => $quiz->subject,
                    'duration' => $quiz->duration,
                    'totalQuestions' => $questions->count(),
                    'show_result' => $quiz->show_result,
                ],
                'questions' => $formattedQuestions,
                'answers' => $answers->mapWithKeys(fn($a) => [$a->question_id => $a->answer]),
                'remainingTime' => $remainingSeconds,
            ],
        ]);
    }

    /**
     * Submit answer - same auto-grading logic, no violation tracking
     */
    public function submitAnswer(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $request->validate([
            'question_id' => 'required|exists:questions,id',
            'answer' => 'required|string',
        ]);

        $user = $request->user();

        $result = ExamResult::where('exam_id', $quiz->id)
            ->where('student_id', $user->id)
            ->where('status', 'in_progress')
            ->first();

        if (!$result) {
            return response()->json(['success' => false, 'message' => 'Sesi quiz tidak ditemukan'], 422);
        }

        // Time check
        if ($result->started_at && $quiz->duration) {
            $personalDeadline = Carbon::parse($result->started_at)->addMinutes($quiz->duration)->addSeconds(30);
            if (now()->greaterThan($personalDeadline)) {
                return response()->json(['success' => false, 'message' => 'Waktu pengerjaan telah habis'], 422);
            }
        }

        $question = Question::where('id', $request->question_id)
            ->where('exam_id', $quiz->id)
            ->first();

        if (!$question) {
            return response()->json(['success' => false, 'message' => 'Soal tidak ditemukan'], 422);
        }

        // Auto-grade
        $isCorrect = null;
        $answerScore = 0;

        if ($question->type === 'multiple_choice') {
            $isCorrect = strtolower(trim($request->answer)) === strtolower(trim($question->correct_answer));
            $answerScore = $isCorrect ? $question->points : 0;
        } elseif ($question->type === 'multiple_answer') {
            $studentAnswers = json_decode($request->answer, true);
            $correctAnswers = json_decode($question->correct_answer, true);
            if (is_array($studentAnswers) && is_array($correctAnswers)) {
                $studentNorm = array_map(fn($a) => strtolower(trim($a)), $studentAnswers);
                $correctNorm = array_map(fn($a) => strtolower(trim($a)), $correctAnswers);
                sort($studentNorm);
                sort($correctNorm);
                $isCorrect = $studentNorm === $correctNorm;
                $correctCount = count(array_intersect($studentNorm, $correctNorm));
                $wrongCount = count(array_diff($studentNorm, $correctNorm));
                $totalCorrect = count($correctNorm);
                if ($totalCorrect > 0) {
                    $score = max(0, ($correctCount - $wrongCount) / $totalCorrect);
                    $answerScore = (int) round($score * $question->points);
                }
            }
        } elseif ($question->type === 'essay' && !empty($question->essay_keywords)) {
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
                $answerScore = round(($matchedCount / $totalKeywords) * $question->points);
                $answerScore = max(1, $answerScore);
                $isCorrect = $matchedCount === $totalKeywords;
            } else {
                $answerScore = 1;
                $isCorrect = false;
            }
        }

        $answer = Answer::updateOrCreate(
            [
                'student_id' => $user->id,
                'question_id' => $question->id,
                'exam_id' => $quiz->id,
            ],
            [
                'answer' => $request->answer,
                'is_correct' => $isCorrect,
                'score' => $answerScore,
                'submitted_at' => now(),
            ]
        );

        return response()->json([
            'success' => true,
            'data' => $answer->only(['id', 'question_id', 'answer', 'submitted_at']),
        ]);
    }

    /**
     * Finish quiz
     */
    public function finishQuiz(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();

        $responseData = DB::transaction(function () use ($quiz, $user) {
            $result = ExamResult::where('exam_id', $quiz->id)
                ->where('student_id', $user->id)
                ->where('status', 'in_progress')
                ->lockForUpdate()
                ->first();

            if (!$result) {
                $already = ExamResult::where('exam_id', $quiz->id)
                    ->where('student_id', $user->id)
                    ->whereIn('status', ['completed', 'graded', 'submitted'])
                    ->first();

                if ($already) {
                    $resp = ['success' => true, 'message' => 'Quiz sudah diselesaikan', 'already_completed' => true];
                    if ($quiz->show_result) {
                        $resp['data'] = [
                            'score' => $already->score,
                            'total_correct' => $already->total_correct,
                            'total_wrong' => $already->total_wrong,
                            'total_questions' => $quiz->questions()->count(),
                            'percentage' => $already->percentage,
                        ];
                    }
                    return $resp;
                }
                return ['error' => true, 'message' => 'Sesi quiz tidak ditemukan'];
            }

            $result->finished_at = now();
            $result->submitted_at = now();

            $hasUngradedEssays = Answer::where('exam_id', $quiz->id)
                ->where('student_id', $user->id)
                ->whereHas('question', function ($q) {
                    $q->where('type', 'essay')->where(function ($q2) {
                        $q2->whereNull('essay_keywords')->orWhere('essay_keywords', '[]');
                    });
                })
                ->exists();

            $result->status = $hasUngradedEssays ? 'submitted' : 'graded';
            $result->calculateScore();

            $resp = ['success' => true, 'message' => 'Quiz berhasil diselesaikan'];
            if ($quiz->show_result) {
                $resp['data'] = [
                    'score' => $result->score,
                    'total_correct' => $result->total_correct,
                    'total_wrong' => $result->total_wrong,
                    'total_questions' => $quiz->questions()->count(),
                    'percentage' => $result->percentage,
                ];
            }
            return $resp;
        });

        if (isset($responseData['error'])) {
            return response()->json(['success' => false, 'message' => $responseData['message']], 422);
        }

        return response()->json($responseData);
    }

    /**
     * Quiz results
     */
    public function results(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $results = ExamResult::with(['student:id,name,nisn,nis,nomor_tes,class_id', 'student.classRoom:id,name'])
            ->where('exam_id', $quiz->id)
            ->get();

        // Essay grading info
        $totalEssayQuestions = Question::where('exam_id', $quiz->id)->where('type', 'essay')->count();
        $essayGrading = [];
        if ($totalEssayQuestions > 0) {
            $studentIds = $results->pluck('student_id')->toArray();
            if (!empty($studentIds)) {
                $counts = Answer::where('exam_id', $quiz->id)
                    ->whereIn('student_id', $studentIds)
                    ->whereHas('question', fn($q) => $q->where('type', 'essay'))
                    ->selectRaw('student_id, COUNT(*) as total_essays, SUM(CASE WHEN graded_at IS NOT NULL THEN 1 ELSE 0 END) as graded_essays')
                    ->groupBy('student_id')
                    ->get();

                foreach ($counts as $c) {
                    $essayGrading[$c->student_id] = [
                        'total_essays' => (int) $c->total_essays,
                        'graded_essays' => (int) $c->graded_essays,
                        'ungraded_essays' => (int) $c->total_essays - (int) $c->graded_essays,
                    ];
                }
            }
        }

        // Students who haven't taken the quiz
        $takenIds = $results->pluck('student_id')->toArray();
        $quizClassIds = $quiz->classes()->pluck('classes.id')->toArray();
        if (empty($quizClassIds)) $quizClassIds = [$quiz->class_id];

        $notTaken = User::with('classRoom:id,name')
            ->whereIn('class_id', $quizClassIds)
            ->where('role', 'siswa')
            ->whereNotIn('id', $takenIds)
            ->select('id', 'name', 'nisn', 'nis', 'nomor_tes', 'class_id')
            ->get();

        $allEntries = [];
        foreach ($results as $r) {
            $entry = $r->toArray();
            $sg = $essayGrading[$r->student_id] ?? null;
            $entry['total_essays'] = $sg ? $sg['total_essays'] : 0;
            $entry['graded_essays'] = $sg ? $sg['graded_essays'] : 0;
            $entry['ungraded_essays'] = $sg ? $sg['ungraded_essays'] : 0;
            $allEntries[] = $entry;
        }

        foreach ($notTaken as $student) {
            $allEntries[] = [
                'id' => null,
                'student_id' => $student->id,
                'student' => $student->toArray(),
                'status' => 'not_started',
                'total_score' => null,
                'max_score' => null,
                'percentage' => null,
                'total_essays' => 0,
                'graded_essays' => 0,
                'ungraded_essays' => 0,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'quiz' => $quiz->load('classes:id,name'),
                'results' => $allEntries,
                'summary' => [
                    'total_students' => count($allEntries),
                    'taken' => $results->count(),
                    'not_started' => $notTaken->count(),
                    'average_score' => $results->count() > 0 ? round($results->avg('percentage'), 1) : 0,
                    'highest_score' => $results->count() > 0 ? round($results->max('percentage'), 1) : 0,
                    'lowest_score' => $results->count() > 0 ? round($results->min('percentage'), 1) : 0,
                ],
            ],
        ]);
    }

    /**
     * Single student result detail
     */
    public function studentResult(Request $request, Exam $quiz, $studentId)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $result = ExamResult::where('exam_id', $quiz->id)
            ->where('student_id', $studentId)
            ->with('student:id,name,nisn,nis')
            ->first();

        if (!$result) {
            return response()->json(['success' => false, 'message' => 'Hasil tidak ditemukan'], 404);
        }

        $answers = Answer::where('exam_id', $quiz->id)
            ->where('student_id', $studentId)
            ->with(['question' => fn($q) => $q->select('id', 'exam_id', 'type', 'question_text', 'passage', 'image', 'options', 'correct_answer', 'essay_keywords', 'points', 'order')])
            ->get()
            ->sortBy(fn($a) => $a->question->order ?? 0)
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'result' => $result,
                'answers' => $answers,
                'quiz' => $quiz->only(['id', 'title', 'subject', 'total_questions', 'show_result', 'passing_score']),
            ],
        ]);
    }

    /**
     * Grade essay answer for quiz
     */
    public function gradeAnswer(Request $request, Exam $quiz, $answerId)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'score' => 'required|numeric|min:0',
            'feedback' => 'nullable|string|max:1000',
        ]);

        $answer = Answer::where('id', $answerId)
            ->where('exam_id', $quiz->id)
            ->with('question')
            ->first();

        if (!$answer) {
            return response()->json(['success' => false, 'message' => 'Jawaban tidak ditemukan'], 404);
        }

        $maxPoints = $answer->question->points;
        $answer->update([
            'score' => min($request->score, $maxPoints),
            'feedback' => $request->feedback,
            'graded_by' => $user->id,
            'graded_at' => now(),
        ]);

        // Recalculate total
        $examResult = ExamResult::where('exam_id', $quiz->id)
            ->where('student_id', $answer->student_id)
            ->first();

        if ($examResult) {
            $examResult->calculateScore();
        }

        return response()->json([
            'success' => true,
            'message' => 'Nilai berhasil disimpan',
            'data' => $answer,
        ]);
    }
}
