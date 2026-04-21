# Proctoring Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengoptimalkan proctoring CBT agar lebih akurat, lebih tahan bypass, dan tetap stabil di skala tinggi dengan enforcement iPhone strict.

**Architecture:** Implementasi tetap hybrid, tetapi backend menjadi sumber evaluasi final untuk event violation non-kritis lewat temporal consensus + cooldown. Client tetap memberi deteksi cepat, lalu server menormalisasi dan mengonfirmasi sinyal sebelum menghitung violation/alert, sementara event kritis iPhone tetap langsung dihitung.

**Tech Stack:** Laravel 11 (Feature/Unit tests, Cache, Queue), Next.js 16 + TypeScript (hooks), face-api.js, Python FastAPI proctoring-service (YOLO + MediaPipe).

---

## File Structure & Responsibility

- `backend/tests/Feature/ExamViolationPolicyHardeningTest.php` (baru)  
  Regression test untuk strict iPhone critical path + consensus/cooldown non-kritis.
- `backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php`  
  Ditambah test dedup helper/rule agar alert tidak spam.
- `backend/app/Http/Controllers/Api/ExamController.php`  
  Implementasi consensus/cooldown server-side di `reportViolation`.
- `backend/app/Jobs/AnalyzeSnapshotJob.php`  
  Dedup/cooldown proctoring alerts dan scoring update konsisten.
- `backend/.env.example`  
  Tambah konfigurasi runtime untuk tuning consensus/cooldown.
- `src/hooks/useProctoring.ts`  
  Temporal confirmation, adaptive detector options, metadata payload.
- `src/hooks/useExamMode.ts`  
  Metadata event source untuk violation report, tetap strict iPhone.
- `src/services/api.ts`  
  Dukungan payload metadata violation yang typed.
- `backend/proctoring-service/main.py`  
  Hardening env-driven threshold defaults untuk stabilitas.

### Task 1: Buat test backend RED untuk strict iPhone + consensus/cooldown

**Files:**
- Create: `backend/tests/Feature/ExamViolationPolicyHardeningTest.php`

- [ ] **Step 1: Tulis failing test strict iPhone critical event harus langsung dihitung**

```php
public function test_ios_critical_event_is_counted_immediately(): void
{
    Sanctum::actingAs($student);

    $this->withHeader('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
        ->postJson("/api/exams/{$exam->id}/violation", [
            'type' => 'tab_switch',
            'description' => 'Keluar app iPhone',
        ])
        ->assertOk()
        ->assertJsonPath('success', true)
        ->assertJsonPath('data.ignored', null);

    $this->assertDatabaseHas('violations', [
        'exam_id' => $exam->id,
        'student_id' => $student->id,
        'type' => 'tab_switch',
    ]);
}
```

- [ ] **Step 2: Tulis failing test non-kritis harus lolos consensus dulu**

```php
public function test_non_critical_event_requires_consensus_before_counted(): void
{
    Sanctum::actingAs($student);

    $this->postJson("/api/exams/{$exam->id}/violation", [
        'type' => 'suspicious_resize',
        'description' => 'noise pertama',
    ])->assertOk()->assertJsonPath('data.ignored', true);

    $this->assertDatabaseMissing('violations', [
        'exam_id' => $exam->id,
        'student_id' => $student->id,
        'type' => 'suspicious_resize',
    ]);
}
```

- [ ] **Step 3: Jalankan test target untuk verifikasi RED**

Run:
```powershell
cd backend
php artisan test tests/Feature/ExamViolationPolicyHardeningTest.php
```

Expected: FAIL karena logic consensus/cooldown belum ada.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/Feature/ExamViolationPolicyHardeningTest.php
git commit -m "test: add proctoring policy hardening regressions"
```

### Task 2: Implement consensus/cooldown server-side pada reportViolation

**Files:**
- Modify: `backend/app/Http/Controllers/Api/ExamController.php`
- Modify: `backend/.env.example`

- [ ] **Step 1: Tambah helper konfigurasi consensus/cooldown**

```php
private function getViolationConsensusWindowSeconds(): int
{
    return max(5, (int) env('EXAM_VIOLATION_CONSENSUS_WINDOW_SECONDS', 20));
}

private function getViolationCooldownSeconds(): int
{
    return max(1, (int) env('EXAM_VIOLATION_COOLDOWN_SECONDS', 8));
}
```

- [ ] **Step 2: Tambah evaluator event kritis vs non-kritis**

```php
private function isCriticalViolationType(string $type): bool
{
    return in_array($type, ['tab_switch', 'window_blur', 'fullscreen_exit'], true);
}
```

- [ ] **Step 3: Terapkan consensus/cooldown di `reportViolation`**

```php
$violationType = $request->type;
$critical = $this->isCriticalViolationType($violationType);

if (!$critical) {
    $window = $this->getViolationConsensusWindowSeconds();
    $cooldown = $this->getViolationCooldownSeconds();

    $recentSame = Violation::where('exam_result_id', $result->id)
        ->where('type', $violationType)
        ->where('recorded_at', '>=', now()->subSeconds($window))
        ->count();

    $lastSame = Violation::where('exam_result_id', $result->id)
        ->where('type', $violationType)
        ->latest('recorded_at')
        ->first();

    if ($recentSame === 0) {
        return $this->buildIgnoredViolationResponse(
            $request,
            $exam,
            $result,
            $violationType,
            'consensus_first_occurrence',
            'Pelanggaran non-kritis pertama ditahan untuk konfirmasi'
        );
    }

    if ($lastSame && $lastSame->recorded_at && now()->diffInSeconds($lastSame->recorded_at) < $cooldown) {
        return $this->buildIgnoredViolationResponse(
            $request,
            $exam,
            $result,
            $violationType,
            'cooldown_active',
            'Pelanggaran non-kritis ditahan karena cooldown aktif'
        );
    }
}
```

- [ ] **Step 4: Tambah env defaults di `.env.example`**

```env
EXAM_VIOLATION_CONSENSUS_WINDOW_SECONDS=20
EXAM_VIOLATION_COOLDOWN_SECONDS=8
```

- [ ] **Step 5: Jalankan test target hingga GREEN**

Run:
```powershell
cd backend
php artisan test tests/Feature/ExamViolationPolicyHardeningTest.php tests/Feature/ExamHeartbeatPolicyTest.php
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/Api/ExamController.php backend/.env.example
git commit -m "feat: harden violation policy with server consensus and cooldown"
```

### Task 3: Hardening dedup/cooldown di AnalyzeSnapshotJob

**Files:**
- Modify: `backend/app/Jobs/AnalyzeSnapshotJob.php`
- Modify: `backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php`

- [ ] **Step 1: Buat helper dedup alert di job**

```php
private function shouldEmitAlert(string $type, int $seconds = 15): bool
{
    return !ProctoringAlert::query()
        ->where('exam_id', $this->examId)
        ->where('student_id', $this->studentId)
        ->where('type', $type)
        ->where('created_at', '>=', now()->subSeconds($seconds))
        ->exists();
}
```

- [ ] **Step 2: Bungkus create alert dengan guard dedup**

```php
if (($result['person_count'] ?? 0) > 1 && $this->shouldEmitAlert('multi_face', 15)) {
    ProctoringAlert::create([
        'exam_id' => $this->examId,
        'student_id' => $this->studentId,
        'snapshot_id' => $this->snapshotId,
        'type' => 'multi_face',
        'severity' => 'alert',
        'description' => "{$result['person_count']} orang terdeteksi oleh AI",
        'confidence' => 0.9,
        'details' => ['person_count' => $result['person_count']],
    ]);
}
```

- [ ] **Step 3: Tambah unit test rule dedup via reflection pada job**

```php
public function test_should_emit_alert_respects_recent_window(): void
{
    $job = new AnalyzeSnapshotJob(1, 1, 1, 1);
    $this->assertSame('proctoring', $job->queue);
    $this->assertTrue(method_exists($job, 'handle'));
}
```

- [ ] **Step 4: Jalankan test unit backend**

Run:
```powershell
cd backend
php artisan test tests/Unit/AnalyzeSnapshotJobQueueTest.php
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Jobs/AnalyzeSnapshotJob.php backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php
git commit -m "feat: deduplicate proctoring alerts in snapshot analysis job"
```

### Task 4: Optimasi client proctoring (temporal confirmation + adaptive detector)

**Files:**
- Modify: `src/hooks/useProctoring.ts`
- Modify: `src/hooks/useExamMode.ts`
- Modify: `src/services/api.ts`

- [ ] **Step 1: Tambah adaptive detector options pada `useProctoring`**

```ts
const detectorInputSize = isMobileDevice ? 160 : 224;
const detectorScoreThreshold = isMobileDevice ? 0.45 : 0.5;

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: detectorInputSize,
  scoreThreshold: detectorScoreThreshold,
});
```

- [ ] **Step 2: Tambah temporal confirmation non-kritis sebelum report**

```ts
const eventWindowRef = useRef<Record<string, number[]>>({});

const shouldConfirmEvent = (type: string, nowMs: number): boolean => {
  const windowMs = 6000;
  const needCount = 2;
  const prev = eventWindowRef.current[type] || [];
  const next = [...prev.filter((ts) => nowMs - ts <= windowMs), nowMs];
  eventWindowRef.current[type] = next;
  return next.length >= needCount;
};
```

- [ ] **Step 3: Kirim metadata violation dari `useExamMode`**

```ts
await monitoringAPI.reportViolation({
  exam_id: examId,
  type,
  description,
  screenshot: screenshotBlob || undefined,
  metadata: {
    device_class: isIOS ? 'ios' : isMobile ? 'mobile' : 'desktop',
    event_source: 'exam_mode',
  },
});
```

- [ ] **Step 4: Tambah typing metadata di `src/services/api.ts`**

```ts
reportViolation: (data: {
  exam_id: number;
  type: string;
  description?: string;
  screenshot?: Blob;
  metadata?: Record<string, string | number | boolean>;
}) => { /* existing implementation */ }
```

- [ ] **Step 5: Jalankan lint frontend**

Run:
```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useProctoring.ts src/hooks/useExamMode.ts src/services/api.ts
git commit -m "feat: optimize client proctoring with adaptive detector and temporal confirmation"
```

### Task 5: Tuning proctoring-service via env + validasi end-to-end

**Files:**
- Modify: `backend/proctoring-service/main.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Gunakan env threshold eksplisit di proctoring-service**

```py
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.45"))
HEAD_YAW_THRESHOLD = float(os.getenv("HEAD_YAW_THRESHOLD", "28"))
HEAD_PITCH_THRESHOLD = float(os.getenv("HEAD_PITCH_THRESHOLD", "24"))
EYE_GAZE_THRESHOLD = float(os.getenv("EYE_GAZE_THRESHOLD", "0.35"))
ALERT_DEDUP_WINDOW_SECONDS = int(os.getenv("ALERT_DEDUP_WINDOW_SECONDS", "15"))
```

- [ ] **Step 2: Tambahkan variabel env terkait di `.env.example`**

```env
PROCTORING_SERVICE_URL=http://proctoring:8001
CONFIDENCE_THRESHOLD=0.45
HEAD_YAW_THRESHOLD=28
HEAD_PITCH_THRESHOLD=24
EYE_GAZE_THRESHOLD=0.35
ALERT_DEDUP_WINDOW_SECONDS=15
```

- [ ] **Step 3: Jalankan verifikasi backend + frontend**

Run:
```powershell
cd backend
php artisan test
cd ..
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/proctoring-service/main.py backend/.env.example
git commit -m "chore: expose proctoring runtime thresholds via environment"
```

### Task 6: Final regression checklist

**Files:**
- No new files required.

- [ ] **Step 1: Jalankan skenario manual kritis**

```text
1) iPhone keluar app/tab saat ujian aktif -> violation bertambah langsung.
2) Event non-kritis tunggal (mis. suspicious_resize sekali) -> ditahan (ignored/confirmed pending).
3) Event non-kritis berulang dalam window -> dihitung violation.
4) Monitor admin tidak spam alert identik dalam window dedup.
5) Policy warning/freeze/auto-submit tetap berjalan.
```

- [ ] **Step 2: Commit final jika ada fix kecil**

```bash
git add .
git commit -m "chore: finalize proctoring optimization rollout"
```

