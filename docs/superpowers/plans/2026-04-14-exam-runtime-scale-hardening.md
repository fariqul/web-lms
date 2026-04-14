# Exam Runtime Scale Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menstabilkan ujian serentak ~600 siswa dengan memastikan toggle snapshot tetap konsisten realtime dan worker backend terpisah untuk beban proctoring.

**Architecture:** Perubahan dibagi ke tiga lapis: (1) integritas backend dan kontrak broadcast snapshot, (2) isolasi worker queue default vs proctoring agar latency endpoint ujian tetap rendah, (3) tuning runtime Apache/MySQL/Compose sesuai spek server 64GB RAM. Event snapshot-monitor dipersempit ke room khusus peserta ujian aktif untuk mengurangi broadcast global yang tidak perlu.

**Tech Stack:** Laravel 11 (PHP 8.3), MySQL 8, Socket.io (Node.js), Next.js 16 + TypeScript, Docker Compose.

---

## Scope Check

Scope ini masih satu subsystem (runtime reliability untuk ujian aktif), jadi cukup 1 plan: snapshot toggle path + queue isolation + capacity tuning.

## File Structure (target perubahan)

- `backend/tests/Feature/SnapshotMonitorSettingTest.php` — regresi API toggle snapshot + verifikasi payload broadcast room.
- `backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php` — regresi agar job analisis snapshot selalu masuk queue `proctoring`.
- `backend/app/Jobs/AnalyzeSnapshotJob.php` — set queue explicit `proctoring`.
- `backend/app/Services/SocketBroadcastService.php` — scope room event `system.snapshot-monitor.updated`.
- `backend/docker-entrypoint.sh` — split bootstrap worker pool `default` vs `proctoring`.
- `backend/.env.example` — variabel worker pool baru.
- `docker-compose.yml` — sinkron env worker pool + resource profile.
- `backend/apache-mpm.conf` — tuning prefork worker.
- `mysql/custom.cnf` — tuning connection ceiling untuk 600 siswa.
- `socket-server/server.js` — room handler `join-system`/`leave-system` untuk channel snapshot monitor.
- `src/app/ujian/[id]/page.tsx` — join room snapshot-monitor saat ujian aktif.
- `docs/SETUP_HOMESERVER.md` — dokumentasi profil 600 siswa dan variabel worker baru.

### Task 1: Tambah regresi test (harus gagal dulu)

**Files:**
- Create: `backend/tests/Feature/SnapshotMonitorSettingTest.php`
- Create: `backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php`
- Test: `backend/tests/Feature/SnapshotMonitorSettingTest.php`
- Test: `backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php`

- [ ] **Step 1: Write failing test untuk snapshot-monitor broadcast room**

```php
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

    private function createAdmin(string $suffix = 'snapshot-admin'): User
    {
        $classId = (int) DB::table('classes')->insertGetId([
            'name' => "X-{$suffix}",
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

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
        Http::fake([
            'http://socket:6001/broadcast' => Http::response(['success' => true], 200),
        ]);

        Sanctum::actingAs($this->createAdmin());

        $this->putJson('/api/school-network-settings/snapshot-monitor', [
            'snapshot_monitor_enabled' => false,
        ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.snapshot_monitor_enabled', false);

        Http::assertSent(function ($request) {
            return $request->url() === 'http://socket:6001/broadcast'
                && data_get($request->data(), 'event') === 'system.snapshot-monitor.updated'
                && data_get($request->data(), 'room') === 'system.snapshot-monitor';
        });
    }
}
```

- [ ] **Step 2: Write failing test untuk queue job proctoring**

```php
<?php

namespace Tests\Unit;

use App\Jobs\AnalyzeSnapshotJob;
use PHPUnit\Framework\TestCase;

class AnalyzeSnapshotJobQueueTest extends TestCase
{
    public function test_analyze_snapshot_job_uses_proctoring_queue(): void
    {
        $job = new AnalyzeSnapshotJob(1, 1, 1, 1);
        $this->assertSame('proctoring', $job->queue);
    }
}
```

- [ ] **Step 3: Run test untuk memastikan gagal**

Run:

```bash
cd backend
php artisan test --filter=SnapshotMonitorSettingTest
php artisan test --filter=AnalyzeSnapshotJobQueueTest
```

Expected:
1. `SnapshotMonitorSettingTest` FAIL pada assertion `room === system.snapshot-monitor` (masih `null`)
2. `AnalyzeSnapshotJobQueueTest` FAIL karena `$job->queue` belum `proctoring`

- [ ] **Step 4: Commit test baseline**

```bash
git add backend/tests/Feature/SnapshotMonitorSettingTest.php backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php
git commit -m "test: add regression coverage for snapshot room and proctoring queue"
```

### Task 2: Pisahkan worker queue default vs proctoring

**Files:**
- Modify: `backend/app/Jobs/AnalyzeSnapshotJob.php`
- Modify: `backend/docker-entrypoint.sh`
- Modify: `backend/.env.example`
- Modify: `docker-compose.yml`
- Test: `backend/tests/Unit/AnalyzeSnapshotJobQueueTest.php`

- [ ] **Step 1: Set queue explicit di AnalyzeSnapshotJob**

```php
public function __construct(
    private int $snapshotId,
    private int $examId,
    private int $studentId,
    private int $examResultId,
) {
    $this->onQueue('proctoring');
}
```

- [ ] **Step 2: Split bootstrap worker pool di docker-entrypoint**

```bash
QUEUE_WORKERS_DEFAULT_COUNT=${QUEUE_WORKERS_DEFAULT:-${QUEUE_WORKERS:-6}}
QUEUE_WORKERS_PROCTORING_COUNT=${QUEUE_WORKERS_PROCTORING:-12}

start_workers () {
    local queue_name="$1"
    local worker_count="$2"
    local i=1
    while [ "$i" -le "$worker_count" ]; do
        php artisan queue:work database --queue="${queue_name}" --sleep=${QUEUE_SLEEP:-1} --tries=${QUEUE_TRIES:-3} --max-time=${QUEUE_MAX_TIME:-300} --quiet &
        echo "Queue worker ${queue_name} #$i started"
        i=$((i + 1))
    done
}

start_workers "default" "$QUEUE_WORKERS_DEFAULT_COUNT"
start_workers "proctoring" "$QUEUE_WORKERS_PROCTORING_COUNT"
```

- [ ] **Step 3: Sinkronkan variabel env**

```dotenv
# backend/.env.example
QUEUE_WORKERS_DEFAULT=6
QUEUE_WORKERS_PROCTORING=12
QUEUE_SLEEP=1
QUEUE_TRIES=3
QUEUE_MAX_TIME=300
```

```yaml
# docker-compose.yml (service backend -> environment)
QUEUE_WORKERS_DEFAULT: ${QUEUE_WORKERS_DEFAULT:-6}
QUEUE_WORKERS_PROCTORING: ${QUEUE_WORKERS_PROCTORING:-12}
QUEUE_SLEEP: ${QUEUE_SLEEP:-1}
QUEUE_TRIES: ${QUEUE_TRIES:-3}
QUEUE_MAX_TIME: ${QUEUE_MAX_TIME:-300}
```

- [ ] **Step 4: Run targeted tests hingga pass**

Run:

```bash
cd backend
php artisan test --filter=AnalyzeSnapshotJobQueueTest
```

Expected: PASS (queue job terdeteksi `proctoring`).

- [ ] **Step 5: Commit queue split**

```bash
git add backend/app/Jobs/AnalyzeSnapshotJob.php backend/docker-entrypoint.sh backend/.env.example docker-compose.yml
git commit -m "feat: split queue workers for default and proctoring jobs"
```

### Task 3: Scope event snapshot-monitor ke room khusus ujian aktif

**Files:**
- Modify: `backend/app/Services/SocketBroadcastService.php`
- Modify: `socket-server/server.js`
- Modify: `src/app/ujian/[id]/page.tsx`
- Test: `backend/tests/Feature/SnapshotMonitorSettingTest.php`

- [ ] **Step 1: Ubah room broadcast snapshot monitor di backend service**

```php
public function snapshotMonitorUpdated(array $data): bool
{
    return $this->broadcast(
        'system.snapshot-monitor.updated',
        $data,
        'system.snapshot-monitor'
    );
}
```

- [ ] **Step 2: Tambahkan room handler system di socket server**

```js
const ALLOWED_SYSTEM_ROOMS = new Set(['system.snapshot-monitor']);

socket.on('join-system', ({ room }) => {
  if (!room || !ALLOWED_SYSTEM_ROOMS.has(room)) return;
  if (joinRoom(room)) {
    console.log(`[room] ${socket.id} joined ${room}`);
  }
});

socket.on('leave-system', ({ room }) => {
  if (!room || !ALLOWED_SYSTEM_ROOMS.has(room)) return;
  leaveRoom(room);
  console.log(`[room] ${socket.id} left ${room}`);
});
```

- [ ] **Step 3: Join/leave room snapshot-monitor dari halaman ujian siswa**

```tsx
useEffect(() => {
  if (!isStarted || !examSocket.isConnected) return;

  examSocket.emit('join-system', { room: 'system.snapshot-monitor' });
  return () => {
    examSocket.emit('leave-system', { room: 'system.snapshot-monitor' });
  };
}, [isStarted, examSocket]);
```

- [ ] **Step 4: Jalankan test feature snapshot + syntax check socket server**

Run:

```bash
cd backend
php artisan test --filter=SnapshotMonitorSettingTest
cd ..
node --check socket-server/server.js
```

Expected:
1. `SnapshotMonitorSettingTest` PASS (payload room sudah `system.snapshot-monitor`)
2. `node --check` selesai tanpa syntax error

- [ ] **Step 5: Commit room scoping**

```bash
git add backend/app/Services/SocketBroadcastService.php socket-server/server.js src/app/ujian/[id]/page.tsx
git add backend/tests/Feature/SnapshotMonitorSettingTest.php
git commit -m "feat: scope snapshot monitor events to exam system room"
```

### Task 4: Tuning kapasitas runtime + dokumentasi operasi

**Files:**
- Modify: `backend/apache-mpm.conf`
- Modify: `mysql/custom.cnf`
- Modify: `docker-compose.yml`
- Modify: `docs/SETUP_HOMESERVER.md`

- [ ] **Step 1: Terapkan profile runtime 600 siswa**

```apache
<IfModule mpm_prefork_module>
    StartServers             24
    MinSpareServers          24
    MaxSpareServers          96
    ServerLimit              384
    MaxRequestWorkers        384
    MaxConnectionsPerChild   8000
</IfModule>
```

```ini
[mysqld]
max_connections = 800
max_user_connections = 700
```

```yaml
# docker-compose.yml (resource profile)
services:
  mysql:
    deploy:
      resources:
        limits:
          memory: 24G
  backend:
    deploy:
      resources:
        limits:
          memory: 16G
  socket:
    deploy:
      resources:
        limits:
          memory: 3G
  proctoring:
    deploy:
      resources:
        limits:
          memory: 8G
```

- [ ] **Step 2: Dokumentasikan profil dan env baru di setup**

```md
## Profil Ujian Serentak 600 Siswa

- QUEUE_WORKERS_DEFAULT=6
- QUEUE_WORKERS_PROCTORING=12
- Apache MaxRequestWorkers=384
- MySQL max_connections=800

Gunakan `docker compose config` setelah update env untuk memastikan nilai terbaca benar.
```

- [ ] **Step 3: Jalankan verifikasi end-to-end**

Run:

```bash
docker compose config
cd backend
php artisan test
cd ..
npm run lint
npm run build
```

Expected:
1. `docker compose config` sukses parse
2. `php artisan test` PASS
3. `npm run lint` PASS
4. `npm run build` PASS

- [ ] **Step 4: Commit tuning + docs**

```bash
git add backend/apache-mpm.conf mysql/custom.cnf docker-compose.yml docs/SETUP_HOMESERVER.md
git commit -m "chore: tune runtime profile for 600 concurrent exam users"
```

## Catatan eksekusi

- Jalankan deployment bertahap: backend+socket terlebih dulu, lalu mysql restart pada maintenance window agar perubahan MySQL config aman.
- Jika load test menunjukkan backlog proctoring > 2 menit, naikkan `QUEUE_WORKERS_PROCTORING` bertahap (+2) tanpa menaikkan `QUEUE_WORKERS_DEFAULT`.
- Jangan menonaktifkan snapshot monitor sebagai solusi permanen; gunakan hanya saat insiden infrastruktur dan aktifkan kembali setelah stabil.
