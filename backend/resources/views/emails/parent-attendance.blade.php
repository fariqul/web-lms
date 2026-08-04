<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notifikasi Absensi</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
                    {{-- Header --}}
                    <tr>
                        <td style="background: linear-gradient(135deg, #0ea5e9, #6366f1);padding:28px 32px;text-align:center;">
                            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">📋 Notifikasi Absensi</h1>
                            <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">Informasi kehadiran anak Anda</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:28px 32px;">
                            <p style="color:#334155;font-size:15px;margin:0 0 20px;">
                                Yth. Orang Tua/Wali dari <strong>{{ $studentName }}</strong>,
                            </p>

                            <p style="color:#475569;font-size:14px;margin:0 0 20px;">
                                Berikut adalah informasi kehadiran anak Anda pada sesi absensi hari ini:
                            </p>

                            {{-- Status Card --}}
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;margin-bottom:24px;">
                                <tr>
                                    <td style="padding:20px 24px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:6px 0;">
                                                    <span style="color:#64748b;font-size:13px;">Nama Siswa</span><br>
                                                    <strong style="color:#1e293b;font-size:15px;">{{ $studentName }}</strong>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;">
                                                    <span style="color:#64748b;font-size:13px;">Kelas</span><br>
                                                    <strong style="color:#1e293b;font-size:15px;">{{ $className }}</strong>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;">
                                                    <span style="color:#64748b;font-size:13px;">Mata Pelajaran</span><br>
                                                    <strong style="color:#1e293b;font-size:15px;">{{ $subject }}</strong>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;">
                                                    <span style="color:#64748b;font-size:13px;">Tanggal & Waktu</span><br>
                                                    <strong style="color:#1e293b;font-size:15px;">{{ $date }}, {{ $time }}</strong>
                                                </td>
                                            </tr>
                                            <tr>
                                                <td style="padding:12px 0 4px;">
                                                    <span style="color:#64748b;font-size:13px;">Status Kehadiran</span><br>
                                                    <span style="display:inline-block;margin-top:6px;padding:6px 16px;border-radius:20px;font-weight:700;font-size:14px;color:#ffffff;background-color:{{ $statusColor() }};">
                                                        {{ $statusLabel() }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="color:#64748b;font-size:13px;margin:0;">
                                Email ini dikirim secara otomatis oleh sistem LMS. Jika ada pertanyaan, silakan hubungi pihak sekolah.
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
