Yth. Orang Tua/Wali dari {{ $studentName }},

Berikut adalah informasi kehadiran anak Anda pada sesi absensi hari ini:

Nama Siswa: {{ $studentName }}
Kelas: {{ $className }}
Mata Pelajaran: {{ $subjectName }}
Tanggal & Waktu: {{ $date }}, {{ $time }}
Status Kehadiran: {{ $statusLabel }}

Email ini dikirim secara otomatis oleh sistem LMS. Jika ada pertanyaan, silakan hubungi pihak sekolah.

© {{ date('Y') }} {{ config('app.name', 'LMS') }} · Notifikasi Otomatis
