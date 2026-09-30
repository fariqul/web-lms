<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Proctoring Service URL
    |--------------------------------------------------------------------------
    | URL internal ke Python microservice (FastAPI + YOLO + MediaPipe).
    | Di Docker, ini adalah nama service di docker-compose.
    */
    'service_url' => env('PROCTORING_SERVICE_URL', 'http://proctoring:8001'),

    /*
    |--------------------------------------------------------------------------
    | YOLO Confidence Threshold
    |--------------------------------------------------------------------------
    | Confidence minimum untuk YOLO object detection (0.0 – 1.0).
    | Semakin rendah = lebih sensitif tapi lebih banyak false positive.
    */
    'confidence_threshold' => (float) env('CONFIDENCE_THRESHOLD', 0.45),

    /*
    |--------------------------------------------------------------------------
    | Head Pose Thresholds (derajat)
    |--------------------------------------------------------------------------
    | Head yaw  = rotasi kiri/kanan.
    | Head pitch = rotasi atas/bawah.
    | Melebihi threshold → is_looking_away = true di Python.
    | Minimal di atas 11° (margin error MediaPipe solvePnP).
    */
    'head_yaw_threshold'   => (float) env('HEAD_YAW_THRESHOLD', 38),
    'head_pitch_threshold' => (float) env('HEAD_PITCH_THRESHOLD', 33),

    /*
    |--------------------------------------------------------------------------
    | Eye Gaze Threshold
    |--------------------------------------------------------------------------
    | Rasio deviasi iris (0.0 – 1.0). Melebihi threshold → is_gaze_deviated.
    */
    'eye_gaze_threshold' => (float) env('EYE_GAZE_THRESHOLD', 0.48),

    /*
    |--------------------------------------------------------------------------
    | Face Similarity Threshold
    |--------------------------------------------------------------------------
    | Cosine similarity minimum antara face embedding snapshot dengan baseline.
    | Di bawah threshold → identity mismatch alert.
    | Nilai tipikal face_recognition library: 0.6.
    */
    'face_similarity_threshold' => (float) env('FACE_SIMILARITY_THRESHOLD', 0.6),

    /*
    |--------------------------------------------------------------------------
    | Alert Deduplication Window (detik)
    |--------------------------------------------------------------------------
    | Jangka waktu minimum antar alert yang sama per siswa agar tidak spam.
    */
    'alert_dedup_window_seconds' => (int) env('ALERT_DEDUP_WINDOW_SECONDS', 15),

    /*
    |--------------------------------------------------------------------------
    | Risk Score Thresholds
    |--------------------------------------------------------------------------
    | Batas risk_score dari Python service untuk menentukan apakah
    | snapshot dianggap violation dan level severity broadcast alert.
    |
    | violation_min  : risk_score >= nilai ini → is_violation = true di snapshot
    | alert_high_min : risk_score >= nilai ini → severity 'warning' di broadcast
    | alert_crit_min : risk_score >= nilai ini → severity 'critical' di broadcast
    | alert_any_min  : risk_score >= nilai ini → broadcast dikirim sama sekali
    */
    'risk_score' => [
        'violation_min'  => (int) env('PROCTORING_RISK_VIOLATION_MIN', 20),
        'alert_any_min'  => (int) env('PROCTORING_RISK_ALERT_ANY', 15),
        'alert_high_min' => (int) env('PROCTORING_RISK_ALERT_HIGH', 30),
        'alert_crit_min' => (int) env('PROCTORING_RISK_ALERT_CRIT', 60),
    ],

    /*
    |--------------------------------------------------------------------------
    | Risk Level Thresholds (total_score → risk_level label)
    |--------------------------------------------------------------------------
    | Sesuai spesifikasi: Low 0–25, Medium 26–50, High 51–75, Critical 76–100.
    | Ubah via .env jika kalibrasi menunjukkan threshold perlu disesuaikan.
    */
    'risk_level' => [
        'medium_min'   => (int) env('PROCTORING_LEVEL_MEDIUM_MIN', 26),
        'high_min'     => (int) env('PROCTORING_LEVEL_HIGH_MIN', 51),
        'critical_min' => (int) env('PROCTORING_LEVEL_CRITICAL_MIN', 76),
    ],

    /*
    |--------------------------------------------------------------------------
    | Score Weights (bobot per indikator dalam total_score, harus jumlah = 1.0)
    |--------------------------------------------------------------------------
    | Ubah via .env untuk kalibrasi berdasarkan data TP/FP nyata.
    | Nilai default: object_detection paling tinggi (paling kuat indikasi).
    */
    'score_weights' => [
        'object_detection'  => (float) env('PROCTORING_WEIGHT_OBJECT', 0.25),
        'identity_mismatch' => (float) env('PROCTORING_WEIGHT_IDENTITY', 0.20),
        'multi_face'        => (float) env('PROCTORING_WEIGHT_MULTI_FACE', 0.20),
        'no_face'           => (float) env('PROCTORING_WEIGHT_NO_FACE', 0.10),
        'head_turn'         => (float) env('PROCTORING_WEIGHT_HEAD_TURN', 0.10),
        'eye_gaze'          => (float) env('PROCTORING_WEIGHT_EYE_GAZE', 0.05),
        'tab_switch'        => (float) env('PROCTORING_WEIGHT_TAB_SWITCH', 0.10),
    ],

    /*
    |--------------------------------------------------------------------------
    | Score Increments per Deteksi
    |--------------------------------------------------------------------------
    | Berapa poin yang ditambahkan ke skor per-indikator setiap kali
    | satu deteksi terjadi. Nilai di-cap ke 100.
    |
    | object_per_item : per objek terlarang yang terdeteksi
    | multi_face      : per frame dengan >1 orang
    | no_face         : per frame tanpa wajah
    | head_turn       : per frame kepala menoleh
    | eye_gaze        : per frame gaze menyimpang
    | identity_base   : per snapshot identity mismatch (dari checkBaselineFaceMatch)
    */
    'score_increments' => [
        'object_per_item' => (int) env('PROCTORING_INC_OBJECT', 15),
        'multi_face'      => (int) env('PROCTORING_INC_MULTI_FACE', 10),
        'no_face'         => (int) env('PROCTORING_INC_NO_FACE', 15),
        'head_turn'       => (int) env('PROCTORING_INC_HEAD_TURN', 8),
        'eye_gaze'        => (int) env('PROCTORING_INC_EYE_GAZE', 5),
        'identity_base'   => (int) env('PROCTORING_INC_IDENTITY', 30),
    ],

    /*
    |--------------------------------------------------------------------------
    | Calibration Logging
    |--------------------------------------------------------------------------
    | Jika enabled, setiap snapshot yang dianalisis AI menulis satu baris ke
    | tabel proctoring_calibration_logs (raw scores + binary AI decisions).
    | Human reviewer kemudian mengisi kolom ground_truth_* untuk evaluasi.
    | Nonaktifkan di production jika tabel terlalu besar dan kalibrasi sudah selesai.
    */
    'calibration' => [
        'enabled' => (bool) env('PROCTORING_CALIBRATION_ENABLED', true),
    ],

    /*
    |--------------------------------------------------------------------------
    | Snapshot Retention Policy
    |--------------------------------------------------------------------------
    | retention_hours : berapa lama file snapshot NON-violation disimpan.
    |                   Setelah expires_at terlampaui, file dihapus oleh
    |                   artisan command `proctoring:cleanup`. Metadata tetap.
    | violation_keep  : jika true, snapshot violation TIDAK punya expires_at
    |                   (disimpan sampai admin menghapus manual).
    */
    'retention' => [
        'hours'          => (int) env('PROCTORING_RETENTION_HOURS', 48),
        'violation_keep' => (bool) env('PROCTORING_VIOLATION_KEEP', true),
    ],

];
