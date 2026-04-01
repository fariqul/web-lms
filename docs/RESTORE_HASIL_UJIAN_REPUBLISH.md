# Panduan Lengkap: Mengembalikan Hasil Ujian yang Ketimpa Republish

Dokumen ini dibuat untuk kasus ketika hasil ujian lama "hilang" setelah republish (mode lama yang menimpa data ujian yang sama).

## 1. Kondisi Masalah

Saat republish lama dijalankan, data berikut di ujian sumber bisa terhapus dari tabel utama:
- `exam_results`
- `answers`
- `violations`

Namun sebelum dihapus, snapshot disimpan ke tabel:
- `exam_republish_archives`

Jadi pemulihan dilakukan dari snapshot arsip tersebut.

---

## 2. Prasyarat

1. Backend berjalan di Docker Compose.
2. Service backend bernama `backend` (sesuai output `docker compose ps`).
3. Branch server sudah berisi command:
   - `exam:restore-archive`
4. Sangat disarankan backup database sebelum restore.

---

## 3. Backup Database (Wajib)

Jalankan dari host server (PowerShell):

```powershell
docker compose exec mysql sh -lc "mysqldump -u\"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" \"$MYSQL_DATABASE\" > /tmp/backup_before_restore.sql"
```

Salin backup ke host (opsional):

```powershell
docker cp lms-mysql:/tmp/backup_before_restore.sql .\backup_before_restore.sql
```

---

## 4. Pastikan Command Restore Tersedia

```powershell
docker compose exec backend php artisan list | findstr restore-archive
```

Kalau tidak muncul:

```powershell
docker compose exec backend composer dump-autoload
docker compose exec backend php artisan optimize:clear
```

Cek ulang:

```powershell
docker compose exec backend php artisan list | findstr restore-archive
```

---

## 5. Lihat Daftar Arsip Republish

### 5.1 Cek jumlah arsip

```powershell
docker compose exec backend php artisan tinker --execute "echo App\Models\ExamRepublishArchive::count();"
```

### 5.2 Lihat 20 arsip terbaru

```powershell
docker compose exec backend php artisan tinker --execute "print_r(App\Models\ExamRepublishArchive::orderByDesc('id')->limit(20)->get(['id','exam_id','session_no','archived_at'])->toArray());"
```

Contoh data yang terlihat:
- `exam_id`: ID ujian sumber
- `session_no`: nomor sesi republish
- `archived_at`: waktu arsip dibuat

---

## 6. Uji Simulasi Restore (Dry-Run)

Jangan langsung restore. Simulasikan dulu:

```powershell
docker compose exec backend php artisan exam:restore-archive EXAM_ID SESSION_NO --dry-run
```

Contoh:

```powershell
docker compose exec backend php artisan exam:restore-archive 221 1 --dry-run
docker compose exec backend php artisan exam:restore-archive 221 2 --dry-run
```

Output dry-run yang harus dicek:
- jumlah `result_rows`
- jumlah `answer_rows`
- exam source/target

Pilih sesi dengan data yang paling sesuai kebutuhan.

---

## 7. Jalankan Restore Sebenarnya

Setelah dry-run sesuai, jalankan tanpa `--dry-run`.

```powershell
docker compose exec backend php artisan exam:restore-archive EXAM_ID SESSION_NO
```

Contoh:

```powershell
docker compose exec backend php artisan exam:restore-archive 221 1
```

Jika perlu restore ke ujian target lain (bukan exam sumber):

```powershell
docker compose exec backend php artisan exam:restore-archive EXAM_ID SESSION_NO --target-exam-id=TARGET_ID
```

---

## 8. Bersihkan Cache Setelah Restore

```powershell
docker compose exec backend php artisan optimize:clear
```

Lalu refresh halaman admin hasil ujian.

---

## 9. Verifikasi Hasil

Setelah restore, cek:
1. Halaman hasil ujian admin untuk exam terkait.
2. Jumlah peserta, nilai, dan jawaban sudah muncul kembali.
3. Jika masih kosong, coba sesi lain (`session_no` berbeda) dengan dry-run.

---

## 10. Troubleshooting

### A. Error: `There are no commands defined in the "exam" namespace`

Penyebab: command belum ter-load.

Solusi:

```powershell
docker compose exec backend composer dump-autoload
docker compose exec backend php artisan optimize:clear
docker compose exec backend php artisan list | findstr restore-archive
```

### B. Error: `Arsip tidak ditemukan untuk exam_id=0, session_no=0`

Penyebab: menulis placeholder teks (`EXAM_ID SESSION_NO`) bukan angka.

Contoh benar:

```powershell
docker compose exec backend php artisan exam:restore-archive 221 1 --dry-run
```

### C. Tidak ada output saat lihat archive

Coba perintah paling sederhana:

```powershell
docker compose exec backend php artisan tinker --execute "echo App\Models\ExamRepublishArchive::count();"
```

Jika `0`, berarti memang tidak ada arsip di database server tersebut.

---

## 11. Catatan Penting Ke Depan

Sistem sekarang sudah diubah ke mode clone saat republish (ujian baru terpisah), agar hasil lama tidak tertimpa lagi.

Tetap disarankan:
1. Backup DB sebelum aksi massal.
2. Uji republish di 1 kelas kecil dulu.
3. Simpan catatan `exam_id` dan `session_no` jika ada insiden.

---

## 12. Checklist Cepat (Ringkas)

1. `docker compose exec backend php artisan list | findstr restore-archive`
2. `docker compose exec backend php artisan tinker --execute "print_r(App\Models\ExamRepublishArchive::orderByDesc('id')->limit(20)->get(['id','exam_id','session_no','archived_at'])->toArray());"`
3. `docker compose exec backend php artisan exam:restore-archive EXAM_ID SESSION_NO --dry-run`
4. `docker compose exec backend php artisan exam:restore-archive EXAM_ID SESSION_NO`
5. `docker compose exec backend php artisan optimize:clear`
