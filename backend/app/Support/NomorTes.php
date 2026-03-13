<?php

namespace App\Support;

class NomorTes
{
    public static function extractNumber(?string $nomorTes): int
    {
        if (!$nomorTes) {
            return 0;
        }

        if (preg_match('/-(\d+)$/', $nomorTes, $matches) !== 1) {
            return 0;
        }

        return (int) $matches[1];
    }

    public static function sortKey(?string $nomorTes, ?string $fallback = ''): string
    {
        $number = self::extractNumber($nomorTes);
        $missingFlag = $number > 0 ? 0 : 1;

        return sprintf('%d-%010d-%s', $missingFlag, $number, mb_strtolower((string) $fallback));
    }
}