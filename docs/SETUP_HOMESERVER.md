# 🏠 Setup Home Server LMS - PC Sekolah

Panduan lengkap setup backend LMS di PC sekolah yang nyala 24 jam.  
**Arsitektur:** Frontend (Vercel gratis) ← internet → Cloudflare Tunnel → PC Sekolah (Docker)

---

## 📋 Prasyarat

- PC Windows yang nyala 24 jam
- Koneksi internet stabil
- Akun GitHub (untuk clone project)
- Akun Cloudflare (gratis) — https://dash.cloudflare.com

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

## Langkah 3: Buat Cloudflare Tunnel (GRATIS)

### 3a. Daftar Cloudflare Zero Trust
1. Buka https://one.dash.cloudflare.com
2. Login/daftar akun Cloudflare (gratis)
3. Pilih plan **Free** (0$/bulan)

### 3b. Buat Tunnel
1. Di dashboard Zero Trust, klik **Networks** → **Tunnels**
2. Klik **Create a tunnel**
3. Pilih **Cloudflared** → Next
4. Beri nama tunnel: `lms-sma15`
5. **PENTING:** Copy **Tunnel Token** yang muncul (string panjang)
6. Klik Next

### 3c. Konfigurasi Public Hostname
Di halaman "Route tunnel", tambahkan **2 hostname**:

**Hostname 1 — Backend API:**
| Field | Value |
|-------|-------|
| Subdomain | `lms-api` (atau nama lain) |
| Domain | Pilih domain Cloudflare kamu* |
| Type | HTTP |
| URL | `nginx:80` |

**Hostname 2 — Socket.io (untuk WebSocket):**
| Field | Value |
|-------|-------|
| Subdomain | `lms-api` (SAMA dengan di atas) |
| Domain | Sama |
| Path | `/socket.io/` |
| Type | HTTP |
| URL | `nginx:80` |

> *Catatan tentang domain: Cloudflare Tunnel memerlukan domain yang terdaftar di Cloudflare.
> - **GRATIS**: Jika kamu sudah punya domain, tambahkan ke Cloudflare (gratis)
> - **MURAH**: Beli domain `.my.id` (~Rp 15rb/tahun) di Niagahoster/IDCloudHost lalu pindahkan NS ke Cloudflare
> - **ALTERNATIF GRATIS**: Pakai Quick Tunnel (lihat Langkah 3d)

### 3d. Alternatif: Quick Tunnel (100% Gratis, tanpa domain)

Jika tidak mau beli domain, gunakan Quick Tunnel. URL akan random tapi tetap HTTPS.

**SKIP langkah 3b-3c**, dan ganti service `cloudflared` di `docker-compose.yml`:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: lms-tunnel
    restart: unless-stopped
    command: tunnel --url http://nginx:80
    depends_on:
      - nginx
    networks:
      - lms-network
```

Setelah start, cek URL di log:
```powershell
docker logs lms-tunnel
# Cari baris: "Your quick Tunnel has been created! Visit it at: https://xxxxx.trycloudflare.com"
```

⚠️ **Kekurangan Quick Tunnel:** URL berubah setiap restart container. Harus update env di Vercel setiap kali.

---

## Langkah 4: Konfigurasi Environment

```powershell
cd C:\lms-server

# Copy file env template
copy .env.homeserver .env
```

Edit file `.env` dengan Notepad:
```powershell
notepad .env
```

Isi nilai berikut:

```env
# URL Cloudflare Tunnel kamu (dari Langkah 3)
APP_URL=https://lms-api.domain-kamu.my.id

# Frontend Vercel (sudah benar)
FRONTEND_URL=https://web-lms-rowr.vercel.app
CORS_ALLOWED_ORIGINS=https://web-lms-rowr.vercel.app
SANCTUM_STATEFUL_DOMAINS=web-lms-rowr.vercel.app

# Token Cloudflare Tunnel (dari Langkah 3b step 5)
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxx...
```

---

## Langkah 5: Build & Start Semua Services

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

### Verifikasi
```powershell
# Cek backend berjalan
docker exec lms-backend php artisan --version

# Cek database terkoneksi
docker exec lms-backend php artisan migrate:status

# Cek tunnel (Named Tunnel)
docker logs lms-tunnel

# Test API (ganti URL)
curl https://lms-api.domain-kamu.my.id/api/health
```

---

## Langkah 6: Update Vercel Environment

1. Buka https://vercel.com → Project LMS → **Settings** → **Environment Variables**
2. Update/tambahkan:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://lms-api.domain-kamu.my.id/api` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://lms-api.domain-kamu.my.id` |
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
| Cloudflare Tunnel | **Rp 0** |
| Domain `.my.id` (opsional) | ~Rp 15.000/tahun |
| **TOTAL** | **Rp 0 - 15.000/tahun** |

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

### Tunnel tidak connect
- Pastikan `CLOUDFLARE_TUNNEL_TOKEN` benar di `.env`
- Pastikan tunnel active di dashboard Cloudflare Zero Trust
- Cek: `docker logs lms-tunnel`

### CORS error di frontend  
- Pastikan `CORS_ALLOWED_ORIGINS` di `.env` match dengan URL Vercel
- Pastikan pakai HTTPS (Cloudflare Tunnel otomatis HTTPS)

### WebSocket tidak connect
- Pastikan hostname Socket.io path (`/socket.io/`) dikonfigurasi di Cloudflare Tunnel
- Di Cloudflare Tunnel settings, enable **WebSocket** pada hostname tersebut

### Migrasi data dari AWS
Jika ada data di server AWS lama:
```powershell
# Di server AWS: export database
docker exec lms-mysql mysqldump -u lms_user -pLmsSekolah123! sma15_lms > aws_backup.sql

# Download file ke PC (pakai scp atau copy manual)

# Di PC sekolah: import database
docker exec -i lms-mysql mysql -u lms_user -pLmsSekolah123! sma15_lms < aws_backup.sql
```
