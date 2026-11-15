<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MonitoringSnapshot;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SnapshotImageController extends Controller
{
    /**
     * Serve a monitoring snapshot from the private disk.
     *
     * Access is granted by the signed URL generated in MonitoringSnapshot::getImageUrlAttribute(),
     * so the browser <img> tag does not need a bearer token.
     */
    public function show(MonitoringSnapshot $snapshot): StreamedResponse
    {
        abort_if($snapshot->file_deleted_at !== null, 404);

        $path = (string) $snapshot->image_path;
        $disk = Storage::disk('local');

        abort_unless($path !== '' && $disk->exists($path), 404);

        return $disk->response($path, null, [
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
