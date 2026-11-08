# Protokol Pengambilan Data — Evaluasi Akurasi AI Proctoring (RQ2)

Dokumen ini menjadi panduan operasional pengambilan data untuk menjawab rumusan masalah kedua
(tingkat akurasi deteksi AI Proctoring dual-layer) pada skripsi
*Pengembangan Learning Management System dengan Fitur AI Proctoring Dual-Layer Berbasis YOLOv8
dan MediaPipe pada SMA Negeri 15 Makassar*.

Asumsi: fitur Experiment sudah di-deploy (termasuk perbaikan kamera yang tetap menyala
antar-capture) dan konfigurasi threshold hasil kalibrasi sudah tersedia.

---

## A. Persiapan (sekali per kondisi alat)

1. **Perangkat & lingkungan tetap** selama satu blok pengambilan data: laptop + webcam yang sama,
   browser yang sama. Isi `device_info` (contoh: `Laptop A / Chrome 142`), `distance_cm`
   (contoh: `30`), dan `lighting` sesuai kondisi ruangan.
2. Catat konfigurasi yang dipakai: setelah kalibrasi, apply draft → active, lalu **semua sesi uji
   memakai `config_scope = active`** agar `config_version_id` tersimpan per trial
   (reproducibility untuk laporan skripsi).
3. Ambil baseline **dari operator A** (wajah yang sama sepanjang sesi). Pastikan badge
   "Baseline ✓" muncul sebelum capture pertama.
4. Tentukan `dataset_split`:
   - `calibration` → blok kalibrasi threshold (boleh memakai Threshold Sweep)
   - `test` → blok evaluasi final (threshold dibekukan; **tidak boleh** di-sweep lalu diubah)

## B. Jumlah trial

| Blok        | Normal | Tiap kategori pelanggaran | Total |
|-------------|--------|---------------------------|-------|
| Kalibrasi   | 10     | 10 × 7 kategori           | 80    |
| Uji (final) | 30     | 30 × 7 kategori           | 240   |

Minimum yang masih layak untuk blok uji: 20 trial per kategori. Pengambilan data boleh dipecah
ke beberapa sesi (per hari atau per kategori); gabungkan hasilnya melalui **Export CSV**.

## C. Aturan isolasi skenario

Tepat **satu kondisi** per trial. Pilih radio kategori sebelum capture; radio otomatis kembali
ke **Normal** setelah capture selesai.

| Kategori          | Kondisi yang dilakukan                                              | Yang TIDAK boleh ada                     |
|-------------------|---------------------------------------------------------------------|------------------------------------------|
| Normal            | Wajah frontal, mata ke layar, tangan kosong                        | objek terlarang, orang lain              |
| No face           | Operator keluar penuh dari frame                                   | tangan/wajah sebagian masih terlihat     |
| Multi face        | Orang kedua masuk frame, wajah terlihat jelas di samping operator  | objek terlarang                          |
| Phone             | Pegang HP hingga terlihat kamera                                   | orang kedua                              |
| Book              | Pegang buku hingga terlihat kamera                                 | orang kedua                              |
| Head turn         | Menoleh melewati 38° (yaw) / 33° (pitch)                           | orang kedua, objek terlarang             |
| Eye gaze away     | Mata melihat ke samping/bawah tanpa menoleh                        | orang kedua, objek terlarang             |
| Identity mismatch | **Operator A keluar frame total**, orang B sendirian menghadap kamera | wajah operator A atau orang lain terlihat |

Jika dua kondisi sempat muncul bersamaan (contoh: orang B masuk frame tetapi wajah operator A
masih terlihat sehingga `multi_face` ikut terpicu), tandai trial tersebut **`is_invalid`** dengan
alasan yang jelas. Jangan memperbaiki label setelah melihat hasil prediksi.

## D. Metadata & penamaan skenario

- Format `scenario`: `{kategori}_{lighting}_{jarak}`, contoh `phone_normal_30`,
  `identity_mismatch_dim_30`.
- Isi `notes` bila ada kondisi khusus (kacamata, posisi kamera miring, dll.).
- Label ground truth **diisi saat capture**, bukan setelah melihat hasil prediksi
  (hindari labeling bias).

## E. Kriteria invalid

Tandai `is_invalid` bila:

- frame blur atau kamera macet saat capture;
- objek tidak sempat terlihat pada saat capture;
- label radio salah (mis. terpilih Phone padahal skenario Book);
- dua kondisi pelanggaran muncul bersamaan;
- orang keluar/masuk frame di tengah proses capture.

Trial invalid otomatis dikeluarkan dari perhitungan metrics.

## F. Alur satu trial (target ±5–8 detik)

1. Pilih radio kategori ground truth.
2. Lakukan kondisi sesuai tabel bagian C.
3. Klik **Capture & Analyze**.
4. Tunggu prediksi muncul di tabel Review Trial.
5. Radio otomatis kembali ke Normal — ulangi langkah 1.

Kamera tetap menyala antar-capture (tidak perlu klik "Start Camera Test" lagi).

## G. Setelah data terkumpul

1. **Blok kalibrasi:** buka tab Threshold Sweep, catat threshold terpilih
   (referensi: `face_distance` ±0.55, `confidence` 0.45, `yaw` 38, `pitch` 33, `gaze` 0.48).
   Terapkan sekali, lalu bekukan untuk blok uji.
2. **Blok uji:** buka tab Metrics, catat TP/TN/FP/FN, accuracy, precision, recall, dan F1 per
   kategori — langsung menjadi tabel BAB IV sesuai Tabel 3.1 proposal.
3. **Export CSV** setiap sesi sebagai lampiran data mentah.
4. **Risk score tidak dicampur ke akurasi** (sesuai proposal). Laporkan terpisah, misalnya
   distribusi risk level pada blok normal versus blok pelanggaran.

## H. Keputusan metode

- **mAP YOLOv8:** aplikasi belum menghitung mAP dan membutuhkannya dataset bounding box
  terpisah. Rekomendasi: tidak dipakai; gunakan precision/recall/F1 per kategori `phone` dan
  `book`. Proposal menyebut mAP sebagai pelengkap opsional.
- **Kalibrasi bobot risk score:** belum tersedia alatnya di aplikasi. Rekomendasi: bobot tetap
  default, dan di BAB IV cukup laporkan korelasi risk score terhadap jumlah pelanggaran dari
  blok kalibrasi. Jangan mengklaim bobot "terkalibrasi" tanpa analisis terpisah.

---

## Checklist cepat sebelum mulai

- [ ] Deploy terbaru aktif, migrasi `baseline_set_at` sudah dijalankan
- [ ] Threshold hasil kalibrasi sudah di-apply ke active
- [ ] Baseline operator A tersimpan (badge "Baseline ✓")
- [ ] `lighting`, `distance_cm`, `device_info`, `dataset_split` terisi
- [ ] Kamera menyala dan tetap hidup setelah capture pertama
- [ ] Radio kategori dipilih **sebelum** setiap capture
- [ ] Trial dengan kondisi ganda ditandai `is_invalid`
