<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SchoolNetworkSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'ip_range',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    /**
     * Check if an IP address is within this network range
     */
    public function containsIp(string $ip): bool
    {
        $ipRange = $this->ip_range;
        
        // Handle CIDR notation (e.g., "192.168.1.0/24")
        if (strpos($ipRange, '/') !== false) {
            return $this->ipInCidr($ip, $ipRange);
        }
        
        // Handle range notation (e.g., "192.168.1.1-192.168.1.255")
        if (strpos($ipRange, '-') !== false) {
            return $this->ipInRange($ip, $ipRange);
        }
        
        // Handle single IP
        return $ip === $ipRange;
    }

    private function ipInCidr(string $ip, string $cidr): bool
    {
        list($subnet, $bits) = explode('/', $cidr);
        $ip = ip2long($ip);
        $subnet = ip2long($subnet);
        $mask = -1 << (32 - (int)$bits);
        $subnet &= $mask;
        return ($ip & $mask) === $subnet;
    }

    private function ipInRange(string $ip, string $range): bool
    {
        list($start, $end) = explode('-', $range);
        $ip = ip2long(trim($ip));
        $start = ip2long(trim($start));
        $end = ip2long(trim($end));
        return $ip >= $start && $ip <= $end;
    }

    /**
     * Check if IP is in any active school network
     */
    public static function isSchoolNetwork(string $ip): bool
    {
        /** @var \Illuminate\Database\Eloquent\Collection<int, static> $networks */
        $networks = self::where('is_active', true)->get();
        
        foreach ($networks as $network) {
            /** @var self $network */
            if ($network->containsIp($ip)) {
                return true;
            }
        }
        
        return false;
    }
}
