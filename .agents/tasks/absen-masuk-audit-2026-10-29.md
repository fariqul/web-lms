# Audit Fitur Absen Masuk — 2026-10-29

**Status ringkas:** Ditemukan **3 bug CRITICAL** (dua duplikasi method PHP yang menyebabkan fatal error, satu duplikasi route), **1 bug WARNING** (naming variable yang membingungkan di settings page), dan sejumlah temuan INFO. Semua bug critical WAJIB diperbaiki sebelum deploy karena akan menyebabkan server error 500 saat pertama kali request.

---

## TEMUAN DETAIL

---

### [CRITICAL-1] Duplikasi method `staffAttendances()` dan `isStaff()` di User.php

- **File:** `d:/project-amsp/backend/app/Models/User.php`
- **Baris perkiraan:** 74–77 (definisi pertama) dan 141–149 (definisi duplikat)
- **Deskripsi:**  
  Method `staffAttendances()` dan `isStaff()` didefinisikan **dua kali** dalam class yang sama. PHP tidak mengizinkan redefinisi method dalam satu class — ini akan menyebabkan **fatal error** `Cannot redeclare App\Models\User::staffAttendances()` setiap kali class User di-load, yaitu hampir setiap request yang membutuhkan autentikasi.

  Definisi pertama (baris ~74):
  ```php
  public function staffAttendances()
  {
      return $this->hasMany(StaffAttendance::class);
  }
  ```
  Definisi duplikat (baris ~141–149):
  ```php
  public function staffAttendances()
  {
      return $this->hasMany(\App\Models\StaffAttendance::class);
  }

  public function isStaff(): bool
  {
      return $this->role === 'staff';
  }
  ```
  Versi pertama `isStaff()` juga sudah ada di baris ~136.

- **Saran fix:**  
  Hapus blok duplikat di baris ~141–152 (yang menggunakan FQCN `\App\Models\StaffAttendance::class`). Pertahankan definisi pertama yang lebih bersih (sudah menggunakan short class name `StaffAttendance::class` — sudah di-import via `use` atau bisa ditambahkan).  
  **Perlu tambah** `use App\Models\StaffAttendance;` di bagian atas file jika belum ada.

---

### [CRITICAL-2] Duplikasi konstanta di SystemSetting.php

- **File:** `d:/project-amsp/backend/app/Models/SystemSetting.php`
- **Baris perkiraan:** Blok 1 = baris 18–22; Blok 2 = baris 190–194
- **Deskripsi:**  
  Lima konstanta didefinisikan **dua kali** dalam class yang sama:
  - `SCHOOL_LATITUDE_KEY` (dua kali)
  - `SCHOOL_LONGITUDE_KEY` (dua kali)
  - `STAFF_ATTENDANCE_RADIUS_KEY` (dua kali)
  - `STAFF_CHECKIN_START_KEY` (dua kali)
  - `STAFF_CHECKIN_END_KEY` (dua kali)

  PHP akan mengeluarkan **fatal error** `Cannot redefine class constant` saat class di-load. Ini terjadi karena konstanta ditambahkan di sesi berbeda — satu blok di awal class (baris 18–22) dan satu blok lagi setelah method graduation (baris 190–194).

- **Saran fix:**  
  Hapus blok duplikat di baris ~189–194 (yang tidak memiliki spasi sejajar/formatnya berbeda). Pertahankan blok pertama di baris 18–22 yang sudah ada bersama komentar section yang jelas.

---

### [CRITICAL-3] Duplikasi route group di api.php

- **File:** `d:/project-amsp/backend/routes/api.php`
- **Baris perkiraan:** Route group `role:guru,staff,admin` muncul dua kali (~baris 293–298 dan ~baris 314–319). Route group `role:admin` untuk admin endpoints juga muncul dua kali (sudah ada di dalam `route:admin,audit` group baris ~221–225, lalu muncul lagi di standalone group ~baris 303–309).
- **Deskripsi:**  
  Terlihat tiga route group untuk staff-attendance di luar admin group utama:

  **Grup 1 (~baris 293–298):**
  ```php
  Route::middleware('role:guru,staff,admin')->group(function () {
      Route::post('/staff-attendance/check-in', ...);
      Route::get('/staff-attendance/today', ...);
      Route::get('/staff-attendance/history', ...);
  });
  ```

  **Grup 2 (~baris 303–309):**
  ```php
  Route::middleware('role:admin')->group(function () {
      Route::get('/staff-attendance/export', ...);
      Route::get('/staff-attendance/settings', ...);
      Route::post('/staff-attendance/settings', ...);
      Route::get('/staff-attendance', ...);
  });
  ```

  **Grup 3 (~baris 314–319) — duplikat Grup 1:**
  ```php
  Route::middleware('role:guru,staff,admin')->group(function () {
      Route::post('/staff-attendance/check-in', ...);
      Route::get('/staff-attendance/today', ...);
      Route::get('/staff-attendance/history', ...);
  });
  ```

  Selain itu, admin endpoints (`/export`, `/settings`, `/staff-attendance`) sudah didaftarkan di dalam `Route::middleware(['role:admin', 'audit'])` di baris ~221–225. Jadi route admin terdaftar **dua kali** — sekali dengan middleware `audit`, sekali tanpa. Laravel tidak error karena route duplikat hanya diabaikan (yang pertama menang), tapi ini sangat membingungkan dan berpotensi menyebabkan route yang salah dipakai.

  Juga terdapat **duplikasi `use` statement** di bagian atas file:
  - Baris 9: `use App\Http\Controllers\Api\StaffAttendanceController;`
  - Baris 32: `use App\Http\Controllers\Api\StaffAttendanceController;` (duplikat)

  PHP melaporkan `Cannot use App\Http\Controllers\Api\StaffAttendanceController as StaffAttendanceController because the name is already in use` — **fatal error**.

- **Saran fix:**  
  1. Hapus duplikat `use` statement di baris ~32.
  2. Hapus Grup 3 (duplikat Grup 1) di baris ~314–319.
  3. Hapus Grup 2 standalone (`role:admin`) di baris ~303–309 — route ini sudah ada dan lebih lengkap (dengan middleware `audit`) di dalam group admin utama. Pertahankan hanya yang di dalam `['role:admin', 'audit']` group.

---

### [WARNING-1] Variable naming mismatch di settings/page.tsx

- **File:** `d:/project-amsp/src/app/admin/absen-masuk/settings/page.tsx`
- **Baris perkiraan:** ~baris 24
- **Deskripsi:**  
  ```typescript
  const [loading, setSaving] = useState(false);
  ```
  State variable dinamai `loading` tapi setter dinamai `setSaving`. Ini tidak menyebabkan crash TypeScript karena sintaksisnya valid, namun sangat membingungkan dan rawan bug saat dikembangkan lebih lanjut. Di tempat lain dalam file, `loading` dipakai sebagai prop `disabled={loading}` dan untuk `{loading ? <Loader2 ...> : <Save ...>}` — secara fungsional **berjalan benar**, tapi semantiknya salah.

- **Saran fix:**  
  Ganti `const [loading, setSaving] = useState(false);` menjadi salah satu:
  - `const [saving, setSaving] = useState(false);` (dan update semua referensi `loading` dalam komponen ini menjadi `saving`), atau
  - `const [loading, setLoading] = useState(false);` (dan update semua `setSaving(...)` menjadi `setLoading(...)`).  
  Pilihan pertama lebih semantik karena ini adalah state untuk operasi save.

---

### [INFO-1] roleInfo.label untuk role 'staff' menghasilkan string kosong

- **File:** `d:/project-amsp/src/components/layouts/DashboardLayout.tsx`
- **Baris perkiraan:** ~baris 106
- **Deskripsi:**  
  ```typescript
  label: role === 'admin' ? 'Administrator' : role === 'guru' ? 'Dashboard Guru' : role === 'siswa' ? 'E-Learning Portal' : '',
  ```
  Role `staff` tidak dicakup — akan menampilkan string kosong di subtitle sidebar. Bukan error tapi pengalaman UI kurang baik untuk user staff.

- **Saran fix:**  
  Tambahkan handler untuk role staff:
  ```typescript
  label: role === 'admin' ? 'Administrator' : role === 'guru' ? 'Dashboard Guru' : role === 'siswa' ? 'E-Learning Portal' : role === 'staff' ? 'Pegawai / Staff' : '',
  ```

---

### [INFO-2] Logika checkIn: koordinat null → absen diizinkan tanpa validasi lokasi

- **File:** `d:/project-amsp/backend/app/Http/Controllers/Api/StaffAttendanceController.php`
- **Baris perkiraan:** ~baris 60–75 (blok validasi lokasi)
- **Deskripsi:**  
  Ketika koordinat sekolah belum dikonfigurasi (`$schoolLat === null || $schoolLng === null`), absen masuk **tetap diterima** dengan `$isLocationValid = true`. Ini adalah keputusan desain yang disengaja dan sudah didokumentasikan dalam kode. Tidak ada bug, tapi perlu dipastikan admin sekolah sudah mengisi koordinat sebelum fitur digunakan di produksi agar validasi lokasi aktif.

- **Saran:**  
  Tidak ada perubahan kode yang diperlukan. Pastikan admin mengisi setting koordinat sekolah sebelum fitur diluncurkan.

---

### [INFO-3] UNIQUE constraint `(user_id, date)` di migration — sudah benar

- **File:** `d:/project-amsp/backend/database/migrations/2026_10_01_000003_create_staff_attendances_table.php`
- **Baris perkiraan:** ~baris 38
- **Deskripsi:**  
  `$table->unique(['user_id', 'date']);` — constraint ini benar untuk kebutuhan "satu absen masuk per orang per hari". Controller sudah menangani kasus ini dengan query `whereDate('date', today())` sebelum insert, sehingga error database constraint hanya akan menjadi safety net, tidak akan muncul dalam flow normal.

- **Status:** OK, tidak perlu perubahan.

---

### [INFO-4] Duplikasi nav item 'Absen Masuk' di DashboardLayout tidak ada

- **File:** `d:/project-amsp/src/components/layouts/DashboardLayout.tsx`
- **Deskripsi:**  
  Grep awal menunjukkan baris 52 muncul tiga kali karena grep menampilkan context lines yang sama. Setelah membaca file langsung, navigation array hanya berisi **satu** entry `Absen Masuk` untuk guru/staff dan **satu** entry `Absen Masuk Pegawai` untuk admin. Tidak ada duplikasi.

- **Status:** OK, tidak perlu perubahan.

---

### [INFO-5] SchoolNetworkSetting::isSchoolNetwork — signature sudah benar

- **File:** `d:/project-amsp/backend/app/Models/SchoolNetworkSetting.php`
- **Deskripsi:**  
  `public static function isSchoolNetwork(string $ip): bool` — digunakan di StaffAttendanceController sebagai `SchoolNetworkSetting::isSchoolNetwork($clientIp)`. Signature cocok, tipe parameter dan return type sesuai.

- **Status:** OK.

---

### [INFO-6] RoleMiddleware sudah mendukung role 'staff'

- **File:** `d:/project-amsp/backend/app/Http/Middleware/RoleMiddleware.php`
- **Deskripsi:**  
  Middleware menggunakan `in_array($userRole, $roles)` dengan variadic `string ...$roles`. Route `middleware('role:guru,staff,admin')` akan meng-inject `['guru', 'staff', 'admin']` sebagai `$roles`. Karena user dengan `role = 'staff'` akan lulus `in_array('staff', ['guru', 'staff', 'admin'])`, middleware bekerja dengan benar.

- **Status:** OK.

---

### [INFO-7] Semua import dan endpoint URL di api.ts sudah benar

- **File:** `d:/project-amsp/src/services/api.ts`
- **Deskripsi:**  
  - `/staff-attendance/check-in` ✓
  - `/staff-attendance/today` ✓
  - `/staff-attendance/history` ✓
  - `/staff-attendance/export` ✓
  - `/staff-attendance/settings` (GET dan POST) ✓
  - `/staff-attendance` (admin index) ✓
  - Semua type annotations konsisten dengan response dari controller.

- **Status:** OK.

---

### [INFO-8] Import di absen-masuk/page.tsx dan admin pages sudah lengkap

- **File:** `d:/project-amsp/src/app/absen-masuk/page.tsx`, `d:/project-amsp/src/app/admin/absen-masuk/page.tsx`, `d:/project-amsp/src/app/admin/absen-masuk/settings/page.tsx`
- **Deskripsi:**  
  Semua import `staffAttendanceAPI`, `DashboardLayout`, dan icon (ClipboardCheck, MapPin, Navigation, Wifi, dll.) sudah ada dan benar. Tidak ada unresolved variable yang terdeteksi.

- **Status:** OK.

---

### [INFO-9] Migration ENUM syntax sudah benar

- **File:** `d:/project-amsp/backend/database/migrations/2026_10_01_000001_add_staff_role_and_jabatan_to_users.php`
- **Deskripsi:**  
  ```php
  DB::statement("ALTER TABLE users MODIFY COLUMN role ENUM('admin','guru','siswa','staff') DEFAULT 'siswa'");
  ```
  Sintaks MySQL untuk modifikasi ENUM sudah benar. Nilai `'staff'` sudah ditambahkan.

- **Status:** OK.

---

## RINGKASAN: FIX WAJIB SEBELUM DEPLOY

| # | Severity | File | Fix |
|---|----------|------|-----|
| 1 | **CRITICAL** | `app/Models/User.php` | Hapus duplikat method `staffAttendances()` dan `isStaff()` di baris ~141–152 |
| 2 | **CRITICAL** | `app/Models/SystemSetting.php` | Hapus duplikat 5 konstanta di baris ~189–194 |
| 3 | **CRITICAL** | `routes/api.php` | Hapus duplikat `use StaffAttendanceController` (baris ~32), hapus duplikat route group `role:guru,staff,admin` (~baris 314–319), hapus duplikat route group `role:admin` standalone (~baris 303–309) |
| 4 | WARNING | `src/app/admin/absen-masuk/settings/page.tsx` | Rename `loading`→`saving` atau `setSaving`→`setLoading` agar konsisten |

Fix nomor 1, 2, dan 3 adalah blocker absolut — ketiganya menyebabkan PHP fatal error yang akan membuat **seluruh backend tidak bisa di-load**, bukan hanya fitur absen masuk.

Fix nomor 4 tidak menyebabkan crash tapi sebaiknya diperbaiki agar kode maintainable.

---

*Audit dilakukan secara static (read-only). Tidak ada server yang dijalankan, tidak ada koneksi database.*
