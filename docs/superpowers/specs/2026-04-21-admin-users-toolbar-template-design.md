# Desain Perbaikan Toolbar Kelola Pengguna + Template Import Users

## Ringkasan Masalah
Halaman **Admin > Kelola Pengguna** memiliki toolbar action yang padat dan saling berdempetan pada viewport kecil/menengah, sehingga tampilan berantakan dan sulit dipakai. Selain itu, proses import users belum memiliki **file template resmi** yang bisa diunduh langsung dari UI.

## Tujuan
1. Membuat toolbar action di halaman kelola pengguna tetap lengkap tetapi responsif, rapi, dan mudah dipakai di berbagai ukuran layar.
2. Menyediakan file template import users dalam format **XLSX dan CSV** yang konsisten dengan skema import backend.

## Non-Tujuan
1. Tidak mengubah logika utama import preview/confirm yang sudah berjalan.
2. Tidak mengubah struktur data users di database.
3. Tidak menambah role/permission baru di luar admin.

## Opsi Pendekatan
### Opsi A (Dipilih): Toolbar tetap lengkap + flex-wrap responsif
- Action tetap dalam bentuk tombol langsung.
- Kontainer action memakai `flex-wrap` dan pengaturan responsif agar tombol pindah ke baris baru saat ruang sempit.
- Kelebihan: discoverability tinggi, tidak ubah alur kerja admin.
- Kekurangan: area header bisa lebih tinggi di mobile.

### Opsi B: Toolbar horizontal scroll
- Semua tombol dipaksa satu baris dengan overflow-x.
- Kelebihan: hemat tinggi layout.
- Kekurangan: usability menurun (harus geser horizontal), tidak ideal untuk tindakan cepat.

### Opsi C: Pecah 2 baris statis
- Tombol dibagi tetap ke 2 baris tanpa adaptasi granular.
- Kelebihan: implementasi sederhana.
- Kekurangan: kurang fleksibel antar breakpoint dan berpotensi tetap sempit.

## Desain Terpilih
### 1. UI Toolbar Kelola Pengguna
- Ubah wrapper action header menjadi kontainer responsif (`flex`, `flex-wrap`, `gap`).
- Pertahankan urutan tombol existing agar muscle memory admin tidak terganggu.
- Tombol prioritas utama (Tambah User, Import, Export) tetap mudah terlihat di breakpoint kecil.
- Tombol lain tetap tersedia dan akan wrap otomatis ke baris berikutnya saat ruang tidak cukup.

### 2. Template Import Users
- Tambah tombol **Download Template** di modal Import Users.
- Sediakan dua varian download:
  - `XLSX`
  - `CSV`
- Isi template:
  - Baris header:
    - `nama,email,role,jenis_kelamin,nisn,nis,nip,nomor_tes,class_name,class_id`
  - Satu baris contoh data valid untuk panduan admin.

### 3. API Backend Template
- Endpoint baru admin-only:
  - `GET /api/users/import-template?format=xlsx|csv`
- Perilaku:
  - `format=xlsx`: generate workbook (PhpSpreadsheet) berisi header + 1 contoh.
  - `format=csv`: stream CSV UTF-8 BOM berisi header + 1 contoh.
  - Format tidak valid: respons 422 dengan pesan Bahasa Indonesia.

## Data Flow
1. Admin buka modal Import Users.
2. Admin klik Download Template (XLSX/CSV).
3. Frontend memanggil endpoint template.
4. Backend generate file sesuai format dan kirim sebagai download response.
5. Admin mengisi file lalu lanjut proses import preview/confirm yang sudah ada.

## Error Handling
1. Query `format` invalid → 422 + pesan jelas.
2. Kegagalan generate file → 500 + pesan aman (tanpa bocor detail sensitif).
3. Frontend menampilkan toast error Bahasa Indonesia untuk kegagalan download.

## Testing
1. Feature test backend untuk endpoint template:
   - berhasil download CSV
   - berhasil download XLSX
   - gagal 422 untuk format invalid
2. Verifikasi frontend:
   - tombol toolbar tidak overlap/berdempetan di ukuran layar kecil-menengah
   - tombol Download Template berfungsi untuk kedua format
3. Regresi standar:
   - `php artisan test`
   - `npm run lint`
   - `npm run build`

## Dampak Perubahan
- **Frontend**:
  - `src/app/admin/users/page.tsx`
  - `src/services/api.ts`
- **Backend**:
  - `backend/app/Http/Controllers/Api/UserController.php`
  - `backend/routes/api.php`
  - `backend/tests/Feature/UserImportExportTest.php` (ditambah skenario endpoint template)

## Catatan Implementasi
- Selaras dengan keputusan sebelumnya: import users tetap upsert by email.
- Template adalah artefak panduan input, bukan pengganti validasi backend.
- Referensi docs:
  - Tailwind (`flex-wrap`, responsive basis/flex behavior)
  - PhpSpreadsheet (generate XLSX/CSV + output streaming)
