# Attendance Recap Audit — LMS SMA 15 Makassar

**Date:** 2025-01-29  
**Scope:** Fitur rekap absensi keseluruhan untuk guru

---

## Summary Answer

**Fitur rekap absensi untuk guru sudah sebagian ada, tapi hanya sebatas sesi satu per satu.
Tidak ada endpoint API maupun halaman frontend yang menyajikan rekap lintas sesi secara terstruktur
khusus untuk guru (matriks siswa × sesi, atau ringkasan total hadir/alpha per siswa di semua sesi milik guru).**

Yang sudah ada:
- Guru bisa lihat riwayat sesi miliknya di tab "Riwayat Sesi" (`/absensi`), dengan summary hadir/total per sesi.
- Export CSV per sesi, per mata pelajaran (hanya berisi session-level stats, bukan per-siswa lintas sesi).
- Download "rekap semua mapel" di `SessionHistoryTab` — tapi **hanya bisa diakses oleh admin** (ada guard `user?.role === 'admin'` di baris 435).
- Export `/api/export/attendance` (XLSX/PDF) — ada guard backend **admin only** (baris 578 ExportController.php).

Yang belum ada:
- Endpoint API `GET /api/attendance-sessions/recap` atau serupa yang mengembalikan ringkasan per-siswa lintas semua sesi (total hadir/izin/sakit/alpha per siswa, per kelas, di semua sesi milik guru).
- Halaman frontend `/absensi/rekap` atau tab baru di `/absensi` untuk rekap tersebut.
- Akses guru ke fitur export (baik UI maupun backend saat ini mengunci export ke admin saja).

---

## Evidence dengan Kutipan File

### 1. Tabel Database

#### `attendance_sessions`
Didefinisikan di `backend/database/migrations/2024_01_30_000001_create_lms_tables.php` baris 12–21, ditambah kolom berikut lewat migration-migration selanjutnya:

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigint PK | |
| `class_id` | FK → classes | |
| `teacher_id` | FK → users | |
| `subject` | varchar | |
| `qr_token` | varchar unique | |
| `token_refresh_interval` | smallint unsigned | default 300 |
| `valid_from` | timestamp | |
| `valid_until` | timestamp | |
| `status` | enum('active','expired','closed') | default 'active' |
| `jam_ke` | varchar(50) nullable | awalnya tinyint, diubah ke string di 2026_07_28 |
| `require_school_network` | boolean | default false |
| `allowed_ip_ranges` | json nullable | |
| `created_at`, `updated_at` | timestamp | |

#### `attendances`
Didefinisikan di migration yang sama baris 24–33, ditambah kolom anti-cheat:

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigint PK | |
| `session_id` | FK → attendance_sessions | cascade delete |
| `student_id` | FK → users | |
| `photo_path` | varchar nullable | kolom lama |
| `photo` | varchar nullable | kolom baru (2026_02_05); **duplikat** dengan photo_path |
| `ip_address` | varchar nullable | |
| `latitude` | decimal(10,7) nullable | |
| `longitude` | decimal(10,7) nullable | |
| `device_id` | varchar nullable | |
| `user_agent` | varchar nullable | |
| `is_suspicious` | boolean | default false |
| `suspicious_reason` | text nullable | |
| `status` | enum('hadir','izin','sakit','alpha') | default 'hadir' |
| `scanned_at` | timestamp nullable | |
| `created_at`, `updated_at` | timestamp | |
| UNIQUE | (session_id, student_id) | |

> **Catatan:** Kolom `photo` dan `photo_path` keduanya ada. `Attendance.php` fillable mendaftarkan keduanya. Di `submitAttendance()` (baris ~374) hanya kolom `photo` yang di-insert. Kolom `photo_path` tidak dipakai di insert terbaru — potensi kebingungan tapi tidak menyebabkan bug saat ini karena `photo_path` nullable.

#### `student_enrollments` (relevan untuk join siswa ↔ kelas)
Dipakai di `getStudentsForSession()` dan `countStudentsForSession()`. FK: `class_id`, `student_id`, scope `activeAt($date)`.

---

### 2. AttendanceController — Method Inventory

File: `backend/app/Http/Controllers/Api/AttendanceController.php`

| Method | Verb + URL (diregistrasi di routes) | Untuk Role | Deskripsi |
|---|---|---|---|
| `index` | `GET /attendance-sessions` | guru, admin | Daftar sesi milik guru; filter by class/date/status; paginated; per-sesi summary (hadir/total) |
| `store` | `POST /attendance-sessions` | guru | Buat sesi baru |
| `show` | `GET /attendance-sessions/{id}` | guru | Detail satu sesi + student_attendances + summary |
| `update` | `PUT /attendance-sessions/{id}` | guru | Update subject/status/interval |
| `destroy` | `DELETE /attendance-sessions/{id}` | guru, admin | Hapus sesi beserta semua attendance-nya |
| `close` | `POST /attendance-sessions/{id}/close` | guru | Tutup sesi; auto-mark alpha untuk yang belum absen |
| `mySessions` | `GET /attendance-sessions/my-sessions` | guru | 50 sesi terbaru milik guru (tanpa summary) |
| `refreshToken` | `POST /attendance-sessions/{id}/refresh-token` | guru | Refresh QR token |
| `getQrToken` | `GET /attendance-sessions/{id}/qr-token` | guru | Baca QR token sekarang |
| `updateStudentStatus` | `POST /attendance-sessions/{id}/update-student-status` | guru | Update status satu siswa |
| `bulkUpdateStatus` | `POST /attendance-sessions/{id}/bulk-update-status` | guru | Update status banyak siswa sekaligus |
| `getDeviceSwitchRequests` | `GET /attendance-sessions/{id}/device-switch-requests` | guru | Lihat permintaan pindah device pending |
| `handleDeviceSwitchRequest` | `POST /device-switch-requests/{id}/handle` | guru | Approve/reject permintaan device |
| `teacherStats` | `GET /teacher-attendance-stats` | guru | Statistik mingguan + total aggregat semua sesi milik guru (bukan per-siswa) |
| `submitAttendance` | `POST /attendance/submit` | siswa | Scan QR |
| `studentHistory` | `GET /attendance/history` | siswa | Riwayat kehadiran siswa sendiri |
| `activeSessions` | `GET /attendance/active-sessions` | siswa | Sesi aktif di kelas siswa hari ini |
| `myStats` | `GET /my-attendance-stats` | siswa | Statistik kehadiran siswa sendiri |
| `updateStudentAttendance` | (route `update-student-status`) | guru | Sama dengan updateStudentStatus (duplikat fungsi) |

**Gap kritis:** Tidak ada method yang mengembalikan **ringkasan per-siswa lintas semua sesi**. `teacherStats` hanya mengembalikan total agregat (total_hadir, total_izin, dll.) tanpa breakdown per siswa atau per kelas.

---

### 3. Routes API — Guru

File: `backend/routes/api.php` (baris 218–260)

```
// TEACHER (GURU) ROUTES
Route::middleware('role:guru')->group(function () {
    GET  /attendance-sessions/my-sessions         → mySessions
    CRUD /attendance-sessions                     → apiResource (index, store, show, update, destroy)
    POST /attendance-sessions/{id}/close          → close
    GET  /attendance-sessions/{id}/qr-token       → getQrToken
    POST /attendance-sessions/{id}/refresh-token  → refreshToken
    POST /attendance-sessions/{id}/update-student-status → updateStudentStatus
    POST /attendance-sessions/{id}/bulk-update-status    → bulkUpdateStatus
    GET  /attendance-sessions/{id}/device-switch-requests → getDeviceSwitchRequests
    POST /device-switch-requests/{id}/handle      → handleDeviceSwitchRequest
    GET  /teacher-attendance-stats                → teacherStats
});

// EXPORT (Admin & Guru)
Route::middleware('role:admin,guru')->group(function () {
    GET /export/attendance → ExportController@attendance
    // tapi di dalam fungsinya ada hard-check: if ($request->user()?->role !== 'admin') abort 403
});
```

> **Bug/Inkonsistensi:** Route `/export/attendance` ada di grup `role:admin,guru`, tapi di dalam `ExportController::attendance()` ada pengecekan manual yang hanya mengizinkan admin (baris ~578). Guru akan mendapat 403 meski route-nya sudah membuka akses. Ini perlu diperbaiki atau disengajakan.

---

### 4. Frontend Guru — Halaman Absensi

#### `/absensi` → `src/app/absensi/page.tsx`
Halaman utama absensi guru. Tiga tab:
1. **Buat Sesi** — form buat sesi + QR code live
2. **Absen Manual** — via `ManualAttendanceTab.tsx`
3. **Riwayat Sesi** — via `SessionHistoryTab.tsx`

Tab "Riwayat Sesi" menampilkan daftar sesi milik guru. Data diambil dari `GET /attendance-sessions` (paginated, 15 per page). Tiap sesi tampilkan: tanggal, kelas, mapel, hadir/total, status.

#### `src/components/absensi/SessionHistoryTab.tsx`
Komponen yang mengelola riwayat sesi. Fitur yang sudah ada:
- Filter by mapel dan kelas
- Per-subject stats summary (dikomputasi dari data sesi, bukan dari endpoint rekap)
- Export CSV: per sesi, per mapel, semua mapel
- **Guard download ada di baris 435:** `{user?.role === 'admin' && (` — tombol "Download Rekap" **hanya tampil untuk admin, tidak untuk guru**

#### `/riwayat-absensi` → `src/app/riwayat-absensi/page.tsx`
Halaman untuk **siswa** — menampilkan riwayat kehadiran siswa sendiri. Tidak relevan untuk guru.

#### Nav sidebar (`src/components/layouts/DashboardLayout.tsx` baris 51):
```
{ name: 'Sesi Absensi', href: '/absensi', roles: ['guru'] }
```
Tidak ada link menuju halaman rekap khusus guru.

---

### 5. Model Relasi

**`Attendance.php`** — fillable: session_id, student_id, photo_path, photo, ip_address, device_id, user_agent, is_suspicious, suspicious_reason, status, scanned_at, latitude, longitude. Relasi: `session()`, `student()`.

**`AttendanceSession.php`** — fillable: class_id, teacher_id, subject, jam_ke, qr_token, token_refresh_interval, valid_from, valid_until, status, require_school_network, allowed_ip_ranges. Relasi: `class()`, `teacher()`, `attendances()`.

**`User.php`** — `attendances()` hasMany via student_id. Relasi `enrollments()` ke StudentEnrollment.

---

### 6. ExportController — Fungsi Attendance

File: `backend/app/Http/Controllers/Api/ExportController.php`, fungsi `attendance()` (baris 562–720)

Format output: tabel datar (satu baris per siswa per grup teacher|subject|class), kolom: No, Guru, Mata Pelajaran, Kelas, NISN, NIS, Nama, Hadir, Izin, Sakit, Alpha, Total.

Mendukung filter: class_id, period (week/month/semester). Bisa menghasilkan XLSX atau PDF.

**Permasalahan:**
1. Hard-block `role !== 'admin'` di baris ~578 → guru tidak bisa pakai meski route group mengizinkan.
2. Data di kolom "Guru" di output Excel bisa multi-guru jika satu kelas punya banyak guru untuk mapel berbeda — yang mana benar, tapi artinya satu siswa bisa muncul beberapa baris (satu per mapel). Sudah dikelompokkan per teacher|subject|class, jadi ini by-design.

---

## Pertanyaan yang Dijawab

### Data apa yang sudah ada?
- Status hadir/izin/sakit/alpha per siswa per sesi ✅
- Waktu scan (`scanned_at`) ✅
- Metode (QR scan vs manual update oleh guru) — tidak ada kolom `method`, tapi bisa diinferensikan dari `scanned_at` null/non-null
- Foto bukti (`photo`) ✅ (nullable)
- Device ID dan IP untuk anti-cheat ✅

### Apakah sudah ada endpoint rekap multi-sesi?
**Tidak.** Yang paling dekat adalah:
- `GET /attendance-sessions` (index) — list sesi + summary per sesi, tapi satu halaman 15 sesi; tidak menyediakan per-student cross-session aggregation.
- `GET /teacher-attendance-stats` — hanya total semua sesi guru, tidak breakdown per siswa.
- `GET /export/attendance` (ExportController) — paling lengkap, bisa rekap per kelas + periode, tapi hanya untuk admin.

### Apa yang belum ada dan perlu dibuat?

1. **Endpoint backend baru** untuk guru:
   - `GET /api/attendance-recap` — mengembalikan ringkasan per-siswa lintas semua sesi milik guru (atau filter by class_id, date range, subject). Data: nama siswa, NISN/NIS, total hadir/izin/sakit/alpha, persentase kehadiran, jumlah sesi.
   - Alternatif: izinkan guru akses `/export/attendance` (hapus atau kondisionalkan guard admin-only).

2. **Halaman/tab baru di frontend** untuk guru:
   - Tab baru "Rekap" di `/absensi` atau halaman terpisah `/absensi/rekap`.
   - Menampilkan tabel matriks: baris = siswa, kolom = total per status + persentase.
   - Filter by kelas, mapel, rentang tanggal.
   - Tombol export CSV/Excel (yang saat ini ter-guard `user.role === 'admin'` perlu dibuka untuk guru).

3. **Fix guard di `SessionHistoryTab.tsx`** baris 435:
   - Ubah `{user?.role === 'admin' && (` → `{(user?.role === 'admin' || user?.role === 'guru') && (` agar guru bisa mengakses tombol Download Rekap yang sudah ada.

4. **Fix guard di `ExportController::attendance()`** (opsional/terpisah):
   - Jika ingin guru bisa ekspor XLSX/PDF, hapus atau relaksasi pengecekan manual `role !== 'admin'`.

### Format rekap yang masuk akal

Dua format yang disarankan, tidak mutually exclusive:

**Format A — Ringkasan per-siswa (yang paling berguna untuk rekap keseluruhan):**
```
Siswa        | NISN | Hadir | Izin | Sakit | Alpha | Total | %
Andi Wijaya  | ...  |  18   |  1   |   0   |   1   |  20   | 90%
Budi Santoso | ...  |  15   |  2   |   1   |   2   |  20   | 75%
```
Filter by: kelas, mata pelajaran, rentang tanggal.

**Format B — Matriks siswa × sesi (lebih granular, mirip buku absen manual):**
```
Siswa        | 01-Jan | 03-Jan | 05-Jan | Total | %
Andi Wijaya  |   H    |   H    |   A    |  2H   | 67%
Budi Santoso |   H    |   I    |   H    |  2H   | 67%
```
Format B lebih berguna untuk guru melihat pola absensi tiap siswa per pertemuan. Tapi lebih kompleks untuk diimplementasikan di frontend (kolom dinamis).

**Rekomendasi:** Implementasikan Format A terlebih dahulu (lebih cepat, endpoint sederhana). Format B bisa ditambahkan kemudian sebagai view detail.

---

## Kesimpulan dan Rekomendasi

### Gap yang Ditemukan

| # | Gap | Prioritas | Effort |
|---|---|---|---|
| 1 | Tidak ada endpoint API rekap lintas sesi per-siswa untuk guru | Tinggi | Sedang |
| 2 | Tombol "Download Rekap" di SessionHistoryTab hanya tampil untuk admin (guard baris 435) | Tinggi | Kecil (1 baris) |
| 3 | `/export/attendance` punya double guard: route group guru tapi controller hardcode admin-only | Sedang | Kecil |
| 4 | Tidak ada halaman/tab rekap khusus guru | Tinggi | Sedang |
| 5 | `teacherStats` tidak breakdown per siswa, hanya aggregat total guru | Sedang | Sedang |

### Rekomendasi Implementasi (Minimal Perubahan)

**Fix cepat (tidak butuh endpoint baru):**
- Ubah guard di `SessionHistoryTab.tsx` baris 435 dari `user?.role === 'admin'` menjadi `user?.role === 'admin' || user?.role === 'guru'`. Ini saja sudah memberi guru akses ke download rekap CSV yang logika-nya sudah ada di frontend.
- Hapus pengecekan `role !== 'admin'` di `ExportController::attendance()` (atau ganti dengan kondisi yang mengizinkan guru, tapi batasi scope hanya ke sesi milik guru) agar guru bisa export XLSX/PDF.

**Fitur baru (endpoint + halaman):**
- Tambahkan method `recap(Request $request)` di `AttendanceController`:
  - Parameter: `class_id?`, `subject?`, `date_from?`, `date_to?`
  - Query: semua sesi milik guru (teacher_id = user->id) dalam filter → join attendances → group by student_id → aggregate count per status
  - Return: array of { student: {id, name, nisn, nis}, hadir, izin, sakit, alpha, total, percentage, sessions_count }
- Registrasikan di routes: `GET /attendance-recap` dalam grup `role:guru`
- Tambahkan tab "Rekap" di `src/app/absensi/page.tsx` yang memanggil endpoint ini

**Tidak perlu migrasi baru** — semua data yang diperlukan sudah ada di tabel `attendance_sessions` dan `attendances`.

---

*File yang relevan untuk implementasi:*
- `backend/app/Http/Controllers/Api/AttendanceController.php` — tambah method `recap()`
- `backend/routes/api.php` baris 235 area — registrasi route baru
- `src/components/absensi/SessionHistoryTab.tsx` baris 435 — fix guard admin-only
- `backend/app/Http/Controllers/Api/ExportController.php` baris ~578 — fix guard admin-only
- `src/app/absensi/page.tsx` — tambah tab "Rekap"
- `src/components/layouts/DashboardLayout.tsx` — opsional: tambah nav link rekap jika dipisah jadi halaman baru
