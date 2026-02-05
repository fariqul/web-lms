<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UtbkScraperService
{
    /**
     * Scrape questions from utbk.or.id URL
     */
    public function scrapeFromUrl(string $url): array
    {
        // Validate URL
        if (!$this->isValidUtbkUrl($url)) {
            throw new \Exception('URL tidak valid. Hanya URL dari utbk.or.id yang diizinkan.');
        }

        // Fetch HTML content (disable SSL verification for development)
        $response = Http::timeout(30)
            ->withoutVerifying()
            ->withHeaders([
                'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language' => 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            ])
            ->get($url);

        if (!$response->successful()) {
            throw new \Exception('Gagal mengambil halaman. Status: ' . $response->status());
        }

        $html = $response->body();
        
        // Check if page uses image-based questions
        if ($this->isImageBasedQuestions($html)) {
            throw new \Exception('Halaman ini menggunakan soal berbasis gambar yang tidak dapat di-scrape. Silakan pilih artikel dengan soal berbasis teks.');
        }
        
        // Extract title/topic from page
        $topic = $this->extractTopic($html);
        
        // Parse questions from HTML
        $questions = $this->parseQuestions($html);

        if (empty($questions)) {
            throw new \Exception('Tidak ditemukan soal di halaman ini. Pastikan halaman berisi soal dengan format teks (bukan gambar).');
        }

        return [
            'topic' => $topic,
            'url' => $url,
            'total_questions' => count($questions),
            'questions' => $questions,
        ];
    }

    /**
     * Check if page uses image-based questions
     */
    private function isImageBasedQuestions(string $html): bool
    {
        // Count image-based questions (images with "Soal" in alt text)
        $imgBasedCount = preg_match_all('/<figure[^>]*class="[^"]*wp-block-image[^"]*"[^>]*>.*?<img[^>]*alt="[^"]*[Ss]oal[^"]*"[^>]*>.*?<\/figure>/is', $html);
        
        // Count text-based answers (Jawaban: X pattern)
        $textBasedCount = preg_match_all('/Jawaban:\s*[A-E]/i', $html);
        
        // If many images but no text answers, it's image-based
        return $imgBasedCount > 5 && $textBasedCount === 0;
    }

    /**
     * Validate if URL is from utbk.or.id
     */
    private function isValidUtbkUrl(string $url): bool
    {
        $parsedUrl = parse_url($url);
        
        if (!isset($parsedUrl['host'])) {
            return false;
        }

        $host = strtolower($parsedUrl['host']);
        return $host === 'utbk.or.id' || str_ends_with($host, '.utbk.or.id');
    }

    /**
     * Extract topic/title from HTML
     */
    private function extractTopic(string $html): string
    {
        // Try to get h1 or title
        if (preg_match('/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)<\/h1>/i', $html, $matches)) {
            return $this->cleanText($matches[1]);
        }

        if (preg_match('/<h1[^>]*>([^<]+)<\/h1>/i', $html, $matches)) {
            return $this->cleanText($matches[1]);
        }

        if (preg_match('/<title>([^<]+)<\/title>/i', $html, $matches)) {
            $title = $this->cleanText($matches[1]);
            // Remove site name suffix
            $title = preg_replace('/\s*[-–|]\s*#?\d*\s*(Simulasi)?.*$/i', '', $title);
            return $title;
        }

        return 'Import dari utbk.or.id';
    }

    /**
     * Parse questions from HTML content
     */
    private function parseQuestions(string $html): array
    {
        $questions = [];

        // Remove scripts and styles to clean HTML
        $html = preg_replace('/<script[^>]*>.*?<\/script>/is', '', $html);
        $html = preg_replace('/<style[^>]*>.*?<\/style>/is', '', $html);
        
        // Try multiple formats
        
        // Format 1: <p><strong>Soal X</strong></p> or <p>Soal X</p>
        $pattern1 = '/<p>(?:<strong>)?Soal\s+(\d+)\s*(?:<\/strong>)?<\/p>(.*?)(?=<p>(?:<strong>)?Soal\s+\d+\s*(?:<\/strong>)?<\/p>|Tingkatkan\s+Nilai|Sering\s+Salah|<h[23]|$)/is';
        
        // Format 2: <b>Soal Nomor X</b> (inline, may have space before </b>)
        $pattern2 = '/<b>Soal Nomor\s+(\d+)\s*<\/b>(.*?)(?=<b>Soal Nomor\s+\d+\s*<\/b>|Tingkatkan\s+Nilai|Sering\s+Salah|<h[23]|$)/is';
        
        // Format 3: <strong>Soal Nomor X</strong>
        $pattern3 = '/<strong>Soal Nomor\s+(\d+)\s*<\/strong>(.*?)(?=<strong>Soal Nomor\s+\d+\s*<\/strong>|Tingkatkan\s+Nilai|Sering\s+Salah|<h[23]|$)/is';
        
        $patterns = [$pattern1, $pattern2, $pattern3];
        
        foreach ($patterns as $pattern) {
            if (preg_match_all($pattern, $html, $matches, PREG_SET_ORDER)) {
                Log::debug('Found ' . count($matches) . ' questions using pattern');
                
                foreach ($matches as $match) {
                    $questionNum = (int) $match[1];
                    $questionHtml = $match[2];
                    
                    $parsed = $this->parseQuestionBlock($questionHtml);
                    
                    if ($parsed) {
                        $parsed['number'] = $questionNum;
                        $questions[] = $parsed;
                    }
                }
                
                // If we found questions with this pattern, stop trying others
                if (!empty($questions)) {
                    break;
                }
            }
        }

        // Sort by question number
        usort($questions, fn($a, $b) => $a['number'] <=> $b['number']);

        return $questions;
    }

    /**
     * Parse a question block HTML
     */
    private function parseQuestionBlock(string $html): ?array
    {
        // Convert HTML to text while preserving structure
        $text = $this->htmlToText($html);
        
        // Find where options start
        // Options format: "A. text" - letter A followed by dot, space, and content
        // Format 1: A. at start of line/paragraph OR after double newline
        // Format 2: A. anywhere in text (inline format like sosiologi)
        
        $hasNewlineOptions = preg_match('/(?:^|\n\n|\n)\s*A\.\s+\S/m', $text);
        $hasInlineOptions = preg_match('/A\.\s+\S.*B\.\s+\S.*C\.\s+\S/s', $text);
        
        if (!$hasNewlineOptions && !$hasInlineOptions) {
            return null;
        }

        // Extract question text (everything before "A. ")
        // Prioritize newline format if both match
        if ($hasNewlineOptions) {
            // Split at first real option A (after paragraph break)
            // Use lookahead so A. stays in $parts[1]
            $parts = preg_split('/(?:^|\n\n|\n)\s*(?=A\.\s+\S)/m', $text, 2);
            $optionsPart = isset($parts[1]) ? trim($parts[1]) : '';
        } else {
            // Inline format: split at first "A. " that starts options
            // Look for pattern like "adalah… A." or "adalah... A." or ending punctuation before A.
            // Use lookahead so A. stays in $parts[1]
            $parts = preg_split('/(?<=[.…?!])\s*(?=A\.\s+\S)/u', $text, 2);
            $optionsPart = isset($parts[1]) ? trim($parts[1]) : '';
        }
        
        $questionText = $this->cleanText($parts[0] ?? '');
        
        if (empty($questionText) || strlen($questionText) < 10) {
            return null;
        }

        // Extract options A-E (stop before Jawaban)
        // First, remove everything from "Jawaban:" onwards from optionsPart
        $optionsPart = preg_replace('/Jawaban:.*$/is', '', $optionsPart);
        
        // Pattern: Letter + dot + space + content (until next option letter+dot)
        $options = [];
        
        // Match options - must be uppercase A-E at beginning or after whitespace
        $optionPattern = '/\b([A-E])\.\s+(.+?)(?=\s*\b[B-E]\.\s+|$)/s';
        
        if (preg_match_all($optionPattern, $optionsPart, $optMatches, PREG_SET_ORDER)) {
            foreach ($optMatches as $optMatch) {
                $letter = strtoupper(trim($optMatch[1]));
                $optionText = $this->cleanText($optMatch[2]);
                if (!empty($optionText)) {
                    $options[$letter] = $optionText;
                }
            }
        }

        // Must have at least A and B options
        if (!isset($options['A']) || !isset($options['B'])) {
            return null;
        }

        // Extract answer
        $answer = null;
        if (preg_match('/Jawaban:\s*([A-E])/i', $text, $ansMatch)) {
            $answer = strtoupper($ansMatch[1]);
        }

        // Extract explanation (everything after "Pembahasan:")
        $explanation = null;
        if (preg_match('/Pembahasan:\s*(.+?)$/is', $text, $expMatch)) {
            $explanation = $this->cleanText($expMatch[1]);
        }

        return [
            'question' => $questionText,
            'options' => $options,
            'answer' => $answer,
            'explanation' => $explanation,
        ];
    }

    /**
     * Convert HTML to readable text
     */
    private function htmlToText(string $html): string
    {
        // Replace common block elements with newlines
        $html = preg_replace('/<br\s*\/?>/i', "\n", $html);
        $html = preg_replace('/<\/(p|div|h[1-6]|li|tr)>/i', "\n", $html);
        $html = preg_replace('/<(p|div|h[1-6]|li|tr)[^>]*>/i', "\n", $html);
        
        // Remove all remaining HTML tags
        $text = strip_tags($html);
        
        // Decode HTML entities
        $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        
        // Normalize whitespace
        $text = preg_replace('/[ \t]+/', ' ', $text);
        $text = preg_replace('/\n\s*\n/', "\n\n", $text);
        $text = trim($text);
        
        return $text;
    }

    /**
     * Clean text by removing extra whitespace
     */
    private function cleanText(string $text): string
    {
        // Remove extra whitespace
        $text = preg_replace('/\s+/', ' ', $text);
        $text = trim($text);
        
        // Handle encoding
        $text = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
        
        return $text;
    }
}
