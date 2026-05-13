<?php

namespace App\Support;

class ViolationStrictMode
{
    public static function isEnabled(): bool
    {
        $value = env('EXAM_VIOLATION_STRICT_MODE', true);
        return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? true;
    }
}
