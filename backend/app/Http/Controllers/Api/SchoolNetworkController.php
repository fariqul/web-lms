<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SchoolNetworkSetting;
use Illuminate\Http\Request;

class SchoolNetworkController extends Controller
{
    /**
     * Display a listing of school network settings
     */
    public function index()
    {
        $networks = SchoolNetworkSetting::orderBy('name')->get();
        
        return response()->json([
            'success' => true,
            'data' => $networks,
        ]);
    }

    /**
     * Store a new network setting
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'ip_range' => 'required|string|max:255',
            'is_active' => 'boolean',
        ]);

        // Validate IP range format
        if (!$this->isValidIpRange($request->ip_range)) {
            return response()->json([
                'success' => false,
                'message' => 'Format IP range tidak valid. Gunakan format CIDR (192.168.1.0/24) atau range (192.168.1.1-192.168.1.255)',
            ], 422);
        }

        $network = SchoolNetworkSetting::create([
            'name' => $request->name,
            'ip_range' => $request->ip_range,
            'is_active' => $request->is_active ?? true,
        ]);

        return response()->json([
            'success' => true,
            'data' => $network,
            'message' => 'Jaringan berhasil ditambahkan',
        ], 201);
    }

    /**
     * Display a specific network setting
     */
    public function show(SchoolNetworkSetting $schoolNetworkSetting)
    {
        return response()->json([
            'success' => true,
            'data' => $schoolNetworkSetting,
        ]);
    }

    /**
     * Update a network setting
     */
    public function update(Request $request, SchoolNetworkSetting $schoolNetworkSetting)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'ip_range' => 'sometimes|string|max:255',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($request->has('ip_range') && !$this->isValidIpRange($request->ip_range)) {
            return response()->json([
                'success' => false,
                'message' => 'Format IP range tidak valid',
            ], 422);
        }

        $schoolNetworkSetting->update($request->only(['name', 'ip_range', 'is_active']));

        return response()->json([
            'success' => true,
            'data' => $schoolNetworkSetting,
            'message' => 'Jaringan berhasil diupdate',
        ]);
    }

    /**
     * Remove a network setting
     */
    public function destroy(SchoolNetworkSetting $schoolNetworkSetting)
    {
        $schoolNetworkSetting->delete();

        return response()->json([
            'success' => true,
            'message' => 'Jaringan berhasil dihapus',
        ]);
    }

    /**
     * Test if current IP is in school network
     */
    public function testCurrentIp(Request $request)
    {
        $clientIp = $request->ip();
        $isSchoolNetwork = SchoolNetworkSetting::isSchoolNetwork($clientIp);

        return response()->json([
            'success' => true,
            'data' => [
                'ip_address' => $clientIp,
                'is_school_network' => $isSchoolNetwork,
                'x_forwarded_for' => $request->header('X-Forwarded-For'),
                'x_real_ip' => $request->header('X-Real-IP'),
            ],
        ]);
    }

    /**
     * Validate IP range format
     */
    private function isValidIpRange(string $range): bool
    {
        // CIDR format (e.g., 192.168.1.0/24)
        if (preg_match('/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/', $range)) {
            return true;
        }
        
        // Range format (e.g., 192.168.1.1-192.168.1.255)
        if (preg_match('/^(\d{1,3}\.){3}\d{1,3}-(\d{1,3}\.){3}\d{1,3}$/', $range)) {
            return true;
        }
        
        // Single IP
        if (filter_var($range, FILTER_VALIDATE_IP)) {
            return true;
        }
        
        return false;
    }
}
