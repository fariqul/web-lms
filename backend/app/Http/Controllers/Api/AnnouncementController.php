<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    /**
     * Display a listing of announcements
     */
    public function index(Request $request)
    {
        $user = $request->user();
        
        // For admin, show all announcements
        if ($user->role === 'admin') {
            $query = Announcement::with('author:id,name,role');
            if (!$request->has('all')) {
                $query->active()->published();
            }
        } 
        // For guru, show announcements targeted to them OR announcements they created
        elseif ($user->role === 'guru') {
            $query = Announcement::with('author:id,name,role')
                ->active()
                ->published()
                ->where(function ($q) use ($user) {
                    $q->where('target', 'all')
                      ->orWhere('target', 'guru')
                      ->orWhere('author_id', $user->id); // Guru can see their own announcements
                });
        }
        // For siswa, show announcements targeted to them
        else {
            $query = Announcement::with('author:id,name,role')
                ->active()
                ->published()
                ->where(function ($q) use ($user) {
                    $q->where('target', 'all')
                      ->orWhere('target', $user->role);
                });
        }

        $announcements = $query->orderBy('priority', 'desc')
            ->orderBy('created_at', 'desc')
            ->paginate(10);

        return response()->json([
            'success' => true,
            'data' => $announcements,
        ]);
    }

    /**
     * Store a newly created announcement
     */
    public function store(Request $request)
    {
        $user = $request->user();

        if (!in_array($user->role, ['admin', 'guru'])) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'priority' => 'sometimes|in:normal,important,urgent',
            'target' => 'sometimes|in:all,guru,siswa',
            'published_at' => 'nullable|date',
            'expires_at' => 'nullable|date|after:now',
        ]);

        // Guru can only create announcements for siswa
        $target = $request->target ?? 'all';
        if ($user->role === 'guru' && $target !== 'siswa') {
            $target = 'siswa';
        }

        $announcement = Announcement::create([
            'title' => $request->input('title'),
            'content' => $request->input('content'),
            'priority' => $request->priority ?? 'normal',
            'target' => $target,
            'author_id' => $user->id,
            'is_active' => true,
            'published_at' => $request->published_at ?? now(),
            'expires_at' => $request->expires_at,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Pengumuman berhasil dibuat',
            'data' => $announcement->load('author:id,name,role'),
        ], 201);
    }

    /**
     * Display the specified announcement
     */
    public function show(Request $request, Announcement $announcement)
    {
        $user = $request->user();

        // Check target-based access control
        if ($user->role !== 'admin' && $announcement->author_id !== $user->id) {
            if ($announcement->target !== 'all' && $announcement->target !== $user->role) {
                return response()->json([
                    'success' => false,
                    'message' => 'Anda tidak memiliki akses ke pengumuman ini',
                ], 403);
            }
        }

        return response()->json([
            'success' => true,
            'data' => $announcement->load('author:id,name,role'),
        ]);
    }

    /**
     * Update the specified announcement
     */
    public function update(Request $request, Announcement $announcement)
    {
        $user = $request->user();

        // Check permission
        if ($user->role !== 'admin' && $announcement->author_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $request->validate([
            'title' => 'sometimes|string|max:255',
            'content' => 'sometimes|string',
            'priority' => 'sometimes|in:normal,important,urgent',
            'target' => 'sometimes|in:all,guru,siswa',
            'is_active' => 'sometimes|boolean',
            'published_at' => 'nullable|date',
            'expires_at' => 'nullable|date',
        ]);

        $announcement->update($request->only([
            'title', 'content', 'priority', 'target', 'is_active', 'published_at', 'expires_at'
        ]));

        return response()->json([
            'success' => true,
            'message' => 'Pengumuman berhasil diperbarui',
            'data' => $announcement->load('author:id,name,role'),
        ]);
    }

    /**
     * Remove the specified announcement
     */
    public function destroy(Announcement $announcement)
    {
        $user = request()->user();

        // Check permission
        if ($user->role !== 'admin' && $announcement->author_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $announcement->delete();

        return response()->json([
            'success' => true,
            'message' => 'Pengumuman berhasil dihapus',
        ]);
    }

    /**
     * Get latest announcements for dashboard
     */
    public function latest(Request $request)
    {
        $user = $request->user();
        $limit = min($request->get('limit', 5), 20); // Cap at 20

        $announcements = Announcement::with('author:id,name,role')
            ->active()
            ->published()
            ->where(function ($q) use ($user) {
                $q->where('target', 'all')
                  ->orWhere('target', $user->role);
            })
            ->orderBy('priority', 'desc')
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $announcements,
        ]);
    }

    /**
     * Get unread count (announcements from last 7 days)
     */
    public function unreadCount(Request $request)
    {
        $user = $request->user();

        $count = Announcement::active()
            ->published()
            ->where('created_at', '>=', now()->subDays(7))
            ->where(function ($q) use ($user) {
                $q->where('target', 'all')
                  ->orWhere('target', $user->role);
            })
            ->count();

        return response()->json([
            'success' => true,
            'data' => ['count' => $count],
        ]);
    }
}
