# Migrasi Server Docker LMS ke PC Windows Baru (Aman & Minim Risiko)

Panduan ini untuk memindahkan seluruh server LMS (container + database + file upload) dari PC Windows lama ke PC Windows baru dengan aman.

Fokus utama:
- Data tetap aman (backup berlapis + checksum + verifikasi)
- Risiko downtime minimal
- Ada rencana rollback jika terjadi masalah

## Ringkasan Arsitektur Saat Ini

Berdasarkan konfigurasi proyek ini, service yang berjalan:
- mysql (`lms-mysql`) dengan volume persisten `mysql_data`
- backend Laravel (`lms-backend`) dengan volume persisten `backend_storage`
- socket (`lms-socket`)
- nginx (`lms-nginx`)
- cloudflared (`lms-tunnel`)
- proctoring (`lms-proctoring`)

Data kritikal ada di:
- Database MySQL
- Volume storage backend (`/var/www/html/storage`) untuk file seperti foto/upload
- Konfigurasi environment/secrets (`.env`, APP key, secret socket, cloud credentials)

## Strategi Migrasi yang Direkomendasikan

Gunakan strategi **Backup -> Restore -> Verifikasi -> Cutover -> Rollback jika perlu**.

Jangan langsung mematikan server lama permanen sebelum server baru lulus verifikasi.

## Prasyarat

Di PC lama dan PC baru:
- Docker Desktop aktif
- `docker compose` bisa dijalankan
- Git terpasang
- Ruang disk cukup untuk backup

Cek cepat:

```powershell
docker --version
docker compose version
git --version
```

## Mode Semi-Otomatis (Direkomendasikan)

Selain langkah manual di dokumen ini, Anda bisa pakai script siap pakai:

- Backup dari PC lama: `scripts/migration/backup-old-server.ps1`
- Restore ke PC baru: `scripts/migration/restore-new-server.ps1`

Jika path Anda berbeda antar mesin, gunakan parameter `-ProjectPath`.

Contoh sesuai setup Anda:

- PC lama: `C:\lms-server`
- PC baru: `D:\lms-server`

Command siap pakai:

```powershell
# Di PC lama
Set-Location C:\lms-server
powershell -ExecutionPolicy Bypass -File .\scripts\migration\backup-old-server.ps1 -ProjectPath "C:\lms-server" -BackupRoot "C:\lms-migration-backup"

# Di PC baru
Set-Location D:\lms-server
powershell -ExecutionPolicy Bypass -File .\scripts\migration\restore-new-server.ps1 -ProjectPath "D:\lms-server" -BackupDir "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS"
```

Contoh pemakaian:

### Di PC lama (backup)

```powershell
Set-Location D:\project-amsp
powershell -ExecutionPolicy Bypass -File .\scripts\migration\backup-old-server.ps1
```

Output folder backup default:

```text
D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS
```

### Di PC baru (restore)

```powershell
Set-Location D:\project-amsp
powershell -ExecutionPolicy Bypass -File .\scripts\migration\restore-new-server.ps1 -BackupDir "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS"
```

Opsional parameter script:

- `backup-old-server.ps1 -SkipMaintenanceMode`
- `restore-new-server.ps1 -SkipBuild`
- `restore-new-server.ps1 -SkipHashVerification`

Jika Anda menjalankan mode script, tetap ikuti Tahap 5 sampai Tahap 7 (verifikasi, cutover, rollback).

## Tahap 0 - Persiapan Window Maintenance

1. Pilih jam sepi pengguna.
2. Informasikan downtime ke guru/siswa.
3. Jangan jalankan `docker compose down -v` kapan pun selama migrasi.

## Tahap 1 - Backup Lengkap di PC Lama

Semua perintah di bawah dijalankan di PC lama.

### 1.1 Siapkan variabel kerja backup

```powershell
$ProjectPath = "D:\project-amsp"
$TimeStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = "D:\lms-migration-backup"
$BackupDir = Join-Path $BackupRoot "backup-$TimeStamp"

New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
Set-Location $ProjectPath
```

### 1.2 Masuk maintenance mode (opsional tapi disarankan)

Tujuan: membekukan perubahan data saat proses dump.

```powershell
docker exec lms-backend php artisan down --render="errors::503"
```

Jika perintah di atas gagal karena view tidak ada, gunakan:

```powershell
docker exec lms-backend php artisan down
```

### 1.3 Simpan metadata deployment

```powershell
git rev-parse HEAD | Out-File -Encoding ascii "$BackupDir\git-commit.txt"
docker compose config | Out-File -Encoding utf8 "$BackupDir\docker-compose-resolved.yml"
docker compose ps | Out-File -Encoding utf8 "$BackupDir\compose-ps.txt"
```

### 1.4 Backup file konfigurasi penting

```powershell
Copy-Item "$ProjectPath\.env" "$BackupDir\.env" -Force
Copy-Item "$ProjectPath\docker-compose.yml" "$BackupDir\docker-compose.yml" -Force
Copy-Item "$ProjectPath\mysql\custom.cnf" "$BackupDir\custom.cnf" -Force
Copy-Item "$ProjectPath\nginx\default.conf" "$BackupDir\default.conf" -Force
```

### 1.5 Ekstrak APP key aktif dari container backend

Ini penting untuk kompatibilitas data terenkripsi Laravel.

```powershell
docker exec lms-backend sh -lc 'grep ^APP_KEY= /var/www/html/.env' > "$BackupDir\app_key.txt"
```

### 1.6 Backup database MySQL (logical dump)

```powershell
docker exec lms-mysql sh -lc 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --default-character-set=utf8mb4 --databases "$MYSQL_DATABASE" --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces > /tmp/database.sql'
docker cp lms-mysql:/tmp/database.sql "$BackupDir\database.sql"
docker exec lms-mysql sh -lc 'rm -f /tmp/database.sql'
```

Catatan penting:
- Hindari redirection langsung `> "$BackupDir\\database.sql"` dari PowerShell 5.1 karena bisa menghasilkan file UTF-16 dan gagal saat import (error ASCII `\0`).

Validasi cepat file dump tidak kosong:

```powershell
Get-Item "$BackupDir\database.sql" | Select-Object FullName,Length,LastWriteTime
```

### 1.7 Backup volume storage backend (upload/foto/file)

```powershell
docker exec lms-backend sh -lc 'cd /var/www/html/storage && tar -czf /tmp/backend-storage.tar.gz .'
docker cp lms-backend:/tmp/backend-storage.tar.gz "$BackupDir\backend-storage.tar.gz"
```

### 1.8 Buat checksum integritas backup

```powershell
Get-FileHash "$BackupDir\database.sql" -Algorithm SHA256 | Out-File "$BackupDir\hash-database.txt"
Get-FileHash "$BackupDir\backend-storage.tar.gz" -Algorithm SHA256 | Out-File "$BackupDir\hash-storage.txt"
```

### 1.9 Keluar dari maintenance mode

```powershell
docker exec lms-backend php artisan up
```

## Tahap 2 - Pindahkan Backup ke PC Baru

Metode bebas (LAN copy, external SSD, dsb). Yang wajib dipindah minimal:
- `database.sql`
- `backend-storage.tar.gz`
- `.env`
- `app_key.txt`
- `docker-compose.yml`
- checksum file

Setelah dipindah, verifikasi checksum di PC baru:

```powershell
Get-FileHash "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\database.sql" -Algorithm SHA256
Get-FileHash "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\backend-storage.tar.gz" -Algorithm SHA256
```

Pastikan hash sama dengan file `hash-database.txt` dan `hash-storage.txt`.

## Tahap 3 - Setup Proyek di PC Baru

### 3.1 Clone source code

```powershell
Set-Location D:\
git clone <URL_REPO_ANDA> project-amsp
Set-Location D:\project-amsp
```

### 3.2 Checkout commit yang sama seperti server lama

Baca commit dari file backup `git-commit.txt`, lalu:

```powershell
git checkout <COMMIT_DARI_BACKUP>
```

### 3.3 Salin konfigurasi `.env` hasil backup

```powershell
Copy-Item "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\.env" "D:\project-amsp\.env" -Force
```

### 3.4 Stabilkan APP key agar tidak berubah tiap restart

1. Buka file `.env`, tambahkan jika belum ada:

```env
APP_KEY=base64:ISI_DARI_app_key.txt
```

2. Pastikan `docker-compose.yml` service `backend` memiliki env berikut:

```yaml
environment:
  APP_KEY: ${APP_KEY}
```

Catatan: ini penting agar APP key konsisten setelah restart container.

## Tahap 4 - Restore Database & Storage di PC Baru

### 4.1 Build image terbaru dari source

```powershell
Set-Location D:\project-amsp
docker compose build --no-cache
```

### 4.2 Start MySQL dulu

```powershell
docker compose up -d mysql
docker compose ps
```

Pastikan status mysql `healthy` sebelum import.

### 4.3 Import database dump

```powershell
docker cp "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\database.sql" lms-mysql:/tmp/database.sql
docker exec lms-mysql sh -lc 'mysql --default-character-set=utf8mb4 --binary-mode=1 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/database.sql'
```

### 4.4 Start backend sementara

```powershell
docker compose up -d backend
```

Tunggu backend ready:

```powershell
docker logs lms-backend --tail 100
```

### 4.5 Restore file storage backend

```powershell
docker cp "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\backend-storage.tar.gz" lms-backend:/tmp/backend-storage.tar.gz
docker exec lms-backend sh -lc 'rm -rf /var/www/html/storage/* && mkdir -p /var/www/html/storage && tar -xzf /tmp/backend-storage.tar.gz -C /var/www/html/storage && chown -R www-data:www-data /var/www/html/storage'
```

### 4.6 Jalankan service sisanya    

```powershell
docker compose up -d
docker compose ps
```

## Tahap 5 - Verifikasi Fungsional Sebelum Cutover

### 5.1 Cek health endpoint

Jika masih pakai quick tunnel:

```powershell
docker logs lms-tunnel --tail 100
```

Ambil URL `https://xxxx.trycloudflare.com`, lalu test:

```text
https://xxxx.trycloudflare.com/api/health
```

### 5.2 Verifikasi aplikasi

Checklist manual:
- Login admin berhasil
- Data user/kelas/ujian muncul
- Hasil ujian lama masih terbaca
- Upload/foto lama masih bisa diakses
- Socket/monitoring real-time normal

### 5.3 Cek log error container

```powershell
docker logs lms-backend --tail 200
docker logs lms-nginx --tail 200
docker logs lms-socket --tail 200
docker logs lms-mysql --tail 200
```

## Tahap 6 - Cutover ke Server Baru

Jika verifikasi lulus:

1. Arahkan frontend ke URL API baru.
2. Jika pakai Vercel, update env:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_SOCKET_URL`
3. Redeploy frontend.
4. Pantau 15-30 menit pertama (logs + akses user).

## Tahap 7 - Rollback Plan (Jika Ada Masalah)

Jika ada issue kritis:

1. Kembalikan frontend ke endpoint server lama.
2. Jalankan ulang stack di server lama jika sempat dimatikan:

```powershell
Set-Location D:\project-amsp
docker compose up -d
```

3. Investigasi di server baru tanpa menghentikan layanan lama.

## Troubleshooting Cepat

### A. MySQL gagal import karena charset/collation

Tambahkan opsi saat dump (di server lama):

```powershell
docker exec lms-mysql sh -lc 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --default-character-set=utf8mb4 --databases "$MYSQL_DATABASE" --single-transaction --routines --triggers --events --set-gtid-purged=OFF --no-tablespaces > /tmp/database.sql'
docker cp lms-mysql:/tmp/database.sql "$BackupDir\database.sql"
docker exec lms-mysql sh -lc 'rm -f /tmp/database.sql'
```

### B. Container backend sering regenerate APP_KEY

Pastikan dua hal:
- `.env` punya `APP_KEY=...`
- `docker-compose.yml` backend environment punya `APP_KEY: ${APP_KEY}`

### C. Quick Tunnel URL berubah

Ini normal. Update:
- `APP_URL` pada `.env`
- `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS` jika perlu
- env frontend di Vercel

Lalu restart:

```powershell
docker compose restart backend socket cloudflared
```

### D. Proctoring error di PC baru tanpa GPU NVIDIA

Sementara nonaktifkan reservasi GPU atau set CPU mode di env `DEVICE` untuk service proctoring.

### E. Import DB error: ASCII '\0' appeared in the statement

Penyebab paling umum:
- File `database.sql` tersimpan dalam encoding UTF-16 (sering terjadi jika dump dibuat pakai redirection PowerShell 5.1).

Solusi cepat (di host Windows):

```powershell
$src = "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\database.sql"
$dst = "D:\lms-migration-backup\backup-YYYYMMDD-HHMMSS\database.utf8.fixed.sql"

Get-Content -Raw -Encoding Unicode $src | Set-Content -Encoding utf8 $dst
docker cp $dst lms-mysql:/tmp/database.sql
docker exec lms-mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < /tmp/database.sql'
```

Solusi terbaik untuk jangka panjang:
- Jalankan ulang backup dengan script terbaru (yang dump di dalam container lalu `docker cp`), agar `database.sql` langsung valid UTF-8/plain text.

### F. Health check menampilkan `503 Service Unavailable`

Penyebab paling umum setelah restore:
- Laravel masih dalam maintenance mode (`php artisan down`), biasanya karena file `storage/framework/down` ikut terbawa dari backup.

Recovery cepat:

```powershell
docker exec lms-backend sh -lc 'rm -f /var/www/html/storage/framework/down; php artisan up || true'
docker compose restart backend nginx
docker logs lms-backend --tail 100
```

Jika masih 503, cek status container:

```powershell
docker compose ps
docker logs lms-nginx --tail 100
docker logs lms-backend --tail 200
```

### G. Teks berubah jadi simbol seperti `ΓÇ`, `â€™`, `â€“`

Ini disebut mojibake (encoding mismatch): data UTF-8 dibaca/ditulis dengan charset yang salah saat dump/import.

Langkah cek cepat:

```powershell
docker exec lms-mysql sh -lc 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -e "SHOW VARIABLES LIKE \"character_set_%\";"'
```

Perbaikan aman yang disarankan:
- Ulangi backup dari server lama dengan script terbaru.
- Pastikan dump pakai `--default-character-set=utf8mb4`.
- Pastikan import pakai `mysql --default-character-set=utf8mb4 --binary-mode=1`.

Jika hanya beberapa data yang rusak, ambil ulang row tersebut dari server lama (sumber yang masih benar), lalu update di server baru.

## Checklist Final (Wajib Centang)

- [ ] Backup SQL berhasil dan ukurannya masuk akal
- [ ] Backup storage berhasil dan bisa diekstrak
- [ ] Hash backup terverifikasi
- [ ] `.env` + secret dipindah aman
- [ ] APP key tetap sama
- [ ] Import DB sukses tanpa error
- [ ] File upload lama bisa diakses
- [ ] API health OK
- [ ] Frontend terhubung ke endpoint baru
- [ ] Rollback plan siap pakai

---

Jika ingin risiko lebih kecil lagi, lakukan simulasi migrasi sekali di PC staging terlebih dahulu, baru eksekusi di hari cutover produksi.
