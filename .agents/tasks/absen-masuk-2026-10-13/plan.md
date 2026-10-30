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
