# Absen Masuk — Fix Print Barcode & Fitur Absen Pulang

**Tanggal implementasi:** 2026-10-13

---

## File yang Dibuat / Diubah

### FITUR 1 — Fix Print Barcode

| File | Status | Keterangan |
|------|--------|-----------|
| `src/app/admin/absen-masuk/barcode/print/page.tsx` | **BARU** | Halaman print standalone (tanpa DashboardLayout). Fetch token, tampilkan QR code (size=280), auto-trigger `window.print()` setelah 300ms. Ada tombol fallback "Print Sekarang" (.no-print). |
| `src/app/admin/absen-masuk/barcode/page.tsx` | **DIUBAH** | `handlePrint` diganti jadi `window.open('/admin/absen-masuk/barcode/print', '_blank')`. Hapus `<style>` print, `#print-area`, `hidden print:*` elements, dan semua class `no-print`. |

### FITUR 2 — Absen Pulang Guru/Staff

#### Backend

| File | Status | Keterangan |
|------|--------|-----------|
| `backend/database/migrations/2026_10_30_000002_add_check_out_columns_to_staff_attendances.php` | **BARU** | Tambah kolom: `checked_out_at`, `check_out_latitude`, `check_out_longitude`, `check_out_ip`, `check_out_distance_meters` ke tabel `staff_attendances`. |
| `backend/app/Models/SystemSetting.php` | **DIUBAH** | Tambah konstanta `STAFF_CHECKOUT_START_KEY` & `STAFF_CHECKOUT_END_KEY`. Tambah method `getStaffCheckOutWindow()`. Update `setStaffAttendanceSettings()`: flush cache baru + setter check_out_start/end. |
| `backend/app/Models/StaffAttendance.php` | **DIUBAH** | Tambah 5 field ke `$fillable` dan `$casts` untuk kolom check-out. |
| `backend/app/Http/Controllers/Api/StaffAttendanceController.php` | **DIUBAH** | Tambah method `checkOut()`. Update `todayStatus()`, `adminIndex()`, `adminExportCsv()`, `getSettings()`, `updateSettings()`. |
| `backend/routes/api.php` | **DIUBAH** | Tambah route `POST /staff-attendance/check-out` di group `role:guru,staff,admin`. |

#### Frontend

| File | Status | Keterangan |
|------|--------|-----------|
| `src/services/api.ts` | **DIUBAH** | Update return type `todayStatus()` & `getSettings()`. Tambah method `checkOut()`. Update parameter `updateSettings()`. |
| `src/app/absen-masuk/page.tsx` | **DIUBAH** | Tambah import `LogOut`. Update interface `TodayStatus`. Tambah state `checkingOut` + fungsi `handleCheckOut`. Tambah UI tombol/card absen pulang di section "sudah absen masuk". |
| `src/app/admin/absen-masuk/page.tsx` | **DIUBAH** | Update interface `StaffRow`. Tambah kolom "Jam Pulang" di tabel header & body. |
| `src/app/admin/absen-masuk/settings/page.tsx` | **DIUBAH** | Update interface `Settings`. Update state default, load settings, handleSave. Tambah section "Jam Absen Pulang" di form. |

---

## Perintah Deploy yang Harus Dijalankan di Server

### 1. Pull latest code

```bash
git pull origin main
```

### 2. Backend — jalankan migration

```bash
cd /path/to/backend
php artisan migrate
```

> Migration yang baru: `2026_10_30_000002_add_check_out_columns_to_staff_attendances`

### 3. Backend — clear cache (opsional tapi direkomendasikan)

```bash
php artisan cache:clear
php artisan config:cache
php artisan route:cache
```

### 4. Frontend — build ulang

```bash
cd /path/to/frontend   # direktori yang berisi package.json Next.js
npm run build
```

### 5. Restart server/process manager

```bash
# Jika pakai PM2:
pm2 restart all

# Atau restart service PHP-FPM/Nginx jika diperlukan:
sudo systemctl restart php8.x-fpm
sudo systemctl reload nginx
```

---

## Catatan Tambahan

- Absen pulang memerlukan GPS aktif di perangkat guru/staff.
- Jam pulang default di settings: mulai `13:00`, akhir `17:00` — admin bisa ubah di halaman Pengaturan Absen.
- Jika kolom koordinat sekolah belum dikonfigurasi, validasi radius GPS di-skip (allow all).
- Halaman print barcode (`/admin/absen-masuk/barcode/print`) adalah tab terpisah, tidak ada auth guard — token dikirim otomatis via Axios interceptor karena bearer token tersimpan di localStorage browser yang sama.

---

## Checklist Deploy — Tahap 1 Proctoring Config UI

**Tanggal implementasi:** 2026-11-01

### File yang Dibuat / Diubah

| File | Status |
|------|--------|
| `backend/database/migrations/2026_11_01_000001_create_proctoring_configurations_table.php` | BARU |
| `backend/database/migrations/2026_11_01_000002_create_proctoring_config_versions_table.php` | BARU |
| `backend/database/migrations/2026_11_01_000003_add_config_version_to_diagnostic_tests.php` | BARU |
| `backend/app/Models/ProctoringConfiguration.php` | SUDAH ADA (models sudah lengkap) |
| `backend/app/Models/ProctoringConfigVersion.php` | SUDAH ADA |
| `backend/app/Http/Controllers/Api/ProctoringConfigController.php` | SUDAH ADA |
| `backend/app/Http/Requests/UpdateProctoringConfigRequest.php` | BARU |
| `backend/database/seeders/ProctoringConfigurationSeeder.php` | BARU |
| `backend/tests/Feature/ProctoringConfigTest.php` | BARU |
| `backend/tests/Unit/ProctoringConfigValidationTest.php` | BARU |
| `backend/proctoring-service/main.py` | DIUBAH |
| `backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php` | DIUBAH |
| `backend/app/Jobs/AnalyzeSnapshotJob.php` | DIUBAH |
| `backend/routes/api.php` | SUDAH ADA (routes proctoring-config sudah ada) |
| `backend/app/Http/Controllers/Api/ExamController.php` | DIUBAH |
| `src/types/proctoring-config.ts` | BARU |
| `src/services/proctoring-config.ts` | BARU |
| `src/components/diagnostic/ThresholdSettings.tsx` | BARU |
| `src/components/diagnostic/ConfigDiffDialog.tsx` | BARU |
| `src/components/diagnostic/ConfigVersionHistory.tsx` | BARU |
| `src/app/admin/proctoring-diagnostic/page.tsx` | DIUBAH |
| `src/hooks/useProctoring.ts` | DIUBAH |
| `src/app/ujian/[id]/page.tsx` | DIUBAH |
| `backend/.env.example` | DIUBAH |

### Langkah Deploy

1. **Jalankan migration:**
   ```bash
   php artisan migrate --force
   ```

2. **Jalankan seeder:**
   ```bash
   php artisan db:seed --class=ProctoringConfigurationSeeder
   ```

3. **Rebuild container (jika main.py berubah):**
   ```bash
   docker compose build proctoring
   docker compose up -d proctoring
   ```
   Backend Laravel tidak perlu rebuild.

4. **Clear cache:**
   ```bash
   php artisan config:clear
   php artisan cache:clear
   php artisan route:clear
   ```

5. **Env var baru di server — tambahkan ke .env:**
   ```
   PROCTORING_CONFIG_CACHE_TTL=300
   PROCTORING_USE_DB_CONFIG=true
   ```

### Verifikasi

- [ ] `GET /api/proctoring-config` dengan token admin mengembalikan HTTP 200
- [ ] Tab 'Konfigurasi Ambang Batas' muncul di halaman `/admin/proctoring-diagnostic`
- [ ] Slider/input threshold dapat diubah dan disimpan sebagai draft
- [ ] Tombol 'Terapkan ke Active' membuka ConfigDiffDialog
- [ ] Riwayat versi tampil di ConfigVersionHistory
- [ ] Rollback ke versi sebelumnya berfungsi
- [ ] Identity mismatch di Diagnostic Tool menggunakan Euclidean distance
- [ ] `CONFIDENCE_THRESHOLD` default di FastAPI adalah 0.45

### Cara Test Lokal

1. `docker compose up -d`
2. `php artisan migrate --force`
3. `php artisan db:seed --class=ProctoringConfigurationSeeder`
4. Buka `http://localhost/admin/proctoring-diagnostic`
5. Klik tab 'Konfigurasi Ambang Batas'
6. Ubah salah satu threshold, klik 'Simpan Draft'
7. Klik 'Terapkan ke Active', isi catatan, konfirmasi
8. Cek tab 'Riwayat Versi' — versi baru harus muncul

## Checklist Deploy Tahap 2 — Pengambilan Data Otomatis

### Migration
```bash
php artisan migrate --force
```
Migration baru: experiment_sessions, experiment_trials

### Docker volume (tambah ke docker-compose.yml jika belum)
```yaml
volumes:
  - ./backend/storage/experiment-snapshots:/var/www/html/storage/app/public/experiment-snapshots
```
Buat direktori di server:
```bash
mkdir -p backend/storage/experiment-snapshots
```

### Storage link (jika belum)
```bash
php artisan storage:link
```

### Clear cache
```bash
php artisan config:clear
php artisan cache:clear
php artisan route:clear
```

### Env var baru di server (.env)
```
EXPERIMENT_MIN_CAPTURE_INTERVAL_MS=500
EXPERIMENT_SNAPSHOT_DISK=experiment_snapshots
```

### Verifikasi
- GET /api/experiment-sessions → 200
- Halaman /admin/proctoring-diagnostic/experiment muncul
- Buat sesi → start → capture satu trial → lihat trial di Review
- Export CSV → file ter-download
- Metrics endpoint return TP/TN/FP/FN
