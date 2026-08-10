Laporan Kehadiran Kelas - {{ $className }}
Tanggal: {{ $date }}

Yth. {{ $teacherName }},

Berikut adalah rincian kehadiran untuk mata pelajaran {{ $subjectName }}.

--- RINGKASAN ---
Hadir: {{ $summary['hadir'] ?? 0 }}
Sakit: {{ $summary['sakit'] ?? 0 }}
Izin:  {{ $summary['izin'] ?? 0 }}
Alpha: {{ $summary['alpha'] ?? 0 }}

--- DAFTAR SISWA ---
@foreach($studentList as $index => $student)
{{ $index + 1 }}. {{ $student['name'] }} - {{ strtoupper($student['status']) }}
@endforeach

====================
© {{ date('Y') }} {{ config('app.name', 'LMS') }}
