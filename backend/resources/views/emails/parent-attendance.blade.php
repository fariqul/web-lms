<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Informasi Kehadiran - {{ $studentName }}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background-color:#F3F4F6;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding:40px 40px 30px;background-color:#111827;text-align:center;">
                            <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:600;letter-spacing:-0.025em;">Informasi Kehadiran</h1>
                            <p style="margin:8px 0 0;color:#9CA3AF;font-size:15px;">{{ $studentName }}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding:40px;">
                            <p style="margin:0 0 32px;color:#374151;font-size:16px;line-height:1.5;">
                                Yth. Orang Tua / Wali dari <strong>{{ $studentName }}</strong>,<br><br>
                                Berikut adalah rincian kehadiran anak Anda:
                            </p>

                            <!-- Data Grid -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
                                <tr>
                                    <td width="35%" style="padding:16px;border-bottom:1px solid #E5E7EB;background-color:#F9FAFB;">
                                        <span style="color:#6B7280;font-size:14px;font-weight:500;">Nama Siswa</span>
                                    </td>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;">
                                        <strong style="color:#111827;font-size:14px;">{{ $studentName }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;background-color:#F9FAFB;">
                                        <span style="color:#6B7280;font-size:14px;font-weight:500;">Kelas</span>
                                    </td>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;">
                                        <strong style="color:#111827;font-size:14px;">{{ $className }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;background-color:#F9FAFB;">
                                        <span style="color:#6B7280;font-size:14px;font-weight:500;">Mata Pelajaran</span>
                                    </td>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;">
                                        <strong style="color:#111827;font-size:14px;">{{ $subjectName }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;background-color:#F9FAFB;">
                                        <span style="color:#6B7280;font-size:14px;font-weight:500;">Tanggal & Waktu</span>
                                    </td>
                                    <td style="padding:16px;border-bottom:1px solid #E5E7EB;">
                                        <strong style="color:#111827;font-size:14px;">{{ $date }}, {{ $time }}</strong>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:20px 16px;background-color:#F9FAFB;">
                                        <span style="color:#6B7280;font-size:14px;font-weight:500;">Status Kehadiran</span>
                                    </td>
                                    <td style="padding:20px 16px;">
                                        <span style="display:inline-block;padding:6px 14px;border-radius:9999px;font-size:13px;font-weight:600;color:{{ $statusColor }};background-color:{{ $statusColor }}10;border:1px solid {{ $statusColor }}30;">
                                            {{ $statusLabel }}
                                        </span>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.5;">
                                Apabila Anda memiliki pertanyaan terkait kehadiran ini, silakan menghubungi wali kelas yang bersangkutan.
                            </p>
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
