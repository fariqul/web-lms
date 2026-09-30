<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

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
    protected $description = 'Send a test error message to the configured Telegram channel';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $this->info('Sending test message to Telegram...');

        Log::channel('telegram')->error('🧪 Telegram logging test from ' . config('app.name'), [
            'env'       => config('app.env'),
            'timestamp' => now()->toIso8601String(),
        ]);

        $this->info('Done. Check your Telegram chat for the message.');
        $this->line('(If nothing arrived, verify TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your .env)');

        return Command::SUCCESS;
    }
}
