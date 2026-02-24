# 🏠 Setup Home Server LMS - PC Sekolah

Panduan lengkap setup backend LMS di PC sekolah yang nyala 24 jam.  
**Arsitektur:** Frontend (Vercel gratis) ← internet → Cloudflare Quick Tunnel → PC Sekolah (Docker)  
**Biaya: Rp 0 (100% gratis)**

---

## 📋 Prasyarat

- PC Windows yang nyala 24 jam
- Koneksi internet stabil
- Docker Desktop terinstall
- Git terinstall

> **Tidak perlu** akun Cloudflare, domain, atau konfigurasi apapun di web Cloudflare.  
> Quick Tunnel otomatis membuat URL HTTPS tanpa setup.

---

## Langkah 1: Install Docker Desktop

1. Download Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Install, restart PC
3. Buka Docker Desktop, pastikan running
4. Buka PowerShell, verifikasi:

```powershell
docker --version
docker compose version
```

### Set Docker Auto-Start
- Docker Desktop → Settings → General → ✅ **Start Docker Desktop when you sign in**

---

## Langkah 2: Install Git & Clone Project

```powershell
# Install Git (jika belum ada)
# Download dari: https://git-scm.com/download/win

# Clone project
cd C:\
git clone https://github.com/fariqul/web-lms.git lms-server
cd lms-server
```

---

## Langkah 3: Konfigurasi Environment

```powershell
cd C:\lms-server

# Copy file env template
copy .env.homeserver .env
```

Untuk sekarang biarkan `.env` apa adanya. Kita akan update `APP_URL` setelah tunnel jalan di Langkah 5.

---

## Langkah 4: Build & Start Semua Services

```powershell
cd C:\lms-server

# Build images (pertama kali, ~5-10 menit)
docker compose build

# Start semua services
docker compose up -d

# Cek status
docker compose ps
```

Semua container harus **running**:
```
NAME            STATUS
lms-mysql       running (healthy)
lms-backend     running
lms-socket      running
lms-nginx       running
lms-tunnel      running
```

### Generate App Key (pertama kali saja)
```powershell
docker exec lms-backend php artisan key:generate --force
docker compose restart backend
```

---

## Langkah 5: Cek URL Quick Tunnel & Update ENV

### 5a. Dapatkan URL Tunnel
```powershell
docker logs lms-tunnel
```

Cari baris seperti ini di output:
```
Your quick Tunnel has been created! Visit it at:
https://random-kata-kata.trycloudflare.com
```

**Copy URL tersebut** (contoh: `https://apple-banana-charlie.trycloudflare.com`)

### 5b. Update `.env`
```powershell
notepad C:\lms-server\.env
```

Ganti baris `APP_URL`:
```env
APP_URL=https://apple-banana-charlie.trycloudflare.com
```

Save & close Notepad.

### 5c. Restart Backend
```powershell
cd C:\lms-server
docker compose restart backend socket
```

### 5d. Verifikasi
Buka browser, akses URL tunnel + `/api/health`:
```
https://apple-banana-charlie.trycloudflare.com/api/health
```

Jika muncul response JSON → backend berhasil diakses dari internet! ✅

---

## Langkah 6: Update Vercel Environment

1. Buka https://vercel.com → Project LMS → **Settings** → **Environment Variables**
2. Update/tambahkan (ganti URL dengan URL tunnel kamu):

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://apple-banana-charlie.trycloudflare.com/api` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://apple-banana-charlie.trycloudflare.com` |
| `NEXT_PUBLIC_APP_NAME` | `SMA 15 Makassar LMS` |
| `NEXT_PUBLIC_APP_URL` | `https://web-lms-rowr.vercel.app` |

3. Klik **Save**
4. Redeploy: **Deployments** → klik `...` pada deployment terakhir → **Redeploy**

---

## Langkah 7: Auto-Start saat PC Nyala

### Opsi A: Docker Desktop Auto-Start (Sudah di Langkah 1)
Docker Desktop sudah diset auto-start, dan `docker-compose.yml` sudah pakai `restart: unless-stopped`.

### Opsi B: Task Scheduler (Extra safety)

1. Buka **Task Scheduler** (ketik di Start Menu)
2. Klik **Create Basic Task**
3. Name: `LMS Docker Start`
4. Trigger: **When the computer starts**
5. Action: **Start a program**
6. Program: `powershell.exe`
7. Arguments: `-WindowStyle Hidden -Command "Start-Sleep 60; cd C:\lms-server; docker compose up -d"`
8. ✅ Centang **Run with highest privileges**
9. Finish

---

## ⚠️ Penting: URL Berubah saat Tunnel Restart

Quick Tunnel memberikan URL **random**. URL ini **tetap sama selama container `lms-tunnel` tidak restart**.

**Kapan URL berubah:**
- PC mati/restart
- `docker compose down` lalu `up`
- Container `lms-tunnel` crash

**Kapan URL TIDAK berubah:**
- PC nyala terus tanpa gangguan (bisa berminggu-minggu)
- `docker compose restart backend` (tunnel tetap jalan)

**Jika URL berubah, lakukan:**
1. Cek URL baru: `docker logs lms-tunnel`
2. Update `.env` → `APP_URL=https://url-baru.trycloudflare.com`
3. `docker compose restart backend socket`
4. Update env di Vercel → Redeploy

---

## 🔧 Perintah Maintenance

```powershell
cd C:\lms-server

# Lihat status semua container
docker compose ps

# Lihat log realtime
docker compose logs -f

# Lihat log container tertentu
docker logs lms-backend -f
docker logs lms-tunnel -f

# Cek URL tunnel saat ini
docker logs lms-tunnel 2>&1 | findstr "trycloudflare"

# Restart semua
docker compose restart

# Update code dari GitHub
git pull origin main
docker compose build --no-cache
docker compose up -d

# Backup database
docker exec lms-mysql mysqldump -u lms_user -pLmsSekolah123! sma15_lms > backup.sql

# Restore database
docker exec -i lms-mysql mysql -u lms_user -pLmsSekolah123! sma15_lms < backup.sql

# Masuk ke container backend
docker exec -it lms-backend bash

# Jalankan migration manual
docker exec lms-backend php artisan migrate --force

# Clear cache
docker exec lms-backend php artisan cache:clear
docker exec lms-backend php artisan config:clear
```

---

## 📊 Estimasi Biaya

| Item | Biaya |
|------|-------|
| Frontend (Vercel) | **Rp 0** |
| Backend + DB (PC Sekolah) | **Rp 0** (listrik sudah jalan) |
| Cloudflare Quick Tunnel | **Rp 0** (tanpa akun/domain) |
| **TOTAL** | **Rp 0** |

---

## ❓ Troubleshooting

### Container tidak start
```powershell
docker compose logs mysql    # Cek error database
docker compose logs backend  # Cek error Laravel
docker compose logs tunnel   # Cek error Cloudflare
```

### Database error "Table already exists"
```powershell
docker exec lms-backend php artisan migrate:status
docker exec lms-backend php artisan migrate --force
```

### Tunnel tidak connect / tidak ada URL
```powershell
# Restart tunnel saja
docker compose restart cloudflared

# Cek log
docker logs lms-tunnel
```

### CORS error di frontend
- Pastikan `CORS_ALLOWED_ORIGINS` di `.env` match dengan URL Vercel
- Pastikan pakai HTTPS (Quick Tunnel otomatis HTTPS)

### WebSocket tidak connect
- Quick Tunnel mendukung WebSocket secara default
- Pastikan `NEXT_PUBLIC_SOCKET_URL` di Vercel sama dengan URL tunnel (tanpa `/api`)

### Migrasi data dari AWS
Jika ada data di server AWS lama:
```powershell
# Di server AWS: export database
docker exec lms-mysql mysqldump -u lms_user -pLmsSekolah123! sma15_lms > aws_backup.sql

# Download file ke PC (pakai scp atau copy manual)

# Di PC sekolah: import database
docker exec -i lms-mysql mysql -u lms_user -pLmsSekolah123! sma15_lms < aws_backup.sql
```
