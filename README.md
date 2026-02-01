# 🎓 SMA 15 Makassar - Learning Management System

Sistem Manajemen Pembelajaran (LMS) untuk SMA 15 Makassar dengan fitur Absensi QR Dinamis, Ujian CBT dengan Anti-Cheat, dan Monitoring Real-time.

## ✨ Fitur Utama

- **📚 Dashboard Multi-Role** - Dashboard khusus untuk Admin, Guru, dan Siswa
- **📍 Absensi QR Dinamis** - QR Code yang berubah setiap 2-5 menit untuk anti-titip
- **🧪 Ujian CBT Anti-Cheat** - Mode fullscreen, blokir copy/paste, deteksi tab switch
- **📷 Kamera Monitoring** - Pengambilan foto otomatis saat absen dan ujian
- **📊 Statistik & Laporan** - Grafik kehadiran dan rekap nilai

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **State Management:** React Context
- **HTTP Client:** Axios
- **Real-time:** Socket.io Client
- **Charts:** Recharts
- **Icons:** Lucide React

### Backend (Terpisah)
- **Framework:** Laravel 11
- **Authentication:** Laravel Sanctum / JWT
- **Real-time:** Laravel WebSockets
- **Database:** PostgreSQL (Supabase)
- **Storage:** Supabase Storage

## 📂 Struktur Project

```
src/
├── app/                    # Next.js App Router pages
│   ├── login/             # Halaman login
│   ├── dashboard/         # Dashboard pages
│   │   ├── admin/         # Admin dashboard
│   │   ├── guru/          # Teacher dashboard
│   │   └── siswa/         # Student dashboard
│   ├── absensi/           # Attendance management
│   ├── ujian/             # Exam pages
│   ├── scan-qr/           # QR Scanner
│   └── admin/             # Admin management pages
├── components/
│   ├── layouts/           # Layout components
│   └── ui/                # Reusable UI components
├── context/               # React Context providers
├── hooks/                 # Custom React hooks
├── services/              # API service functions
└── types/                 # TypeScript type definitions
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm atau yarn
- Backend Laravel 11 (terpisah)

### Installation

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd project-amsp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local sesuai konfigurasi
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

5. **Open browser**
   ```
   http://localhost:3000
   ```

## 📝 Demo Login

Untuk testing, gunakan kredensial demo:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@sma15makassar.sch.id | password |
| Guru | guru@sma15makassar.sch.id | password |
| Siswa | siswa@sma15makassar.sch.id | password |

## 🔧 Available Scripts

```bash
# Development
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## 📱 User Roles & Access

### Admin
- Kelola pengguna (CRUD)
- Kelola kelas
- Manajemen jadwal
- Lihat statistik keseluruhan

### Guru
- Buat sesi absensi dengan QR dinamis
- Buat dan kelola ujian
- Monitoring ujian real-time
- Lihat rekap nilai

### Siswa
- Scan QR untuk absensi
- Mengerjakan ujian online
- Lihat jadwal dan nilai
- Akses materi pelajaran

## 🔒 Anti-Cheat Features

1. **Fullscreen Lock** - Ujian harus dalam mode fullscreen
2. **Tab Switch Detection** - Deteksi jika siswa pindah tab
3. **Copy/Paste Block** - Blokir copy/paste
4. **Camera Monitoring** - Foto diambil secara berkala
5. **Keyboard Shortcuts Disabled** - Blokir shortcut terlarang

## 📡 API Endpoints

Lihat dokumentasi API lengkap di folder `backend/` atau dokumentasi Postman.

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
