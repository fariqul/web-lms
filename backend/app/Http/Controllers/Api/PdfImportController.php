<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BankQuestion;
use App\Services\PdfQuestionParser;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PdfImportController extends Controller
{
    protected PdfQuestionParser $parser;
    
    public function __construct(PdfQuestionParser $parser)
    {
        $this->parser = $parser;
    }
    
    /**
     * Parse PDF and return extracted questions (preview before import)
     */
    public function parse(Request $request)
    {
        Log::info('PDF Parse request', [
            'has_file' => $request->hasFile('pdf_file'),
            'all_files' => array_keys($request->allFiles()),
            'content_type' => $request->header('Content-Type'),
        ]);
        
        $request->validate([
            'pdf_file' => 'required|file|mimes:pdf|max:10240', // Max 10MB
            'format' => 'nullable|in:utbk,un,snbt,general',
            'answer_key_file' => 'nullable|file|mimes:pdf|max:5120', // Optional answer key PDF
        ]);
        
        try {
            // Store uploaded file temporarily
            $pdfPath = $request->file('pdf_file')->store('temp', 'local');
            $fullPath = Storage::disk('local')->path($pdfPath);
            
            // Get format
            $format = $request->get('format', 'general');
            
            // Get metadata
            $metadata = $this->parser->getMetadata($fullPath);
            
            // Parse questions
            $result = $this->parser->parse($fullPath, $format);
            
            // Detect subject from content
            $pdf = new \Smalot\PdfParser\Parser();
            $pdfDoc = $pdf->parseFile($fullPath);
            $text = $pdfDoc->getText();
            $detectedSubject = $this->parser->detectSubject($text);
            
            // Parse answer key if provided
            if ($request->hasFile('answer_key_file')) {
                $answerKeyPath = $request->file('answer_key_file')->store('temp', 'local');
                $answerKeyFullPath = Storage::disk('local')->path($answerKeyPath);
                
                $answerKeyPdf = $pdf->parseFile($answerKeyFullPath);
                $answerKeyText = $answerKeyPdf->getText();
                $answerKey = $this->parser->parseAnswerKey($answerKeyText);
                
                // Merge with questions
                if (!empty($answerKey) && !empty($result['questions'])) {
                    $result['questions'] = $this->parser->mergeWithAnswerKey($result['questions'], $answerKey);
                }
                
                // Clean up answer key file
                Storage::disk('local')->delete($answerKeyPath);
            }
            
            // Clean up question file
            Storage::disk('local')->delete($pdfPath);
            
            // Sanitize questions for JSON encoding
            $sanitizedQuestions = array_map(function($q) {
                return array_map(function($value) {
                    if (is_string($value)) {
                        // Fix UTF-8 encoding
                        $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
                        $value = iconv('UTF-8', 'UTF-8//IGNORE', $value);
                    }
                    if (is_array($value)) {
                        return array_map(function($v) {
                            if (is_string($v)) {
                                $v = mb_convert_encoding($v, 'UTF-8', 'UTF-8');
                                return iconv('UTF-8', 'UTF-8//IGNORE', $v);
                            }
                            return $v;
                        }, $value);
                    }
                    return $value;
                }, $q);
            }, $result['questions']);
            
            return response()->json([
                'success' => $result['success'],
                'message' => $result['success'] 
                    ? "Berhasil mengekstrak {$result['total_extracted']} soal" 
                    : 'Tidak dapat mengekstrak soal dari PDF. Coba format lain.',
                'data' => [
                    'format_detected' => $result['format'],
                    'total_questions' => $result['total_extracted'],
                    'detected_subject' => $detectedSubject,
                    'metadata' => $metadata,
                    'questions' => $sanitizedQuestions,
                ],
            ], 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
        } catch (\Exception $e) {
            Log::error('PDF Parse Error', [
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);
            
            return response()->json([
                'success' => false,
                'message' => 'Gagal memproses file PDF',
            ], 500);
        }
    }
    
    /**
     * Parse PDF from URL
     */
    public function parseFromUrl(Request $request)
    {
        $request->validate([
            'url' => 'required|url',
            'format' => 'nullable|in:utbk,un,snbt,general',
        ]);
        
        try {
            $format = $request->get('format', 'general');
            $result = $this->parser->parseFromUrl($request->url, $format);
            
            if (!$result['success']) {
                return response()->json([
                    'success' => false,
                    'message' => $result['error'] ?? 'Gagal mengekstrak soal dari URL',
                ], 400);
            }
            
            return response()->json([
                'success' => true,
                'message' => "Berhasil mengekstrak {$result['total_extracted']} soal",
                'data' => [
                    'format_detected' => $result['format'],
                    'total_questions' => $result['total_extracted'],
                    'questions' => $result['questions'],
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('URL Parse Error', ['message' => $e->getMessage()]);
            return response()->json([
                'success' => false,
                'message' => 'Gagal memproses URL',
            ], 500);
        }
    }
    
    /**
     * Import parsed questions to database
     */
    public function import(Request $request)
    {
        $request->validate([
            'questions' => 'required|array|min:1',
            'questions.*.question' => 'required|string',
            'questions.*.options' => 'required|array|min:2',
            'questions.*.correct_answer' => 'required|string',
            'subject' => 'required|string|max:100',
            'grade_level' => 'required|in:10,11,12',
            'difficulty' => 'nullable|in:mudah,sedang,sulit',
            'source' => 'nullable|string|max:255',
        ]);
        
        try {
            $user = Auth::user();
            $questions = $request->questions;
            $subject = $request->subject;
            $gradeLevel = $request->grade_level;
            $difficulty = $request->get('difficulty', 'sedang');
            $source = $request->get('source', 'PDF Import');
            
            $imported = 0;
            $errors = [];
            
            foreach ($questions as $index => $q) {
                try {
                    // Skip if no correct answer
                    if (empty($q['correct_answer'])) {
                        $errors[] = "Soal #{$q['number']} tidak memiliki kunci jawaban";
                        continue;
                    }
                    
                    BankQuestion::create([
                        'teacher_id' => $user->id,
                        'subject' => $subject,
                        'type' => 'pilihan_ganda',
                        'question' => $q['question'],
                        'options' => $q['options'],
                        'correct_answer' => $q['correct_answer'],
                        'explanation' => $q['explanation'] ?? "Sumber: {$source}",
                        'difficulty' => $q['difficulty'] ?? $difficulty,
                        'grade_level' => $gradeLevel,
                        'is_active' => true,
                    ]);
                    
                    $imported++;
                } catch (\Exception $e) {
                    $errors[] = "Gagal menyimpan soal #{$q['number']}: " . $e->getMessage();
                }
            }
            
            return response()->json([
                'success' => true,
                'message' => "Berhasil mengimpor {$imported} dari " . count($questions) . " soal",
                'data' => [
                    'imported' => $imported,
                    'total' => count($questions),
                    'errors' => $errors,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Gagal mengimpor soal: ' . $e->getMessage(),
            ], 500);
        }
    }
    
    /**
     * Get sample PDF formats info
     */
    public function getFormats()
    {
        return response()->json([
            'success' => true,
            'data' => [
                'formats' => [
                    [
                        'id' => 'utbk',
                        'name' => 'UTBK/SBMPTN',
                        'description' => 'Format soal UTBK dengan 5 pilihan (A-E)',
                        'pattern' => '1. Pertanyaan? A. Opsi B. Opsi C. Opsi D. Opsi E. Opsi',
                    ],
                    [
                        'id' => 'snbt',
                        'name' => 'SNBT',
                        'description' => 'Format soal SNBT (sama dengan UTBK)',
                        'pattern' => '1. Pertanyaan? A. Opsi B. Opsi C. Opsi D. Opsi E. Opsi',
                    ],
                    [
                        'id' => 'un',
                        'name' => 'Ujian Nasional',
                        'description' => 'Format soal UN dengan 4 pilihan (A-D)',
                        'pattern' => '1. Pertanyaan? A. Opsi B. Opsi C. Opsi D. Opsi',
                    ],
                    [
                        'id' => 'general',
                        'name' => 'Umum/Otomatis',
                        'description' => 'Deteksi otomatis format soal',
                        'pattern' => 'Auto-detect',
                    ],
                ],
                'supported_subjects' => [
                    'Matematika', 'Bahasa Indonesia', 'Bahasa Inggris',
                    'Fisika', 'Kimia', 'Biologi', 'Ekonomi', 'Geografi',
                    'Sejarah', 'Sosiologi', 'PKN', 'TPS', 'Literasi', 'Penalaran',
                ],
            ],
        ]);
    }
}
