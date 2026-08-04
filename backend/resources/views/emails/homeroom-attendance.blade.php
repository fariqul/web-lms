<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rekap Absensi Kelas</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
                    {{-- Header --}}
                    <tr>
                        <td style="background: linear-gradient(135deg, #6366f1, #8b5cf6);padding:28px 32px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">📊 Rekap Absensi Kelas</h1>
                            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">{{ $className }} &middot; {{ $date }}</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="color:#334155;font-size:15px;margin:0 0 20px;">
                                Halo <strong>{{ $teacherName }}</strong>,
                            </p>
                            <p style="color:#475569;font-size:14px;margin:0 0 20px;">
                                Berikut adalah rekapitulasi absensi kelas <strong>{{ $className }}</strong> untuk mata pelajaran <strong>{{ $subjectName }}</strong>:
                            </p>

                            {{-- Summary Cards --}}
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                    <td width="25%" style="padding:4px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;text-align:center;">
                                            <tr><td style="padding:12px 8px;">
                                                <div style="font-size:22px;font-weight:700;color:#16a34a;">{{ $summary['hadir'] ?? 0 }}</div>
                                                <div style="font-size:11px;color:#4ade80;font-weight:600;">HADIR</div>
                                            </td></tr>
                                        </table>
                                    </td>
                                    <td width="25%" style="padding:4px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fefce8;border-radius:8px;border:1px solid #fde68a;text-align:center;">
                                            <tr><td style="padding:12px 8px;">
                                                <div style="font-size:22px;font-weight:700;color:#ca8a04;">{{ $summary['sakit'] ?? 0 }}</div>
                                                <div style="font-size:11px;color:#facc15;font-weight:600;">SAKIT</div>
                                            </td></tr>
                                        </table>
                                    </td>
                                    <td width="25%" style="padding:4px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;text-align:center;">
                                            <tr><td style="padding:12px 8px;">
                                                <div style="font-size:22px;font-weight:700;color:#2563eb;">{{ $summary['izin'] ?? 0 }}</div>
                                                <div style="font-size:11px;color:#60a5fa;font-weight:600;">IZIN</div>
                                            </td></tr>
                                        </table>
                                    </td>
                                    <td width="25%" style="padding:4px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca;text-align:center;">
                                            <tr><td style="padding:12px 8px;">
                                                <div style="font-size:22px;font-weight:700;color:#dc2626;">{{ $summary['alpha'] ?? 0 }}</div>
                                                <div style="font-size:11px;color:#f87171;font-weight:600;">ALPHA</div>
                                            </td></tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            {{-- Student List Table --}}
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;margin-bottom:20px;">
                                <thead>
                                    <tr style="background-color:#f1f5f9;">
                                        <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;">No</th>
                                        <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;">Nama Siswa</th>
                                        <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:600;color:#475569;border-bottom:1px solid #e2e8f0;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @foreach($studentList as $index => $student)
                                    @php
                                        $bgColor = $index % 2 === 0 ? '#ffffff' : '#f8fafc';
                                        $statusBg = match($student['status']) {
                                            'hadir' => '#dcfce7',
                                            'sakit' => '#fef9c3',
                                            'izin' => '#dbeafe',
                                            'alpha' => '#fee2e2',
                                            default => '#f1f5f9',
                                        };
                                        $statusText = match($student['status']) {
                                            'hadir' => '#15803d',
                                            'sakit' => '#a16207',
                                            'izin' => '#1d4ed8',
                                            'alpha' => '#b91c1c',
                                            default => '#475569',
                                        };
                                        $statusLabel = match($student['status']) {
                                            'hadir' => 'Hadir',
                                            'sakit' => 'Sakit',
                                            'izin' => 'Izin',
                                            'alpha' => 'Alpha',
                                            default => ucfirst($student['status']),
                                        };
                                    @endphp
                                    <tr style="background-color:{{ $bgColor }};">
                                        <td style="padding:8px 14px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">{{ $index + 1 }}</td>
                                        <td style="padding:8px 14px;font-size:13px;color:#1e293b;font-weight:500;border-bottom:1px solid #f1f5f9;">{{ $student['name'] }}</td>
                                        <td style="padding:8px 14px;text-align:center;border-bottom:1px solid #f1f5f9;">
                                            <span style="display:inline-block;padding:3px 12px;border-radius:12px;font-size:11px;font-weight:600;color:{{ $statusText }};background-color:{{ $statusBg }};">
                                                {{ $statusLabel }}
                                            </span>
                                        </td>
                                    </tr>
                                    @endforeach
                                </tbody>
                            </table>

                            <p style="color:#64748b;font-size:13px;margin:0;">
                                Total siswa: <strong>{{ $summary['total'] ?? count($studentList) }}</strong> &middot;
                                Email ini dikirim secara otomatis oleh sistem LMS.
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background-color:#f8fafc;padding:16px 32px;text-align:center;border-top:1px solid #e2e8f0;">
                            <p style="color:#94a3b8;font-size:12px;margin:0;">
                                &copy; {{ date('Y') }} {{ config('app.name', 'LMS') }} &middot; Notifikasi Otomatis
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
