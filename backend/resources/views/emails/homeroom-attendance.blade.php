<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laporan Kehadiran - {{ $className }}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background-color:#F3F4F6;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding:40px 40px 30px;background-color:#111827;text-align:center;">
                            <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:600;letter-spacing:-0.025em;">Laporan Kehadiran Kelas</h1>
                            <p style="margin:8px 0 0;color:#9CA3AF;font-size:15px;">{{ $className }} &middot; {{ $date }}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding:40px;">
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td style="padding-bottom:24px;">
                                        <p style="margin:0;color:#374151;font-size:16px;line-height:1.5;">
                                            Yth. <strong>{{ $teacherName }}</strong>,<br><br>
                                            Rincian kehadiran untuk mata pelajaran <strong>{{ $subjectName }}</strong>.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Stats -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
                                <tr>
                                    <td width="50%" style="padding:20px 16px;text-align:center;border-right:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;">
                                        <div style="font-size:28px;font-weight:700;color:#059669;">{{ $summary['hadir'] ?? 0 }}</div>
                                        <div style="font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.05em;margin-top:4px;">HADIR</div>
                                    </td>
                                    <td width="50%" style="padding:20px 16px;text-align:center;border-bottom:1px solid #E5E7EB;">
                                        <div style="font-size:28px;font-weight:700;color:#D97706;">{{ $summary['sakit'] ?? 0 }}</div>
                                        <div style="font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.05em;margin-top:4px;">SAKIT</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td width="50%" style="padding:20px 16px;text-align:center;border-right:1px solid #E5E7EB;">
                                        <div style="font-size:28px;font-weight:700;color:#2563EB;">{{ $summary['izin'] ?? 0 }}</div>
                                        <div style="font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.05em;margin-top:4px;">IZIN</div>
                                    </td>
                                    <td width="50%" style="padding:20px 16px;text-align:center;">
                                        <div style="font-size:28px;font-weight:700;color:#DC2626;">{{ $summary['alpha'] ?? 0 }}</div>
                                        <div style="font-size:11px;font-weight:600;color:#6B7280;letter-spacing:0.05em;margin-top:4px;">ALPHA</div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Student List -->
                            <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">Daftar Siswa</h2>
                            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                <thead>
                                    <tr>
                                        <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6B7280;border-bottom:2px solid #E5E7EB;background-color:#F9FAFB;">Siswa</th>
                                        <th style="padding:12px 16px;text-align:right;font-size:12px;font-weight:600;color:#6B7280;border-bottom:2px solid #E5E7EB;background-color:#F9FAFB;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @foreach($studentList as $index => $student)
                                    @php
                                        $statusColor = match($student['status']) {
                                            'hadir' => '#059669', // Emerald 600
                                            'sakit' => '#D97706', // Amber 600
                                            'izin' => '#2563EB',  // Blue 600
                                            'alpha' => '#DC2626', // Red 600
                                            default => '#6B7280',
                                        };
                                        $statusBg = match($student['status']) {
                                            'hadir' => '#ECFDF5', // Emerald 50
                                            'sakit' => '#FFFBEB', // Amber 50
                                            'izin' => '#EFF6FF',  // Blue 50
                                            'alpha' => '#FEF2F2', // Red 50
                                            default => '#F3F4F6',
                                        };
                                        $statusLabel = match($student['status']) {
                                            'hadir' => 'Hadir',
                                            'sakit' => 'Sakit',
                                            'izin' => 'Izin',
                                            'alpha' => 'Alpha',
                                            default => ucfirst($student['status']),
                                        };
                                    @endphp
                                    <tr>
                                        <td style="padding:16px;font-size:14px;color:#111827;font-weight:500;border-bottom:1px solid #F3F4F6;">
                                            {{ $student['name'] }}
                                        </td>
                                        <td style="padding:16px;text-align:right;border-bottom:1px solid #F3F4F6;">
                                            <span style="display:inline-block;padding:4px 10px;border-radius:9999px;font-size:12px;font-weight:600;color:{{ $statusColor }};background-color:{{ $statusBg }};">
                                                {{ $statusLabel }}
                                            </span>
                                        </td>
                                    </tr>
                                    @endforeach
                                </tbody>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding:30px 40px;background-color:#F9FAFB;border-top:1px solid #E5E7EB;text-align:center;">
                            <p style="margin:0;color:#9CA3AF;font-size:13px;line-height:1.5;">
                                &copy; {{ date('Y') }} {{ config('app.name', 'LMS') }}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
