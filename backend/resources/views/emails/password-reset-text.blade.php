Permintaan Reset Password

Yth. {{ $user->name }},

Kami menerima permintaan untuk melakukan pengaturan ulang (reset) password pada akun Anda. 

Silakan salin dan tempel URL berikut ke peramban (browser) Anda untuk mengatur ulang password:
{{ $resetUrl }}

Tautan ini hanya berlaku selama 60 menit.

Apabila Anda tidak meminta pengaturan ulang password, Anda dapat mengabaikan pesan ini dengan aman.

==================================================
© {{ date('Y') }} {{ config('app.name', 'LMS') }}
