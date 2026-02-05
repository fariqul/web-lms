<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankQuestion;
use App\Services\UtbkScraperService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class UrlImportController extends Controller
{
    protected $scraperService;

    public function __construct(UtbkScraperService $scraperService)
    {
        $this->scraperService = $scraperService;
    }

    /**
     * Preview questions from URL before importing
     */
    public function preview(Request $request)
    {
        $request->validate([
            'url' => 'required|url',
        ]);

        try {
            $result = $this->scraperService->scrapeFromUrl($request->url);

            return response()->json([
                'success' => true,
                'data' => $result,
            ]);
        } catch (\Exception $e) {
            Log::error('URL Preview Error: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Import questions from URL to bank soal
     */
    public function import(Request $request)
    {
        $request->validate([
            'url' => 'required|url',
            'subject' => 'required|string',
            'difficulty' => 'nullable|in:mudah,sedang,sulit',
            'grade_level' => 'nullable|in:10,11,12',
            'class_id' => 'nullable|exists:classes,id',
            'selected_questions' => 'nullable|array',
        ]);

        try {
            // Scrape questions
            $scrapedData = $this->scraperService->scrapeFromUrl($request->url);

            // Filter selected questions if specified
            if ($request->has('selected_questions') && !empty($request->selected_questions)) {
                $selectedNumbers = $request->selected_questions;
                $scrapedData['questions'] = array_filter(
                    $scrapedData['questions'],
                    fn($q) => in_array($q['number'], $selectedNumbers)
                );
                $scrapedData['questions'] = array_values($scrapedData['questions']); // Re-index array
                $scrapedData['total_questions'] = count($scrapedData['questions']);
            }

            // Import to database
            $importedCount = 0;
            $skippedCount = 0;
            $errors = [];

            DB::beginTransaction();

            foreach ($scrapedData['questions'] as $index => $q) {
                try {
                    // Skip questions without answer
                    if (empty($q['answer'])) {
                        $skippedCount++;
                        continue;
                    }

                    // Convert options to array format
                    $options = [];
                    foreach (['A', 'B', 'C', 'D', 'E'] as $letter) {
                        if (isset($q['options'][$letter])) {
                            $options[] = $q['options'][$letter];
                        }
                    }

                    // Find correct answer text
                    $correctAnswer = $q['options'][$q['answer']] ?? null;
                    
                    if (!$correctAnswer) {
                        $skippedCount++;
                        continue;
                    }

                    BankQuestion::create([
                        'teacher_id' => Auth::id(),
                        'class_id' => $request->class_id,
                        'subject' => $request->subject,
                        'type' => 'pilihan_ganda',
                        'question' => $q['question'],
                        'options' => $options,
                        'correct_answer' => $correctAnswer,
                        'explanation' => $q['explanation'] ?? "Jawaban yang benar adalah {$q['answer']}. (Sumber: utbk.or.id)",
                        'difficulty' => $request->difficulty ?? 'sedang',
                        'grade_level' => $request->grade_level ?? '10',
                        'is_active' => true,
                    ]);
                    $importedCount++;
                } catch (\Exception $e) {
                    $errors[] = "Soal #" . ($q['number'] ?? $index + 1) . ": " . $e->getMessage();
                    Log::warning('Failed to import question: ' . $e->getMessage());
                }
            }

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => "Berhasil mengimport {$importedCount} soal dari {$scrapedData['total_questions']} soal.",
                'data' => [
                    'imported' => $importedCount,
                    'skipped' => $skippedCount,
                    'total' => $scrapedData['total_questions'],
                    'topic' => $scrapedData['topic'],
                    'errors' => $errors,
                ],
            ]);
        } catch (\Exception $e) {
            DB::rollBack();
            Log::error('URL Import Error: ' . $e->getMessage());
            
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }
}
