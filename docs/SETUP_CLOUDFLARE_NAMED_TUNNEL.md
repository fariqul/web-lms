# Setup Cloudflare Named Tunnel (Domain Tetap) untuk LMS

Panduan ini memindahkan akses backend dari Quick Tunnel (`*.trycloudflare.com`) ke Named Tunnel (domain tetap), supaya lebih stabil dan tidak kena limit random seperti 429 dari quick tunnel.

## Kenapa Pindah ke Named Tunnel

- URL tetap (tidak berubah saat container restart)
- Lebih stabil dibanding Quick Tunnel
- Mengurangi potensi error CORS akibat URL tunnel berubah
- Lebih cocok untuk produksi sekolah

## Prasyarat

- Akun Cloudflare aktif
- Domain aktif di Cloudflare (DNS dikelola Cloudflare)
- Docker stack LMS sudah jalan (`nginx`, `backend`, `cloudflared`)

## 1) Buat Named Tunnel di Cloudflare Dashboard

1. Buka Cloudflare Zero Trust.
2. Masuk ke Networks -> Tunnels.
3. Klik Create a tunnel.
4. Pilih Cloudflared.
5. Isi nama tunnel, misal: `lms-home-server`.
6. Simpan, lalu copy nilai **token** Docker yang diberikan.

Contoh format token (jangan share ke publik):

```text
eyJhIjoi...<panjang>..."
```

## 2) Buat Public Hostname (route domain)

Masih di halaman tunnel:

1. Buka tab Public Hostname.
2. Add a public hostname:
   - Subdomain: `api` (contoh)
   - Domain: `domain-anda.com`
   - Path: kosong
   - Service type: `HTTP`
   - URL: `nginx:80`
3. Simpan.

Contoh hasil endpoint API:

```text
https://api.domain-anda.com/api/health
```

## 3) Isi Token di Server

Di server Windows (folder project, contoh `D:\lms-server`):

1. Buka file `.env` (bukan `.env.homeserver` template), lalu isi:

```env
CLOUDFLARE_TUNNEL_TOKEN=ISI_TOKEN_DARI_CLOUDFLARE
APP_URL=https://api.domain-anda.com
FRONTEND_URL=https://www.domain-anda.com
CORS_ALLOWED_ORIGINS=https://domain-anda.com,https://www.domain-anda.com,https://web-lms-rowr.vercel.app
SANCTUM_STATEFUL_DOMAINS=domain-anda.com,www.domain-anda.com,web-lms-rowr.vercel.app
```

2. Simpan file.

Catatan:
- `CORS_ALLOWED_ORIGINS` bisa isi banyak origin dipisahkan koma.
- Untuk custom domain, masukkan versi root dan www jika keduanya dipakai.
- Jangan beri spasi setelah koma agar parsing env konsisten.

## 4) Restart Service Cloudflared + Backend

Jalankan:

```powershell
Set-Location D:\lms-server
docker-compose up -d cloudflared
docker-compose restart backend nginx socket
```

Cek log tunnel:

```powershell
docker logs lms-tunnel --tail 200
```

Yang diharapkan:
- Tidak ada pesan quick tunnel URL baru
- Ada koneksi tunnel aktif untuk named tunnel

## 5) Test Endpoint Domain Tetap

Tes health endpoint:

```text
https://api.domain-anda.com/api/health
```

Jika normal, respon JSON status `ok` akan muncul.

## 6) Update Vercel (Frontend)

Di Project Vercel -> Settings -> Environment Variables:

- `NEXT_PUBLIC_API_URL=https://api.domain-anda.com/api`
- `NEXT_PUBLIC_SOCKET_URL=https://api.domain-anda.com`

Lalu redeploy frontend.

## 7) Verifikasi CORS dari Browser

Dari frontend login page, coba login ulang.

Jika masih ada error CORS:

1. Pastikan origin frontend sama dengan `CORS_ALLOWED_ORIGINS`.
2. Jalankan clear cache config Laravel:

```powershell
docker exec lms-backend php artisan optimize:clear
docker-compose restart backend nginx
```

## Troubleshooting

### A. Masih dapat 429 / context canceled dari cloudflared

- Pastikan token benar dan tunnel status Healthy di dashboard Cloudflare.
- Pastikan public hostname mengarah ke `nginx:80` (bukan localhost).
- Pastikan **hanya ada satu** Public Hostname aktif untuk `api.domain-anda.com` (hindari route ganda di tunnel lain).
- Pastikan di DNS Cloudflare juga tidak ada record `api` lain yang bentrok (A/AAAA/CNAME duplikat).
- Cek container status:

```powershell
docker-compose ps
docker logs lms-tunnel --tail 200
docker logs lms-nginx --tail 200
docker logs lms-backend --tail 200
```

### A1. 502 intermiten (kadang normal, kadang gagal)

- Gunakan mode koneksi edge `http2` pada service `cloudflared` (lebih stabil untuk jaringan yang tidak konsisten di UDP/QUIC).
- Setelah ubah compose, recreate tunnel:

```powershell
docker compose up -d --force-recreate cloudflared
```

- Uji 20 kali beruntun untuk memastikan stabil:

```powershell
1..20 | % { curl.exe -s -o NUL -w "%{http_code}`n" https://api.domain-anda.com/api/health }
```

Semua hasil idealnya `200`.

### B. Domain tidak resolve

- Pastikan DNS domain dikelola Cloudflare.
- Cek record otomatis dari public hostname sudah terbuat.

### C. CORS masih error

- Pastikan file `.env` yang dipakai container berisi origin benar.
- Setelah ubah env, selalu restart backend.

## Rollback Cepat ke Quick Tunnel

Jika named tunnel bermasalah sementara:

1. Kosongkan `CLOUDFLARE_TUNNEL_TOKEN` di `.env`.
2. Restart cloudflared:

```powershell
docker-compose up -d cloudflared
```

Konfigurasi project ini akan fallback otomatis ke Quick Tunnel (`trycloudflare`).
