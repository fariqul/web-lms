<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Exam;
use App\Models\Question;
use App\Models\Answer;
use App\Models\ExamResult;
use App\Models\Violation;
use App\Models\MonitoringSnapshot;
use Illuminate\Http\Request;
use Carbon\Carbon;

class ExamController extends Controller
{
    /**
     * Display a listing of exams - OPTIMIZED
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Exam::with(['teacher:id,name', 'class:id,name']);

        if ($user->role === 'guru') {
            $query->where('teacher_id', $user->id);
        } elseif ($user->role === 'siswa') {
            $query->where('class_id', $user->class_id)
                ->whereIn('status', ['scheduled', 'active']);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        $exams = $query->orderBy('start_time', 'desc')
            ->paginate($request->per_page ?? 15);

        // For students, add their result status using eager loaded data
        if ($user->role === 'siswa') {
            $examIds = $exams->pluck('id');
            $myResults = ExamResult::where('student_id', $user->id)
                ->whereIn('exam_id', $examIds)
                ->get(['id', 'exam_id', 'status', 'total_score', 'percentage', 'submitted_at'])
                ->keyBy('exam_id');

            $exams->getCollection()->transform(function ($exam) use ($myResults) {
                $exam->my_result = $myResults[$exam->id] ?? null;
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
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'class_id' => 'required|exists:classes,id',
            'subject' => 'required|string|max:255',
            'duration_minutes' => 'required|integer|min:1',
            'start_time' => 'required|date',
            'end_time' => 'required|date|after:start_time',
        ]);

        $exam = Exam::create([
            'title' => $request->title,
            'description' => $request->description,
            'class_id' => $request->class_id,
            'teacher_id' => $request->user()->id,
            'subject' => $request->subject,
            'duration' => $request->duration_minutes,
            'start_time' => $request->start_time,
            'end_time' => $request->end_time,
            'status' => 'draft',
        ]);

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
        $exam->load(['teacher:id,name', 'class:id,name']);

        // For teacher: include all questions with answers
        if ($user->role === 'guru' || $user->role === 'admin') {
            $exam->load(['questions' => fn($q) => $q->orderBy('order')]);
            
            // Transform questions to include formatted options
            if ($exam->questions) {
                $exam->questions->transform(function ($question) {
                    // Convert options array to structured format for frontend
                    if ($question->question_type === 'multiple_choice' && is_array($question->options)) {
                        $question->options = collect($question->options)->map(function ($optText, $idx) use ($question) {
                            return [
                                'id' => $idx + 1,
                                'option_text' => $optText,
                                'is_correct' => $optText === $question->correct_answer,
                            ];
                        })->values()->toArray();
                    }
                    return $question;
                });
            }
        }

        // For students: include questions only if exam is active
        if ($user->role === 'siswa') {
            $result = ExamResult::where('exam_id', $exam->id)
                ->where('student_id', $user->id)
                ->first(['id', 'status', 'total_score', 'percentage', 'started_at', 'submitted_at']);
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
        $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'class_id' => 'sometimes|exists:classes,id',
            'subject' => 'sometimes|string|max:255',
            'duration_minutes' => 'sometimes|integer|min:1',
            'start_time' => 'sometimes|date',
            'end_time' => 'sometimes|date',
            'passing_score' => 'sometimes|integer|min:0|max:100',
            'shuffle_questions' => 'boolean',
            'shuffle_options' => 'boolean',
            'show_result' => 'boolean',
            'max_violations' => 'sometimes|integer|min:0',
            'status' => 'sometimes|in:draft,scheduled,active,completed',
        ]);

        $exam->fill($request->only([
            'title', 'description', 'class_id', 'subject', 
            'duration_minutes', 'start_time', 'end_time',
            'passing_score', 'shuffle_questions', 'shuffle_options',
            'show_result', 'max_violations', 'status'
        ]));
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
    public function destroy(Exam $exam)
    {
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
    public function publish(Exam $exam)
    {
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
            'options' => 'required_if:question_type,multiple_choice|array',
            'options.*.option_text' => 'required_if:question_type,multiple_choice|string',
            'options.*.is_correct' => 'required_if:question_type,multiple_choice|boolean',
            'points' => 'nullable|integer|min:1',
        ]);

        // Convert options to old format for storage
        $optionsArray = [];
        $correctAnswer = '';
        
        if ($request->question_type === 'multiple_choice' && $request->options) {
            foreach ($request->options as $opt) {
                $optionsArray[] = $opt['option_text'];
                if ($opt['is_correct']) {
                    $correctAnswer = $opt['option_text'];
                }
            }
        }

        $question = Question::create([
            'exam_id' => $exam->id,
            'question_text' => $request->question_text,
            'question_type' => $request->question_type,
            'options' => $optionsArray,
            'correct_answer' => $correctAnswer,
            'points' => $request->points ?? 10,
            'order' => $exam->questions()->count() + 1,
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
        $request->validate([
            'question_text' => 'sometimes|string',
            'question_type' => 'sometimes|in:multiple_choice,essay',
            'options' => 'sometimes|array',
            'correct_answer' => 'sometimes|string',
            'points' => 'sometimes|integer|min:1',
        ]);

        $question->fill($request->only([
            'question_text', 'question_type', 'options', 
            'correct_answer', 'points'
        ]));
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
    public function deleteQuestion(Question $question)
    {
        $question->delete();

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

        // Check if student belongs to the class
        if ($user->class_id !== $exam->class_id) {
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
                if ($q->question_type === 'multiple_choice' && is_array($q->options)) {
                    $shuffled = $q->options;
                    shuffle($shuffled);
                    $q->options = $shuffled;
                }
                return $q;
            });
        }

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
                'exam' => $exam->only(['id', 'title', 'duration_minutes', 'max_violations']),
                'result' => $result,
                'questions' => $questions,
                'existing_answers' => $existingAnswers,
                'remaining_time' => $exam->duration_minutes * 60 - $result->started_at->diffInSeconds(now()),
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

        // Check if answer is correct
        $isCorrect = strtolower(trim($request->answer)) === strtolower(trim($question->correct_answer));

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
                'score' => $isCorrect ? $question->points : 0,
                'submitted_at' => now(),
            ]
        );

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

        if (!$result) {
            return response()->json([
                'success' => false,
                'message' => 'Sesi ujian tidak ditemukan',
            ], 422);
        }

        // Calculate score
        $result->finished_at = now();
        $result->status = 'completed';
        $result->calculateScore();

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
        ]);

        // Update violation count
        $result->violation_count = $result->violations()->count();
        $result->save();

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
        $request->validate([
            'image' => 'required|image|max:2048',
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

        $imagePath = $request->file('image')->store('monitoring-snapshots', 'public');

        $snapshot = MonitoringSnapshot::create([
            'exam_result_id' => $result->id,
            'student_id' => $user->id,
            'exam_id' => $exam->id,
            'image_path' => $imagePath,
            'captured_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'data' => $snapshot,
        ]);
    }

    /**
     * Get exam results (for teacher) - OPTIMIZED
     */
    public function results(Exam $exam)
    {
        $results = ExamResult::with(['student:id,name,nisn'])
            ->where('exam_id', $exam->id)
            ->orderBy('percentage', 'desc')
            ->get();

        // Calculate summary with collection methods - single iteration
        $completed = $results->where('status', 'completed');
        
        $summary = [
            'total_students' => $results->count(),
            'completed' => $completed->count(),
            'in_progress' => $results->where('status', 'in_progress')->count(),
            'average_score' => $completed->avg('percentage'),
            'highest_score' => $results->max('percentage'),
            'lowest_score' => $completed->min('percentage'),
            'passed' => $results->where('percentage', '>=', $exam->passing_score)->count(),
        ];

        return response()->json([
            'success' => true,
            'data' => [
                'results' => $results,
                'summary' => $summary,
            ],
        ]);
    }

    /**
     * Get student result detail (for teacher) - OPTIMIZED
     */
    public function studentResult(Exam $exam, $studentId)
    {
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

        $answers = Answer::with('question:id,question_text,question_type,correct_answer,points')
            ->where('exam_id', $exam->id)
            ->where('student_id', $studentId)
            ->get(['id', 'question_id', 'answer', 'is_correct', 'score', 'submitted_at']);

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
     * Get live monitoring data - OPTIMIZED
     */
    public function monitoring(Exam $exam)
    {
        $results = ExamResult::with('student:id,name,nisn')
            ->where('exam_id', $exam->id)
            ->where('status', 'in_progress')
            ->get(['id', 'exam_id', 'student_id', 'started_at', 'violation_count']);

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

        $monitoringData = $results->map(function ($result) use ($latestSnapshots, $answerCounts) {
            return [
                'student' => $result->student,
                'started_at' => $result->started_at,
                'violation_count' => $result->violation_count,
                'answered_count' => $answerCounts[$result->student_id] ?? 0,
                'latest_snapshot' => $latestSnapshots[$result->id] ?? null,
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $monitoringData,
        ]);
    }
}
