# Proctoring Audit — 2026-09-30
## Eksplorasi Lengkap Sistem AI Proctoring Diagnostic (Tahap 0)

---

## 1. Peta File-File Kunci

| File | Deskripsi |
|------|-----------|
| `src/app/admin/proctoring-diagnostic/page.tsx` | Halaman utama Diagnostic Tool — state management, layout, orchestrasi semua komponen |
| `src/components/diagnostic/InteractiveScenarioTester.tsx` | Komponen scenario testing (6 skenario, countdown modal, result summary) |
| `src/components/diagnostic/CameraPreview.tsx` | Pratinjau kamera + tombol Capture & Analyze / Set Baseline / Stop Camera |
| `src/components/diagnostic/AnalysisResults.tsx` | Tampilan Overall Health Score + Component Analysis |
| `src/components/diagnostic/DetectionOverlay.tsx` | Overlay objek/wajah terdeteksi di atas frame |
| `src/components/diagnostic/TroubleshootingSuggestions.tsx` | Saran troubleshooting |
| `src/components/diagnostic/TestHistory.tsx` | Riwayat tes diagnostik |
| `src/components/diagnostic/LiveHealthMonitor.tsx` | Monitor kesehatan sistem real-time (polling 10 s) |
| `src/hooks/useProctoring.ts` | Hook face-api.js — deteksi no_face/multi_face lokal di browser |
| `src/lib/api.ts` | Helper `apiGet`/`apiPost` — attaches Bearer token dari localStorage |
| `src/types/diagnostic.ts` | Type definitions + `SCENARIO_CONFIGS` (6 skenario + countdown config) |
| `backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php` | Controller semua endpoint diagnostic |
| `backend/app/Http/Controllers/Api/ProctoringMonitorController.php` | Controller monitor ujian sungguhan (alerts, scores, HITL review) |
| `backend/app/Jobs/AnalyzeSnapshotJob.php` | Job queue untuk analisis snapshot ujian sungguhan |
| `backend/app/Models/ProctoringAlert.php` | Model alert (HITL lifecycle: pending → confirmed/dismissed) |
| `backend/app/Models/ProctoringScore.php` | Model score kumulatif per exam result |
| `backend/app/Models/ProctoringDiagnosticTest.php` | Model hasil tes diagnostik |
| `backend/app/Models/SystemSetting.php` | Key-value settings (belum ada proctoring key di sini) |
| `backend/config/proctoring.php` | Semua config proctoring → env var mapping |
| `backend/proctoring-service/main.py` | FastAPI microservice — YOLO + MediaPipe + face_recognition |
| `backend/database/migrations/2026_03_01_000002_create_proctoring_tables.php` | `proctoring_scores` + `proctoring_alerts` |
| `backend/database/migrations/2026_06_12_000001_create_proctoring_diagnostic_tests_table.php` | `proctoring_diagnostic_tests` |
| `backend/database/migrations/2026_06_12_000002_create_proctoring_diagnostic_issues_table.php` | `proctoring_diagnostic_issues` |
| `backend/database/migrations/2026_09_30_000003_create_proctoring_calibration_logs_table.php` | `proctoring_calibration_logs` |
| `backend/database/migrations/2026_09_30_000004_add_review_fields_to_proctoring_alerts.php` | Kolom HITL di `proctoring_alerts` |

---

## 2. Semua Endpoint Laravel ↔ FastAPI

### Endpoint Diagnostic Tool (Existing)

| Method | URL (Laravel) | Controller Method | Keterangan |
|--------|--------------|-------------------|------------|
| `POST` | `/api/proctoring-diagnostic/set-baseline` | `setBaseline` | Kirim frame ke `/analyze` FastAPI, simpan embedding di Redis cache (key: `diagnostic_baseline_{user_id}`, TTL 2 jam) |
| `POST` | `/api/proctoring-diagnostic/analyze` | `analyzeCapture` | Kirim frame ke `/analyze` FastAPI, hitung component scores, simpan ke `proctoring_diagnostic_tests` |
| `GET`  | `/api/proctoring-diagnostic/tests` | `getTestHistory` | 10 tes terbaru |
| `GET`  | `/api/proctoring-diagnostic/tests/{id}` | `getTestResult` | Detail satu tes |
| `GET`  | `/api/proctoring-diagnostic/tests/compare?ids=1,2` | `compareTests` | Perbandingan dua tes |
| `GET`  | `/api/proctoring-diagnostic/tests/{id}/report` | `downloadReport` | Download JSON report |
| `GET`  | `/api/proctoring-diagnostic/health` | `getHealthStatus` | Status backend/FastAPI/DB/queue (cache 10 s) |
| `POST` | `/api/proctoring-diagnostic/scenarios/{scenario}/run` | `runScenario` | Jalankan skenario tertentu (reuse `analyzeCapture`) |

**Skenario valid:** `object_detection`, `multi_face`, `head_turning`, `identity_baseline`, `identity_mismatch`

### Endpoint Monitor Ujian (Existing, bukan Diagnostic)

| Method | URL | Keterangan |
|--------|-----|-----------|
| `GET` | `/api/exams/{exam}/proctoring-scores` | Semua skor siswa |
| `GET` | `/api/exams/{exam}/proctoring-alerts` | Semua alert |
| `GET` | `/api/exams/{exam}/proctoring-alerts/pending-count` | Jumlah alert belum direview |
| `POST` | `/api/proctoring-alerts/{alert}/review` | HITL review (confirmed/dismissed) |
| `POST` | `/api/proctoring-alerts/{alert}/acknowledge` | Legacy acknowledge |
| `GET` | `/api/exam-results/{result}/proctoring` | Detail proctoring per siswa |

### FastAPI Endpoints

| Method | URL (FastAPI :8001) | Request | Response Key Fields |
|--------|--------------------|---------|--------------------|
| `GET`  | `/health` | — | `yolo_loaded`, `mediapipe_loaded`, `face_recognition_loaded`, `device` |
| `POST` | `/analyze` | `multipart/form-data: image` (UploadFile) | `success`, `person_count`, `face_analysis` (obj), `suspicious_objects` (list), `prohibited_objects` (list), `all_detections` (list), `risk_score` (0–100), `processing_time_ms`, `message`, `detections` (list str) |
| `POST` | `/analyze-batch` | `multipart/form-data: images[]` (max 10) | `success`, `results` (list: `filename`, `person_count`, `prohibited_objects`, `face_detected`, `is_looking_away`, `has_issues`) |

### FastAPI `/analyze` — Detail Response Schema

```
face_analysis:
  face_detected: bool
  face_count: int
  face_confidence: float
  face_bbox: [x1,y1,x2,y2] | null
  head_yaw: float | null        # derajat, negatif = kiri
  head_pitch: float | null      # derajat, positif = atas
  head_roll: float | null
  is_looking_away: bool
  looking_direction: "center"|"left"|"right"|"up"|"down"|"no_face"
  eye_gaze_ratio: float | null  # 0=center, 1=extreme
  is_gaze_deviated: bool
  face_embedding: [float x128] | null  # face_recognition library

all_detections / suspicious_objects / prohibited_objects:
  class_id: int
  class_name: str
  confidence: float
  bbox: [x1,y1,x2,y2]
  is_prohibited: bool
```

### Cara Laravel Memanggil FastAPI
- **HTTP multipart upload** via `Http::timeout(20..60)->attach('image', $imageContents, 'capture.jpg')->post("{$url}/analyze")`
- Untuk Diagnostic: timeout 60 s
- Untuk AnalyzeSnapshotJob: timeout 20 s
- **Tidak ada auth token** antara Laravel ↔ FastAPI (internal Docker network)
- FastAPI **tidak menerima konfigurasi threshold dari request** — semua hardcoded dari env var saat startup

---

## 3. Semua Parameter Threshold

### Parameter Threshold yang Ada Saat Ini

| Nama Env Var | Default | Dipakai Di | Configurable? |
|-------------|---------|------------|---------------|
| `CONFIDENCE_THRESHOLD` | `0.45` (Laravel) / `0.25` (FastAPI) | `config/proctoring.php` L10, `main.py` L28 | ⚠️ **Inkonsisten** — dua default berbeda |
| `HEAD_YAW_THRESHOLD` | `38` (derajat) | `config/proctoring.php` L24, `main.py` L33, `ProctoringDiagnosticController.php` L773 | ✅ .env |
| `HEAD_PITCH_THRESHOLD` | `33` (derajat) | `config/proctoring.php` L25, `main.py` L34, `ProctoringDiagnosticController.php` L774 | ✅ .env |
| `EYE_GAZE_THRESHOLD` | `0.48` | `config/proctoring.php` L32, `main.py` L35, `ProctoringDiagnosticController.php` L805 | ✅ .env |
| `FACE_SIMILARITY_THRESHOLD` | `0.6` | `config/proctoring.php` L40, `AnalyzeSnapshotJob.php` L580 | ✅ .env |
| `ALERT_DEDUP_WINDOW_SECONDS` | `15` | `config/proctoring.php` L47, `AnalyzeSnapshotJob.php` L537 | ✅ .env |
| `PROCTORING_RISK_VIOLATION_MIN` | `20` | `config/proctoring.php` L60 | ✅ .env (commented) |
| `PROCTORING_RISK_ALERT_ANY` | `15` | `config/proctoring.php` L61 | ✅ .env (commented) |
| `PROCTORING_RISK_ALERT_HIGH` | `30` | `config/proctoring.php` L62 | ✅ .env (commented) |
| `PROCTORING_RISK_ALERT_CRIT` | `60` | `config/proctoring.php` L63 | ✅ .env (commented) |
| `PROCTORING_LEVEL_MEDIUM_MIN` | `26` | `config/proctoring.php` L74 | ✅ .env (commented) |
| `PROCTORING_LEVEL_HIGH_MIN` | `51` | `config/proctoring.php` L75 | ✅ .env (commented) |
| `PROCTORING_LEVEL_CRITICAL_MIN` | `76` | `config/proctoring.php` L76 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_OBJECT` | `0.25` | `config/proctoring.php` L86 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_IDENTITY` | `0.20` | `config/proctoring.php` L87 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_MULTI_FACE` | `0.20` | `config/proctoring.php` L88 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_NO_FACE` | `0.10` | `config/proctoring.php` L89 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_HEAD_TURN` | `0.10` | `config/proctoring.php` L90 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_EYE_GAZE` | `0.05` | `config/proctoring.php` L91 | ✅ .env (commented) |
| `PROCTORING_WEIGHT_TAB_SWITCH` | `0.10` | `config/proctoring.php` L92 | ✅ .env (commented) |
| `PROCTORING_INC_OBJECT` | `15` | `config/proctoring.php` L104 | ✅ .env (commented) |
| `PROCTORING_INC_MULTI_FACE` | `10` | `config/proctoring.php` L105 | ✅ .env (commented) |
| `PROCTORING_INC_NO_FACE` | `15` | `config/proctoring.php` L106 | ✅ .env (commented) |
| `PROCTORING_INC_HEAD_TURN` | `8` | `config/proctoring.php` L107 | ✅ .env (commented) |
| `PROCTORING_INC_EYE_GAZE` | `5` | `config/proctoring.php` L108 | ✅ .env (commented) |
| `PROCTORING_INC_IDENTITY` | `30` | `config/proctoring.php` L109 | ✅ .env (commented) |
| `PROCTORING_CALIBRATION_ENABLED` | `true` | `config/proctoring.php` L121 | ✅ .env (commented) |
| `PROCTORING_RETENTION_HOURS` | `48` | `config/proctoring.php` L131 | ✅ .env (commented) |
| `PROCTORING_VIOLATION_KEEP` | `true` | `config/proctoring.php` L132 | ✅ .env (commented) |
| `PROCTORING_SERVICE_URL` | `http://proctoring:8001` | `config/proctoring.php` L7 | ✅ .env |

### Parameter yang HANYA Ada di FastAPI (tidak di Laravel config)

| Nama Env Var | Default | Keterangan |
|-------------|---------|-----------|
| `YOLO_MODEL` | `yolov8n.pt` | Path model YOLO |
| `DEVICE` | `"0"` | GPU device ID atau `"cpu"` |
| `LOG_LEVEL` | `"INFO"` | Log level FastAPI |

### ⚠️ Masalah: FastAPI Membaca Threshold dari Env Sendiri
FastAPI membaca `HEAD_YAW_THRESHOLD`, `HEAD_PITCH_THRESHOLD`, `EYE_GAZE_THRESHOLD`, `CONFIDENCE_THRESHOLD` dari env var **saat startup** dan menyimpannya sebagai **konstanta modul** (bukan per-request). Nilai ini dipakai untuk keputusan `is_looking_away` dan `is_gaze_deviated` dalam response. Laravel hanya membaca dari config untuk scoring-nya sendiri.

**Dampak untuk Tahap 1:** Saat threshold diubah dari UI, perubahan akan berlaku di logika Laravel (ProctoringDiagnosticController scoring) **tapi TIDAK** di keputusan FastAPI (`is_looking_away`, `is_gaze_deviated`) kecuali threshold dikirim per-request ke FastAPI.

### Parameter Client-Side yang Belum Configurable dari Backend

| Parameter | Nilai Hardcoded | Lokasi |
|-----------|----------------|--------|
| Snapshot interval | 30 s (terlihat dari komentar: "every 30 second interval" di exam page) | `src/app/ujian/[id]/page.tsx` |
| Anomaly detection interval | `3000` ms (`detectionInterval: 3000`) | `src/app/ujian/[id]/page.tsx` L298 |
| Anomaly snapshot cooldown | `20_000` ms | `src/app/ujian/[id]/page.tsx` L292, `useProctoring.ts` |
| Face detection threshold (face-api.js) | `0.35` | `src/hooks/useProctoring.ts` |
| Confirmation count (no_face) | `3` kali berturut-turut | `src/hooks/useProctoring.ts` |
| Confirmation count (multi_face) | `2` kali berturut-turut | `src/hooks/useProctoring.ts` |

---

## 4. Skema DB Lengkap — Tabel Proctoring

### `proctoring_scores`
| Kolom | Tipe | Nullable | Keterangan |
|-------|------|----------|-----------|
| `id` | bigint PK | NO | |
| `exam_result_id` | bigint FK (exam_results) | NO | UNIQUE — satu record per ujian |
| `student_id` | bigint FK (users) | NO | |
| `exam_id` | bigint FK (exams) | NO | |
| `no_face_score` | int | NO | default 0, 0–100 |
| `multi_face_score` | int | NO | default 0 |
| `head_turn_score` | int | NO | default 0 |
| `eye_gaze_score` | int | NO | default 0 |
| `identity_mismatch_score` | int | NO | default 0 |
| `object_detection_score` | int | NO | default 0 |
| `tab_switch_score` | int | NO | default 0 |
| `total_score` | int | NO | default 0, weighted |
| `risk_level` | varchar(20) | NO | low/medium/high/critical |
| `no_face_count` | int | NO | default 0 |
| `multi_face_count` | int | NO | default 0 |
| `head_turn_count` | int | NO | default 0 |
| `eye_gaze_count` | int | NO | default 0 |
| `identity_mismatch_count` | int | NO | default 0 |
| `object_detected_count` | int | NO | default 0 |
| `total_snapshots` | int | NO | default 0 |
| `total_analyzed` | int | NO | default 0 |
| `created_at` | timestamp | YES | |
| `updated_at` | timestamp | YES | |

### `proctoring_alerts`
| Kolom | Tipe | Nullable | Keterangan |
|-------|------|----------|-----------|
| `id` | bigint PK | NO | |
| `exam_id` | bigint FK (exams) | NO | |
| `student_id` | bigint FK (users) | NO | |
| `snapshot_id` | bigint FK (monitoring_snapshots) | YES | |
| `type` | varchar(50) | NO | no_face/multi_face/head_turn/eye_gaze/object_detected/identity_mismatch |
| `severity` | varchar(20) | NO | warning/alert/critical |
| `description` | varchar | YES | |
| `confidence` | decimal(4,3) | NO | default 0 |
| `details` | json | YES | raw detection data |
| `acknowledged` | boolean | NO | default false |
| `acknowledged_at` | timestamp | YES | |
| `review_status` | enum | NO | pending/confirmed/dismissed, default pending |
| `reviewed_by` | bigint FK (users) | YES | |
| `reviewed_at` | timestamp | YES | |
| `admin_note` | varchar(500) | YES | |
| `violation_id` | bigint FK (violations) | YES | |
| `created_at` | timestamp | YES | |
| `updated_at` | timestamp | YES | |
| **INDEX** | `idx_alerts_exam_review_status` (exam_id, review_status) | | |

### `proctoring_diagnostic_tests`
| Kolom | Tipe | Nullable | Keterangan |
|-------|------|----------|-----------|
| `id` | bigint PK | NO | |
| `admin_id` | bigint FK (users) | NO | |
| `overall_health_score` | int | NO | 0–100 |
| `overall_status` | enum | NO | healthy/warning/critical |
| `component_scores` | json | NO | {object_detection, face_detection, head_pose, eye_gaze, face_embedding} masing-masing {status, score, confidence, details} |
| `detected_objects` | json | YES | |
| `detected_faces` | json | YES | |
| `processing_time_ms` | int | NO | |
| `image_size_kb` | int | YES | |
| `test_type` | enum | NO | manual/scenario, default manual |
| `scenario_name` | varchar(50) | YES | |
| `created_at` | timestamp | NO | `useCurrent()` |
| **INDEX** | `idx_admin_created` (admin_id, created_at), `idx_status` (overall_status), `idx_created` (created_at) | | |
| **NOTE** | TIDAK ada `updated_at` (`UPDATED_AT = null`) | | |

### `proctoring_diagnostic_issues`
| Kolom | Tipe | Nullable | Keterangan |
|-------|------|----------|-----------|
| `id` | bigint PK | NO | |
| `test_id` | bigint FK (proctoring_diagnostic_tests) | NO | cascade delete |
| `category` | enum | NO | camera/network/configuration/performance |
| `severity` | enum | NO | critical/warning/info |
| `issue` | varchar(255) | NO | |
| `description` | text | NO | |
| `action` | text | NO | |
| `technical_details` | text | YES | |
| `related_config` | json | YES | array of config keys |
| `documentation_link` | varchar(255) | YES | |
| `created_at` | timestamp | NO | `useCurrent()` |

### `proctoring_calibration_logs`
| Kolom | Tipe | Nullable | Keterangan |
|-------|------|----------|-----------|
| `id` | bigint PK | NO | |
| `exam_id` | bigint FK (exams) | NO | cascade |
| `student_id` | bigint FK (users) | NO | cascade |
| `snapshot_id` | bigint FK (monitoring_snapshots) | YES | set null on delete |
| `exam_result_id` | bigint FK (exam_results) | YES | set null on delete |
| `no_face_raw` | tinyint unsigned | NO | default 0 |
| `multi_face_raw` | tinyint unsigned | NO | default 0 |
| `head_turn_raw` | tinyint unsigned | NO | default 0 |
| `eye_gaze_raw` | tinyint unsigned | NO | default 0 |
| `object_detection_raw` | tinyint unsigned | NO | default 0 |
| `identity_mismatch_raw` | tinyint unsigned | NO | default 0 |
| `risk_score_raw` | smallint unsigned | NO | default 0 (dari FastAPI) |
| `total_score` | tinyint unsigned | NO | default 0 (weighted PHP) |
| `ai_no_face` | boolean | NO | default false |
| `ai_multi_face` | boolean | NO | default false |
| `ai_head_turn` | boolean | NO | default false |
| `ai_eye_gaze` | boolean | NO | default false |
| `ai_object_detected` | boolean | NO | default false |
| `ai_identity_mismatch` | boolean | NO | default false |
| `ai_is_violation` | boolean | NO | default false |
| `ground_truth_no_face` | boolean | YES | null = belum dilabel |
| `ground_truth_multi_face` | boolean | YES | |
| `ground_truth_head_turn` | boolean | YES | |
| `ground_truth_eye_gaze` | boolean | YES | |
| `ground_truth_object_detected` | boolean | YES | |
| `ground_truth_identity_mismatch` | boolean | YES | |
| `ground_truth_is_violation` | boolean | YES | |
| `scenario_label` | varchar(64) | YES | null = ujian sungguhan; diset manual saat sesi kalibrasi |
| `processing_time_ms` | smallint unsigned | YES | |
| `raw_detections` | json | YES | Python "detections" array |
| `face_analysis` | json | YES | Python face_analysis object |
| `risk_level` | varchar(20) | YES | low/medium/high/critical |
| `captured_at` | timestamp | YES | INDEX |
| `created_at` | timestamp | YES | |
| `updated_at` | timestamp | YES | |
| **INDEX** | `scenario_label`, `(exam_id, captured_at)`, `(exam_id, student_id, captured_at)`, `(scenario_label, captured_at)` | | |

**Tabel yang BELUM ADA:** `proctoring_configurations`, `proctoring_config_versions`, `experiment_sessions`, `experiment_trials`

---

## 5. Gap Analysis

### Gap untuk Tahap 1 — Pengaturan Ambang Batas dari UI

| # | Gap | Dampak |
|---|-----|--------|
| G1 | **Tidak ada tabel konfigurasi di DB.** Semua threshold di .env saja — tidak bisa diubah dari UI tanpa restart. | Tujuan utama Tahap 1 tidak bisa dicapai |
| G2 | **FastAPI membaca threshold dari env saat startup** sebagai modul-level constants (`HEAD_YAW_THRESHOLD`, `EYE_GAZE_THRESHOLD`). Perubahan DB tidak otomatis propagate ke FastAPI. | Keputusan `is_looking_away`/`is_gaze_deviated` di FastAPI tetap pakai nilai lama |
| G3 | **Tidak ada mekanisme draft vs active.** Tidak ada isolasi antara config untuk eksperimen dan config untuk ujian sungguhan. | Eksperimen bisa mengubah behavior ujian sungguhan |
| G4 | **Tidak ada versioning.** Tidak ada riwayat perubahan, tidak bisa rollback. | Tidak memenuhi kebutuhan audit trail skripsi |
| G5 | **Diagnostic Tool tidak menerima threshold override saat analyze.** Controller membaca dari `config('proctoring.*')` — bukan dari body request. | Draft config tidak bisa langsung diuji di Diagnostic Tool |
| G6 | **Snapshot interval, anomaly cooldown, dan face-api.js threshold hardcoded di frontend.** | Tidak bisa dikalibrasi tanpa deploy ulang |
| G7 | **Tidak ada endpoint untuk get/set active config.** | Frontend tidak bisa menampilkan nilai saat ini atau submit perubahan |
| G8 | **SystemSetting tidak punya proctoring key.** | Tidak ada tempat menyimpan config yang berlaku tanpa restart |
| G9 | **Identity mismatch di Diagnostic Tool** dihitung dengan Euclidean distance hardcoded threshold `0.6` di controller, sementara `AnalyzeSnapshotJob` menggunakan cosine similarity. Inkonsistensi ini perlu diselesaikan. | Skor identity mismatch berbeda antara Diagnostic Tool dan ujian sungguhan |
| G10 | **CONFIDENCE_THRESHOLD** punya dua default berbeda: 0.45 di Laravel, 0.25 di FastAPI. | Ambiguous — tidak jelas mana yang "benar" |

### Gap untuk Tahap 2 — Pengambilan Data Otomatis

| # | Gap | Dampak |
|---|-----|--------|
| G11 | **Tidak ada tabel `experiment_sessions`.** Tidak ada konsep sesi eksperimen terstruktur. | Tidak bisa melabel capture dengan kondisi (cahaya, jarak, kamera, dataset_split) |
| G12 | **Tidak ada tabel `experiment_trials`.** `proctoring_calibration_logs` ada tapi terikat ke ujian sungguhan (`exam_id`, `student_id` wajib). | Capture eksperimen tidak bisa disimpan tanpa exam context. `calibration_logs` tidak bisa dipakai untuk Tahap 2 secara langsung |
| G13 | **Tidak ada snapshot storage untuk eksperimen.** Snapshot ujian disimpan di `storage/app/public/monitoring-snapshots`. Tidak ada direktori/volume terpisah. | Risiko tercampurnya snapshot ujian dengan snapshot eksperimen |
| G14 | **Tidak ada ground truth yang terintegrasi dengan capture otomatis.** `calibration_logs.scenario_label` ada tapi nullable dan diset manual. | Data Tahap 2 tidak punya label ground truth otomatis dari skenario |
| G15 | **Tidak ada metrik latensi terpisah.** Saat ini hanya `processing_time_ms` (waktu roundtrip Laravel→FastAPI). Tidak ada `inference_ms`, `queue_wait_ms`, `end_to_end_ms`. | Kebutuhan spesifikasi item 8 tidak terpenuhi |
| G16 | **Tidak ada capture person_count terpisah dari face_count.** FastAPI mengembalikan keduanya tapi `proctoring_calibration_logs` hanya menyimpan binary `ai_multi_face`. Nilai raw `person_count` dan `face_count` tersimpan di `face_analysis` JSON tapi tidak di kolom terpisah. | User melaporkan "2 Person, 1 wajah" — penting untuk evaluasi |
| G17 | **Tidak ada endpoint untuk eksperimen** (start session, capture trial, list sessions, export CSV). | Semua perlu dibuat baru |
| G18 | **Tidak ada rate limiting khusus untuk capture eksperimen** terpisah dari ujian. | Berisiko membebani FastAPI saat ujian berlangsung |
| G19 | **Tidak ada indikator apakah ada ujian aktif.** | Tidak bisa memperingatkan peneliti sebelum eksperimen dimulai |
| G20 | **Tidak ada Docker volume terpisah untuk snapshot eksperimen.** | Snapshot eksperimen tidak terisolasi dari snapshot ujian |

---

## 6. Rancangan Skema DB Baru

### `proctoring_configurations`

Tabel ini menyimpan satu set nilai parameter untuk scope tertentu. Dua baris utama: `draft` (untuk eksperimen) dan `active` (untuk ujian sungguhan).

```sql
CREATE TABLE proctoring_configurations (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  scope                   ENUM('draft','active') NOT NULL,
  -- Head pose
  head_yaw_threshold      FLOAT NOT NULL DEFAULT 38,
  head_pitch_threshold    FLOAT NOT NULL DEFAULT 33,
  -- Eye gaze
  eye_gaze_threshold      FLOAT NOT NULL DEFAULT 0.48,
  -- Face similarity
  face_similarity_threshold FLOAT NOT NULL DEFAULT 0.6,
  -- YOLO confidence
  confidence_threshold    FLOAT NOT NULL DEFAULT 0.45,
  -- Per-class YOLO confidence (JSON: {"cell_phone": 0.45, "book": 0.45})
  per_class_confidence    JSON NULL,
  -- Alert deduplication
  alert_dedup_window_sec  INT NOT NULL DEFAULT 15,
  -- Score weights (JSON: {"object_detection": 0.25, ...}, sum must = 1.0)
  score_weights           JSON NOT NULL,
  -- Score increments (JSON: {"object_per_item": 15, ...})
  score_increments        JSON NOT NULL,
  -- Risk score thresholds
  risk_violation_min      INT NOT NULL DEFAULT 20,
  risk_alert_any_min      INT NOT NULL DEFAULT 15,
  risk_alert_high_min     INT NOT NULL DEFAULT 30,
  risk_alert_crit_min     INT NOT NULL DEFAULT 60,
  -- Risk level thresholds
  risk_level_medium_min   INT NOT NULL DEFAULT 26,
  risk_level_high_min     INT NOT NULL DEFAULT 51,
  risk_level_critical_min INT NOT NULL DEFAULT 76,
  -- Client-side params (dikirim ke frontend saat mulai ujian)
  snapshot_interval_sec   INT NOT NULL DEFAULT 30,
  anomaly_trigger_sec     INT NOT NULL DEFAULT 3,
  anomaly_cooldown_sec    INT NOT NULL DEFAULT 20,
  -- Meta
  notes                   TEXT NULL,
  created_by              BIGINT UNSIGNED NULL,  -- FK users
  updated_by              BIGINT UNSIGNED NULL,  -- FK users
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_scope (scope)
);
```

**Catatan desain:**
- Hanya dua baris (scope = 'draft' atau 'active').
- Saat tabel kosong atau query gagal, semua kode fallback ke nilai `config('proctoring.*')` (env).
- Cache key: `proctoring:config:active` dan `proctoring:config:draft` (Redis, TTL 5 menit atau invalidate on save).

### `proctoring_config_versions`

Audit trail setiap perubahan scope `active`.

```sql
CREATE TABLE proctoring_config_versions (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  config_scope   ENUM('active') NOT NULL DEFAULT 'active',
  version_number INT NOT NULL,
  snapshot       JSON NOT NULL,   -- nilai lengkap config saat itu
  changed_by     BIGINT UNSIGNED NULL,  -- FK users
  notes          TEXT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_scope_version (config_scope, version_number DESC),
  INDEX idx_created_at (created_at)
);
```

**Kolom `config_version_id`** akan ditambahkan ke:
- `proctoring_diagnostic_tests` (version yang dipakai saat tes, nullable)
- `proctoring_calibration_logs` (version yang dipakai, nullable)
- `experiment_trials` (lihat bawah)

### `experiment_sessions`

Satu sesi = satu set kondisi pengujian yang terencana.

```sql
CREATE TABLE experiment_sessions (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  researcher_name VARCHAR(255) NOT NULL,
  lighting        ENUM('bright','normal','dim','backlit','other') NOT NULL DEFAULT 'normal',
  device_info     VARCHAR(255) NULL,   -- "Laptop Acer Aspire 5, kamera bawaan"
  distance_cm     INT NULL,            -- jarak wajah dari kamera
  notes           TEXT NULL,
  dataset_split   ENUM('calibration','test') NOT NULL DEFAULT 'calibration',
  -- Config saat sesi (bisa draft atau active)
  config_scope    ENUM('draft','active') NOT NULL DEFAULT 'draft',
  config_version_id BIGINT UNSIGNED NULL,  -- FK proctoring_config_versions
  -- Status
  status          ENUM('created','running','paused','completed','cancelled') NOT NULL DEFAULT 'created',
  started_at      TIMESTAMP NULL,
  completed_at    TIMESTAMP NULL,
  -- Runtime info
  fastapi_device  VARCHAR(50) NULL,  -- "cuda:0" atau "cpu"
  fastapi_model   VARCHAR(100) NULL, -- "yolov8n.pt"
  -- Creator
  created_by      BIGINT UNSIGNED NULL,  -- FK users
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dataset_split (dataset_split),
  INDEX idx_status (status),
  INDEX idx_created_by (created_by)
);
```

### `experiment_trials`

Satu trial = satu capture dalam sesi eksperimen. Menyimpan SEMUA metrik mentah.

```sql
CREATE TABLE experiment_trials (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id            BIGINT UNSIGNED NOT NULL,  -- FK experiment_sessions
  -- Ground truth (diisi otomatis dari skenario, bisa diedit manual)
  scenario              VARCHAR(100) NULL,  -- "normal","no_face","multi_face","phone","book","head_turn","eye_gaze_away","identity_mismatch","custom"
  gt_no_face            BOOLEAN NOT NULL DEFAULT FALSE,
  gt_multi_face         BOOLEAN NOT NULL DEFAULT FALSE,
  gt_phone              BOOLEAN NOT NULL DEFAULT FALSE,
  gt_book               BOOLEAN NOT NULL DEFAULT FALSE,
  gt_head_turn          BOOLEAN NOT NULL DEFAULT FALSE,
  gt_eye_gaze_away      BOOLEAN NOT NULL DEFAULT FALSE,
  gt_identity_mismatch  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Snapshot
  snapshot_path         VARCHAR(512) NULL,  -- path di storage eksperimen
  image_width           INT NULL,
  image_height          INT NULL,
  image_size_kb         INT NULL,
  -- FastAPI raw output
  person_count          INT NULL,           -- dari YOLO (terpisah dari face_count)
  face_count            INT NULL,           -- dari MediaPipe
  face_detected         BOOLEAN NULL,
  face_confidence       FLOAT NULL,
  face_bbox             JSON NULL,          -- [x1,y1,x2,y2]
  head_yaw              FLOAT NULL,
  head_pitch            FLOAT NULL,
  head_roll             FLOAT NULL,
  eye_gaze_ratio        FLOAT NULL,
  face_similarity       FLOAT NULL,         -- cosine similarity vs baseline (jika ada)
  all_detections        JSON NULL,          -- [{class_id,class_name,confidence,bbox,is_prohibited}]
  risk_score_raw        INT NULL,           -- FastAPI risk_score (0–100)
  fastapi_detections    JSON NULL,          -- Python "detections" list
  -- Laravel computed scores (menggunakan config saat trial)
  score_no_face         INT NULL,
  score_multi_face      INT NULL,
  score_head_turn       INT NULL,
  score_eye_gaze        INT NULL,
  score_object_detection INT NULL,
  score_identity_mismatch INT NULL,
  total_score           INT NULL,
  risk_level            VARCHAR(20) NULL,
  -- AI predictions (keputusan berdasarkan threshold aktif saat itu)
  pred_no_face          BOOLEAN NULL,
  pred_multi_face       BOOLEAN NULL,
  pred_head_turn        BOOLEAN NULL,
  pred_eye_gaze_away    BOOLEAN NULL,
  pred_phone            BOOLEAN NULL,
  pred_book             BOOLEAN NULL,
  pred_identity_mismatch BOOLEAN NULL,
  -- Config reference
  config_version_id     BIGINT UNSIGNED NULL,  -- FK proctoring_config_versions
  config_scope_used     ENUM('draft','active') NULL,
  -- Latency (ms)
  inference_ms          INT NULL,   -- FastAPI processing_time_ms
  queue_wait_ms         INT NULL,   -- waktu dari dispatch ke mulai handle (jika via queue)
  server_total_ms       INT NULL,   -- total server-side (Laravel roundtrip)
  end_to_end_ms         INT NULL,   -- dari tombol capture hingga response di browser
  -- Quality control
  is_invalid            BOOLEAN NOT NULL DEFAULT FALSE,  -- soft delete oleh peneliti
  invalidation_reason   VARCHAR(255) NULL,
  -- Sequence
  trial_number          INT NOT NULL DEFAULT 1,  -- urutan dalam sesi
  captured_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_et_session FOREIGN KEY (session_id) REFERENCES experiment_sessions(id) ON DELETE CASCADE,
  INDEX idx_session_trial (session_id, trial_number),
  INDEX idx_session_invalid (session_id, is_invalid),
  INDEX idx_captured_at (captured_at)
);
```

---

## 7. Rencana File yang Perlu Dibuat/Diubah

### Tahap 1: Pengaturan Ambang Batas dari UI

#### File Baru (Backend)
| File | Keterangan |
|------|-----------|
| `backend/database/migrations/2026_XX_XX_create_proctoring_configurations_table.php` | Tabel `proctoring_configurations` |
| `backend/database/migrations/2026_XX_XX_create_proctoring_config_versions_table.php` | Tabel `proctoring_config_versions` |
| `backend/database/migrations/2026_XX_XX_add_config_version_to_diagnostic_tests.php` | Kolom `config_version_id` di `proctoring_diagnostic_tests` |
| `backend/database/migrations/2026_XX_XX_add_config_version_to_calibration_logs.php` | Kolom `config_version_id` di `proctoring_calibration_logs` |
| `backend/app/Models/ProctoringConfiguration.php` | Model dengan static `getActive()`, `getDraft()`, cache invalidation |
| `backend/app/Models/ProctoringConfigVersion.php` | Model audit trail |
| `backend/app/Http/Controllers/Api/ProctoringConfigController.php` | CRUD config (get, update draft, apply to active, history, rollback) |
| `backend/app/Http/Requests/UpdateProctoringConfigRequest.php` | Form request dengan validasi range + weights sum check |
| `backend/database/seeders/ProctoringConfigurationSeeder.php` | Seed baris default dari env |

#### File Diubah (Backend)
| File | Perubahan |
|------|----------|
| `backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php` | `analyzeCapture()`: terima `config_scope` dari request body; jika `'draft'` gunakan `ProctoringConfiguration::getDraft()` bukan `config('proctoring.*')`. Simpan `config_version_id` ke `ProctoringDiagnosticTest`. Perbaiki inkonsistensi identity check (Euclidean vs Cosine). |
| `backend/app/Jobs/AnalyzeSnapshotJob.php` | Baca dari `ProctoringConfiguration::getActive()` bukan `config('proctoring.*')` langsung. Simpan `config_version_id` ke calibration log. |
| `backend/proctoring-service/main.py` | Terima threshold opsional per-request di body (`/analyze` endpoint) — overrides modul constants. Contoh: `threshold_config: Optional[dict] = None` di form/JSON body. |
| `backend/routes/api.php` | Tambah route group `proctoring-config` dengan auth middleware |
| `backend/config/proctoring.php` | Tidak perlu diubah — tetap sebagai fallback default |

#### File Baru (Frontend)
| File | Keterangan |
|------|-----------|
| `src/app/admin/proctoring-diagnostic/config/page.tsx` | Atau: tambah tab "Konfigurasi" di halaman diagnostic |
| `src/components/diagnostic/ThresholdSettings.tsx` | Form dengan slider + number input per parameter, badge "diubah", reset per-param + reset semua |
| `src/components/diagnostic/ConfigDiffDialog.tsx` | Dialog konfirmasi "Terapkan ke Active" dengan diff tabel |
| `src/components/diagnostic/ConfigVersionHistory.tsx` | Tabel riwayat versi + tombol rollback |
| `src/types/proctoring-config.ts` | TypeScript types untuk config API |
| `src/services/proctoring-config.ts` | Service functions: `getConfig`, `updateDraft`, `applyToActive`, `rollback`, `getHistory` |

### Tahap 2: Pengambilan Data Otomatis

#### File Baru (Backend)
| File | Keterangan |
|------|-----------|
| `backend/database/migrations/2026_XX_XX_create_experiment_sessions_table.php` | |
| `backend/database/migrations/2026_XX_XX_create_experiment_trials_table.php` | |
| `backend/app/Models/ExperimentSession.php` | |
| `backend/app/Models/ExperimentTrial.php` | |
| `backend/app/Http/Controllers/Api/ExperimentController.php` | Start/pause/stop session, capture trial, list sessions/trials, export CSV, evaluasi metrics, threshold sweep |
| `backend/app/Http/Requests/CreateExperimentSessionRequest.php` | |
| `backend/app/Http/Requests/CaptureExperimentTrialRequest.php` | Validasi image size/type, rate limit |
| `backend/app/Services/ExperimentMetricsService.php` | TP/TN/FP/FN per kategori, Accuracy/Precision/Recall/F1 (handle div-by-zero), threshold sweep |
| `backend/app/Exports/ExperimentTrialExport.php` | CSV export (Laravel Excel atau manual) |
| `backend/storage/app/experiment-snapshots/` (volume Docker) | Storage path terpisah dari `monitoring-snapshots` |

#### File Diubah (Backend)
| File | Perubahan |
|------|----------|
| `backend/routes/api.php` | Route group `experiment-sessions` + `experiment-trials` |
| `docker-compose.yml` | Volume baru untuk `experiment-snapshots`, mapping ke container backend |
| `backend/.env.example` | Tambah `EXPERIMENT_SNAPSHOT_DISK`, `EXPERIMENT_SNAPSHOT_PATH`, quota config |

#### File Baru (Frontend)
| File | Keterangan |
|------|-----------|
| `src/app/admin/proctoring-diagnostic/experiment/page.tsx` | Atau: tab baru "Sesi Eksperimen" |
| `src/components/experiment/SessionSetupForm.tsx` | Form nama sesi, peneliti, kondisi, dataset_split |
| `src/components/experiment/CaptureController.tsx` | Countdown, progress bar, pause/stop, hitung mundur |
| `src/components/experiment/TrialReviewTable.tsx` | Thumbnail, label, prediksi, filter, edit GT, tandai invalid |
| `src/components/experiment/EvaluationDashboard.tsx` | TP/TN/FP/FN tabel, metrik per kategori |
| `src/components/experiment/ThresholdSweepChart.tsx` | Grafik F1/Precision/Recall vs threshold, rekomendasi, tombol "Pakai ke draft" |
| `src/services/experiment.ts` | Service functions untuk semua experiment API calls |

---

## 8. Daftar Env Var Baru yang Perlu Ditambahkan ke `.env.example`

```bash
# ─── Tahap 1: Config DB ──────────────────────────────────────────────────────
# Jika true, proctoring config dibaca dari DB (tabel proctoring_configurations).
# Jika false atau tabel kosong, fallback ke nilai .env di atas.
PROCTORING_USE_DB_CONFIG=true

# Redis cache TTL untuk active config (detik). Default: 300 (5 menit).
PROCTORING_CONFIG_CACHE_TTL=300

# ─── Tahap 2: Experiment Storage ─────────────────────────────────────────────
# Disk Storage untuk snapshot eksperimen (filesystem disk name di config/filesystems.php)
EXPERIMENT_SNAPSHOT_DISK=experiment_snapshots

# Path relatif ke storage root untuk snapshot eksperimen
EXPERIMENT_SNAPSHOT_PATH=experiment-snapshots

# Kuota maksimum penyimpanan per sesi eksperimen (MB). 0 = unlimited.
EXPERIMENT_SESSION_STORAGE_QUOTA_MB=500

# Kuota total penyimpanan semua eksperimen (MB). 0 = unlimited.
EXPERIMENT_TOTAL_STORAGE_QUOTA_MB=5000

# Rate limit capture eksperimen: maks request per menit per admin
EXPERIMENT_CAPTURE_RATE_LIMIT=60

# Interval minimum antar capture dalam satu sesi eksperimen (ms)
EXPERIMENT_MIN_CAPTURE_INTERVAL_MS=500

# Antrean Redis khusus untuk job analisis eksperimen (jangan pakai 'proctoring')
EXPERIMENT_QUEUE=experiment

# ─── Tahap 2: Metrik Latensi ─────────────────────────────────────────────────
# Jika true, catat server-side timing (queue_wait_ms, server_total_ms) di trial
EXPERIMENT_RECORD_LATENCY=true
```

---

## 9. Pertanyaan / Keputusan Desain yang Perlu Konfirmasi

### Keputusan Kritis (Blokir Implementasi)

**K1. Cara propagasi threshold ke FastAPI**

Ada tiga opsi:
- **Opsi A (Rekomendasi):** Laravel kirim threshold config dalam body setiap request ke `/analyze`. FastAPI menerima optional `threshold_config: dict` dan menggunakannya untuk override konstanta modul. Stateless — tidak perlu restart FastAPI.
- **Opsi B:** FastAPI poll endpoint Laravel setiap N detik untuk config terbaru. Lebih kompleks, ada lag.
- **Opsi C:** Restart FastAPI container saat config active berubah. Downtime singkat, melanggar constraint "tanpa restart".

Apakah Opsi A disetujui? Implikasinya: perlu mengubah request schema `/analyze` di FastAPI dan semua caller (ProctoringDiagnosticController, AnalyzeSnapshotJob).

---

**K2. Inkonsistensi identity check antara Diagnostic Tool dan AnalyzeSnapshotJob**

Diagnostic Tool pakai **Euclidean distance** (threshold 0.6), AnalyzeSnapshotJob pakai **Cosine similarity** (threshold 0.6). Keduanya pakai face_recognition library 128-dim embedding tapi metrik berbeda.

Perlu disamakan. Rekomendasinya: gunakan **Euclidean distance ≤ 0.6** (standar library face_recognition) di semua tempat. Apakah setuju, atau ada preferensi?

---

**K3. Scope konfigurasi client-side (snapshot_interval, anomaly_trigger)**

Parameter ini ada di browser JavaScript. Ada dua cara menyampaikannya ke client:
- **Opsi A:** Kirim dalam response saat student mulai ujian (`POST /api/exams/{exam}/start`). Frontend apply dinamis.
- **Opsi B:** Hanya berlaku setelah full deploy (biarkan hardcoded di frontend).

Untuk Tahap 1, apakah client-side params perlu configurable dari UI (Opsi A), atau cukup server-side params dulu (Tahap 1) dan client-side nanti (Tahap 2/3)?

---

**K4. Relasi `experiment_sessions` dengan user**

Sesi eksperimen dibuat oleh admin. Apakah perlu dikaitkan dengan `exam_id` tertentu (untuk akses baseline face), atau harus benar-benar standalone (peneliti upload foto sendiri, tidak ada baseline dari ujian)?

Untuk threshold sweep dan evaluasi, tidak perlu exam context. Tapi untuk menguji identity mismatch, baseline diperlukan. Rekomendasinya: simpan optional `baseline_embedding` di `experiment_sessions` (JSON, 128-dim), diisi via tombol "Set Baseline" di UI eksperimen.

---

### Keputusan Desain Sekunder (Bisa Diasumsikan Default)

**K5. Apakah `proctoring_calibration_logs` (ujian sungguhan) perlu di-extend atau tetap terpisah dari `experiment_trials`?**

Rekomendasinya: **tetap terpisah**. `calibration_logs` untuk data pasif dari ujian sungguhan. `experiment_trials` untuk data aktif dari sesi eksperimen. Keduanya bisa diekspor CSV secara terpisah.

**K6. Format export CSV Tahap 2 — satu file per sesi atau semua sesi sekaligus?**

Rekomendasinya: keduanya — endpoint export per-sesi dan export filter (dataset_split, lighting, date range).

**K7. Apakah threshold sweep perlu menyimpan hasil sweep ke DB, atau computed on-the-fly?**

Rekomendasinya: **on-the-fly** — query `experiment_trials` berdasarkan filter, hitung ulang di server per nilai threshold. Data mentah sudah tersimpan di `experiment_trials`. Tidak perlu tabel tambahan untuk hasil sweep.

**K8. Apakah ada rate limit untuk ujian sungguhan yang perlu dicek sebelum eksperimen dimulai?**

Rekomendasinya: cek `exam_results` dengan `status = 'in_progress'` saat `POST /experiment-sessions/{id}/start`. Jika ada ujian aktif, tampilkan warning (tapi jangan blokir, karena ini lab terpisah).

**K9. Docker volume eksperimen**

Apakah snapshot eksperimen perlu **auto-purge** otomatis setelah sesi selesai/dibatalkan, atau dikelola manual via tombol purge di UI? Rekomendasinya: tidak auto-purge — data eksperimen adalah aset skripsi. Sediakan tombol purge per sesi di UI dengan konfirmasi.

**K10. Apakah `proctoring_config_versions` juga menyimpan perubahan ke `draft` atau hanya `active`?**

Rekomendasinya: **hanya `active`** (yang berdampak ke ujian sungguhan). Draft adalah sandbox, historynya tidak kritis. Jika perlu audit draft, bisa ditambahkan sebagai enhancement.

---

## Ringkasan Temuan Kunci

1. **Infrastruktur threshold sudah baik** — semua parameter ada di `config/proctoring.php` dan dibaca via `config()` secara konsisten di Laravel. Tidak ada hardcode tersisa di `AnalyzeSnapshotJob`.

2. **FastAPI adalah blocker utama Tahap 1** — threshold dibaca sebagai modul-level constants dari env saat startup. Harus diubah untuk menerima override per-request.

3. **`proctoring_calibration_logs` sudah ada tapi tidak cukup** untuk Tahap 2 — terikat ke konteks ujian (`exam_id`, `student_id`), tidak punya field ground truth terstruktur per skenario, dan tidak menyimpan snapshot file eksperimen.

4. **Diagnostic Tool sudah berjalan dengan baik** — arsitektur clean, komponen terpisah, API calls sudah ada. Tinggal ditambah tab konfigurasi dan tab eksperimen.

5. **Inkonsistensi identity check** antara Diagnostic Tool (Euclidean) dan AnalyzeSnapshotJob (Cosine) — perlu diselesaikan di Tahap 1.

6. **SystemSetting tidak relevan** untuk proctoring threshold — pattern-nya key-value untuk boolean/string sederhana. Lebih tepat membuat tabel dedicated `proctoring_configurations` yang menyimpan JSON structured config.

7. **`CONFIDENCE_THRESHOLD` punya dua default berbeda** (0.45 di Laravel, 0.25 di FastAPI) — perlu dikonfirmasi mana yang benar sebelum implementasi.
