<?php

namespace App\Services;

use Smalot\PdfParser\Parser;

class PdfQuestionParser
{
    protected Parser $parser;
    
    public function __construct()
    {
        $this->parser = new Parser();
    }
    
    /**
     * Parse PDF file and extract questions
     * 
     * @param string $filePath Path to PDF file
     * @param string $format Format type: 'utbk', 'un', 'general'
     * @return array
     */
    public function parse(string $filePath, string $format = 'general'): array
    {
        try {
            $pdf = $this->parser->parseFile($filePath);
            $text = $pdf->getText();
            
            // Clean up text
            $text = $this->cleanText($text);
            
            // Parse based on format
            return match ($format) {
                'utbk' => $this->parseUtbkFormat($text),
                'un' => $this->parseUnFormat($text),
                'snbt' => $this->parseSnbtFormat($text),
                default => $this->parseGeneralFormat($text),
            };
        } catch (\Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'questions' => [],
            ];
        }
    }
    
    /**
     * Parse from URL (download then parse)
     */
    public function parseFromUrl(string $url, string $format = 'general'): array
    {
        try {
            $tempFile = tempnam(sys_get_temp_dir(), 'pdf_');
            $content = file_get_contents($url);
            
            if ($content === false) {
                return [
                    'success' => false,
                    'error' => 'Gagal mengunduh file PDF dari URL',
                    'questions' => [],
                ];
            }
            
            file_put_contents($tempFile, $content);
            $result = $this->parse($tempFile, $format);
            unlink($tempFile);
            
            return $result;
        } catch (\Exception $e) {
            return [
                'success' => false,
                'error' => $e->getMessage(),
                'questions' => [],
            ];
        }
    }
    
    /**
     * Clean extracted text
     */
    protected function cleanText(string $text): string
    {
        // Fix UTF-8 encoding issues
        $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
        
        // Remove invalid UTF-8 characters
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text);
        
        // Replace non-UTF8 characters with space
        $text = iconv('UTF-8', 'UTF-8//IGNORE', $text);
        
        // Remove excessive whitespace
        $text = preg_replace('/\s+/', ' ', $text);
        
        // Fix common OCR issues
        $text = str_replace(['  ', '—', '–'], [' ', '-', '-'], $text);
        
        // Normalize line breaks for question separation
        $text = preg_replace('/(\d+)\s*\.\s*/', "\n$1. ", $text);
        
        return trim($text);
    }
    
    /**
     * Parse UTBK/SBMPTN format
     * Pattern: numbered questions with A, B, C, D, E options
     */
    protected function parseUtbkFormat(string $text): array
    {
        $questions = [];
        
        // Pattern untuk soal UTBK
        // Soal biasanya: "1. [pertanyaan] A. [opsi] B. [opsi] C. [opsi] D. [opsi] E. [opsi]"
        $pattern = '/(\d+)\.\s*(.+?)\s*(?:A\.|a\.)\s*(.+?)\s*(?:B\.|b\.)\s*(.+?)\s*(?:C\.|c\.)\s*(.+?)\s*(?:D\.|d\.)\s*(.+?)\s*(?:E\.|e\.)\s*(.+?)(?=\d+\.|$)/s';
        
        preg_match_all($pattern, $text, $matches, PREG_SET_ORDER);
        
        foreach ($matches as $match) {
            $questions[] = [
                'number' => (int) $match[1],
                'question' => $this->cleanQuestionText($match[2]),
                'options' => [
                    $this->cleanQuestionText($match[3]),
                    $this->cleanQuestionText($match[4]),
                    $this->cleanQuestionText($match[5]),
                    $this->cleanQuestionText($match[6]),
                    $this->cleanQuestionText($match[7]),
                ],
                'type' => 'pilihan_ganda',
                'correct_answer' => null, // Need to be filled manually or from answer key
            ];
        }
        
        // If 5 options pattern didn't match, try 4 options (A-D)
        if (empty($questions)) {
            $questions = $this->parseFourOptionsFormat($text);
        }
        
        return [
            'success' => true,
            'format' => 'utbk',
            'total_extracted' => count($questions),
            'questions' => $questions,
        ];
    }
    
    /**
     * Parse UN (Ujian Nasional) format
     */
    protected function parseUnFormat(string $text): array
    {
        return $this->parseFourOptionsFormat($text, 'un');
    }
    
    /**
     * Parse SNBT format (similar to UTBK but newer)
     */
    protected function parseSnbtFormat(string $text): array
    {
        return $this->parseUtbkFormat($text);
    }
    
    /**
     * Parse 4 options format (A, B, C, D)
     */
    protected function parseFourOptionsFormat(string $text, string $format = 'general'): array
    {
        $questions = [];
        
        // Pattern untuk soal dengan 4 opsi
        $pattern = '/(\d+)\.\s*(.+?)\s*(?:A\.|a\.)\s*(.+?)\s*(?:B\.|b\.)\s*(.+?)\s*(?:C\.|c\.)\s*(.+?)\s*(?:D\.|d\.)\s*(.+?)(?=\d+\.|$)/s';
        
        preg_match_all($pattern, $text, $matches, PREG_SET_ORDER);
        
        foreach ($matches as $match) {
            $questions[] = [
                'number' => (int) $match[1],
                'question' => $this->cleanQuestionText($match[2]),
                'options' => [
                    $this->cleanQuestionText($match[3]),
                    $this->cleanQuestionText($match[4]),
                    $this->cleanQuestionText($match[5]),
                    $this->cleanQuestionText($match[6]),
                ],
                'type' => 'pilihan_ganda',
                'correct_answer' => null,
            ];
        }
        
        return empty($questions) ? [
            'success' => count($questions) > 0,
            'format' => $format,
            'total_extracted' => count($questions),
            'questions' => $questions,
        ] : [
            'success' => true,
            'format' => $format,
            'total_extracted' => count($questions),
            'questions' => $questions,
        ];
    }
    
    /**
     * Parse general format - tries multiple patterns
     */
    protected function parseGeneralFormat(string $text): array
    {
        $questions = [];
        
        // Try UTBK format first (5 options)
        $result = $this->parseUtbkFormat($text);
        if ($result['total_extracted'] > 0) {
            return $result;
        }
        
        // Try 4 options format
        $result = $this->parseFourOptionsFormat($text);
        if ($result['total_extracted'] > 0) {
            return $result;
        }
        
        // Try alternative patterns
        $questions = $this->parseAlternativePatterns($text);
        
        return [
            'success' => count($questions) > 0,
            'format' => 'general',
            'total_extracted' => count($questions),
            'questions' => $questions,
        ];
    }
    
    /**
     * Try alternative question patterns
     */
    protected function parseAlternativePatterns(string $text): array
    {
        $questions = [];
        
        // Pattern: Questions separated by numbers with parentheses options
        // e.g., "1) Question text (A) option (B) option (C) option (D) option"
        $pattern = '/(\d+)\)\s*(.+?)\s*\(A\)\s*(.+?)\s*\(B\)\s*(.+?)\s*\(C\)\s*(.+?)\s*\(D\)\s*(.+?)(?=\d+\)|$)/si';
        
        preg_match_all($pattern, $text, $matches, PREG_SET_ORDER);
        
        foreach ($matches as $match) {
            $questions[] = [
                'number' => (int) $match[1],
                'question' => $this->cleanQuestionText($match[2]),
                'options' => [
                    $this->cleanQuestionText($match[3]),
                    $this->cleanQuestionText($match[4]),
                    $this->cleanQuestionText($match[5]),
                    $this->cleanQuestionText($match[6]),
                ],
                'type' => 'pilihan_ganda',
                'correct_answer' => null,
            ];
        }
        
        return $questions;
    }
    
    /**
     * Parse answer key from PDF
     * Common format: "1. A  2. B  3. C ..." or "1-A, 2-B, 3-C..."
     */
    public function parseAnswerKey(string $text): array
    {
        $answers = [];
        
        // Pattern 1: "1. A" or "1.A"
        preg_match_all('/(\d+)\s*\.\s*([A-Ea-e])/i', $text, $matches, PREG_SET_ORDER);
        foreach ($matches as $match) {
            $answers[(int) $match[1]] = strtoupper($match[2]);
        }
        
        // Pattern 2: "1-A" or "1 - A"
        if (empty($answers)) {
            preg_match_all('/(\d+)\s*-\s*([A-Ea-e])/i', $text, $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                $answers[(int) $match[1]] = strtoupper($match[2]);
            }
        }
        
        // Pattern 3: "1)A" or "1) A"
        if (empty($answers)) {
            preg_match_all('/(\d+)\s*\)\s*([A-Ea-e])/i', $text, $matches, PREG_SET_ORDER);
            foreach ($matches as $match) {
                $answers[(int) $match[1]] = strtoupper($match[2]);
            }
        }
        
        return $answers;
    }
    
    /**
     * Merge questions with answer key
     */
    public function mergeWithAnswerKey(array $questions, array $answerKey): array
    {
        $optionLetters = ['A', 'B', 'C', 'D', 'E'];
        
        foreach ($questions as &$question) {
            $number = $question['number'];
            if (isset($answerKey[$number])) {
                $letterIndex = array_search($answerKey[$number], $optionLetters);
                if ($letterIndex !== false && isset($question['options'][$letterIndex])) {
                    $question['correct_answer'] = $question['options'][$letterIndex];
                }
            }
        }
        
        return $questions;
    }
    
    /**
     * Clean question text
     */
    protected function cleanQuestionText(string $text): string
    {
        $text = trim($text);
        $text = preg_replace('/\s+/', ' ', $text);
        $text = html_entity_decode($text);
        return $text;
    }
    
    /**
     * Extract subject from PDF metadata or content
     */
    public function detectSubject(string $text): ?string
    {
        $subjectPatterns = [
            'Matematika' => '/matemat|math/i',
            'Bahasa Indonesia' => '/bahasa\s*indonesia|b\.?\s*indo/i',
            'Bahasa Inggris' => '/bahasa\s*inggris|b\.?\s*inggris|english/i',
            'Fisika' => '/fisika|physics/i',
            'Kimia' => '/kimia|chemistry/i',
            'Biologi' => '/biologi|biology/i',
            'Ekonomi' => '/ekonomi|economic/i',
            'Geografi' => '/geografi|geography/i',
            'Sejarah' => '/sejarah|history/i',
            'Sosiologi' => '/sosiologi|sociology/i',
            'PKN' => '/pkn|ppkn|kewarganegaraan|civic/i',
            'TPS' => '/tps|penalaran\s*umum|tes\s*potensi\s*skolastik/i',
            'TPA' => '/tpa|tes\s*potensi\s*akademik/i',
            'Literasi' => '/literasi/i',
            'Penalaran' => '/penalaran/i',
        ];
        
        foreach ($subjectPatterns as $subject => $pattern) {
            if (preg_match($pattern, $text)) {
                return $subject;
            }
        }
        
        return null;
    }
    
    /**
     * Get PDF metadata
     */
    public function getMetadata(string $filePath): array
    {
        try {
            $pdf = $this->parser->parseFile($filePath);
            $details = $pdf->getDetails();
            $pages = $pdf->getPages();
            
            return [
                'title' => $details['Title'] ?? null,
                'author' => $details['Author'] ?? null,
                'subject' => $details['Subject'] ?? null,
                'creator' => $details['Creator'] ?? null,
                'pages' => count($pages),
                'created_date' => $details['CreationDate'] ?? null,
            ];
        } catch (\Exception $e) {
            return [];
        }
    }
}
