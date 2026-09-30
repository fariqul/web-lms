<?php

namespace App\Logging;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;

/**
 * Monolog handler that forwards ERROR and above to a Telegram bot.
 *
 * Anti-spam: identical errors (same message + file + line) are deduplicated
 * using Cache::add with a 5-minute TTL.
 *
 * Fail-safe: all Telegram API calls are wrapped in try/catch, have a 3-second
 * timeout, and never re-throw — this handler must NEVER cause a secondary error.
 */
class TelegramHandler extends AbstractProcessingHandler
{
    public function __construct()
    {
        parent::__construct(Level::Error, bubble: true);
    }

    protected function write(LogRecord $record): void
    {
        $token  = config('services.telegram.bot_token');
        $chatId = config('services.telegram.chat_id');

        // Silently skip when not configured.
        if (empty($token) || empty($chatId)) {
            return;
        }

        try {
            $context = $record->context;
            $extra   = $record->extra;

            // --- Extract file:line from exception context if available ---
            $file = $extra['file'] ?? null;
            $line = $extra['line'] ?? null;

            if (isset($context['exception']) && $context['exception'] instanceof \Throwable) {
                $e    = $context['exception'];
                $file = $file ?? $e->getFile();
                $line = $line ?? $e->getLine();
            }

            // --- Anti-spam deduplication ---
            $dedupeKey = 'tg_log:' . md5($record->message . ($file ?? '') . ($line ?? ''));

            // Cache::add returns false if key already exists → skip sending.
            if (! Cache::add($dedupeKey, 1, now()->addMinutes(5))) {
                return;
            }

            // --- Build the message ---
            $message = $this->buildMessage($record, $file, $line);

            // --- Send to Telegram ---
            Http::timeout(3)->post("https://api.telegram.org/bot{$token}/sendMessage", [
                'chat_id'    => $chatId,
                'text'       => $message,
                'parse_mode' => 'HTML',
            ]);
        } catch (\Throwable) {
            // Intentionally swallowed — this handler must never throw.
        }
    }

    private function buildMessage(LogRecord $record, ?string $file, ?int $line): string
    {
        $appName = $this->escape(config('app.name', 'Laravel'));
        $env     = $this->escape(config('app.env', 'production'));
        $level   = $this->escape(strtoupper($record->level->name));
        $time    = $record->datetime->format('Y-m-d H:i:s');

        // Truncate message to 500 chars to avoid Telegram 4096 limit.
        $msg     = $this->escape(mb_substr($record->message, 0, 500));

        // --- File:line ---
        $fileLine = '';
        if ($file !== null) {
            // Strip absolute path prefix so it's readable.
            $shortFile = preg_replace('#^.*/(?:app|routes|database)/#', '$0', $file) ?? $file;
            $fileLine  = "\n📄 <code>" . $this->escape($shortFile) . ($line ? ":{$line}" : '') . "</code>";
        }

        // --- Request URL ---
        $url = '';
        try {
            if (app()->runningInConsole()) {
                $url = "\n🖥 <i>console</i>";
            } else {
                $requestUrl = request()->fullUrl();
                $url        = "\n🔗 <code>" . $this->escape($requestUrl) . "</code>";
            }
        } catch (\Throwable) {
            // Not in HTTP context.
        }

        // --- User ID ---
        $userId = '';
        try {
            $user = request()->user();
            if ($user !== null) {
                $userId = "\n👤 user_id: <code>" . $this->escape((string) $user->id) . "</code>";
            }
        } catch (\Throwable) {
            // Auth not available.
        }

        return <<<HTML
🚨 <b>{$appName}</b> [{$env}]

⚠️ <b>{$level}</b> — <code>{$time}</code>

📝 {$msg}{$fileLine}{$url}{$userId}
HTML;
    }

    /**
     * Escape special HTML characters for Telegram HTML parse_mode.
     */
    private function escape(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
