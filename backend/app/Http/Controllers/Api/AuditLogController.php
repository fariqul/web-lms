<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    /**
     * Get paginated audit logs with filters.
     * GET /api/audit-logs
     */
    public function index(Request $request)
    {
        $query = AuditLog::with('user:id,name,email,role')
            ->orderBy('created_at', 'desc');

        // Filters
        if ($request->filled('user_id')) {
            $query->forUser($request->integer('user_id'));
        }

        if ($request->filled('action')) {
            $query->forAction($request->input('action'));
        }

        if ($request->filled('date_from') || $request->filled('date_to')) {
            $query->betweenDates($request->input('date_from'), $request->input('date_to'));
        }

        $perPage = min($request->integer('per_page', 20), 100);
        $logs = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $logs->items(),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ]);
    }

    /**
     * Get all distinct action types for filter dropdown.
     * GET /api/audit-logs/actions
     */
    public function actions()
    {
        $actions = AuditLog::distinctActions();

        return response()->json([
            'success' => true,
            'data' => $actions,
        ]);
    }
}
