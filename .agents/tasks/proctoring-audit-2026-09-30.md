# AI Proctoring System Audit — 2026-09-30

## Executive Summary

The recent changes are **largely correct and well-structured**. There are **no critical runtime-breaking bugs** that would prevent the system from starting. However there are **3 WARNING-level issues** and **5 INFO-level observations** that should be addressed before the next deployment.

The most important issue is a **CONFIDENCE_THRESHOLD default mismatch** between the FastAPI service (0.25) and the Laravel config (0.45), which means YOLO will behave differently depending on which component's env var takes precedence. There is also a **route ordering risk** with `/proctoring-alerts/pending-count` that could be shadowed by wildcard routes in future, and a **score weight sum discrepancy** in comments vs. config that may mislead future calibration.

---

## Findings

### 1. CONFIDENCE_THRESHOLD default mismatch between Laravel and FastAPI

**Severity: WARNING**
**Files:**
- `backend/config/proctoring.php` — line `'confidence_threshold' => (float) env('CONFIDENCE_THRESHOLD', 0.45)`
- `backend/proctoring-service/main.py` — line `CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.25"))`

**Description:**
The default value for `CONFIDENCE_THRESHOLD` is `0.45` in `config/proctoring.php` but `0.25` in `main.py`. Laravel reads this config key but never actually *sends* it to the FastAPI service — FastAPI reads it directly from its own environment. If the env var `CONFIDENCE_THRESHOLD` is not explicitly set in the Docker environment for the proctoring container, FastAPI will use `0.25`, making YOLO more permissive than intended (more detections, more false positives). `docker-entrypoint.sh` writes `CONFIDENCE_THRESHOLD=${CONFIDENCE_THRESHOLD:-0.45}` to the *backend* container's `.env`, but that env is never injected into the *proctoring* Python container.

**Suggested fix:**
Add `CONFIDENCE_THRESHOLD=${CONFIDENCE_THRESHOLD:-0.45}` to the proctoring service's Docker environment (in `docker-compose.yml` or via the proctoring container's own entrypoint). Alternatively, remove the Laravel config key if Laravel never uses it (it currently does not pass it to FastAPI).

---

### 2. Route ordering — `pending-count` literal before `{alert}` wildcard (currently safe, fragile)

**Severity: WARNING**
**File:** `backend/routes/api.php` — lines 170–175

**Description:**
The routes are:
```
GET  /exams/{exam}/proctoring-alerts              → alerts()
GET  /exams/{exam}/proctoring-alerts/pending-count → pendingCount()
POST /proctoring-alerts/{alert}/review            → reviewAlert()
POST /proctoring-alerts/{alert}/acknowledge       → acknowledgeAlert()
```

The `pending-count` GET route is defined *after* the `alerts` GET route in the file, but because these are different path segments (`/proctoring-alerts` vs `/proctoring-alerts/pending-count`) there is no current conflict — Laravel's router handles this correctly. **However**, the POST routes for `/proctoring-alerts/{alert}/review` and `/proctoring-alerts/{alert}/acknowledge` are wildcard-first. If someone were to add `GET /proctoring-alerts/{alert}` in the future, it could shadow `pending-count` if placed before it. The current ordering is safe, but a comment warning would prevent future mistakes.

**Suggested fix:** Add a comment above the `pending-count` line noting that it must stay before any wildcard `{alert}` GET routes on the same prefix, consistent with the pattern already used in the graduation routes section.

---

### 3. Score weights comment in `config/proctoring.php` says "sum = 1.0" but doesn't validate

**Severity: WARNING**
**File:** `backend/config/proctoring.php` — lines ~95–110

**Description:**
The comment states weights must sum to 1.0. The current defaults do sum to 1.0:
`0.25 + 0.20 + 0.20 + 0.10 + 0.10 + 0.05 + 0.10 = 1.00` ✓

However, the weights are individually overridable via `.env` vars (`PROCTORING_WEIGHT_*`). There is no runtime validation in `AnalyzeSnapshotJob` that checks the sum before using them. If an operator misconfigures one weight (e.g., sets `PROCTORING_WEIGHT_OBJECT=0.50` without adjusting others), total scores would exceed 100 before the `min(100, ...)` cap, silently producing distorted results. This is not a crash bug, but it produces misleading calibration data.

**Suggested fix:** Add a runtime validation check at the top of `calculateTotalScore()` or in a service provider boot to log a warning if `array_sum(config('proctoring.score_weights'))` deviates significantly from 1.0.

---

### 4. Migration 0001 (`make_user_id_nullable`) has no `hasColumn` guard

**Severity: INFO**
**File:** `backend/database/migrations/2026_09_30_000001_make_user_id_nullable_in_monitoring_snapshots.php`

**Description:**
The migration calls `$table->unsignedBigInteger('user_id')->nullable()->change()` without checking whether `user_id` already exists. On a fresh install where the column was already created as nullable from the start (or on a database where an earlier migration already fixed this), this migration is idempotent only by luck — `->change()` on an already-nullable column will succeed silently. **This is not a bug** in the current production scenario (where `user_id` exists as NOT NULL per the original 2024 migration), but it could fail if the column definition changed in the future. Compare with the pattern used in `2025_01_20_000003_fix_exam_monitoring_schema.php` which wraps every change in `if (!Schema::hasColumn(...))`.

**Suggested fix:** Wrap with `if (Schema::hasColumn('monitoring_snapshots', 'user_id') && !...)` or add a comment explaining why the guard is not needed here.

---

### 5. `AnalyzeSnapshotJob::checkBaselineFaceMatch` uses minute-granular cache key for identity mismatch dedup

**Severity: INFO**
**File:** `backend/app/Jobs/AnalyzeSnapshotJob.php` — line ~588

**Description:**
```php
], 'identity_' . date('YmdHi'));
```
The fingerprint for dedup is `identity_YYYYMMDDHHMM` — minute-granular. This means dedup window for identity mismatch resets **every minute** regardless of the `alert_dedup_window_seconds` config (15 seconds). In practice, a student with a persistent identity mismatch could generate one alert per minute (up to 60 per hour), not one per 15 seconds as the spec requires. The other alert types use `shouldEmitAlert()` with the config window correctly.

**Suggested fix:** Replace `'identity_' . date('YmdHi')` with a consistent fingerprint string like `'identity_check'` and let `shouldEmitAlert()` handle the 15-second window:
```php
$this->createAlertIfNotDuplicate('identity_mismatch', [...], 'identity_mismatch');
```

---

### 6. `ProctoringCleanupCommand` orphan scan only checks `monitoring-snapshots/` (top-level, not recursive)

**Severity: INFO**
**File:** `backend/app/Console/Commands/ProctoringCleanupCommand.php` — line `$files = $disk->files('monitoring-snapshots');`

**Description:**
`Storage::disk('public')->files('monitoring-snapshots')` is **non-recursive** (files only in the top-level directory, no subdirectories). If `Storage::disk('public')->put()` or any other code stores snapshots in date-based subdirectories (e.g., `monitoring-snapshots/2026/09/30/file.jpg`), those files would never be found by the orphan scan. The `store('monitoring-snapshots', 'public')` in `ExamController::uploadSnapshot()` uses Laravel's default storage path which may add a hashed subdirectory.

**Suggested fix:** Replace `$disk->files(...)` with `$disk->allFiles('monitoring-snapshots')` to scan recursively.

---

### 7. `useProctoring.ts` — `detectionInterval` prop is passed as 3000 ms but min_confirmations × interval = 6–9 s trigger latency

**Severity: INFO**
**File:** `src/hooks/useProctoring.ts` — lines ~47–49, `src/app/ujian/[id]/page.tsx` — line 297

**Description:**
`MIN_CONFIRMATIONS = { no_face: 3, multi_face: 2 }` and `detectionInterval = 3000` ms. This means:
- `no_face` requires 3 consecutive positives × 3s = **9 seconds** before triggering a snapshot
- `multi_face` requires 2 × 3s = **6 seconds** before triggering

The specification says "if anomaly detected 3 seconds consecutively, send snapshot immediately." The implementation interprets "3 seconds consecutively" as 3 consecutive 3-second intervals (9 seconds), which is **3× longer than specified**. The cooldown after trigger is 60 seconds (`cooldownRef.current.until = now + 60_000`), which also differs from the 20-second `ANOMALY_SNAPSHOT_COOLDOWN_MS` in `page.tsx`. Two separate cooldown mechanisms exist:
1. `useProctoring.ts` local cooldown: 60 seconds per type (prevents re-triggering `onDetection`)
2. `page.tsx` hybrid trigger cooldown: 20 seconds (prevents re-sending snapshots)

The effective cooldown is 60 seconds because `useProctoring`'s local cooldown gates the `onDetection` callback.

**Suggested fix:** If the spec means "3 seconds of continuous anomaly" → reduce `detectionInterval` to 1000 ms and keep `MIN_CONFIRMATIONS.no_face = 3`. Or reduce `MIN_CONFIRMATIONS.no_face = 1` with `detectionInterval = 3000`. Also align the two cooldown constants to avoid confusion.

---

### 8. FastAPI `all_detections` field in response not consumed by `AnalyzeSnapshotJob`

**Severity: INFO**
**File:** `backend/proctoring-service/main.py` — `AnalysisResult.all_detections`; `backend/app/Jobs/AnalyzeSnapshotJob.php`

**Description:**
The FastAPI response includes an `all_detections` field (list of all YOLO-detected objects, including `person` class). The Laravel job reads `detections` (list of string labels), `prohibited_objects`, `suspicious_objects`, and `person_count`, but never reads `all_detections`. This is not a bug — the job gets all the information it needs from the other fields. However, `all_detections` is stored in `analysis_result` (the raw JSON column on the snapshot) and is available for the admin's review panel via `MonitoringSnapshot.analysis_result`. No action needed, but it's worth noting in documentation.

---

## Cross-cutting Contract Check: FastAPI ↔ Laravel

| Field read by Laravel (`AnalyzeSnapshotJob`) | Present in FastAPI `AnalysisResult` | Match? |
|---|---|---|
| `risk_score` | `risk_score: int` | ✅ |
| `prohibited_objects[].class_name` | `DetectedObject.class_name: str` | ✅ |
| `prohibited_objects[].confidence` | `DetectedObject.confidence: float` | ✅ |
| `suspicious_objects[].class_name` | `DetectedObject.class_name: str` | ✅ |
| `person_count` | `person_count: int` | ✅ |
| `face_analysis.face_detected` | `FaceAnalysis.face_detected: bool` | ✅ |
| `face_analysis.face_count` | `FaceAnalysis.face_count: int` | ✅ |
| `face_analysis.is_looking_away` | `FaceAnalysis.is_looking_away: bool` | ✅ |
| `face_analysis.looking_direction` | `FaceAnalysis.looking_direction: str` | ✅ |
| `face_analysis.head_yaw` | **NOT in `FaceAnalysis` model** | ⚠️ see below |
| `face_analysis.head_pitch` | **NOT in `FaceAnalysis` model** | ⚠️ see below |
| `face_analysis.is_gaze_deviated` | `FaceAnalysis.is_gaze_deviated: bool` | ✅ |
| `face_analysis.eye_gaze_ratio` | `FaceAnalysis.eye_gaze_ratio: Optional[float]` | ✅ |
| `face_analysis.face_embedding` | `FaceAnalysis.face_embedding: Optional[list[float]]` | ✅ |
| `detections` | `detections: list[str]` | ✅ |
| `message` | `message: str` | ✅ |
| `processing_time_ms` | `processing_time_ms: float` | ✅ |

### head_yaw / head_pitch field mismatch (WARNING)

**Severity: WARNING**
**File:** `backend/app/Jobs/AnalyzeSnapshotJob.php` — lines ~161–162

```php
$yaw   = $faceAnalysis['head_yaw']   ?? 0;
$pitch = $faceAnalysis['head_pitch']  ?? 0;
```

The `FaceAnalysis` Pydantic model in `main.py` defines:
```python
head_pitch: Optional[float] = None
head_roll: Optional[float] = None
```

There is **no `head_yaw` field** in the Pydantic model. The yaw value is calculated internally in `analyze_face()` but is never added to the `FaceAnalysis` response object. The Laravel job reads `face_analysis['head_yaw']` which will always be `null` / fall back to `0`. This means the `head_turn` alert description always shows `yaw: 0°` even when the actual yaw value triggered the detection.

This is a **cosmetic/informational bug** — the `is_looking_away` boolean is still correct (computed from the yaw value), so alerts fire correctly. Only the description text is wrong.

**Suggested fix:** Add `head_yaw: Optional[float] = None` to the `FaceAnalysis` Pydantic model in `main.py` and populate it in `analyze_face()`:
```python
return FaceAnalysis(
    ...,
    head_yaw=round(head_yaw, 1),   # ADD THIS
    head_pitch=round(head_pitch, 1),
    ...
)
```

---

## Summary Table

| # | Severity | File | Issue |
|---|---|---|---|
| 1 | WARNING | `config/proctoring.php`, `main.py` | CONFIDENCE_THRESHOLD default mismatch (0.45 vs 0.25) |
| 2 | WARNING | `routes/api.php` | Route ordering comment missing (fragile, currently safe) |
| 3 | WARNING | `config/proctoring.php`, `AnalyzeSnapshotJob.php` | No runtime validation that score weights sum to 1.0 |
| 4 | WARNING | `main.py`, `AnalyzeSnapshotJob.php` | `head_yaw` missing from FastAPI `FaceAnalysis` response — description shows 0° |
| 5 | INFO | `AnalyzeSnapshotJob.php` | Identity mismatch dedup uses minute-granular key, bypasses `alert_dedup_window_seconds` |
| 6 | INFO | `ProctoringCleanupCommand.php` | Orphan scan is non-recursive — misses files in subdirectories |
| 7 | INFO | `useProctoring.ts`, `page.tsx` | Hybrid trigger latency is 9s (not 3s as spec), two misaligned cooldowns |
| 8 | INFO | `2026_09_30_000001` migration | No `hasColumn` guard (non-critical, idempotent by luck) |

## What is Correct ✅

- All 4 migrations are safe: nullable/default additions, no data drops, proper FK constraint handling.
- `config/proctoring.php` is comprehensive and all numeric parameters are env-configurable.
- `AnalyzeSnapshotJob` correctly uses `onQueue('proctoring')` — queue separation is implemented.
- Dedup cache key structure for all types except identity is correct: `examId:studentId:type:fingerprint`.
- `ProctoringCleanupCommand` correctly keeps DB rows (audit trail) and only deletes files.
- Retention policy logic (non-violation expires at +48h, violation `expires_at = null`) is correctly implemented in both `ExamController::uploadSnapshot` and `ProctoringCleanupCommand`.
- `ProctoringAlert` model has all required constants (`STATUS_PENDING`, `STATUS_CONFIRMED`, `STATUS_DISMISSED`) and `isPending()` / `violationType()` methods used by `ProctoringMonitorController`.
- HITL `reviewAlert` endpoint correctly wraps violation creation in a DB transaction.
- FastAPI `FaceAnalysis` field names match what `AnalyzeSnapshotJob` reads **except** `head_yaw`.
- Score weight defaults sum to exactly 1.00 (0.25+0.20+0.20+0.10+0.10+0.05+0.10).
- `bootstrap/app.php` `withSchedule` correctly registers `proctoring:cleanup` hourly.
- `docker-entrypoint.sh` correctly starts separate `default` and `proctoring` queue worker pools.
- `useExamMode.ts` correctly adds `isOffline` state and `online`/`offline` event listeners with retry queue flush.
- `monitor/page.tsx` `ProctoringScoreData` interface matches all fields returned by `ProctoringMonitorController::scores()`.
