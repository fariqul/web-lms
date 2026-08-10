<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Permintaan Reset Password</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;background-color:#F3F4F6;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding:40px 40px 30px;background-color:#111827;text-align:center;">
                            <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:600;letter-spacing:-0.025em;">Reset Password</h1>
                            <p style="margin:8px 0 0;color:#9CA3AF;font-size:15px;">{{ config('app.name', 'LMS') }}</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding:40px;">
                            <p style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.5;">
                                Yth. <strong>{{ $user->name }}</strong>,<br><br>
                                Kami menerima permintaan untuk melakukan pengaturan ulang (reset) password pada akun Anda.
                            </p>

                            <!-- CTA Button -->
                            <div style="text-align:center;margin:32px 0;">
                                <a href="{{ $resetUrl }}" style="display:inline-block;padding:14px 32px;background-color:#2563EB;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">
                                    Atur Ulang Password
                                </a>
                            </div>

                            <p style="margin:0 0 24px;color:#6B7280;font-size:14px;line-height:1.5;">
                                Atau, salin dan tempel URL berikut ke peramban (browser) Anda:
                            </p>
                            
                            <div style="margin-bottom:32px;padding:16px;background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:6px;">
                                <p style="margin:0;color:#4B5563;font-size:13px;word-break:break-all;font-family:monospace;">
                                    {{ $resetUrl }}
                                </p>
                            </div>

                            <p style="margin:0 0 16px;color:#DC2626;font-size:14px;font-weight:500;">
                                Tautan ini hanya berlaku selama 60 menit.
                            </p>

                            <p style="margin:0;color:#6B7280;font-size:14px;line-height:1.5;">
                                Apabila Anda tidak meminta pengaturan ulang password, Anda dapat mengabaikan pesan ini dengan aman.
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
