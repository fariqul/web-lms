<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class NotificationController extends Controller
{
    private const NOTIFICATION_CACHE_TTL_SECONDS = 30;

    private function cacheVersionKey(int $userId): string
    {
        return "notification_cache_version:user:{$userId}";
    }

    private function getCacheVersion(int $userId): int
    {
        return (int) Cache::get($this->cacheVersionKey($userId), 1);
    }

    private function bumpCacheVersion(int $userId): void
    {
        $key = $this->cacheVersionKey($userId);
        if (!Cache::has($key)) {
            Cache::put($key, 2, now()->addDays(7));
            return;
        }

        Cache::increment($key);
    }

    /**
     * Get paginated notifications for the authenticated user.
     * GET /api/notifications
     */
    public function index(Request $request)
    {
        $userId = (int) $request->user()->id;
        $perPage = min($request->integer('per_page', 20), 50);
        $page = max(1, $request->integer('page', 1));
        $unreadOnly = $request->boolean('unread_only');

        $cacheVersion = $this->getCacheVersion($userId);
        $cacheKey = "notifications:index:user:{$userId}:v:{$cacheVersion}:page:{$page}:per:{$perPage}:unread:" . ($unreadOnly ? '1' : '0');

        $payload = Cache::remember($cacheKey, self::NOTIFICATION_CACHE_TTL_SECONDS, function () use ($userId, $unreadOnly, $perPage, $page) {
            $query = Notification::forUser($userId)
                ->orderBy('created_at', 'desc');

            if ($unreadOnly) {
                $query->unread();
            }

            $notifications = $query->paginate($perPage, ['*'], 'page', $page);

            return [
                'success' => true,
                'data' => $notifications->items(),
                'meta' => [
                    'current_page' => $notifications->currentPage(),
                    'last_page' => $notifications->lastPage(),
                    'per_page' => $notifications->perPage(),
                    'total' => $notifications->total(),
                ],
            ];
        });

        return response()->json($payload);
    }

    /**
     * Get unread notifications count.
     * GET /api/notifications/unread-count
     */
    public function unreadCount(Request $request)
    {
        $userId = (int) $request->user()->id;
        $cacheVersion = $this->getCacheVersion($userId);
        $cacheKey = "notifications:unread-count:user:{$userId}:v:{$cacheVersion}";

        $count = Cache::remember($cacheKey, self::NOTIFICATION_CACHE_TTL_SECONDS, function () use ($userId) {
            return Notification::forUser($userId)->unread()->count();
        });

        return response()->json([
            'success' => true,
            'data' => [
                'count' => $count,
            ],
        ]);
    }

    /**
     * Mark a single notification as read.
     * POST /api/notifications/{id}/read
     */
    public function markAsRead(Request $request, int $id)
    {
        $userId = (int) $request->user()->id;
        $notification = Notification::where('id', $id)
            ->where('user_id', $userId)
            ->firstOrFail();

        $notification->markAsRead();
        $this->bumpCacheVersion($userId);

        return response()->json([
            'success' => true,
            'message' => 'Notifikasi ditandai sudah dibaca.',
        ]);
    }

    /**
     * Mark all notifications as read for the authenticated user.
     * POST /api/notifications/read-all
     */
    public function markAllAsRead(Request $request)
    {
        $userId = (int) $request->user()->id;

        Notification::forUser($userId)
            ->unread()
            ->update(['read_at' => now()]);

        $this->bumpCacheVersion($userId);

        return response()->json([
            'success' => true,
            'message' => 'Semua notifikasi ditandai sudah dibaca.',
        ]);
    }

    /**
     * Delete a notification.
     * DELETE /api/notifications/{id}
     */
    public function destroy(Request $request, int $id)
    {
        $userId = (int) $request->user()->id;
        $notification = Notification::where('id', $id)
            ->where('user_id', $userId)
            ->firstOrFail();

        $notification->delete();
        $this->bumpCacheVersion($userId);

        return response()->json([
            'success' => true,
            'message' => 'Notifikasi berhasil dihapus.',
        ]);
    }
}
