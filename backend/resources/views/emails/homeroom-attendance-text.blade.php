Halo {{ $teacherName }},

Berikut adalah rekapitulasi absensi kelas {{ $className }} untuk mata pelajaran {{ $subjectName }} pada tanggal {{ $date }}:

=== RINGKASAN ===
Hadir: {{ $summary['hadir'] ?? 0 }}
Sakit: {{ $summary['sakit'] ?? 0 }}
Izin:  {{ $summary['izin'] ?? 0 }}
Alpha: {{ $summary['alpha'] ?? 0 }}

=== DAFTAR SISWA ===
@foreach($studentList as $index => $student)
{{ $index + 1 }}. {{ $student['name'] }} - {{ strtoupper($student['status']) }}
@endforeach

Email ini dikirim secara otomatis oleh sistem.

© {{ date('Y') }} {{ config('app.name', 'LMS') }} · Rekap Absensi Otomatis
