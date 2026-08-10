Informasi Kehadiran Siswa - {{ $studentName }}

Yth. Orang Tua / Wali dari {{ $studentName }},

Berikut adalah rincian kehadiran anak Anda:

--------------------------------------------------
Nama Siswa     : {{ $studentName }}
Kelas          : {{ $className }}
Mata Pelajaran : {{ $subjectName }}
Tanggal & Waktu: {{ $date }}, {{ $time }}
Status         : {{ $statusLabel }}
--------------------------------------------------

Apabila Anda memiliki pertanyaan terkait kehadiran ini, silakan menghubungi wali kelas yang bersangkutan.

==================================================
© {{ date('Y') }} {{ config('app.name', 'LMS') }}
