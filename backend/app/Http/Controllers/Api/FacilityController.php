<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Facility;
use App\Models\FacilityPhoto;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class FacilityController extends Controller
{
    private const MAX_PHOTOS = 8;

    public function index(Request $request)
    {
        $query = Facility::with('photos');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where('name', 'like', "%{$search}%");
        }

        if ($request->has('is_active')) {
            $isActive = filter_var($request->is_active, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if (!is_null($isActive)) {
                $query->where('is_active', $isActive);
            }
        }

        $facilities = $query
            ->orderBy('display_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $facilities,
        ]);
    }

    public function publicIndex()
    {
        $facilities = Facility::with('photos')
            ->where('is_active', true)
            ->orderBy('display_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $facilities,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:facilities,name',
            'description' => 'nullable|string',
            'display_order' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
            'photos' => 'nullable|array|max:' . self::MAX_PHOTOS,
            'photos.*' => 'image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        $displayOrder = $request->has('display_order')
            ? (int) $request->display_order
            : ((int) Facility::max('display_order') + 1);

        $facility = Facility::create([
            'name' => $request->name,
            'description' => $request->description,
            'display_order' => $displayOrder,
            'is_active' => $request->is_active ?? true,
        ]);

        $files = $request->file('photos', []);
        if (!empty($files)) {
            $this->storePhotos($facility, $files);
        }

        return response()->json([
            'success' => true,
            'message' => 'Fasilitas berhasil ditambahkan',
            'data' => $facility->load('photos'),
        ], 201);
    }

    public function update(Request $request, Facility $facility)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255|unique:facilities,name,' . $facility->id,
            'description' => 'nullable|string',
            'display_order' => 'nullable|integer|min:0',
            'is_active' => 'nullable|boolean',
            'photos' => 'nullable|array|max:' . self::MAX_PHOTOS,
            'photos.*' => 'image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);

        $newFiles = $request->file('photos', []);
        $currentCount = $facility->photos()->count();
        if (!empty($newFiles) && ($currentCount + count($newFiles)) > self::MAX_PHOTOS) {
            return response()->json([
                'success' => false,
                'message' => 'Maksimal ' . self::MAX_PHOTOS . ' foto per fasilitas',
            ], 422);
        }

        if ($request->has('name')) {
            $facility->name = $request->name;
        }
        if ($request->has('description')) {
            $facility->description = $request->description;
        }
        if ($request->has('display_order')) {
            $facility->display_order = (int) $request->display_order;
        }
        if ($request->has('is_active')) {
            $facility->is_active = (bool) $request->is_active;
        }

        $facility->save();

        if (!empty($newFiles)) {
            $this->storePhotos($facility, $newFiles);
        }

        return response()->json([
            'success' => true,
            'message' => 'Fasilitas berhasil diperbarui',
            'data' => $facility->load('photos'),
        ]);
    }

    public function destroy(Facility $facility)
    {
        $facility->load('photos');
        foreach ($facility->photos as $photo) {
            if ($photo->path && Storage::disk('public')->exists($photo->path)) {
                Storage::disk('public')->delete($photo->path);
            }
        }

        $facility->delete();

        return response()->json([
            'success' => true,
            'message' => 'Fasilitas berhasil dihapus',
        ]);
    }

    public function deletePhoto(Facility $facility, FacilityPhoto $photo)
    {
        if ($photo->facility_id !== $facility->id) {
            return response()->json([
                'success' => false,
                'message' => 'Foto tidak ditemukan',
            ], 404);
        }

        if ($photo->path && Storage::disk('public')->exists($photo->path)) {
            Storage::disk('public')->delete($photo->path);
        }

        $photo->delete();

        return response()->json([
            'success' => true,
            'message' => 'Foto fasilitas berhasil dihapus',
        ]);
    }

    private function storePhotos(Facility $facility, array $files): void
    {
        $position = (int) $facility->photos()->max('position');

        foreach ($files as $file) {
            $path = $file->store('facilities', 'public');
            $position++;

            FacilityPhoto::create([
                'facility_id' => $facility->id,
                'path' => $path,
                'position' => $position,
            ]);
        }
    }
}
