# Teacher Exam Results Visibility Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan toggle global di Admin > Ujian untuk mengunci/buka akses hasil ujian siswa bagi guru owner secara realtime.

**Architecture:** Status toggle disimpan di `system_settings` dengan default ON (guru diblokir). Backend tetap jadi sumber kebenaran: endpoint hasil ujian akan menolak guru saat toggle ON. Perubahan toggle dibroadcast via socket event sistem agar halaman hasil guru yang sedang terbuka langsung menampilkan pesan dan redirect tanpa refresh.

**Tech Stack:** Laravel 11 (Sanctum, Feature Test), Next.js 16 + TypeScript, Socket.io, Axios service layer.

---

## File Structure & Responsibility

- `backend/app/Models/SystemSetting.php`  
  Menyediakan getter/setter key baru `teacher_exam_results_hidden` dengan default ON.
- `backend/app/Http/Controllers/Api/ExamResultVisibilityController.php` (baru)  
  Endpoint admin-only untuk baca/update toggle + trigger broadcast.
- `backend/app/Services/SocketBroadcastService.php`  
  Menambah helper broadcast event visibility hasil ujian guru.
- `socket-server/server.js`  
  Menambah system room allowlist baru agar client bisa subscribe event visibility.
- `backend/routes/api.php`  
  Registrasi endpoint admin-only `/exam-results-visibility`.
- `backend/app/Http/Controllers/Api/ExamController.php`  
  Menambah guard setting global pada `results()` dan `studentResult()`.
- `backend/tests/Feature/ExamResultsVisibilitySettingTest.php` (baru)  
  Test toggle API admin-only + behavior guru/admin pada ON/OFF.
- `backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php`  
  Diselaraskan dengan aturan baru (default ON, guru hanya boleh jika OFF).
- `src/services/api.ts`  
  Tambah client API untuk get/update setting visibility.
- `src/app/admin/ujian/page.tsx`  
  Tambah UI toggle admin untuk on/off akses hasil guru.
- `src/app/ujian/[id]/results/page.tsx`  
  Subscribe event socket sistem, redirect guru otomatis saat toggle ON.
- `src/app/ujian/[id]/hasil/[studentId]/page.tsx`  
  Subscribe event socket sistem, redirect guru otomatis saat toggle ON.

### Task 1: Backend tests (RED) untuk aturan toggle visibility hasil ujian

**Files:**
- Create: `backend/tests/Feature/ExamResultsVisibilitySettingTest.php`
- Modify: `backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php`

- [ ] **Step 1: Tulis test baru endpoint toggle admin-only dan policy ON/OFF**

```php
<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExamResultsVisibilitySettingTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'X-Visibility'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'X',
            'academic_year' => '2026/2027',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function createUser(string $role, int $classId, string $suffix): User
    {
        $id = (int) DB::table('users')->insertGetId([
            'name' => "User {$suffix}",
            'email' => "user-{$suffix}@example.com",
            'password' => Hash::make('password123'),
            'role' => $role,
            'class_id' => $classId,
            'nisn' => $role === 'siswa' ? "NISN{$suffix}" : null,
            'nip' => $role === 'guru' ? "NIP{$suffix}" : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return User::query()->findOrFail($id);
    }

    public function test_admin_can_read_and_update_exam_results_visibility_setting(): void
    {
        Http::fake();
        $classId = $this->createClassRoom('X-Visibility-Admin');
        $admin = $this->createUser('admin', $classId, 'visibility-admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/exam-results-visibility')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.teacher_exam_results_hidden', true);

        $this->putJson('/api/exam-results-visibility', [
            'teacher_exam_results_hidden' => false,
        ])
            ->assertOk()
            ->assertJsonPath('data.teacher_exam_results_hidden', false);

        $this->assertFalse(SystemSetting::getTeacherExamResultsHidden());
    }

    public function test_non_admin_cannot_update_exam_results_visibility_setting(): void
    {
        $classId = $this->createClassRoom('X-Visibility-Guru');
        $guru = $this->createUser('guru', $classId, 'visibility-guru');
        Sanctum::actingAs($guru);

        $this->putJson('/api/exam-results-visibility', [
            'teacher_exam_results_hidden' => false,
        ])->assertStatus(403);
    }
}
```

- [ ] **Step 2: Selaraskan test akses hasil ujian existing dengan default ON**

```php
// backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php
public function test_teacher_owner_cannot_access_exam_results_when_visibility_is_hidden(): void
{
    // tanpa set toggle -> default ON
    Sanctum::actingAs($teacherOwner);
    $this->getJson("/api/exams/{$exam->id}/results")->assertStatus(403);
}

public function test_teacher_owner_can_access_exam_results_when_visibility_is_open(): void
{
    \App\Models\SystemSetting::setTeacherExamResultsHidden(false);
    Sanctum::actingAs($teacherOwner);
    $this->getJson("/api/exams/{$exam->id}/results")->assertOk();
}
```

- [ ] **Step 3: Jalankan test target untuk memastikan RED**

Run:
```powershell
cd backend
php artisan test tests/Feature/ExamResultsVisibilitySettingTest.php tests/Feature/ExamResultsAdminOnlyAccessTest.php
```

Expected: FAIL karena endpoint dan helper setting baru belum diimplementasikan.

- [ ] **Step 4: Commit perubahan test**

```bash
git add backend/tests/Feature/ExamResultsVisibilitySettingTest.php backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php
git commit -m "test: define exam results visibility toggle behavior"
```

### Task 2: Implement backend toggle API + guard + broadcast (GREEN)

**Files:**
- Modify: `backend/app/Models/SystemSetting.php`
- Create: `backend/app/Http/Controllers/Api/ExamResultVisibilityController.php`
- Modify: `backend/app/Http/Controllers/Api/ExamController.php`
- Modify: `backend/app/Services/SocketBroadcastService.php`
- Modify: `backend/routes/api.php`
- Modify: `socket-server/server.js`

- [ ] **Step 1: Tambah helper setting baru di SystemSetting dengan default ON**

```php
// backend/app/Models/SystemSetting.php
public const TEACHER_EXAM_RESULTS_HIDDEN_KEY = 'teacher_exam_results_hidden';

public static function getTeacherExamResultsHidden(): bool
{
    $cacheKey = self::cacheKey(self::TEACHER_EXAM_RESULTS_HIDDEN_KEY);

    return (bool) Cache::rememberForever($cacheKey, function () {
        try {
            $raw = self::query()
                ->where('setting_key', self::TEACHER_EXAM_RESULTS_HIDDEN_KEY)
                ->value('setting_value');
        } catch (\Throwable $e) {
            Log::warning('SystemSetting read failed, fallback teacher_exam_results_hidden=true: ' . $e->getMessage());
            return true;
        }

        if ($raw === null) return true;
        $parsed = filter_var($raw, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        return $parsed ?? true;
    });
}

public static function setTeacherExamResultsHidden(bool $hidden): void
{
    try {
        self::updateOrCreate(
            ['setting_key' => self::TEACHER_EXAM_RESULTS_HIDDEN_KEY],
            ['setting_value' => $hidden ? '1' : '0']
        );
    } catch (\Throwable $e) {
        Log::warning('SystemSetting write failed, cache only update applied: ' . $e->getMessage());
    }

    Cache::forever(self::cacheKey(self::TEACHER_EXAM_RESULTS_HIDDEN_KEY), $hidden);
}
```

- [ ] **Step 2: Tambah controller admin-only untuk get/update toggle**

```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;

class ExamResultVisibilityController extends Controller
{
    public function show()
    {
        return response()->json([
            'success' => true,
            'data' => [
                'teacher_exam_results_hidden' => SystemSetting::getTeacherExamResultsHidden(),
            ],
        ]);
    }

    public function update(Request $request)
    {
        $validated = $request->validate([
            'teacher_exam_results_hidden' => 'required|boolean',
        ]);

        $hidden = (bool) $validated['teacher_exam_results_hidden'];
        SystemSetting::setTeacherExamResultsHidden($hidden);

        app(SocketBroadcastService::class)->examResultsVisibilityUpdated([
            'teacher_exam_results_hidden' => $hidden,
            'updated_by' => $request->user()?->id,
            'updated_at' => now()->toISOString(),
        ]);

        return response()->json([
            'success' => true,
            'data' => ['teacher_exam_results_hidden' => $hidden],
            'message' => $hidden
                ? 'Akses hasil ujian guru dinonaktifkan'
                : 'Akses hasil ujian guru diaktifkan',
        ]);
    }
}
```

- [ ] **Step 3: Tambah route admin-only untuk visibility setting**

```php
// backend/routes/api.php (di grup role:admin)
Route::get('/exam-results-visibility', [ExamResultVisibilityController::class, 'show']);
Route::put('/exam-results-visibility', [ExamResultVisibilityController::class, 'update']);
```

- [ ] **Step 4: Tambah guard toggle di ExamController results + studentResult**

```php
// backend/app/Http/Controllers/Api/ExamController.php
$isAdmin = $user->role === 'admin';
$isOwnerTeacher = $user->role === 'guru' && (int) $exam->teacher_id === (int) $user->id;

if (!$isAdmin && !$isOwnerTeacher) {
    return response()->json(['success' => false, 'message' => 'Anda tidak memiliki akses ke hasil ujian ini'], 403);
}

if (!$isAdmin && \App\Models\SystemSetting::getTeacherExamResultsHidden()) {
    return response()->json([
        'success' => false,
        'message' => 'Akses hasil ujian untuk guru sedang dinonaktifkan admin',
    ], 403);
}
```

- [ ] **Step 5: Tambah method broadcast service + room allowlist socket server**

```php
// backend/app/Services/SocketBroadcastService.php
public function examResultsVisibilityUpdated(array $data): bool
{
    return $this->broadcast(
        'system.exam-results-visibility.updated',
        $data,
        'system.exam-results-visibility'
    );
}
```

```js
// socket-server/server.js
const ALLOWED_SYSTEM_ROOMS = new Set([
  'system.snapshot-monitor',
  'system.exam-results-visibility',
]);
```

- [ ] **Step 6: Jalankan test target hingga GREEN**

Run:
```powershell
cd backend
php artisan test tests/Feature/ExamResultsVisibilitySettingTest.php tests/Feature/ExamResultsAdminOnlyAccessTest.php
```

Expected: PASS.

- [ ] **Step 7: Commit implementasi backend**

```bash
git add backend/app/Models/SystemSetting.php backend/app/Http/Controllers/Api/ExamResultVisibilityController.php backend/app/Http/Controllers/Api/ExamController.php backend/app/Services/SocketBroadcastService.php backend/routes/api.php socket-server/server.js
git commit -m "feat: add admin toggle for teacher exam results visibility"
```

### Task 3: Tambah toggle UI di Admin > Ujian

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/app/admin/ujian/page.tsx`

- [ ] **Step 1: Tambah API client untuk get/update visibility setting**

```ts
// src/services/api.ts
export const examSettingsAPI = {
  getResultsVisibility: () => api.get('/exam-results-visibility'),
  updateResultsVisibility: (teacherExamResultsHidden: boolean) =>
    api.put('/exam-results-visibility', {
      teacher_exam_results_hidden: teacherExamResultsHidden,
    }),
};
```

- [ ] **Step 2: Tambah state + fetch + handler toggle di halaman admin ujian**

```tsx
// src/app/admin/ujian/page.tsx
const [teacherExamResultsHidden, setTeacherExamResultsHidden] = useState(true);
const [resultsVisibilityLoading, setResultsVisibilityLoading] = useState(true);
const [resultsVisibilitySaving, setResultsVisibilitySaving] = useState(false);

const fetchResultsVisibility = async () => {
  try {
    const response = await examSettingsAPI.getResultsVisibility();
    setTeacherExamResultsHidden(response.data?.data?.teacher_exam_results_hidden !== false);
  } finally {
    setResultsVisibilityLoading(false);
  }
};

const handleToggleResultsVisibility = async () => {
  const next = !teacherExamResultsHidden;
  setResultsVisibilitySaving(true);
  try {
    await examSettingsAPI.updateResultsVisibility(next);
    setTeacherExamResultsHidden(next);
    toast.success(next ? 'Akses hasil ujian guru dinonaktifkan' : 'Akses hasil ujian guru diaktifkan');
  } catch {
    toast.error('Gagal menyimpan pengaturan akses hasil ujian guru');
  } finally {
    setResultsVisibilitySaving(false);
  }
};
```

- [ ] **Step 3: Render card toggle di admin ujian**

```tsx
<Card>
  <CardHeader title="Kontrol Akses Hasil Ujian Guru" subtitle="Atur apakah guru bisa melihat hasil ujian siswa." />
  <div className="p-4 flex items-center justify-between">
    <div>
      <p className="font-medium text-slate-900 dark:text-white">Sembunyikan hasil ujian dari guru</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {teacherExamResultsHidden ? 'ON: Guru tidak bisa melihat hasil ujian' : 'OFF: Guru owner bisa melihat hasil ujian'}
      </p>
    </div>
    <Button
      onClick={handleToggleResultsVisibility}
      disabled={resultsVisibilityLoading || resultsVisibilitySaving}
      variant={teacherExamResultsHidden ? 'danger' : 'outline'}
    >
      {resultsVisibilitySaving ? 'Menyimpan...' : teacherExamResultsHidden ? 'ON' : 'OFF'}
    </Button>
  </div>
</Card>
```

- [ ] **Step 4: Run lint untuk validasi halaman admin**

Run:
```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit perubahan frontend admin**

```bash
git add src/services/api.ts src/app/admin/ujian/page.tsx
git commit -m "feat: add admin ujian toggle for teacher results access"
```

### Task 4: Realtime lockout di halaman hasil ujian guru (tanpa refresh)

**Files:**
- Modify: `src/app/ujian/[id]/results/page.tsx`
- Modify: `src/app/ujian/[id]/hasil/[studentId]/page.tsx`
- Modify: `src/hooks/useSocket.ts`

- [ ] **Step 1: Tambah helper socket untuk system room exam-results-visibility**

```ts
// src/hooks/useSocket.ts
export function useSystemSocket(room: 'system.snapshot-monitor' | 'system.exam-results-visibility') {
  const { emit, on, off, isConnected } = useSocket();

  useEffect(() => {
    if (!isConnected) return;
    emit('join-system', { room });
    return () => emit('leave-system', { room });
  }, [emit, room, isConnected]);

  const onExamResultsVisibilityUpdated = useCallback((callback: (data: unknown) => void) => {
    on('system.exam-results-visibility.updated', callback);
    return () => off('system.exam-results-visibility.updated');
  }, [on, off]);

  return { isConnected, onExamResultsVisibilityUpdated };
}
```

- [ ] **Step 2: Subscribe event di halaman list hasil ujian**

```tsx
// src/app/ujian/[id]/results/page.tsx
const { user } = useAuth();
const isGuru = user?.role === 'guru';
const systemSocket = useSystemSocket('system.exam-results-visibility');

useEffect(() => {
  if (!isGuru) return;
  const cleanup = systemSocket.onExamResultsVisibilityUpdated((payload: unknown) => {
    const d = payload as { teacher_exam_results_hidden?: boolean };
    if (d.teacher_exam_results_hidden) {
      toast.error('Akses hasil ujian untuk guru sedang dinonaktifkan admin');
      router.replace('/ujian');
    }
  });
  return cleanup;
}, [isGuru, systemSocket, toast, router]);
```

- [ ] **Step 3: Subscribe event di halaman detail hasil ujian siswa**

```tsx
// src/app/ujian/[id]/hasil/[studentId]/page.tsx
const isGuru = user?.role === 'guru';
const systemSocket = useSystemSocket('system.exam-results-visibility');

useEffect(() => {
  if (!isGuru) return;
  const cleanup = systemSocket.onExamResultsVisibilityUpdated((payload: unknown) => {
    const d = payload as { teacher_exam_results_hidden?: boolean };
    if (d.teacher_exam_results_hidden) {
      toast.error('Akses hasil ujian untuk guru sedang dinonaktifkan admin');
      router.replace('/ujian');
    }
  });
  return cleanup;
}, [isGuru, systemSocket, toast, router]);
```

- [ ] **Step 4: Pastikan handling 403 existing tetap aktif**

```tsx
// kedua halaman tetap mempertahankan handling:
if (status === 403) {
  toast.error('Akses hasil ujian untuk guru sedang dinonaktifkan admin');
  router.replace('/ujian');
  return;
}
```

- [ ] **Step 5: Run lint untuk validasi hooks + halaman**

Run:
```powershell
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit perubahan realtime frontend**

```bash
git add src/hooks/useSocket.ts src/app/ujian/[id]/results/page.tsx src/app/ujian/[id]/hasil/[studentId]/page.tsx
git commit -m "feat: enforce realtime guru lockout on exam results pages"
```

### Task 5: Full verification dan penyelesaian

**Files:**
- No additional files required unless fix regression.

- [ ] **Step 1: Jalankan backend test suite**

Run:
```powershell
cd backend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
php artisan key:generate --force
php artisan test
```

Expected: PASS semua test.

- [ ] **Step 2: Jalankan frontend lint + build**

Run:
```powershell
cd ..
npm run lint
npm run build
```

Expected: PASS lint dan build.

- [ ] **Step 3: Validasi manual skenario utama**

```text
1) Admin buka Admin > Ujian -> toggle ON/OFF bisa disimpan.
2) Toggle ON -> guru owner yang sedang buka /ujian/{id}/results langsung toast + redirect ke /ujian.
3) Toggle ON -> guru owner direct URL /ujian/{id}/results atau detail tetap 403.
4) Toggle OFF -> guru owner bisa akses kembali list + detail hasil ujian.
5) Admin tetap bisa akses hasil ujian kapan pun.
```

- [ ] **Step 4: Commit final jika ada penyesuaian terakhir**

```bash
git add .
git commit -m "chore: finalize teacher exam results visibility toggle rollout"
```

