<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reset Password</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #2563eb; color: white; padding: 20px 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; }
        .content { padding: 30px; }
        .content p { color: #333; line-height: 1.6; }
        .btn { display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 30px; border-radius: 6px; margin: 20px 0; font-weight: bold; }
        .btn:hover { background-color: #1d4ed8; }
        .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #eee; }
        .code { background: #f3f4f6; padding: 10px 15px; border-radius: 4px; font-family: monospace; font-size: 14px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SMA 15 Makassar LMS</h1>
        </div>
        <div class="content">
            <p>Halo <strong>{{ $user->name }}</strong>,</p>
            <p>Kami menerima permintaan untuk mereset password akun Anda. Klik tombol di bawah untuk membuat password baru:</p>
            
            <p style="text-align: center;">
                <a href="{{ $resetUrl }}" class="btn">Reset Password</a>
            </p>
            
            <p>Atau salin link berikut ke browser Anda:</p>
            <p class="code">{{ $resetUrl }}</p>
            
            <p><strong>Link ini akan kadaluarsa dalam 60 menit.</strong></p>
            
            <p>Jika Anda tidak meminta reset password, abaikan email ini. Password Anda tidak akan berubah.</p>
        </div>
        <div class="footer">
            <p>&copy; {{ date('Y') }} SMA 15 Makassar LMS. Seluruh hak cipta dilindungi.</p>
        </div>
    </div>
</body>
</html>
