<?php

namespace Tests\Feature;

use App\Models\MonitoringSnapshot;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class SnapshotPrivacyTest extends TestCase
{
    use RefreshDatabase;

    private function snapshot(?string $path = 'monitoring-snapshots/exam-1/frame.jpg', ?string $contents = 'jpeg-bytes'): MonitoringSnapshot
    {
        Storage::fake('local');

        if ($path !== null && $contents !== null) {
            Storage::disk('local')->put($path, $contents);
        }

        $snapshot = new MonitoringSnapshot([
            'image_path'  => $path,
            'photo_path'  => $path,
            'captured_at' => now(),
        ]);
        $snapshot->type = 'exam';
        $snapshot->save();

        return $snapshot;
    }

    private function signedUrl(MonitoringSnapshot $snapshot): string
    {
        return URL::temporarySignedRoute(
            'monitoring-snapshots.image',
            now()->addMinutes(5),
            ['snapshot' => $snapshot->id],
        );
    }

    public function test_signed_url_streams_file_from_private_disk(): void
    {
        $snapshot = $this->snapshot();

        $response = $this->get($this->signedUrl($snapshot));

        $response->assertOk();
        $this->assertSame('jpeg-bytes', $response->streamedContent());
        $this->assertStringContainsString('private', $response->headers->get('Cache-Control'));
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
    }

    public function test_unsigned_request_is_rejected(): void
    {
        $snapshot = $this->snapshot();

        $this->get("/api/monitoring-snapshots/{$snapshot->id}/image")->assertStatus(403);
    }

    public function test_tampered_signature_is_rejected(): void
    {
        $snapshot = $this->snapshot();

        $this->get($this->signedUrl($snapshot) . '&signature=deadbeef')->assertStatus(403);
    }

    public function test_missing_file_returns_404(): void
    {
        $snapshot = $this->snapshot('monitoring-snapshots/exam-1/missing.jpg', null);

        $this->get($this->signedUrl($snapshot))->assertNotFound();
    }

    public function test_purged_snapshot_returns_404(): void
    {
        $snapshot = $this->snapshot();
        $snapshot->forceFill(['file_deleted_at' => now()])->save();

        $this->get($this->signedUrl($snapshot))->assertNotFound();
    }

    public function test_serialized_snapshot_exposes_signed_url_instead_of_public_path(): void
    {
        $snapshot = $this->snapshot();
        $payload = $snapshot->toArray();

        $this->assertArrayHasKey('image_url', $payload);
        $this->assertStringContainsString("/api/monitoring-snapshots/{$snapshot->id}/image", $payload['image_url']);
        $this->assertStringContainsString('signature=', $payload['image_url']);
        $this->assertStringNotContainsString('/storage/', $payload['image_url']);
    }
}
