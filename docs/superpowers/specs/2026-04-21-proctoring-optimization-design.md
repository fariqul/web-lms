# Proctoring Optimization Design (CBT)

## Problem
Sistem proctoring sudah berjalan, tetapi masih ada risiko false positive/noise pada event non-kritis, potensi bypass jika hanya mengandalkan sinyal client, dan kualitas alert admin belum cukup bersih untuk operasi skala besar (target 600 siswa serentak).

## Goals
1. Menurunkan false positive tanpa melemahkan anti-cheat kritis.
2. Menjaga enforcement iPhone strict untuk keluar app/tab.
3. Menjadikan backend sebagai sumber evaluasi risiko utama.
4. Menjaga stabilitas performa untuk beban tinggi.

## Non-Goals
1. Tidak menambah liveness anti-spoof kompleks (challenge/blink flow interaktif) pada fase ini.
2. Tidak mengubah arsitektur besar deployment.

## Selected Approach
Pendekatan yang dipilih adalah **server-first hybrid stabil**:
- Client tetap mendeteksi cepat (UX realtime) lewat `useExamMode` dan `useProctoring`.
- Backend (`reportViolation` + `AnalyzeSnapshotJob` + proctoring-service) menjadi sumber evaluasi risiko final.
- Tambah temporal consensus, cooldown, dan dedup agar alert valid lebih dominan dibanding noise.

## Architecture Changes

### 1. Client Layer (Next.js)
- `useExamMode`:
  - Pertahankan event kritis iPhone (`tab_switch`, `window_blur`, `fullscreen_exit`) sebagai strict path.
  - Tambahkan metadata event ringkas untuk server-side classification (mis. `device_class`, `event_source`, `streak_hint`).
- `useProctoring`:
  - Tambah mekanisme temporal confirmation untuk deteksi non-kritis (`no_face`, `head_turn`, `eye_gaze`) agar tidak langsung dihitung dari single frame.
  - Tuning `TinyFaceDetectorOptions` adaptif:
    - Mobile: input size lebih kecil (fokus FPS/stabilitas).
    - Desktop: input size sedang (fokus akurasi).
  - Threshold ditarik ke konstanta terkonfigurasi agar mudah tuning.

### 2. Backend API Layer (Laravel)
- `ExamController::reportViolation`:
  - Tambah normalisasi event non-kritis.
  - Tambah **server-side temporal consensus/cooldown** untuk tipe noise-prone.
  - Event kritis iPhone tetap bypass konsensus (langsung dihitung).
  - Response policy (`warning/freeze/auto_submit`) tetap konsisten ke client.

### 3. Async AI Layer
- `AnalyzeSnapshotJob`:
  - Tambah dedup/cooldown alert per `(exam_result_id, type, window)` agar monitor tidak spam.
  - Simpan sinyal AI terstruktur dengan confidence final.
  - Update `ProctoringScore` berbobot secara konsisten setelah dedup.
- `proctoring-service`:
  - Threshold dibaca dari environment variable yang eksplisit dan terdokumentasi.
  - Tuning default diarahkan ke profil stabilitas (bukan agresivitas maksimum).

### 4. Monitoring Experience
- Payload monitoring menandai event sebagai:
  - `confirmed` (lolos konsensus),
  - `transient` (noise/ditahan cooldown).
- UI monitor admin difokuskan ke `confirmed` untuk mengurangi alarm fatigue.

## Data Flow
1. Client menangkap event/snapshot.
2. Event violation masuk ke `reportViolation`.
3. Backend menentukan jalur:
   - Kritis iPhone -> langsung count.
   - Non-kritis -> cek consensus/cooldown.
4. Snapshot diproses async oleh `AnalyzeSnapshotJob` ke proctoring-service.
5. Hasil AI diakumulasi ke `ProctoringScore`, alert dibroadcast dengan dedup.
6. Client heartbeat menarik policy terbaru (`policy_action`, `freeze_seconds`, `force_submit`).

## Error Handling
- Kegagalan proctoring-service 5xx: job retry terkontrol, tidak menghasilkan success semu.
- Kegagalan non-retriable: log jelas dan tidak memblokir alur ujian utama.
- Validasi payload violation diperketat agar tidak menerima tipe/sumber tak dikenal.

## Performance Strategy
- Kurangi cost client inference lewat detector input adaptif.
- Kurangi write amplification backend lewat dedup/cooldown.
- Pertahankan pemisahan queue `proctoring` dari queue default.

## Security & Integrity
- Enforcement inti tetap di backend.
- Client metadata hanya sebagai sinyal bantu, bukan trust boundary.
- Tidak menambahkan fallback yang menyamarkan kegagalan sistem.

## Testing Plan
1. Backend Feature tests:
   - strict iPhone critical events tetap dihitung,
   - non-kritis butuh consensus,
   - cooldown mencegah spam violation/alert.
2. Backend Unit tests:
   - scoring dan dedup window behavior.
3. Frontend tests:
   - classifier event kritis vs non-kritis,
   - temporal confirmation pada `useProctoring`.
4. Regressions:
   - jalur freeze/auto-submit existing tidak rusak.

## Rollout
- Berlaku langsung untuk semua CBT (tanpa feature flag) sesuai keputusan user.
- Tuning parameter dilakukan lewat env agar bisa fine-tune tanpa ubah arsitektur.

