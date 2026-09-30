<?php

namespace App\Logging;

use Monolog\Logger;

/**
 * Factory class for the 'telegram' custom log channel.
 *
 * Registered in config/logging.php as:
 *   'telegram' => [
 *       'driver' => 'custom',
 *       'via'    => TelegramLogger::class,
 *   ]
 */
class TelegramLogger
{
    /**
     * Create a custom Monolog instance.
     *
     * Laravel calls this method and passes the channel config array.
     *
     * @param  array<string, mixed>  $config
     */
    public function __invoke(array $config): Logger
    {
        $logger = new Logger('telegram');
        $logger->pushHandler(new TelegramHandler());

        return $logger;
    }
}
