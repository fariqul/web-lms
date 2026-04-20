# Desain: Toggle Akses Hasil Ujian Guru (Global On/Off oleh Admin)

## Latar Belakang
Saat ini guru owner dapat melihat hasil ujian siswa. Dibutuhkan kontrol global dari admin agar akses ini bisa dimatikan sewaktu-waktu dengan satu toggle.

## Tujuan
1. Admin punya satu toggle untuk mengatur akses hasil ujian siswa di sisi guru.
2. Saat toggle **ON**, guru tidak bisa melihat hasil ujian (list dan detail), termasuk direct URL/API.
3. Saat toggle **OFF**, guru owner bisa melihat hasil ujian kembali.
4. Perubahan berlaku langsung tanpa refresh untuk halaman guru yang sedang terbuka.

## Scope
### In scope
- Hanya untuk **hasil ujian (CBT)**, tidak mencakup quiz.
- Toggle ditempatkan di halaman **Admin > Ujian**.
- Kontrol akses di backend + sinkronisasi realtime ke frontend guru.

### Out of scope
- Perubahan kebijakan export hasil ujian (tetap admin-only).
- Perubahan akses hasil quiz.
- Perubahan skema role user.

## Keputusan Produk
1. **Target fitur:** hasil ujian CBT saja.
2. **Default setting:** **ON** (guru default tidak bisa melihat hasil ujian sampai admin mematikan toggle).
3. **Lokasi UI toggle:** Admin > Ujian.
4. **Efek perubahan:** realtime (tanpa refresh) untuk sesi halaman guru yang aktif.

## Opsi Pendekatan
1. **Dipilih: Global setting + guard backend + realtime socket**
   - Kelebihan: aman (backend source of truth), efek langsung, konsisten lintas tab/user.
   - Kekurangan: butuh tambahan event socket + listener frontend.
2. Global setting + guard backend tanpa realtime
   - Aman, tetapi efek baru terasa saat request berikutnya.
3. Frontend-only toggle
   - Paling cepat, tetapi tidak aman karena bisa dilewati direct API call.

## Desain Teknis
### 1) Persistence setting
- Gunakan tabel `system_settings` yang sudah ada.
- Tambah key baru:
  - `teacher_exam_results_hidden` (`'1'` = ON/sembunyikan dari guru, `'0'` = OFF/tampilkan ke guru owner).
- Tambah helper di `SystemSetting`:
  - `getTeacherExamResultsHidden(): bool` (default `true` jika belum ada nilai).
  - `setTeacherExamResultsHidden(bool $hidden): void`.

### 2) API admin toggle
- Tambah endpoint admin:
  - `GET /api/exam-results-visibility` → baca status toggle.
  - `PUT /api/exam-results-visibility` dengan payload `{ "teacher_exam_results_hidden": boolean }`.
- Validasi role: admin-only.
- Response format konsisten:
```json
{
  "success": true,
  "data": { "teacher_exam_results_hidden": true },
  "message": "Akses hasil ujian guru dinonaktifkan"
}
```

### 3) Guard backend pada endpoint hasil ujian
- Lokasi: `ExamController::results()` dan `ExamController::studentResult()`.
- Aturan:
  - `admin`: selalu boleh.
  - `guru`: hanya boleh jika
    1) owner exam, **dan**
    2) `teacher_exam_results_hidden === false`.
  - Selain itu: `403`.
- Pesan error untuk toggle ON:
  - `"Akses hasil ujian untuk guru sedang dinonaktifkan admin"`.

### 4) Realtime propagation
- Saat admin update toggle:
  - simpan setting,
  - broadcast event socket global baru (misalnya `system.exam-results-visibility.updated`) dengan payload:
```json
{
  "teacher_exam_results_hidden": true,
  "updated_by": 1,
  "updated_at": "2026-04-20T13:00:00+08:00"
}
```
- Frontend halaman hasil ujian guru subscribe event ini:
  - jika nilai berubah jadi `true` dan user role guru → toast + redirect otomatis ke `/ujian`.

### 5) Frontend Admin > Ujian
- Tambah satu toggle card di halaman admin ujian:
  - Label: `Sembunyikan hasil ujian dari guru`.
  - Deskripsi status ON/OFF dalam Bahasa Indonesia.
  - Save state + loading state.
- Saat toggle diubah:
  - kirim PUT,
  - tampilkan toast sukses/gagal.

### 6) Frontend halaman hasil guru
- Halaman target:
  - `src/app/ujian/[id]/results/page.tsx`
  - `src/app/ujian/[id]/hasil/[studentId]/page.tsx`
- Perilaku:
  - Handle 403 spesifik toggle dengan toast yang informatif.
  - Listener socket untuk auto-redirect ketika toggle dinyalakan admin.

## Error Handling
- Backend:
  - `403` untuk akses guru saat toggle ON.
  - `422` untuk payload toggle invalid.
- Frontend:
  - Toast error jelas dalam Bahasa Indonesia.
  - Redirect aman ke `/ujian` untuk mencegah stale view.

## Testing Strategy
1. Backend Feature Test:
   - admin bisa get/update toggle.
   - guru owner dapat 403 saat toggle ON.
   - guru owner dapat 200 saat toggle OFF.
   - admin tetap 200 untuk hasil ujian pada ON/OFF.
2. Frontend:
   - toggle tampil dan berfungsi di Admin > Ujian.
   - export exam tetap admin-only (tidak berubah).
   - halaman guru auto-redirect saat event toggle ON diterima.
3. Regression:
   - akses hasil quiz tetap tidak terpengaruh.

## Risiko & Mitigasi
- Risiko: UI sudah sembunyi tapi API masih bisa diakses.
  - Mitigasi: backend guard wajib jadi sumber utama.
- Risiko: halaman guru stale saat toggle berubah.
  - Mitigasi: event socket global + redirect otomatis.
- Risiko: default ON mengubah behavior existing.
  - Mitigasi: tampilkan status toggle jelas di admin ujian dan dokumentasikan di release notes.

## Kriteria Selesai
1. Admin dapat mengaktifkan/nonaktifkan akses hasil ujian guru dari satu toggle.
2. Saat ON, guru owner tidak dapat akses hasil ujian list/detail (API + UI).
3. Saat OFF, guru owner kembali dapat akses.
4. Perubahan status berlaku realtime pada halaman guru aktif.
5. Semua test baru dan regresi terkait lulus.
