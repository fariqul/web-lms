<?php

namespace App\Services;

class TroubleshootingEngine
{
    /**
     * Generate troubleshooting suggestions from analysis result
     *
     * @param array $analysisResult The analysis result from proctoring service
     * @return array Array of TroubleshootingSuggestion objects
     */
    public function generateSuggestions(array $analysisResult): array
    {
        $suggestions = [];

        // Camera Issues
        $suggestions = array_merge($suggestions, $this->checkCameraIssues($analysisResult));

        // Service Issues
        $suggestions = array_merge($suggestions, $this->checkServiceIssues($analysisResult));

        // Configuration Issues
        $suggestions = array_merge($suggestions, $this->checkConfigurationIssues($analysisResult));

        // Performance Issues
        $suggestions = array_merge($suggestions, $this->checkPerformanceIssues($analysisResult));

        return $suggestions;
    }

    /**
     * Check for camera-related issues
     */
    private function checkCameraIssues(array $analysisResult): array
    {
        $suggestions = [];

        // No face detected
        if (isset($analysisResult['face_analysis']['face_detected']) && 
            !$analysisResult['face_analysis']['face_detected']) {
            $suggestions[] = $this->createSuggestion(
                category: 'camera',
                severity: 'warning',
                issue: 'Wajah tidak terdeteksi',
                description: 'Kamera tidak mendeteksi wajah pada gambar yang di-capture. Hal ini dapat disebabkan oleh pencahayaan yang buruk, posisi wajah yang tidak tepat, atau kualitas kamera yang rendah.',
                action: "1. Pastikan wajah terlihat jelas di kamera\n2. Atur pencahayaan ruangan agar lebih terang\n3. Posisikan wajah di tengah frame\n4. Hindari backlight (cahaya dari belakang)\n5. Pastikan tidak ada objek yang menutupi wajah",
                technicalDetails: 'face_analysis.face_detected: false'
            );
        }

        // Low image resolution (if processing time is suspiciously low, might indicate low resolution)
        if (isset($analysisResult['processing_time_ms']) && $analysisResult['processing_time_ms'] < 50) {
            $suggestions[] = $this->createSuggestion(
                category: 'camera',
                severity: 'info',
                issue: 'Kemungkinan resolusi gambar rendah',
                description: 'Waktu pemrosesan yang sangat cepat mungkin mengindikasikan resolusi gambar yang rendah. Resolusi rendah dapat mempengaruhi akurasi deteksi.',
                action: "1. Gunakan kamera dengan resolusi minimal 640x480\n2. Pastikan browser memiliki akses penuh ke kamera\n3. Periksa pengaturan kualitas video di browser",
                technicalDetails: "Processing time: {$analysisResult['processing_time_ms']}ms (unusually fast)"
            );
        }

        // Poor lighting detection (based on low confidence when face is detected)
        if (isset($analysisResult['face_analysis']['face_detected']) && 
            $analysisResult['face_analysis']['face_detected'] &&
            isset($analysisResult['face_analysis']['confidence']) &&
            $analysisResult['face_analysis']['confidence'] < 0.6) {
            $suggestions[] = $this->createSuggestion(
                category: 'camera',
                severity: 'info',
                issue: 'Kualitas deteksi wajah rendah',
                description: 'Wajah terdeteksi tetapi dengan confidence yang rendah. Ini mungkin disebabkan oleh pencahayaan yang kurang baik atau kualitas gambar yang buruk.',
                action: "1. Tingkatkan pencahayaan ruangan\n2. Gunakan pencahayaan dari depan, bukan dari belakang\n3. Hindari bayangan pada wajah\n4. Bersihkan lensa kamera jika kotor",
                technicalDetails: "Face confidence: " . round($analysisResult['face_analysis']['confidence'] * 100, 1) . "%"
            );
        }

        return $suggestions;
    }

    /**
     * Check for service-related issues
     */
    private function checkServiceIssues(array $analysisResult): array
    {
        $suggestions = [];

        // face_recognition library not installed
        if (isset($analysisResult['face_analysis']['face_detected']) && 
            $analysisResult['face_analysis']['face_detected'] &&
            (!isset($analysisResult['face_analysis']['face_embedding']) || 
             $analysisResult['face_analysis']['face_embedding'] === null)) {
            $suggestions[] = $this->createSuggestion(
                category: 'network',
                severity: 'critical',
                issue: 'Library face_recognition tidak terinstall',
                description: 'Library face_recognition tidak terinstall atau tidak dapat dimuat di proctoring service. Fitur identity verification tidak akan berfungsi tanpa library ini.',
                action: "1. Install face_recognition library di proctoring service\n2. Pastikan dlib juga terinstall sebagai dependency\n3. Restart proctoring service setelah instalasi\n4. Lihat dokumentasi IDENTITY_MISMATCH_DETECTION.md untuk panduan lengkap",
                technicalDetails: 'pip install face_recognition dlib',
                documentationLink: 'IDENTITY_MISMATCH_DETECTION.md'
            );
        }

        // Proctoring service unreachable (indicated by status field)
        if (isset($analysisResult['status']) && $analysisResult['status'] === 'error') {
            $errorMessage = $analysisResult['message'] ?? 'Unknown error';
            $suggestions[] = $this->createSuggestion(
                category: 'network',
                severity: 'critical',
                issue: 'Proctoring service tidak dapat dijangkau',
                description: 'Backend tidak dapat terhubung ke proctoring service. Periksa apakah service berjalan dengan baik dan dapat diakses dari backend.',
                action: "1. Periksa apakah proctoring service berjalan: docker ps\n2. Periksa log proctoring service: docker logs proctoring-service\n3. Verifikasi konfigurasi PROCTORING_SERVICE_URL di .env\n4. Test koneksi: curl http://proctoring:8001/health\n5. Restart service jika diperlukan: docker-compose restart proctoring-service",
                technicalDetails: "Error: {$errorMessage}"
            );
        }

        // Request timeout (processing time > 30 seconds)
        if (isset($analysisResult['processing_time_ms']) && $analysisResult['processing_time_ms'] > 30000) {
            $suggestions[] = $this->createSuggestion(
                category: 'network',
                severity: 'warning',
                issue: 'Request timeout - Service sangat lambat',
                description: 'Proctoring service membutuhkan waktu lebih dari 30 detik untuk memproses request. Ini menunjukkan masalah performa yang serius.',
                action: "1. Periksa penggunaan CPU/GPU di server: docker stats\n2. Pastikan service menggunakan GPU jika tersedia\n3. Periksa apakah ada banyak request yang sedang diproses bersamaan\n4. Pertimbangkan untuk meningkatkan resource server\n5. Restart service jika memory usage tinggi",
                technicalDetails: "Processing time: {$analysisResult['processing_time_ms']}ms (> 30000ms threshold)"
            );
        }

        return $suggestions;
    }

    /**
     * Check for configuration-related issues
     */
    private function checkConfigurationIssues(array $analysisResult): array
    {
        $suggestions = [];

        // Confidence below threshold
        if ($this->isConfidenceBelowThreshold($analysisResult)) {
            $confidenceThreshold = $this->getConfigValue('proctoring.confidence_threshold', 0.7);
            $suggestions[] = $this->createSuggestion(
                category: 'configuration',
                severity: 'info',
                issue: 'Detection confidence di bawah threshold',
                description: 'Deteksi berhasil tetapi confidence di bawah threshold yang dikonfigurasi. Jika ini sering terjadi pada deteksi yang valid, pertimbangkan untuk menyesuaikan threshold.',
                action: "1. Review hasil deteksi untuk memastikan akurasinya\n2. Jika deteksi valid, pertimbangkan menurunkan CONFIDENCE_THRESHOLD\n3. Sebaliknya, jika banyak false positive, naikkan threshold\n4. Update nilai di file .env: CONFIDENCE_THRESHOLD={$confidenceThreshold}\n5. Restart backend setelah perubahan konfigurasi",
                relatedConfig: ['CONFIDENCE_THRESHOLD'],
                technicalDetails: "Current threshold: {$confidenceThreshold}"
            );
        }

        // False positives - multiple prohibited objects detected with low confidence
        if (isset($analysisResult['object_detection']['prohibited_objects']) && 
            count($analysisResult['object_detection']['prohibited_objects']) > 2) {
            $prohibitedCount = count($analysisResult['object_detection']['prohibited_objects']);
            $suggestions[] = $this->createSuggestion(
                category: 'configuration',
                severity: 'warning',
                issue: 'Banyak objek terlarang terdeteksi',
                description: "Sistem mendeteksi {$prohibitedCount} objek terlarang. Jika ini false positive, pertimbangkan untuk menyesuaikan threshold atau daftar objek terlarang.",
                action: "1. Verifikasi apakah objek yang terdeteksi benar-benar terlarang\n2. Review daftar PROHIBITED_OBJECTS di konfigurasi\n3. Naikkan OBJECT_DETECTION_THRESHOLD jika banyak false positive\n4. Update konfigurasi di .env sesuai kebutuhan\n5. Test ulang setelah perubahan konfigurasi",
                relatedConfig: ['PROHIBITED_OBJECTS', 'OBJECT_DETECTION_THRESHOLD'],
                technicalDetails: "Prohibited objects detected: " . implode(', ', $analysisResult['object_detection']['prohibited_objects'])
            );
        }

        // Multiple faces detected
        if (isset($analysisResult['multi_face_detection']['face_count']) && 
            $analysisResult['multi_face_detection']['face_count'] > 1) {
            $faceCount = $analysisResult['multi_face_detection']['face_count'];
            $suggestions[] = $this->createSuggestion(
                category: 'configuration',
                severity: 'warning',
                issue: 'Multiple wajah terdeteksi',
                description: "Sistem mendeteksi {$faceCount} wajah dalam frame. Ini menunjukkan kemungkinan ada orang lain dalam frame atau deteksi false positive.",
                action: "1. Pastikan hanya ada satu orang di depan kamera\n2. Periksa apakah ada foto/poster wajah di background\n3. Verifikasi threshold multi-face detection di konfigurasi\n4. Jika ini terjadi sering pada situasi normal, sesuaikan MULTI_FACE_THRESHOLD",
                relatedConfig: ['MULTI_FACE_THRESHOLD'],
                technicalDetails: "Face count: {$faceCount}"
            );
        }

        return $suggestions;
    }

    /**
     * Check for performance-related issues
     */
    private function checkPerformanceIssues(array $analysisResult): array
    {
        $suggestions = [];

        // Slow processing (between 5-30 seconds)
        if (isset($analysisResult['processing_time_ms']) && 
            $analysisResult['processing_time_ms'] > 5000 && 
            $analysisResult['processing_time_ms'] <= 30000) {
            $processingTime = round($analysisResult['processing_time_ms'] / 1000, 1);
            $suggestions[] = $this->createSuggestion(
                category: 'performance',
                severity: 'warning',
                issue: 'Processing time lambat',
                description: "Waktu pemrosesan mencapai {$processingTime} detik. Ini dapat mempengaruhi pengalaman pengguna selama ujian real-time.",
                action: "1. Periksa apakah proctoring service menggunakan GPU: docker logs proctoring-service | grep 'device'\n2. Verifikasi resource server mencukupi: docker stats\n3. Pastikan tidak ada proses lain yang menggunakan GPU/CPU secara intensif\n4. Pertimbangkan untuk mengoptimalkan ukuran gambar sebelum dikirim ke service\n5. Monitor penggunaan resource secara berkala",
                technicalDetails: "Processing time: {$analysisResult['processing_time_ms']}ms"
            );
        }

        // Low confidence across multiple components
        $lowConfidenceComponents = $this->getLowConfidenceComponents($analysisResult);
        if (count($lowConfidenceComponents) >= 2) {
            $componentsList = implode(', ', $lowConfidenceComponents);
            $suggestions[] = $this->createSuggestion(
                category: 'performance',
                severity: 'info',
                issue: 'Confidence rendah pada multiple komponen',
                description: "Beberapa komponen ({$componentsList}) menunjukkan confidence yang rendah. Ini bisa mengindikasikan masalah kualitas input atau performa model.",
                action: "1. Periksa kualitas kamera dan pencahayaan\n2. Verifikasi bahwa model AI ter-load dengan benar\n3. Pastikan proctoring service menggunakan device yang tepat (GPU lebih baik)\n4. Pertimbangkan untuk re-download model jika corrupted\n5. Monitor trend confidence dari waktu ke waktu",
                technicalDetails: "Low confidence components: {$componentsList}"
            );
        }

        return $suggestions;
    }

    /**
     * Check if confidence is below threshold
     */
    private function isConfidenceBelowThreshold(array $analysisResult): bool
    {
        $confidenceThreshold = $this->getConfigValue('proctoring.confidence_threshold', 0.7);

        // Check object detection confidence
        if (isset($analysisResult['object_detection']['detected_objects'])) {
            foreach ($analysisResult['object_detection']['detected_objects'] as $object) {
                if (isset($object['confidence']) && 
                    $object['confidence'] < $confidenceThreshold && 
                    $object['confidence'] > 0.5) { // Only consider if not too low
                    return true;
                }
            }
        }

        // Check face detection confidence
        if (isset($analysisResult['face_analysis']['confidence']) && 
            $analysisResult['face_analysis']['confidence'] < $confidenceThreshold &&
            $analysisResult['face_analysis']['confidence'] > 0.5) {
            return true;
        }

        return false;
    }

    /**
     * Get components with low confidence
     */
    private function getLowConfidenceComponents(array $analysisResult): array
    {
        $lowConfidenceComponents = [];
        $confidenceThreshold = 0.7;

        // Face detection
        if (isset($analysisResult['face_analysis']['confidence']) && 
            $analysisResult['face_analysis']['confidence'] < $confidenceThreshold) {
            $lowConfidenceComponents[] = 'face_detection';
        }

        // Object detection
        if (isset($analysisResult['object_detection']['detected_objects'])) {
            $hasLowConfidenceObject = false;
            foreach ($analysisResult['object_detection']['detected_objects'] as $object) {
                if (isset($object['confidence']) && $object['confidence'] < $confidenceThreshold) {
                    $hasLowConfidenceObject = true;
                    break;
                }
            }
            if ($hasLowConfidenceObject) {
                $lowConfidenceComponents[] = 'object_detection';
            }
        }

        // Head pose (if confidence available)
        if (isset($analysisResult['face_analysis']['head_pose']['confidence']) && 
            $analysisResult['face_analysis']['head_pose']['confidence'] < $confidenceThreshold) {
            $lowConfidenceComponents[] = 'head_pose';
        }

        // Eye gaze (if confidence available)
        if (isset($analysisResult['face_analysis']['eye_gaze']['confidence']) && 
            $analysisResult['face_analysis']['eye_gaze']['confidence'] < $confidenceThreshold) {
            $lowConfidenceComponents[] = 'eye_gaze';
        }

        return $lowConfidenceComponents;
    }

    /**
     * Get configuration value (with fallback for testing)
     */
    private function getConfigValue(string $key, $default)
    {
        // In Laravel context, use config helper
        if (function_exists('config')) {
            return config($key, $default);
        }
        
        // Fallback for unit tests
        return $default;
    }

    /**
     * Create a troubleshooting suggestion object
     *
     * @param string $category Category: 'camera', 'network', 'configuration', 'performance'
     * @param string $severity Severity: 'critical', 'warning', 'info'
     * @param string $issue Short issue title
     * @param string $description Detailed description in Bahasa Indonesia
     * @param string $action Step-by-step instructions in Bahasa Indonesia
     * @param string|null $technicalDetails Optional technical info (commands, error messages)
     * @param array|null $relatedConfig Optional array of config keys
     * @param string|null $documentationLink Optional link to docs
     * @return array TroubleshootingSuggestion array
     */
    private function createSuggestion(
        string $category,
        string $severity,
        string $issue,
        string $description,
        string $action,
        ?string $technicalDetails = null,
        ?array $relatedConfig = null,
        ?string $documentationLink = null
    ): array {
        $suggestion = [
            'category' => $category,
            'severity' => $severity,
            'issue' => $issue,
            'description' => $description,
            'action' => $action,
        ];

        if ($technicalDetails !== null) {
            $suggestion['technical_details'] = $technicalDetails;
        }

        if ($relatedConfig !== null && count($relatedConfig) > 0) {
            $suggestion['related_config'] = $relatedConfig;
        }

        if ($documentationLink !== null) {
            $suggestion['documentation_link'] = $documentationLink;
        }

        return $suggestion;
    }
}
