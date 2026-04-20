# Desain: Partial Revert Akses Hasil untuk Guru (Ujian + Quiz)

## Latar Belakang
Saat ini akses hasil ujian siswa dibatasi admin-only. Di lapangan, ada kasus riwayat ujian/quiz yang hanya terlihat di sisi guru, sehingga guru perlu melihat hasil untuk operasional harian. Namun export tetap harus dibatasi admin demi kontrol distribusi data.

## Tujuan
1. Guru bisa melihat hasil **ujian** dan **quiz** miliknya sendiri.
2. Guru tidak bisa melihat hasil milik guru lain.
3. Export hasil ujian/quiz tetap admin-only.
4. UI dan API konsisten (tidak hanya sembunyi tombol).

## Ruang Lingkup
- Backend route & controller untuk hasil ujian/quiz (list dan detail).
- Frontend halaman hasil ujian/quiz dan link navigasi terkait.
- Pengujian regresi akses role + ownership.

Di luar scope:
- Perubahan skema database.
- Perubahan format export.
- Perubahan kebijakan akses admin.

## Opsi Pendekatan
1. **Full revert**: kembalikan semua akses guru termasuk export.
2. **Revert sebagian tanpa ownership**: guru bisa lihat semua hasil, export admin-only.
3. **Dipilih (rekomendasi): Revert sebagian + ownership strict**  
   Guru hanya bisa lihat hasil ujian/quiz yang `teacher_id`-nya miliknya, export tetap admin-only.

Alasan memilih opsi 3:
- Menyelesaikan kebutuhan operasional guru.
- Tetap membatasi akses lintas guru.
- Menjaga kontrol data sensitif lewat export admin-only.

## Desain Teknis

### 1) Backend Akses Hasil Ujian
- Route hasil ujian (`/exams/{exam}/results`, `/exams/{exam}/results/{studentId}`) dibuka untuk `admin,guru`.
- Guard di controller:
  - `admin`: selalu boleh.
  - `guru`: hanya boleh jika `exam.teacher_id === user.id`.
  - selain itu: 403.

### 2) Backend Akses Hasil Quiz
- Route hasil quiz (`/quizzes/{quiz}/results`, `/quizzes/{quiz}/results/{studentId}`) dibuka untuk `admin,guru`.
- Guard ownership analog dengan ujian:
  - `admin`: selalu boleh.
  - `guru`: hanya quiz miliknya.
  - selain itu: 403.

### 3) Export Tetap Admin-Only
- Route export hasil ujian/quiz tetap `role:admin`.
- Guard tambahan di controller export tetap dipertahankan (defense-in-depth).

### 4) Frontend
- Halaman hasil ujian/quiz:
  - `admin`: selalu bisa akses.
  - `guru`: hanya halaman hasil milik ujian/quiz yang dia punya.
  - lainnya: redirect + pesan akses ditolak.
- Link tombol “Lihat Hasil” untuk guru ditampilkan kembali hanya pada data miliknya.
- Direct URL tetap aman karena backend tetap menjadi source of truth.

## Error Handling
- Backend mengembalikan `403` dengan pesan akses ditolak saat guru non-owner mencoba akses.
- Frontend menampilkan notifikasi singkat lalu redirect ke daftar ujian/quiz.

## Strategi Pengujian
1. Ujian:
   - guru owner -> 200 (list + detail).
   - guru non-owner -> 403.
   - admin -> 200.
2. Quiz:
   - guru owner -> 200 (list + detail).
   - guru non-owner -> 403.
   - admin -> 200.
3. Export:
   - guru -> 403 (ujian + quiz).
   - admin -> 200.
4. UI:
   - tombol/link hasil muncul untuk admin dan guru owner.
   - non-owner tidak dapat data meski direct URL.

## Risiko dan Mitigasi
- Risiko: kebocoran akses karena hanya kontrol di UI.  
  Mitigasi: ownership wajib di backend controller + route role middleware.
- Risiko: inkonsistensi ujian vs quiz.  
  Mitigasi: pola guard dan test dibuat simetris.

## Kriteria Selesai
1. Guru owner bisa melihat hasil ujian/quiz miliknya.
2. Guru non-owner ditolak konsisten (403).
3. Export hasil ujian/quiz tetap admin-only.
4. Test akses baru lulus.
