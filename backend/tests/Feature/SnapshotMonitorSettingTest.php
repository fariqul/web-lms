<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SnapshotMonitorSettingTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Snapshot-Monitor'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createAdmin(string $suffix = 'snapshot-monitor-admin'): User
    {
        $classId = $this->createClassRoom("X-{$suffix}");

        $id = (int) DB::table('users')->insertGetId([
            'name' => "Admin {$suffix}",
            'email' => "admin-{$suffix}@example.com",
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'class_id' => $classId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::query()->findOrFail($id);
    }

    public function test_admin_toggle_snapshot_monitor_broadcasts_to_system_room(): void
    {
        Http::fake();

        Sanctum::actingAs($this->createAdmin());

        $this->putJson('/api/school-network-settings/snapshot-monitor', [
            'snapshot_monitor_enabled' => false,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.snapshot_monitor_enabled', false);

        $broadcastRequests = Http::recorded()->filter(
            fn (array $requestPair) => str_ends_with($requestPair[0]->url(), '/broadcast')
        );

        $this->assertCount(1, $broadcastRequests);

        $payload = $broadcastRequests->first()[0]->data();
        $this->assertSame('system.snapshot-monitor.updated', data_get($payload, 'event'));
        $this->assertSame('system.snapshot-monitor', data_get($payload, 'room'));
    }
}
