<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\News;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class NewsController extends Controller
{
    /**
     * Public: Get published news for landing page.
     */
    public function publicIndex(Request $request)
    {
        $limit = min((int) ($request->query('limit', 4)), 20);

        $news = News::published()
            ->with('author:id,name')
            ->select(['id', 'title', 'slug', 'category', 'excerpt', 'image', 'author_id', 'is_featured', 'published_at'])
            ->limit($limit)
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'title' => $item->title,
                    'slug' => $item->slug,
                    'category' => $item->category,
                    'excerpt' => $item->excerpt,
                    'image' => $item->image,
                    'author' => $item->author?->name ?? 'Admin',
                    'is_featured' => $item->is_featured,
                    'published_at' => $item->published_at?->toISOString(),
                    'published_at_human' => $item->published_at?->translatedFormat('d F Y'),
                ];
            });

        return response()->json(['data' => $news]);
    }

    /**
     * Public: Get single published news by slug.
     */
    public function publicShow(string $slug)
    {
        $news = News::published()
            ->with('author:id,name')
            ->where('slug', $slug)
            ->first();

        if (!$news) {
            return response()->json([
                'success' => false,
                'message' => 'Berita tidak ditemukan',
            ], 404);
        }

        return response()->json([
            'data' => [
                'id' => $news->id,
                'title' => $news->title,
                'slug' => $news->slug,
                'category' => $news->category,
                'excerpt' => $news->excerpt,
                'content' => $news->content,
                'image' => $news->image,
                'author' => $news->author?->name ?? 'Admin',
                'is_featured' => $news->is_featured,
                'published_at' => $news->published_at?->toISOString(),
                'published_at_human' => $news->published_at?->translatedFormat('d F Y'),
            ],
        ]);
    }

    /**
     * Admin: List all news (paginated).
     */
    public function index(Request $request)
    {
        $query = News::with('author:id,name')
            ->orderBy('created_at', 'desc');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('excerpt', 'like', "%{$search}%");
            });
        }

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->filled('status')) {
            if ($request->status === 'published') {
                $query->where('is_published', true);
            } elseif ($request->status === 'draft') {
                $query->where('is_published', false);
            }
        }

        $perPage = min((int) ($request->query('per_page', 20)), 100);
        $news = $query->paginate($perPage);

        return response()->json($news);
    }

    /**
     * Admin: Show single news.
     */
    public function show(News $news)
    {
        $news->load('author:id,name');

        return response()->json(['data' => $news]);
    }

    /**
     * Admin: Create news.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'category' => 'required|string|in:prestasi,kegiatan,akademik,pendaftaran,umum',
            'excerpt' => 'nullable|string|max:500',
            'content' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
            'is_featured' => 'nullable|boolean',
            'is_published' => 'nullable|boolean',
        ]);

        $slug = News::generateSlug($validated['title']);

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('news', 'public');
        }

        $isPublished = filter_var($validated['is_published'] ?? false, FILTER_VALIDATE_BOOLEAN);

        $news = News::create([
            'title' => $validated['title'],
            'slug' => $slug,
            'category' => $validated['category'],
            'excerpt' => $validated['excerpt'] ?? null,
            'content' => $validated['content'] ?? null,
            'image' => $imagePath,
            'author_id' => $request->user()->id,
            'is_featured' => filter_var($validated['is_featured'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'is_published' => $isPublished,
            'published_at' => $isPublished ? now() : null,
        ]);

        $news->load('author:id,name');

        return response()->json([
            'message' => 'Berita berhasil dibuat',
            'data' => $news,
        ], 201);
    }

    /**
     * Admin: Update news.
     */
    public function update(Request $request, News $news)
    {
        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'category' => 'sometimes|required|string|in:prestasi,kegiatan,akademik,pendaftaran,umum',
            'excerpt' => 'nullable|string|max:500',
            'content' => 'nullable|string',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:5120',
            'is_featured' => 'nullable|boolean',
            'is_published' => 'nullable|boolean',
        ]);

        if (isset($validated['title']) && $validated['title'] !== $news->title) {
            $news->slug = News::generateSlug($validated['title'], $news->id);
        }

        if ($request->hasFile('image')) {
            // Delete old image
            if ($news->image) {
                Storage::disk('public')->delete($news->image);
            }
            $news->image = $request->file('image')->store('news', 'public');
        }

        $news->title = $validated['title'] ?? $news->title;
        $news->category = $validated['category'] ?? $news->category;
        $news->excerpt = array_key_exists('excerpt', $validated) ? $validated['excerpt'] : $news->excerpt;
        $news->content = array_key_exists('content', $validated) ? $validated['content'] : $news->content;
        $news->is_featured = filter_var($validated['is_featured'] ?? $news->is_featured, FILTER_VALIDATE_BOOLEAN);

        $wasPublished = $news->is_published;
        $isPublished = filter_var($validated['is_published'] ?? $news->is_published, FILTER_VALIDATE_BOOLEAN);
        $news->is_published = $isPublished;

        // Set published_at when first published
        if ($isPublished && !$wasPublished) {
            $news->published_at = now();
        } elseif (!$isPublished) {
            $news->published_at = null;
        }

        $news->save();
        $news->load('author:id,name');

        return response()->json([
            'message' => 'Berita berhasil diperbarui',
            'data' => $news,
        ]);
    }

    /**
     * Admin: Upload gambar selipan untuk konten berita.
     */
    public function uploadContentImage(Request $request)
    {
        $request->validate([
            'image' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120',
        ]);

        $path = $request->file('image')->store('news/content', 'public');

        return response()->json([
            'message' => 'Gambar konten berhasil diunggah',
            'data' => [
                'path' => $path,
            ],
        ]);
    }

    /**
     * Admin: Delete news.
     */
    public function destroy(News $news)
    {
        if ($news->image) {
            Storage::disk('public')->delete($news->image);
        }

        $news->delete();

        return response()->json(['message' => 'Berita berhasil dihapus']);
    }
}
