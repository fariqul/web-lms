# Panduan Manual Import Database LMS (Windows, Tanpa Script Otomatis)

Panduan ini khusus untuk Anda yang ingin migrasi database secara manual dari:
- PC lama: C:\lms-server
- PC baru: D:\lms-server

Tujuan:
- Data database dipindah dengan aman
- Hindari error encoding seperti teks aneh (contoh: Gamma C...)
- Hindari error import seperti ASCII NUL

## Ringkasan Alur

1. Export database bersih dari PC lama (dump dibuat di dalam container MySQL).
2. Pindahkan file dump ke PC baru.
3. Import ulang dari nol di PC baru (drop/create DB lalu import).
4. Verifikasi hasil.

## Prasyarat

- Docker Desktop sudah running di kedua PC.
- Container di kedua PC sudah ada: lms-mysql dan lms-backend.
- Anda punya akses PowerShell admin/user normal.

Cek cepat:

```powershell
docker --version
docker compose version
```

## Bagian A - Export DB Manual di PC Lama (C:\lms-server)

### A1) Masuk ke folder project

```powershell
Set-Location C:\lms-server
```

### A2) Cek container aktif

```powershell
docker compose ps
```

Pastikan minimal:
- lms-mysql running/healthy
- lms-backend running

### A3) Aktifkan maintenance mode sementara

```powershell
docker exec lms-backend php artisan down
```

### A4) Buat dump SQL di dalam container MySQL

Penting: jangan redirect output mysqldump langsung ke file host Windows.

```powershell
docker exec lms-mysql sh -lc 'rm -f /tmp/db-clean.sql'
docker exec lms-mysql sh -lc 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces --databases "$MYSQL_DATABASE" > /tmp/db-clean.sql'
```

### A5) Copy file dump ke host lama

```powershell
New-Item -ItemType Directory -Force -Path C:\lms-migration-backup | Out-Null
docker cp lms-mysql:/tmp/db-clean.sql C:\lms-migration-backup\db-clean.sql
```

### A6) Validasi file dump di host lama

```powershell
Get-Item C:\lms-migration-backup\db-clean.sql | Select-Object FullName,Length,LastWriteTime
Format-Hex -Path C:\lms-migration-backup\db-clean.sql -Count 4
```

Interpretasi cepat header file:
- Jika mulai `ff fe` atau `fe ff` -> UTF-16 (jangan dipakai, harus buat ulang dump)
- Jika mulai `1f 8b` -> gzip (harus diekstrak dulu)
- Jika teks SQL normal (mulai `-- MySQL dump`) -> aman

### A7) Nonaktifkan maintenance mode di server lama

```powershell
docker exec lms-backend php artisan up
```

### A8) Optional cleanup file sementara di container lama

```powershell
docker exec lms-mysql sh -lc 'rm -f /tmp/db-clean.sql'
```

## Bagian B - Pindahkan Dump ke PC Baru

Pindahkan file:

- Dari: C:\lms-migration-backup\db-clean.sql
- Ke: D:\lms-migration-backup\db-clean.sql

Bisa pakai:
- flashdisk
- LAN copy
- shared folder

## Bagian C - Import DB Manual dari Nol di PC Baru (D:\lms-server)

### C1) Masuk ke folder project

```powershell
Set-Location D:\lms-server
```

### C2) Cek container aktif

```powershell
docker compose ps
```

Pastikan minimal:
- lms-mysql running/healthy
- lms-backend running

### C3) Aktifkan maintenance mode

```powershell
docker exec lms-backend php artisan down
```

### C4) Backup database baru saat ini (jaga-jaga rollback)

```powershell
New-Item -ItemType Directory -Force -Path D:\lms-migration-backup | Out-Null
docker exec lms-mysql sh -lc 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces --databases "$MYSQL_DATABASE" > /tmp/db-before-reimport.sql'
docker cp lms-mysql:/tmp/db-before-reimport.sql D:\lms-migration-backup\db-before-reimport.sql
```

### C5) Copy dump lama ke container MySQL baru

```powershell
docker cp D:\lms-migration-backup\db-clean.sql lms-mysql:/tmp/db-clean.sql
```

### C6) Drop dan create ulang database target (clean import)

```powershell
docker exec lms-mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS $MYSQL_DATABASE; CREATE DATABASE $MYSQL_DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'
```

### C7) Import dump ke database baru

```powershell
docker exec lms-mysql sh -lc 'mysql --default-character-set=utf8mb4 --binary-mode=1 -uroot -p"$MYSQL_ROOT_PASSWORD" < /tmp/db-clean.sql'
```

### C8) Bersihkan file sementara di container

```powershell
docker exec lms-mysql sh -lc 'rm -f /tmp/db-clean.sql /tmp/db-before-reimport.sql'
```

### C9) Clear cache Laravel dan keluar maintenance

```powershell
docker exec lms-backend php artisan optimize:clear
docker exec lms-backend sh -lc 'rm -f /var/www/html/storage/framework/down; php artisan up || true'
```

### C10) Restart service aplikasi

```powershell
docker compose restart backend nginx socket
docker compose ps
```

## Bagian D - Verifikasi Hasil

### D1) Cek health API

```powershell
docker logs lms-tunnel --tail 100
```

Ambil URL tunnel lalu buka:

- https://URL-TUNNEL-ANDA/api/health

### D2) Cek data dari aplikasi

Checklist:
- Login admin berhasil
- Data user/kelas/ujian tampil
- Data lama tidak berubah jadi simbol aneh
- Monitoring/socket tetap jalan

### D3) Cek charset MySQL

```powershell
docker exec lms-mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW VARIABLES LIKE \"character_set_%\";"'
```

## Troubleshooting Cepat

### 1) Muncul warning world-writable custom.cnf

Contoh warning:
- World-writable config file ... is ignored.

Ini biasanya warning, bukan error fatal.

### 2) Error ASCII NUL saat import

Penyebab umum: file SQL UTF-16 atau biner rusak.

Solusi:
- Ulangi dump dari PC lama dengan metode di atas (dump di dalam container lalu docker cp).
- Jangan redirect mysqldump langsung ke file host Windows.

### 3) Setelah import muncul 503 Service Unavailable

Coba:

```powershell
docker exec lms-backend sh -lc 'rm -f /var/www/html/storage/framework/down; php artisan up || true'
docker compose restart backend nginx
```

### 4) Teks jadi simbol aneh

Contoh: Gamma C..., aEUR(tm), aEUR"

Ini mismatch encoding saat dump/import.

Solusi paling aman:
- Re-export dari PC lama dengan utf8mb4
- Re-import dengan perintah mysql yang sudah ada `--default-character-set=utf8mb4 --binary-mode=1`

## Rollback Cepat (Jika Hasil Tidak Sesuai)

Jika perlu balik ke kondisi sebelum re-import di PC baru:

```powershell
docker cp D:\lms-migration-backup\db-before-reimport.sql lms-mysql:/tmp/db-before-reimport.sql
docker exec lms-mysql sh -lc 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < /tmp/db-before-reimport.sql'
docker exec lms-mysql sh -lc 'rm -f /tmp/db-before-reimport.sql'
docker compose restart backend nginx socket
```

## Checklist Final

- [ ] Dump dari PC lama berhasil dan ukuran file masuk akal
- [ ] File dump sudah dipindah ke PC baru
- [ ] DB di PC baru sudah di-drop/create ulang
- [ ] Import selesai tanpa error fatal
- [ ] API health normal
- [ ] Data tampil benar dan tidak mojibake
- [ ] Rollback dump tersedia
