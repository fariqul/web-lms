# 🎓 SMA 15 Makassar - Learning Management System

Sistem Manajemen Pembelajaran (LMS) untuk SMA 15 Makassar dengan fitur Absensi QR Dinamis, Ujian CBT dengan Anti-Cheat berbasis AI, dan Monitoring Real-time.

Repo ini adalah **monorepo multi-service**: frontend Next.js, backend Laravel, server real-time Socket.IO, dan microservice AI proctoring (Python), diorkestrasi dengan Docker Compose.

## ✨ Fitur Utama

- **📚 Dashboard Multi-Role** - Dashboard khusus untuk Admin, Guru, dan Siswa
- **📍 Absensi QR Dinamis** - QR Code yang berubah secara berkala (anti-titip) + foto & verifikasi perangkat
- **🧪 Ujian CBT Anti-Cheat** - Mode fullscreen, blokir copy/paste, deteksi tab switch, dukungan Safe Exam Browser (SEB)
- **🤖 AI Proctoring** - Deteksi objek terlarang (YOLOv8) + analisis wajah/pandangan mata (MediaPipe) secara asinkron
- **📷 Kamera Monitoring** - Snapshot otomatis saat absen dan ujian, dianalisis AI
- **📊 Statistik & Laporan** - Grafik kehadiran, rekap nilai sumatif, rapor/progress, export Excel/PDF
- **📡 Real-time** - Monitoring ujian, notifikasi, dan event live via Socket.IO

## 🛠️ Tech Stack

### Frontend (`src/`)
- **Framework:** Next.js 16 (App Router) + React 19 + React Compiler
- **Styling:** Tailwind CSS v4
- **State Management:** React Context (`AuthContext`, `ThemeContext`)
- **HTTP Client:** Axios
- **Real-time:** Socket.io Client
- **Charts:** Recharts
- **Icons:** Lucide React + Heroicons
- **Computer Vision (klien):** face-api.js (deteksi wajah real-time saat ujian)
- **Lainnya:** KaTeX (render matematika), jsPDF/html2canvas/docx/mammoth (dokumen), jsQR + qrcode.react (QR)
- **Deploy:** Vercel

### Backend API (`backend/`)
- **Framework:** Laravel 12 (PHP 8.2+)
- **Authentication:** Laravel Sanctum (token Bearer)
- **Database:** MySQL 8.0
- **Cache / Queue / Session:** Redis 7 (via Predis)
- **Dokumen:** barryvdh/laravel-dompdf (PDF), phpoffice/phpspreadsheet (Excel), smalot/pdfparser (import soal)

### Real-time Server (`socket-server/`)
- **Framework:** Node.js + Socket.IO (port 6001), dijalankan via PM2
- Menerima broadcast server-to-server dari Laravel dan menyebarkannya ke klien per-room

### AI Proctoring Service (`backend/proctoring-service/`)
- **Framework:** Python FastAPI (port 8001)
- **Model:** YOLOv8-nano (deteksi objek) + MediaPipe Face Detection & Face Mesh (head pose, eye gaze)
- Berjalan di GPU NVIDIA atau fallback CPU

### Infrastruktur
- **Reverse Proxy:** Nginx
- **Tunnel:** Cloudflare Tunnel (`cloudflared`)
- **Orkestrasi:** Docker Compose

## 🏗️ Arsitektur Sistem

```
            Browser (Admin/Guru/Siswa) + Kamera + QR Scanner
                              │  HTTPS / WSS
                       Cloudflare Tunnel
                              │
                      Nginx Reverse Proxy
        ┌─────────────┬───────┴────────┬──────────────────┐
        ▼             ▼                ▼                  ▼
  Laravel 12 API  Socket.IO       FastAPI Proctoring   (Vercel: Frontend
  (Sanctum)       (Node.js)       (YOLO + MediaPipe)    Next.js terpisah)
        │  SQL         ▲ broadcast      ▲ HTTP (queue job)
        ▼              │                │
   MySQL 8  +  Redis 7 (cache/session/queue/rate-limit)
        ▼
   Storage lokal (foto absensi, snapshot ujian, materi, SKL)
```

Detail lengkap: lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 📂 Struktur Project

```
web-lms/
├── src/                      # Frontend Next.js (App Router)
│   ├── app/                  # Halaman (routing berbasis folder)
│   ├── components/           # Komponen UI (layouts, ui, ujian, absensi, ...)
│   ├── context/              # AuthContext, ThemeContext
│   ├── hooks/                # useExamMode, useProctoring, useSocket, ...
│   ├── services/             # api.ts (Axios client terpusat)
│   ├── lib/ utils/ types/ constants/
│   └── api/                  # Next.js route handler (cetak absensi PDF)
│
├── backend/                  # Backend Laravel 12
│   ├── app/Http/Controllers/Api/   # 26 controller REST
│   ├── app/Models/                  # 34 Eloquent model
│   ├── app/Services/                # Notifikasi, Socket broadcast, PDF, SKL
│   ├── app/Jobs/                    # AnalyzeSnapshotJob (proctoring async)
│   ├── routes/api.php               # Seluruh endpoint API
│   ├── database/migrations/         # Skema database
│   └── proctoring-service/          # Microservice Python (FastAPI + YOLO)
│
├── socket-server/            # Server Socket.IO (Node.js)
├── nginx/  mysql/            # Konfigurasi infra
├── docs/                     # Dokumentasi arsitektur & operasional
├── docker-compose.yml        # Orkestrasi semua service
└── next.config.ts  vercel.json
```

## 🚀 Getting Started

### Opsi A — Frontend saja (dev cepat)

Prasyarat: **Node.js 20+**, npm. Membutuhkan backend yang sudah berjalan (lihat Opsi B) atau URL API yang valid.

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env.local
# Edit NEXT_PUBLIC_API_URL agar menunjuk ke backend (default http://localhost:8000/api)

# 3. Jalankan dev server
npm run dev

# 4. Buka http://localhost:3000
```

### Opsi B — Full stack via Docker Compose

Prasyarat: **Docker + Docker Compose**. Menjalankan MySQL, Redis, Laravel API, Socket.IO, AI Proctoring, dan Nginx sekaligus.

```bash
# Salin & isi variabel environment yang dibutuhkan (lihat docker-compose.yml)
cp backend/.env.example backend/.env

# Build & jalankan seluruh service
docker compose up -d --build

# (opsional) cek status
docker compose ps
```

> Catatan: service `cloudflared` membutuhkan `CLOUDFLARE_TUNNEL_TOKEN`. Untuk pengembangan lokal tanpa tunnel, service tersebut bisa dilewati.

### Opsi C — Backend Laravel lokal (tanpa Docker)

Prasyarat: **PHP 8.2+, Composer, MySQL, Redis**.

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed     # menjalankan DatabaseSeeder + DemoSeeder
php artisan serve              # API di http://localhost:8000
# Queue worker (untuk AI proctoring & notifikasi):
php artisan queue:work --queue=default,proctoring
```

## 🔧 Available Scripts

### Frontend (root)
```bash
npm run dev      # Development server
npm run build    # Production build
npm start        # Start production server
npm run lint     # Lint (ESLint) — hanya folder src
```

### Backend (`backend/`)
```bash
composer run dev    # Jalankan server + queue + log + vite bersamaan
composer run test   # php artisan test
php artisan migrate # Migrasi database
```

## 🔐 Login

Login mendukung **Email** (admin/guru) atau **NISN** (siswa). Untuk lingkungan demo/seeder, gunakan akun hasil `DemoSeeder` (lihat `backend/database/seeders/DemoSeeder.php`).

> ⚠️ Pastikan mengganti seluruh kredensial default sebelum deploy ke produksi.

Catatan keamanan login:
- **Single-device enforcement** untuk siswa (cegah berbagi akun saat ujian) — gunakan "Paksa Login" untuk mengeluarkan sesi lain.
- Siswa/guru yang diblokir admin tidak dapat login (`ACCOUNT_BLOCKED`).

## 📱 User Roles & Access

### Admin
- Kelola pengguna, kelas, jadwal (CRUD + import/export Excel)
- Kelola berita, fasilitas, landing page, pengaturan jaringan sekolah
- Publish/lock ujian, monitoring real-time, kick peserta
- Manajemen kelulusan & pengumuman, audit log, statistik

### Guru
- Buat sesi absensi dengan QR dinamis + persetujuan pindah perangkat
- Buat & kelola ujian/kuis, bank soal (termasuk import dari PDF/URL/Excel/Word)
- Monitoring ujian real-time + alert AI proctoring
- Materi, tugas, penilaian (termasuk grading esai), rekap nilai

### Siswa
- Scan QR untuk absensi (dengan foto)
- Mengerjakan ujian/kuis online (mode anti-cheat)
- Latihan bank soal mandiri
- Lihat jadwal, nilai, progress, materi; cek status kelulusan

## 🔒 Anti-Cheat & AI Proctoring

### Anti-cheat sisi klien (saat ujian)
1. **Fullscreen Lock** - Ujian wajib mode fullscreen
2. **Tab Switch Detection** - Deteksi pindah tab/aplikasi
3. **Copy/Paste Block** - Blokir clipboard
4. **Keyboard Shortcuts Disabled** - Blokir shortcut terlarang
5. **Camera Monitoring** - Snapshot diambil berkala
6. **Safe Exam Browser (SEB)** - Dukungan ujian terkunci SEB
7. **Kebijakan pelanggaran** - Akumulasi pelanggaran → warning / freeze / auto-submit

### AI Proctoring (dua lapis)
- **Lapis klien** (`face-api.js`): deteksi no-face, multi-face, head-turn, eye-gaze, identity-mismatch, dan pola "cek HP" — dengan temporal confirmation + cooldown untuk menekan false positive.
- **Lapis server** (FastAPI + YOLOv8 + MediaPipe): analisis snapshot secara asinkron via queue `proctoring`, menghasilkan skor risiko berbobot (`ProctoringScore`) dan alert (`ProctoringAlert`) yang ditampilkan real-time ke guru.

Detail algoritma: lihat dokumentasi proctoring di folder [`docs/`](docs/).

## 📡 API Endpoints

Seluruh endpoint REST didefinisikan di [`backend/routes/api.php`](backend/routes/api.php) dan dikelompokkan per peran (admin / guru / siswa / shared). Autentikasi menggunakan token Bearer (Laravel Sanctum).

## 🧪 CI

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) menjalankan:
- **Frontend:** `npm ci` → `npm run lint` → `npm run build` (Node 20)
- **Backend:** install dependency Composer (PHP 8.3)

## 🤝 Contributing

1. Fork repository
2. Buat feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

## 📄 License

MIT License - Silakan gunakan untuk keperluan pendidikan.

## 👥 Tim Pengembang

- **SMA 15 Makassar** - E-Learning Development Team

---

© 2026 SMA 15 Makassar. All rights reserved.
