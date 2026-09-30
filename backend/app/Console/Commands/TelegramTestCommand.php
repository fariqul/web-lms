<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class TelegramTestCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'telegram:test';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Send a direct test message to Telegram and show the API response';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $token  = config('services.telegram.bot_token');
        $chatId = config('services.telegram.chat_id');

        $this->line('=== Telegram Configuration ===');
        $this->line('BOT_TOKEN : ' . ($token  ? substr($token, 0, 10) . '...' . substr($token, -5) : '<EMPTY>'));
        $this->line('CHAT_ID   : ' . ($chatId ? $chatId : '<EMPTY>'));
        $this->newLine();

        if (empty($token) || empty($chatId)) {
            $this->error('TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID kosong di .env!');
            $this->line('Pastikan sudah diset dan sudah jalankan: php artisan config:clear');
            return Command::FAILURE;
        }

        $this->info('Mengirim pesan langsung ke Telegram API...');

        $text = "🧪 <b>Test dari " . config('app.name') . "</b>\n"
              . "Env: <code>" . config('app.env') . "</code>\n"
              . "Waktu: <code>" . now()->toDateTimeString() . "</code>\n"
              . "✅ Jika kamu melihat ini, Telegram logging berfungsi!";

        try {
            $response = Http::timeout(10)->post("https://api.telegram.org/bot{$token}/sendMessage", [
                'chat_id'    => $chatId,
                'text'       => $text,
                'parse_mode' => 'HTML',
            ]);

            $this->newLine();
            $this->line('=== Telegram API Response ===');
            $this->line('HTTP Status : ' . $response->status());
            $this->line('Body        : ' . $response->body());
            $this->newLine();

            if ($response->successful() && ($response->json('ok') === true)) {
                $this->info('✅ Berhasil! Pesan terkirim ke Telegram.');
            } else {
                $this->error('❌ Gagal. Lihat body response di atas untuk detail error.');
                $this->newLine();
                $this->line('Tips umum:');
                $this->line('  - Pastikan kamu sudah klik /start di bot kamu: https://t.me/' . $this->getBotUsername($token));
                $this->line('  - Untuk grup/channel: tambahkan bot sebagai admin, lalu kirim 1 pesan ke grup');
                $this->line('  - CHAT_ID grup biasanya diawali -100..., coba cek via: https://api.telegram.org/bot' . substr($token, 0, 8) . '.../getUpdates');
            }
        } catch (\Throwable $e) {
            $this->error('Exception: ' . $e->getMessage());
        }

        return Command::SUCCESS;
    }

    private function getBotUsername(string $token): string
    {
        try {
            $res = Http::timeout(5)->get("https://api.telegram.org/bot{$token}/getMe");
            return $res->json('result.username') ?? 'your_bot';
        } catch (\Throwable) {
            return 'your_bot';
        }
    }
}
