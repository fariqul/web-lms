<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rekap Absensi Kelas</title>
</head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;padding:40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
                    {{-- Header --}}
                    <tr>
                        <td style="padding:40px 40px 24px;border-bottom:1px solid #f0f0f0;">
                            <h1 style="color:#111827;margin:0;font-size:24px;font-weight:600;letter-spacing:-0.5px;">Rekap Absensi Kelas</h1>
                            <p style="color:#6b7280;margin:8px 0 0;font-size:15px;line-height:1.5;">{{ $className }} &middot; {{ $date }}</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:32px 40px;">
                            <p style="color:#111827;font-size:15px;margin:0 0 24px;line-height:1.5;">
                                Halo <strong>{{ $teacherName }}</strong>,
                            </p>
                            <p style="color:#374151;font-size:15px;margin:0 0 32px;line-height:1.5;">
                                Berikut adalah rekapitulasi absensi kelas <strong>{{ $className }}</strong> untuk mata pelajaran <strong>{{ $subjectName }}</strong>:
                            </p>

                            {{-- Summary Cards --}}
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;">
                                <tr>
                                    <td width="25%" style="padding:16px 12px;border-right:1px solid #e5e5e5;text-align:center;">
                                        <div style="font-size:24px;font-weight:600;color:#111827;">{{ $summary['hadir'] ?? 0 }}</div>
                                        <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.5px;margin-top:4px;">HADIR</div>
                                    </td>
                                    <td width="25%" style="padding:16px 12px;border-right:1px solid #e5e5e5;text-align:center;">
                                        <div style="font-size:24px;font-weight:600;color:#111827;">{{ $summary['sakit'] ?? 0 }}</div>
                                        <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.5px;margin-top:4px;">SAKIT</div>
                                    </td>
                                    <td width="25%" style="padding:16px 12px;border-right:1px solid #e5e5e5;text-align:center;">
                                        <div style="font-size:24px;font-weight:600;color:#111827;">{{ $summary['izin'] ?? 0 }}</div>
                                        <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.5px;margin-top:4px;">IZIN</div>
                                    </td>
                                    <td width="25%" style="padding:16px 12px;text-align:center;">
                                        <div style="font-size:24px;font-weight:600;color:#111827;">{{ $summary['alpha'] ?? 0 }}</div>
                                        <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.5px;margin-top:4px;">ALPHA</div>
                                    </td>
                                </tr>
                            </table>

                            {{-- Student List Table --}}
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
                                <thead>
                                    <tr>
                                        <th style="padding:12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e5e5;width:40px;">No</th>
                                        <th style="padding:12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e5e5;">Nama Siswa</th>
                                        <th style="padding:12px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e5e5;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @foreach($studentList as $index => $student)
                                    @php
                                        $statusColor = match($student['status']) {
                                            'hadir' => '#16a34a',
                                            'sakit' => '#ca8a04',
                                            'izin' => '#2563eb',
                                            'alpha' => '#dc2626',
                                            default => '#6b7280',
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
                                        <td style="padding:12px;font-size:14px;color:#6b7280;border-bottom:1px solid #f3f4f6;">{{ $index + 1 }}</td>
                                        <td style="padding:12px;font-size:14px;color:#111827;font-weight:500;border-bottom:1px solid #f3f4f6;">{{ $student['name'] }}</td>
                                        <td style="padding:12px;text-align:right;border-bottom:1px solid #f3f4f6;">
                                            <span style="font-size:13px;font-weight:600;color:{{ $statusColor }};">
                                                {{ $statusLabel }}
                                            </span>
                                        </td>
                                    </tr>
                                    @endforeach
                                </tbody>
                            </table>

                            <p style="color:#6b7280;font-size:13px;margin:0;line-height:1.5;">
                                Email ini dikirim secara otomatis oleh sistem.
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background-color:#fafafa;padding:24px 40px;text-align:center;border-top:1px solid #e5e5e5;">
                            <p style="color:#9ca3af;font-size:12px;margin:0;">
                                &copy; {{ date('Y') }} {{ config('app.name', 'LMS') }}<br>Rekap Absensi Otomatis
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
