<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informasi Kehadiran</title>
</head>
<body style="margin:0;padding:0;background-color:#fafafa;font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafafa;padding:40px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
                    {{-- Header --}}
                    <tr>
                        <td style="padding:40px 40px 24px;border-bottom:1px solid #f0f0f0;">
                            <h1 style="color:#111827;margin:0;font-size:24px;font-weight:600;letter-spacing:-0.5px;">Informasi Kehadiran</h1>
                            <p style="color:#6b7280;margin:8px 0 0;font-size:15px;line-height:1.5;">Rekapitulasi absensi harian untuk anak Anda.</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:32px 40px;">
                            <p style="color:#111827;font-size:15px;margin:0 0 24px;line-height:1.5;">
                                Yth. Orang Tua/Wali dari <strong>{{ $studentName }}</strong>,
                            </p>

                            <p style="color:#374151;font-size:15px;margin:0 0 32px;line-height:1.5;">
                                Berikut adalah rincian kehadiran anak Anda pada sesi hari ini:
                            </p>

                            {{-- Data Grid --}}
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                                <tr>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;" width="35%">
                                        <span style="color:#6b7280;font-size:14px;">Nama Siswa</span>
                                    </td>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <strong style="color:#111827;font-size:14px;font-weight:500;">{{ $studentName }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <span style="color:#6b7280;font-size:14px;">Kelas</span>
                                    </td>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <strong style="color:#111827;font-size:14px;font-weight:500;">{{ $className }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <span style="color:#6b7280;font-size:14px;">Mata Pelajaran</span>
                                    </td>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <strong style="color:#111827;font-size:14px;font-weight:500;">{{ $subjectName }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <span style="color:#6b7280;font-size:14px;">Tanggal & Waktu</span>
                                    </td>
                                    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;">
                                        <strong style="color:#111827;font-size:14px;font-weight:500;">{{ $date }}, {{ $time }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px 0 12px;">
                                        <span style="color:#6b7280;font-size:14px;">Status Kehadiran</span>
                                    </td>
                                    <td style="padding:16px 0 12px;">
                                        <span style="display:inline-block;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:600;color:{{ $statusColor }};border:1px solid {{ $statusColor }}33;background-color:{{ $statusColor }}10;">
                                            {{ $statusLabel }}
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <p style="color:#6b7280;font-size:13px;margin:0;line-height:1.5;">
                                Email ini dikirim secara otomatis oleh sistem. Jika Anda memiliki pertanyaan, silakan menghubungi wali kelas.
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background-color:#fafafa;padding:24px 40px;text-align:center;border-top:1px solid #e5e5e5;">
                            <p style="color:#9ca3af;font-size:12px;margin:0;">
                                &copy; {{ date('Y') }} {{ config('app.name', 'LMS') }}<br>Notifikasi Absensi Otomatis
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
