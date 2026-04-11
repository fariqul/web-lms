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
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Carbon\Carbon;

class QuizController extends Controller
{
    private const QUIZ_SHOW_CACHE_TTL_SECONDS_DEFAULT = 20;

    private function getQuizShowCacheTtlSeconds(): int
    {
        $ttl = (int) env('QUIZ_SHOW_CACHE_TTL_SECONDS', self::QUIZ_SHOW_CACHE_TTL_SECONDS_DEFAULT);
        return max(5, $ttl);
    }

    private function forgetQuizShowCache(int $quizId): void
    {
        Cache::forget("quiz:show:{$quizId}:role:guru");
        Cache::forget("quiz:show:{$quizId}:role:admin");
    }

    private function clonePublicFilePath(?string $sourcePath, string $targetDir): ?string
    {
        if (!$sourcePath) {
            return null;
        }

        if (!Storage::disk('public')->exists($sourcePath)) {
            return $sourcePath;
        }

        $ext = pathinfo($sourcePath, PATHINFO_EXTENSION);
        $filename = uniqid('dup_', true) . ($ext ? ".{$ext}" : '');
        $newPath = trim($targetDir, '/') . '/' . $filename;

        Storage::disk('public')->copy($sourcePath, $newPath);
        return $newPath;
    }

    private function normalizePublicDiskPath(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }

        $normalized = trim($path);
        if ($normalized === '') {
            return null;
        }

        $normalized = str_replace('\\', '/', $normalized);

        if (preg_match('/^https?:\/\//i', $normalized) === 1) {
            $parsedPath = parse_url($normalized, PHP_URL_PATH);
            if (is_string($parsedPath) && $parsedPath !== '') {
                $normalized = $parsedPath;
            }
        }

        $storagePos = strpos($normalized, '/storage/');
        if ($storagePos !== false) {
            $normalized = substr($normalized, $storagePos + strlen('/storage/'));
        }

        $normalized = ltrim($normalized, '/');
        $normalized = preg_replace('/^public\//', '', $normalized) ?? $normalized;

        return $normalized !== '' ? $normalized : null;
    }

    private function copyFromPublicPath(?string $sourcePath, string $targetDir): ?string
    {
        $normalizedPath = $this->normalizePublicDiskPath($sourcePath);
        if (!$normalizedPath || !Storage::disk('public')->exists($normalizedPath)) {
            return null;
        }

        return $this->clonePublicFilePath($normalizedPath, $targetDir);
    }

    private function buildScoredAnswerPayload(Question $question, string $rawAnswer): array
    {
        $isCorrect = null;
        $answerScore = 0;

        if ($question->type === 'multiple_choice') {
            $isCorrect = strtolower(trim($rawAnswer)) === strtolower(trim((string) $question->correct_answer));
            $answerScore = $isCorrect ? (int) $question->points : 0;
        } elseif ($question->type === 'multiple_answer') {
            $studentAnswers = json_decode($rawAnswer, true);
            $correctAnswers = json_decode((string) $question->correct_answer, true);
            if (is_array($studentAnswers) && is_array($correctAnswers)) {
                $studentNorm = array_map(fn($a) => strtolower(trim((string) $a)), $studentAnswers);
                $correctNorm = array_map(fn($a) => strtolower(trim((string) $a)), $correctAnswers);
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
            $studentAnswer = mb_strtolower(trim($rawAnswer));
            $keywords = $question->essay_keywords;
            $totalKeywords = count($keywords);
            $matchedCount = 0;
            foreach ($keywords as $keyword) {
                if (mb_stripos($studentAnswer, mb_strtolower(trim($keyword))) !== false) {
                    $matchedCount++;
                }
            }
            if ($totalKeywords > 0 && $matchedCount > 0) {
                $answerScore = (int) round(($matchedCount / $totalKeywords) * $question->points);
                $answerScore = max(1, $answerScore);
                $isCorrect = $matchedCount === $totalKeywords;
            } else {
                $answerScore = 1;
                $isCorrect = false;
            }
        }

        return [
            'answer' => $rawAnswer,
            'is_correct' => $isCorrect,
            'score' => $answerScore,
        ];
    }

    private function deriveCorrectOptionFlags(Question $question, array $options): array
    {
        $flags = array_fill(0, count($options), false);

        if ($question->type === 'multiple_choice') {
            $target = mb_strtolower(trim((string) $question->correct_answer));
            foreach ($options as $idx => $opt) {
                $optText = is_array($opt) ? (string) ($opt['text'] ?? '') : '';
                if (mb_strtolower(trim($optText)) === $target) {
                    $flags[$idx] = true;
                    break;
                }
            }
        } elseif ($question->type === 'multiple_answer') {
            $correctAnswers = json_decode((string) $question->correct_answer, true);
            $normalizedCorrect = is_array($correctAnswers)
                ? array_map(fn($item) => mb_strtolower(trim((string) $item)), $correctAnswers)
                : [];

            foreach ($options as $idx => $opt) {
                $optText = is_array($opt) ? (string) ($opt['text'] ?? '') : '';
                $flags[$idx] = in_array(mb_strtolower(trim($optText)), $normalizedCorrect, true);
            }
        }

        return $flags;
    }

    private function remapSingleAnswerValue(string $answerValue, array $oldOptionTexts, array $newOptionTexts): string
    {
        $normalized = mb_strtolower(trim($answerValue));
        foreach ($oldOptionTexts as $idx => $oldText) {
            if (mb_strtolower(trim((string) $oldText)) === $normalized) {
                return (string) ($newOptionTexts[$idx] ?? $answerValue);
            }
        }

        return $answerValue;
    }

    private function remapLiveInProgressAnswers(Exam $quiz, Question $question, array $oldOptions, array $newOptions): void
    {
        if (!in_array($question->type, ['multiple_choice', 'multiple_answer'], true)) {
            return;
        }

        if (count($oldOptions) !== count($newOptions) || count($oldOptions) === 0) {
            return;
        }

        $oldOptionTexts = array_map(
            fn($opt) => is_array($opt) ? (string) ($opt['text'] ?? '') : '',
            $oldOptions
        );
        $newOptionTexts = array_map(
            fn($opt) => is_array($opt) ? (string) ($opt['text'] ?? '') : '',
            $newOptions
        );

        $hasTextChanges = false;
        foreach ($oldOptionTexts as $idx => $oldText) {
            if ($oldText !== ($newOptionTexts[$idx] ?? '')) {
                $hasTextChanges = true;
                break;
            }
        }
        if (!$hasTextChanges) {
            return;
        }

        $answers = Answer::query()
            ->select('answers.*')
            ->join('exam_results', function ($join) {
                $join->on('answers.exam_id', '=', 'exam_results.exam_id')
                    ->on('answers.student_id', '=', 'exam_results.student_id');
            })
            ->where('answers.exam_id', $quiz->id)
            ->where('answers.question_id', $question->id)
            ->where('exam_results.status', 'in_progress')
            ->get();

        foreach ($answers as $answer) {
            $rawAnswer = (string) $answer->answer;
            if (trim($rawAnswer) === '') {
                continue;
            }

            $updatedAnswer = $rawAnswer;
            if ($question->type === 'multiple_choice') {
                $updatedAnswer = $this->remapSingleAnswerValue($rawAnswer, $oldOptionTexts, $newOptionTexts);
            } else {
                $decoded = json_decode($rawAnswer, true);
                if (!is_array($decoded)) {
                    continue;
                }

                $remapped = array_map(function ($item) use ($oldOptionTexts, $newOptionTexts) {
                    if (!is_string($item)) {
                        return $item;
                    }
                    return $this->remapSingleAnswerValue($item, $oldOptionTexts, $newOptionTexts);
                }, $decoded);

                $encoded = json_encode($remapped);
                if ($encoded === false) {
                    continue;
                }
                $updatedAnswer = $encoded;
            }

            if ($updatedAnswer === $rawAnswer) {
                continue;
            }

            $scored = $this->buildScoredAnswerPayload($question, $updatedAnswer);
            $answer->update([
                'answer' => $updatedAnswer,
                'is_correct' => $scored['is_correct'],
                'score' => $scored['score'],
            ]);
        }
    }

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
        $shouldUseShowCache = in_array($user->role, ['guru', 'admin'], true) && !$request->boolean('no_cache');
        $showCacheKey = "quiz:show:{$quiz->id}:role:{$user->role}";

        // Teacher/admin: show with questions
        if ($user->role === 'guru' || $user->role === 'admin') {
            if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }

            if ($shouldUseShowCache) {
                $cachedPayload = Cache::get($showCacheKey);
                if (is_array($cachedPayload) && array_key_exists('success', $cachedPayload) && array_key_exists('data', $cachedPayload)) {
                    return response()->json($cachedPayload);
                }
            }

            $quiz->load(['questions' => fn($q) => $q->orderBy('order'), 'classes:id,name', 'teacher:id,name']);
            $payload = ['success' => true, 'data' => $quiz->toArray()];

            if ($shouldUseShowCache) {
                Cache::put($showCacheKey, $payload, now()->addSeconds($this->getQuizShowCacheTtlSeconds()));
            }

            return response()->json($payload);
        }

        // Student: show without questions (must start first)
        $quiz->load('classes:id,name');
        $quizClassIds = $quiz->classes->pluck('id')->toArray();
        if (empty($quizClassIds)) {
            $quizClassIds = [$quiz->class_id];
        }
        if (!in_array($user->class_id, $quizClassIds, true)) {
            return response()->json(['success' => false, 'message' => 'Anda tidak memiliki akses ke quiz ini'], 403);
        }
        if (!in_array($quiz->status, ['scheduled', 'active', 'completed'], true)) {
            return response()->json(['success' => false, 'message' => 'Quiz tidak tersedia'], 403);
        }

        $result = ExamResult::where('exam_id', $quiz->id)->where('student_id', $user->id)->first();
        $quiz->my_result = $result;

        return response()->json(['success' => true, 'data' => $quiz]);
    }

    /**
     * Sync latest question content for in-progress student sessions.
     */
    public function syncQuestions(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Bukan quiz'], 404);
        }

        $user = $request->user();
        $quizClassIds = $quiz->classes()->pluck('classes.id')->toArray();
        if (empty($quizClassIds)) {
            $quizClassIds = [$quiz->class_id];
        }

        if (!in_array($user->class_id, $quizClassIds, true)) {
            return response()->json(['success' => false, 'message' => 'Anda tidak memiliki akses ke quiz ini'], 403);
        }

        $result = ExamResult::where('exam_id', $quiz->id)
            ->where('student_id', $user->id)
            ->where('status', 'in_progress')
            ->first();

        if (!$result) {
            return response()->json(['success' => false, 'message' => 'Sesi quiz tidak aktif'], 422);
        }

        $questions = $quiz->questions()->orderBy('order')->get();
        $latestUpdatedAt = $questions->max('updated_at');
        $revision = $latestUpdatedAt ? Carbon::parse((string) $latestUpdatedAt)->getTimestamp() : 0;

        return response()->json([
            'success' => true,
            'data' => [
                'revision' => $revision,
                'questions' => $questions->map(fn($q) => [
                    'id' => $q->id,
                    'order' => $q->order,
                    'question_text' => $q->question_text,
                    'type' => $q->type,
                    'question_type' => $q->type,
                    'passage' => $q->passage,
                    'options' => $q->options ?? [],
                    'image' => $q->image,
                    'updated_at' => $q->updated_at ? $q->updated_at->toISOString() : null,
                ])->values(),
            ],
        ]);
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
        $this->forgetQuizShowCache($quiz->id);

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

        DB::transaction(function () use ($quiz) {
            // Explicit cleanup for clarity; remaining relations are also protected by FK cascade.
            Answer::where('exam_id', $quiz->id)->delete();
            ExamResult::where('exam_id', $quiz->id)->delete();
            $quiz->questions()->delete();
            $quiz->classes()->detach();
            $quiz->delete();
        });

        $this->forgetQuizShowCache($quiz->id);

        return response()->json([
            'success' => true,
            'message' => 'Quiz beserta hasil dan jawaban siswa berhasil dihapus',
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
            $this->forgetQuizShowCache($quiz->id);

            return response()->json([
                'success' => true,
                'message' => 'Quiz berhasil dipublish dan aktif',
                'data' => $quiz,
            ]);
        }

        // Toggle: active → draft (unpublish)
        if ($quiz->status === 'active' || $quiz->status === 'scheduled') {
            $hasInProgressAttempts = ExamResult::where('exam_id', $quiz->id)
                ->where('status', 'in_progress')
                ->exists();

            if ($hasInProgressAttempts) {
                return response()->json([
                    'success' => false,
                    'message' => 'Quiz tidak dapat di-unpublish karena masih ada siswa yang sedang mengerjakan.',
                ], 422);
            }

            $quiz->status = 'draft';
            $quiz->save();
            $this->forgetQuizShowCache($quiz->id);

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
            /** @var \Illuminate\Database\Eloquent\Collection<int, \App\Models\ExamResult> $inProgress */
            $inProgress = ExamResult::where('exam_id', $quiz->id)
                ->where('status', 'in_progress')
                ->lockForUpdate()
                ->get();

            foreach ($inProgress as $result) {
                $result->finished_at = now();
                $result->submitted_at = now();

                $hasUngradedEssays = Answer::where('exam_id', $quiz->id)
                    ->where('student_id', $result->student_id)
                    ->whereHas('question', function ($q) {
                        $q->where('type', 'essay')->where(function ($q2) {
                            $q2->whereNull('essay_keywords')->orWhere('essay_keywords', '[]');
                        });
                    })
                    ->exists();

                $result->status = $hasUngradedEssays ? 'submitted' : 'graded';
                $result->calculateScore();
            }
        });

        $quiz->status = 'completed';
        $quiz->end_time = now();
        $quiz->save();
        $this->forgetQuizShowCache($quiz->id);

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

        if ($quiz->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Soal hanya dapat ditambahkan saat quiz berstatus draft',
            ], 422);
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
            'options.*.existing_image' => 'nullable|string',
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
        } elseif ($copiedImage = $this->copyFromPublicPath($request->image_path, 'question-images')) {
            $imagePath = $copiedImage;
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
                } elseif ($copiedOptImage = $this->copyFromPublicPath($opt['image_path'] ?? ($opt['existing_image'] ?? null), 'option-images')) {
                    $optImage = $copiedOptImage;
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
        $this->forgetQuizShowCache($quiz->id);

        return response()->json([
            'success' => true,
            'data' => $question,
            'message' => 'Soal berhasil ditambahkan',
        ], 201);
    }

    /**
     * Duplicate questions from CBT exam into quiz/ujian harian
     */
    public function duplicateFromExam(Request $request, Exam $quiz)
    {
        if ($quiz->type !== 'quiz') {
            return response()->json(['success' => false, 'message' => 'Target bukan quiz'], 404);
        }

        $user = $request->user();
        if ($user->role === 'guru' && $quiz->teacher_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        if ($quiz->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Duplikasi soal hanya dapat dilakukan saat quiz berstatus draft',
            ], 422);
        }

        $request->validate([
            'source_exam_id' => 'required|exists:exams,id',
            'replace_existing' => 'nullable|boolean',
            'question_ids' => 'nullable|array|min:1',
            'question_ids.*' => 'integer|exists:questions,id',
        ]);

        $sourceExam = Exam::with(['questions' => fn($q) => $q->orderBy('order')])->findOrFail($request->source_exam_id);

        if ($sourceExam->type === 'quiz') {
            return response()->json([
                'success' => false,
                'message' => 'Sumber harus dari ujian CBT, bukan quiz',
            ], 422);
        }

        if ($user->role === 'guru' && $sourceExam->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda hanya dapat duplicate dari ujian CBT milik Anda',
            ], 403);
        }

        if ($sourceExam->questions->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Ujian sumber belum memiliki soal',
            ], 422);
        }

        $selectedQuestionIds = collect($request->input('question_ids', []))
            ->filter(fn($id) => is_numeric($id))
            ->map(fn($id) => (int) $id)
            ->unique()
            ->values();

        $sourceQuestions = $sourceExam->questions;
        if ($selectedQuestionIds->isNotEmpty()) {
            $sourceQuestions = $sourceQuestions
                ->whereIn('id', $selectedQuestionIds)
                ->sortBy('order')
                ->values();

            if ($sourceQuestions->count() !== $selectedQuestionIds->count()) {
                return response()->json([
                    'success' => false,
                    'message' => 'Ada soal yang dipilih tidak berasal dari ujian CBT sumber',
                ], 422);
            }
        }

        if ($sourceQuestions->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak ada soal yang dipilih untuk diduplikasi',
            ], 422);
        }

        $replaceExisting = (bool) $request->boolean('replace_existing', false);
        $duplicatedCount = 0;

        DB::transaction(function () use ($quiz, $sourceQuestions, $replaceExisting, &$duplicatedCount) {
            if ($replaceExisting) {
                $quiz->questions()->delete();
            }

            $order = ($quiz->questions()->max('order') ?? 0) + 1;

            foreach ($sourceQuestions as $srcQuestion) {
                $newQuestionImage = $this->clonePublicFilePath($srcQuestion->image, 'question-images');

                $newOptions = null;
                if (is_array($srcQuestion->options)) {
                    $newOptions = collect($srcQuestion->options)->map(function ($opt) {
                        if (is_string($opt)) {
                            return $opt;
                        }

                        if (!is_array($opt)) {
                            return $opt;
                        }

                        $newOpt = $opt;
                        if (!empty($opt['image']) && is_string($opt['image'])) {
                            $newOpt['image'] = $this->clonePublicFilePath($opt['image'], 'option-images');
                        }
                        return $newOpt;
                    })->toArray();
                }

                Question::create([
                    'exam_id' => $quiz->id,
                    'passage' => $srcQuestion->passage,
                    'question_text' => $srcQuestion->question_text,
                    'type' => $srcQuestion->type,
                    'image' => $newQuestionImage,
                    'options' => $newOptions,
                    'correct_answer' => $srcQuestion->correct_answer,
                    'essay_keywords' => $srcQuestion->essay_keywords,
                    'points' => $srcQuestion->points,
                    'order' => $order,
                ]);

                $order++;
                $duplicatedCount++;
            }

            $quiz->total_questions = $quiz->questions()->count();
            $quiz->save();
        });

        $this->forgetQuizShowCache($quiz->id);

        return response()->json([
            'success' => true,
            'message' => "{$duplicatedCount} soal berhasil diduplikasi dari ujian CBT",
            'data' => [
                'duplicated_count' => $duplicatedCount,
                'source_exam_id' => $sourceExam->id,
                'replace_existing' => $replaceExisting,
                'selected_count' => $selectedQuestionIds->count(),
            ],
        ]);
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

        if (!in_array($quiz->status, ['draft', 'active'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Soal hanya dapat diubah saat quiz berstatus draft atau aktif',
            ], 422);
        }

        $isLiveEdit = $quiz->status === 'active';
        $existingOptions = is_array($question->options) ? array_values($question->options) : [];
        $existingCorrectFlags = $this->deriveCorrectOptionFlags($question, $existingOptions);

        $request->validate([
            'question_text' => 'sometimes|string',
            'question_type' => 'sometimes|in:multiple_choice,multiple_answer,essay',
            'passage' => 'nullable|string',
            'options' => 'sometimes|array',
            'options.*.option_text' => 'nullable|string',
            'options.*.is_correct' => 'sometimes|boolean',
            'options.*.image' => 'nullable|image|max:5120',
            'options.*.image_path' => 'nullable|string',
            'options.*.existing_image' => 'nullable|string',
            'options.*.remove_image' => 'nullable|boolean',
            'points' => 'nullable|integer|min:1',
            'image' => 'nullable|image|max:5120',
            'image_path' => 'nullable|string',
            'remove_image' => 'nullable|boolean',
            'essay_keywords' => 'nullable|array',
            'essay_keywords.*' => 'string',
        ]);

        if ($isLiveEdit) {
            if ($request->filled('question_type') && $request->input('question_type') !== $question->type) {
                return response()->json([
                    'success' => false,
                    'message' => 'Saat quiz aktif, tipe soal tidak dapat diubah',
                ], 422);
            }

            if ($request->has('points') && (int) $request->input('points') !== (int) $question->points) {
                return response()->json([
                    'success' => false,
                    'message' => 'Saat quiz aktif, poin soal tidak dapat diubah',
                ], 422);
            }

            if ($request->has('essay_keywords')) {
                return response()->json([
                    'success' => false,
                    'message' => 'Saat quiz aktif, kata kunci essay tidak dapat diubah',
                ], 422);
            }

            if ($request->has('options') && is_array($request->input('options'))) {
                $incomingOptions = array_values($request->input('options', []));
                if (count($incomingOptions) !== count($existingOptions)) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Saat quiz aktif, jumlah opsi tidak dapat diubah',
                    ], 422);
                }

                foreach ($incomingOptions as $idx => $opt) {
                    if (!is_array($opt) || !array_key_exists('is_correct', $opt)) {
                        continue;
                    }

                    $incomingIsCorrect = filter_var(
                        $opt['is_correct'],
                        FILTER_VALIDATE_BOOLEAN,
                        FILTER_NULL_ON_FAILURE
                    );
                    $normalizedIncomingFlag = $incomingIsCorrect ?? (bool) $opt['is_correct'];

                    if ($normalizedIncomingFlag !== ($existingCorrectFlags[$idx] ?? false)) {
                        return response()->json([
                            'success' => false,
                            'message' => 'Saat quiz aktif, kunci jawaban tidak dapat diubah',
                        ], 422);
                    }
                }
            }
        }

        $imagePath = $question->image;
        if ($request->boolean('remove_image')) {
            if ($question->image) {
                Storage::disk('public')->delete($question->image);
            }
            $imagePath = null;
        } elseif ($request->hasFile('image')) {
            if ($question->image) Storage::disk('public')->delete($question->image);
            $imagePath = $request->file('image')->store('question-images', 'public');
        } else {
            $incomingImagePath = $this->normalizePublicDiskPath($request->input('image_path'));
            if ($incomingImagePath) {
                if ($incomingImagePath === $question->image) {
                    $imagePath = $question->image;
                } elseif ($copiedImage = $this->copyFromPublicPath($incomingImagePath, 'question-images')) {
                    if ($question->image && $question->image !== $copiedImage) {
                        Storage::disk('public')->delete($question->image);
                    }
                    $imagePath = $copiedImage;
                }
            }
        }

        $type = $isLiveEdit ? $question->type : ($request->question_type ?? $question->type);
        $optionsArray = $question->options;
        $correctAnswer = $question->correct_answer;
        $optionsWereUpdated = false;

        if ($request->has('options') && in_array($type, ['multiple_choice', 'multiple_answer'])) {
            $optionsWereUpdated = true;
            $optionsArray = [];
            $correctAnswers = [];
            $correctAnswer = '';
            $submittedOptions = array_values((array) $request->input('options', []));

            foreach ($submittedOptions as $idx => $opt) {
                $existingImage = null;
                if (isset($existingOptions[$idx]) && is_array($existingOptions[$idx])) {
                    $existingImage = $this->normalizePublicDiskPath($existingOptions[$idx]['image'] ?? null);
                }

                $removeOptImage = ($opt['remove_image'] ?? false) || $request->boolean("options.{$idx}.remove_image");
                $optImage = $existingImage;

                if ($removeOptImage) {
                    if ($existingImage && Storage::disk('public')->exists($existingImage)) {
                        Storage::disk('public')->delete($existingImage);
                    }
                    $optImage = null;
                } elseif ($request->hasFile("options.{$idx}.image")) {
                    if ($existingImage && Storage::disk('public')->exists($existingImage)) {
                        Storage::disk('public')->delete($existingImage);
                    }
                    $optImage = $request->file("options.{$idx}.image")->store('option-images', 'public');
                } else {
                    $incomingOptImagePath = $this->normalizePublicDiskPath($opt['image_path'] ?? ($opt['existing_image'] ?? null));
                    if ($incomingOptImagePath) {
                        if ($incomingOptImagePath === $existingImage) {
                            $optImage = $existingImage;
                        } elseif ($copiedOptImage = $this->copyFromPublicPath($incomingOptImagePath, 'option-images')) {
                            if ($existingImage && Storage::disk('public')->exists($existingImage)) {
                                Storage::disk('public')->delete($existingImage);
                            }
                            $optImage = $copiedOptImage;
                        }
                    }
                }
                $optText = $opt['option_text'] ?? '';
                if (empty(trim($optText)) && $optImage) {
                    $optText = '[Gambar ' . chr(65 + $idx) . ']';
                }
                $optionsArray[] = ['text' => $optText, 'image' => $optImage];
                $isCorrectOption = $isLiveEdit
                    ? ($existingCorrectFlags[$idx] ?? false)
                    : (bool) ($opt['is_correct'] ?? false);
                if ($isCorrectOption) {
                    $correctAnswers[] = $optText;
                    $correctAnswer = $optText;
                }
            }

            if ($type === 'multiple_answer') {
                $correctAnswer = json_encode($correctAnswers);
            }
        } elseif ($type === 'essay') {
            $optionsArray = null;
            $correctAnswer = null;
        }

        $question->update([
            'question_text' => $request->question_text ?? $question->question_text,
            'type' => $type,
            'passage' => $request->passage ?? $question->passage,
            'image' => $imagePath,
            'options' => $optionsArray,
            'correct_answer' => $correctAnswer,
            'essay_keywords' => $type === 'essay'
                ? ($isLiveEdit ? $question->essay_keywords : ($request->essay_keywords ?? $question->essay_keywords))
                : null,
            'points' => $isLiveEdit ? $question->points : ($request->points ?? $question->points),
        ]);
        $this->forgetQuizShowCache($quiz->id);
        $question->refresh();

        if ($isLiveEdit && $optionsWereUpdated && in_array($type, ['multiple_choice', 'multiple_answer'], true)) {
            $this->remapLiveInProgressAnswers(
                $quiz,
                $question,
                $existingOptions,
                is_array($question->options) ? array_values($question->options) : []
            );
        }

        if ($isLiveEdit) {
            try {
                app(SocketBroadcastService::class)->examQuestionUpdated($quiz->id, [
                    'quiz_id' => $quiz->id,
                    'question' => [
                        'id' => $question->id,
                        'order' => $question->order,
                        'question_text' => $question->question_text,
                        'type' => $question->type,
                        'question_type' => $question->type,
                        'passage' => $question->passage,
                        'options' => $question->options ?? [],
                        'image' => $question->image,
                        'updated_at' => $question->updated_at ? $question->updated_at->toISOString() : null,
                    ],
                ]);
            } catch (\Throwable $e) {
                Log::warning('Broadcast quiz question-updated failed: ' . $e->getMessage(), [
                    'quiz_id' => $quiz->id,
                    'question_id' => $question->id,
                ]);
            }
        }

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

        if ($quiz->status !== 'draft') {
            return response()->json([
                'success' => false,
                'message' => 'Soal hanya dapat diubah saat quiz berstatus draft',
            ], 422);
        }

        if ($question->image) Storage::disk('public')->delete($question->image);
        $question->delete();

        $quiz->total_questions = $quiz->questions()->count();
        $quiz->save();
        $this->forgetQuizShowCache($quiz->id);

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

            if ($result && $result->status === 'in_progress' && $quiz->status === 'completed') {
                return 'closed';
            }

            if (!$result && !in_array($quiz->status, ['scheduled', 'active'], true)) {
                return 'unavailable';
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

        if ($result === 'unavailable') {
            return response()->json(['success' => false, 'message' => 'Quiz tidak tersedia'], 422);
        }

        if ($result === 'closed') {
            return response()->json(['success' => false, 'message' => 'Quiz sudah berakhir'], 422);
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
        // Carbon 3 can return signed values depending on call order; use abs to keep elapsed non-negative.
        $elapsed = abs(now()->diffInSeconds(Carbon::parse($result->started_at)));
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

        $scored = $this->buildScoredAnswerPayload($question, $request->answer);

        $answer = Answer::updateOrCreate(
            [
                'student_id' => $user->id,
                'question_id' => $question->id,
                'exam_id' => $quiz->id,
            ],
            array_merge(
                $scored,
                [
                'submitted_at' => now(),
                ]
            )
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

        $request->validate([
            'answers' => 'nullable|array',
            'answers.*' => 'nullable|string',
            'time_spent' => 'nullable|integer|min:0',
        ]);

        $user = $request->user();

        $responseData = DB::transaction(function () use ($quiz, $user, $request) {
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

            $isDeadlineExceeded = false;
            if ($result->started_at && $quiz->duration) {
                $personalDeadline = Carbon::parse($result->started_at)->addMinutes($quiz->duration)->addSeconds(30);
                if (now()->greaterThan($personalDeadline)) {
                    $isDeadlineExceeded = true;
                }
            }

            $fallbackAnswers = $isDeadlineExceeded ? [] : $request->input('answers', []);
            if (is_array($fallbackAnswers) && !empty($fallbackAnswers)) {
                $questionMap = Question::where('exam_id', $quiz->id)->get()->keyBy('id');
                foreach ($fallbackAnswers as $questionId => $rawAnswer) {
                    $qId = (int) $questionId;
                    if (!$questionMap->has($qId) || !is_string($rawAnswer) || trim($rawAnswer) === '') {
                        continue;
                    }

                    $scored = $this->buildScoredAnswerPayload($questionMap[$qId], $rawAnswer);
                    Answer::updateOrCreate(
                        [
                            'student_id' => $user->id,
                            'question_id' => $qId,
                            'exam_id' => $quiz->id,
                        ],
                        array_merge(
                            $scored,
                            ['submitted_at' => now()]
                        )
                    );
                }
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

            $resp = [
                'success' => true,
                'message' => $isDeadlineExceeded
                    ? 'Quiz berhasil diselesaikan (waktu habis, jawaban terlambat diabaikan)'
                    : 'Quiz berhasil diselesaikan',
            ];
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

        /** @var \Illuminate\Database\Eloquent\Collection<int, \App\Models\ExamResult> $results */
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
                    ->whereHas('question', function ($q) {
                        $q->where('type', 'essay')->where(function ($q2) {
                            $q2->whereNull('essay_keywords')->orWhere('essay_keywords', '[]');
                        });
                    })
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

        /** @var \Illuminate\Database\Eloquent\Collection<int, \App\Models\User> $notTaken */
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
            $notTakenStatus = $quiz->status === 'completed' ? 'missed' : 'not_started';
            $allEntries[] = [
                'id' => null,
                'student_id' => $student->id,
                'student' => $student->toArray(),
                'status' => $notTakenStatus,
                'total_score' => null,
                'max_score' => null,
                'percentage' => null,
                'total_essays' => 0,
                'graded_essays' => 0,
                'ungraded_essays' => 0,
            ];
        }

        $quizPayload = $quiz->load('classes:id,name');
        $completedCount = collect($allEntries)->whereIn('status', ['completed', 'graded', 'submitted'])->count();
        $inProgressCount = collect($allEntries)->where('status', 'in_progress')->count();
        $notStartedCount = collect($allEntries)->where('status', 'not_started')->count();
        $missedCount = collect($allEntries)->where('status', 'missed')->count();
        $finalizedResults = $results->whereIn('status', ['completed', 'graded']);
        $passedCount = $finalizedResults
            ->filter(fn($r) => (float) ($r->percentage ?? 0) >= (float) ($quiz->passing_score ?? 0))
            ->count();
        $failedCount = $finalizedResults
            ->filter(fn($r) => (float) ($r->percentage ?? 0) < (float) ($quiz->passing_score ?? 0))
            ->count() + $missedCount;
        $totalUngradedEssays = collect($allEntries)->sum(fn($e) => (int) ($e['ungraded_essays'] ?? 0));
        $studentsWithUngraded = collect($allEntries)->filter(fn($e) => (int) ($e['ungraded_essays'] ?? 0) > 0)->count();

        return response()->json([
            'success' => true,
            'data' => [
                'quiz' => $quizPayload,
                'exam' => $quizPayload,
                'results' => $allEntries,
                'summary' => [
                    'total_students' => count($allEntries),
                    'taken' => $results->count(),
                    'completed' => $completedCount,
                    'in_progress' => $inProgressCount,
                    'not_started' => $notStartedCount,
                    'missed' => $missedCount,
                    'passed' => $passedCount,
                    'failed' => $failedCount,
                    'average_score' => $finalizedResults->count() > 0 ? round($finalizedResults->avg('percentage'), 1) : 0,
                    'highest_score' => $finalizedResults->count() > 0 ? round($finalizedResults->max('percentage'), 1) : 0,
                    'lowest_score' => $finalizedResults->count() > 0 ? round($finalizedResults->min('percentage'), 1) : 0,
                    'total_essay_questions' => $totalEssayQuestions,
                    'total_ungraded_essays' => $totalUngradedEssays,
                    'students_with_ungraded' => $studentsWithUngraded,
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

            // If all essay answers are graded, promote submitted/completed to graded
            $ungradedEssays = Answer::where('exam_id', $quiz->id)
                ->where('student_id', $answer->student_id)
                ->whereHas('question', function ($q) {
                    $q->where('type', 'essay')->where(function ($q2) {
                        $q2->whereNull('essay_keywords')->orWhere('essay_keywords', '[]');
                    });
                })
                ->whereNull('graded_at')
                ->count();

            if ($ungradedEssays === 0 && in_array($examResult->status, ['completed', 'submitted'], true)) {
                $examResult->status = 'graded';
                $examResult->save();
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Nilai berhasil disimpan',
            'data' => [
                'answer' => $answer,
                'exam_result' => $examResult,
            ],
        ]);
    }
}
