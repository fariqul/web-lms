# QA Checklist: Realtime Block & Kick Siswa

Dokumen ini dipakai untuk verifikasi fitur terbaru:
- Block siswa oleh admin harus memaksa logout realtime di halaman mana pun.
- Kick siswa dari monitor ujian harus memaksa logout realtime dengan pesan admin.
- Popup notifikasi harus tampil di tengah, besar, dan tidak bisa ditutup manual.
- Kanal user socket tidak boleh bisa di-spoof (join ke room user lain).

## Prasyarat

1. Frontend, backend, dan socket-server berjalan normal.
2. Akun uji tersedia:
- `admin_test`
- `siswa_test_1`
- `siswa_test_2`
3. Socket server bisa mengakses endpoint backend `/api/me` (untuk verifikasi token join-user).
4. Build terbaru sudah ter-deploy.

## Konfigurasi Wajib

1. Pastikan environment variable socket server sudah benar:
- `BACKEND_API_URL`
2. Contoh nilai:
- Docker internal: `http://backend:8000/api`
- Host langsung: `https://domain-backend-kamu/api`

## Skenario Uji Fungsional

### TC-01: Block realtime saat siswa di dashboard

1. Login sebagai `siswa_test_1`, buka dashboard, diamkan halaman.
2. Login sebagai admin di browser/device lain.
3. Blokir `siswa_test_1` dari manajemen user.

Expected:
1. Dalam beberapa detik, siswa langsung muncul popup tengah besar.
2. Popup berisi pesan block dari admin.
3. Popup tidak ada tombol tutup (non-dismissable).
4. Setelah jeda singkat, siswa otomatis logout ke `/login?reason=blocked`.
5. URL login dibersihkan otomatis setelah pesan tampil.

### TC-02: Block realtime saat siswa sedang ujian

1. Login `siswa_test_1`, masuk halaman ujian yang aktif.
2. Dari admin, lakukan block akun siswa.

Expected:
1. Muncul popup tengah besar di halaman ujian.
2. Tidak muncul browser leave prompt default.
3. Siswa otomatis keluar ke login.

### TC-03: Bulk block (multi siswa)

1. Login dua akun siswa di device berbeda (`siswa_test_1`, `siswa_test_2`).
2. Admin lakukan bulk block.

Expected:
1. Kedua siswa menerima popup dan logout otomatis.
2. Tidak perlu refresh manual.

### TC-04: Unblock dan login ulang

1. Admin unblock `siswa_test_1`.
2. Siswa login ulang.

Expected:
1. Login berhasil normal.
2. Tidak ada loop logout.

### TC-05: Kick siswa dari monitor ujian dengan pesan custom

1. `siswa_test_1` sedang mengerjakan ujian.
2. Admin buka monitor ujian.
3. Klik aksi kick pada siswa.
4. Isi pesan custom, lanjut konfirmasi 2 langkah, lalu kick.

Expected:
1. Siswa menerima popup tengah dengan isi pesan custom admin.
2. Siswa logout otomatis ke login.
3. Siswa bisa login lagi tanpa perlu unblock akun.
4. Di monitor admin muncul event feed kick.

### TC-06: Validasi fallback pesan kick

1. Ulang TC-05 beberapa kali.
2. Saat kick, pastikan siswa tetap menerima pesan meskipun event room ujian terlambat.

Expected:
1. Pesan tetap muncul karena ada fallback notify user channel.

## Skenario Uji Keamanan

### TC-07: Coba spoof join-user room

Tujuan: memastikan socket menolak join room user lain.

Langkah contoh (lokal) dengan token milik `siswa_test_1`:

```bash
node -e "const { io } = require('socket.io-client'); const s = io('https://URL_SOCKET_KAMU',{auth:{token:'TOKEN_SISWA_1'}}); s.on('connect',()=>{ s.emit('join-user',{userId:999999}); }); s.on('error',(e)=>{ console.log('SOCKET_ERROR',e); process.exit(0); }); setTimeout(()=>process.exit(0),5000);"
```

Expected:
1. Server menolak request join-user yang userId-nya tidak sesuai token.
2. Log server menampilkan peringatan `join-user rejected`.
3. Tidak ada notifikasi milik user lain yang diterima.

## Troubleshooting Cepat

1. Gejala: siswa tidak logout realtime.
- Cek koneksi socket client.
- Cek log socket server apakah ada `join-user rejected`.
- Cek `BACKEND_API_URL` dan akses ke `/api/me` dari socket server.

2. Gejala: popup muncul tapi pesan kosong.
- Cek payload `message` dari backend block/kick endpoint.
- Cek interceptor dan SessionEventHandler di frontend.

3. Gejala: logout baru terjadi setelah refresh.
- Cek apakah event `notification` masuk ke client.
- Cek fallback polling `authAPI.me` berjalan tiap 10 detik.

## Kriteria Lulus Rilis

1. Semua TC-01 s.d. TC-07 lulus.
2. Tidak ada kasus perlu refresh manual untuk force logout.
3. Tidak ada bypass keamanan join-user spoofing.
4. Build production lulus tanpa error.
