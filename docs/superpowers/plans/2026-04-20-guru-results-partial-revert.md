# Guru Results Partial Revert Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengembalikan akses lihat hasil ujian+quiz untuk guru pemilik, sambil mempertahankan export hasil ujian+quiz hanya untuk admin.

**Architecture:** Kebijakan akses dipusatkan di backend (route middleware + ownership guard controller) agar direct URL tetap aman. Frontend hanya menyesuaikan UX: tampilkan tombol/halaman hasil untuk admin dan guru owner, serta sembunyikan aksi export untuk guru. TDD dipakai untuk mengunci matriks akses (admin, guru owner, guru non-owner) pada endpoint ujian, quiz, dan export.

**Tech Stack:** Laravel 11 (Sanctum, Feature Test), Next.js 16 + TypeScript, Axios service layer.

---

## File Structure & Responsibility

- `backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php`  
  Ubah menjadi test matriks akses ujian berbasis ownership (bukan admin-only total).
- `backend/tests/Feature/QuizResultsAccessTest.php` (baru)  
  Tambah test matriks akses hasil quiz dan export quiz admin-only.
- `backend/routes/api.php`  
  Ubah middleware endpoint hasil ujian ke `role:admin,guru`; paksa export quiz ke `role:admin`.
- `backend/app/Http/Controllers/Api/ExamController.php`  
  Ubah guard `results()` dan `studentResult()` dari admin-only menjadi admin-or-owner.
- `backend/app/Http/Controllers/Api/QuizController.php`  
  Tegaskan guard ownership dengan pesan konsisten Bahasa Indonesia.
- `backend/app/Http/Controllers/Api/ExportController.php`  
  Tambah hard-guard admin pada `quizResults()` (defense-in-depth).
- `src/app/ujian/page.tsx`  
  Tampilkan kembali tombol “Lihat Hasil” untuk guru (data guru sudah owner-only dari API list).
- `src/app/ujian/[id]/results/page.tsx`  
  Hapus hard-block admin-only, ganti dengan handling 403 backend.
- `src/app/ujian/[id]/hasil/[studentId]/page.tsx`  
  Hapus hard-block admin-only, pertahankan privasi snapshot hanya admin.
- `src/app/quiz/[id]/hasil/page.tsx`  
  Tambah role awareness; sembunyikan tombol export untuk non-admin; tangani 403.
- `src/app/quiz/[id]/hasil/[studentId]/page.tsx`  
  Tangani 403 agar guru non-owner di-redirect dengan pesan akses ditolak.

### Task 1: Tulis test gagal untuk matriks akses backend

**Files:**
- Modify: `backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php`
- Create: `backend/tests/Feature/QuizResultsAccessTest.php`

- [ ] **Step 1: Ubah test ujian agar mencerminkan kebijakan baru (guru owner boleh lihat, non-owner ditolak, export tetap 403)**

```php
public function test_teacher_owner_can_access_exam_results_list_and_detail(): void
{
    $classId = $this->createClassRoom('X-Results-Owner');
    $owner = $this->createUser('guru', $classId, 'teacher-owner');
    $student = $this->createUser('siswa', $classId, 'student-owner');
    $exam = $this->createExamWithResult($owner, $student, $classId);

    Sanctum::actingAs($owner);

    $this->getJson("/api/exams/{$exam->id}/results")->assertOk();
    $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")->assertOk();
}

public function test_teacher_non_owner_cannot_access_exam_results(): void
{
    $classId = $this->createClassRoom('X-Results-NonOwner');
    $owner = $this->createUser('guru', $classId, 'teacher-owner-2');
    $otherTeacher = $this->createUser('guru', $classId, 'teacher-other');
    $student = $this->createUser('siswa', $classId, 'student-non-owner');
    $exam = $this->createExamWithResult($owner, $student, $classId);

    Sanctum::actingAs($otherTeacher);

    $this->getJson("/api/exams/{$exam->id}/results")->assertStatus(403);
    $this->getJson("/api/exams/{$exam->id}/results/{$student->id}")->assertStatus(403);
}
```

- [ ] **Step 2: Buat file test hasil quiz + export quiz admin-only**

```php
<?php

namespace Tests\Feature;

use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuizResultsAccessTest extends TestCase
{
    use RefreshDatabase;

    private function createClassRoom(string $name = 'XI-Quiz-Results-Access'): int
    {
        return (int) DB::table('classes')->insertGetId([
            'name' => $name,
            'grade_level' => 'XI',
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

    private function createQuizWithResult(User $teacher, User $student, int $classId): Exam
    {
        $quiz = Exam::query()->create([
            'type' => 'quiz',
            'class_id' => $classId,
            'teacher_id' => $teacher->id,
            'title' => 'Quiz Results Ownership',
            'description' => 'Access test',
            'subject' => 'Fisika',
            'start_time' => now()->subHour(),
            'end_time' => now()->addHour(),
            'duration' => 45,
            'status' => 'active',
            'total_questions' => 0,
            'show_result' => true,
            'passing_score' => 70,
            'shuffle_questions' => false,
            'shuffle_options' => false,
            'max_violations' => 3,
        ]);

        $quiz->classes()->sync([$classId]);

        ExamResult::query()->create([
            'exam_id' => $quiz->id,
            'student_id' => $student->id,
            'status' => 'completed',
            'started_at' => now()->subMinutes(35),
            'finished_at' => now()->subMinutes(2),
            'submitted_at' => now()->subMinutes(2),
            'total_score' => 85,
            'max_score' => 100,
            'percentage' => 85,
            'violation_count' => 0,
        ]);

        return $quiz;
    }

    public function test_teacher_owner_can_access_quiz_results_and_detail(): void
    {
        $classId = $this->createClassRoom('XI-Quiz-Owner');
        $owner = $this->createUser('guru', $classId, 'quiz-owner');
        $student = $this->createUser('siswa', $classId, 'quiz-student-owner');
        $quiz = $this->createQuizWithResult($owner, $student, $classId);

        Sanctum::actingAs($owner);

        $this->getJson("/api/quizzes/{$quiz->id}/results")->assertOk();
        $this->getJson("/api/quizzes/{$quiz->id}/results/{$student->id}")->assertOk();
    }

    public function test_teacher_non_owner_cannot_access_quiz_results_and_detail(): void
    {
        $classId = $this->createClassRoom('XI-Quiz-NonOwner');
        $owner = $this->createUser('guru', $classId, 'quiz-owner-2');
        $otherTeacher = $this->createUser('guru', $classId, 'quiz-other-teacher');
        $student = $this->createUser('siswa', $classId, 'quiz-student-non-owner');
        $quiz = $this->createQuizWithResult($owner, $student, $classId);

        Sanctum::actingAs($otherTeacher);

        $this->getJson("/api/quizzes/{$quiz->id}/results")->assertStatus(403);
        $this->getJson("/api/quizzes/{$quiz->id}/results/{$student->id}")->assertStatus(403);
    }

    public function test_teacher_cannot_export_quiz_results(): void
    {
        $classId = $this->createClassRoom('XI-Quiz-Export-Guru');
        $owner = $this->createUser('guru', $classId, 'quiz-export-guru');
        $student = $this->createUser('siswa', $classId, 'quiz-export-student');
        $quiz = $this->createQuizWithResult($owner, $student, $classId);

        Sanctum::actingAs($owner);

        $this->get("/api/export/quiz-results/{$quiz->id}?format=xlsx")->assertStatus(403);
    }

    public function test_admin_can_export_quiz_results(): void
    {
        $classId = $this->createClassRoom('XI-Quiz-Export-Admin');
        $owner = $this->createUser('guru', $classId, 'quiz-owner-admin');
        $admin = $this->createUser('admin', $classId, 'quiz-admin');
        $student = $this->createUser('siswa', $classId, 'quiz-student-admin');
        $quiz = $this->createQuizWithResult($owner, $student, $classId);

        Sanctum::actingAs($admin);

        $this->get("/api/export/quiz-results/{$quiz->id}?format=xlsx")
            ->assertStatus(200);
    }
}
```

- [ ] **Step 3: Jalankan test target untuk memastikan RED sebelum implementasi**

Run:
```powershell
cd backend; php artisan test tests/Feature/ExamResultsAdminOnlyAccessTest.php tests/Feature/QuizResultsAccessTest.php
```

Expected: FAIL pada skenario guru owner akses hasil ujian (karena saat ini masih admin-only), dan/atau export quiz guru belum 403.

- [ ] **Step 4: Commit baseline test changes**

```bash
git add backend/tests/Feature/ExamResultsAdminOnlyAccessTest.php backend/tests/Feature/QuizResultsAccessTest.php
git commit -m "test: define ownership access matrix for exam and quiz results"
```

### Task 2: Implement backend authorization sesuai kebijakan final

**Files:**
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Http/Controllers/Api/ExamController.php`
- Modify: `backend/app/Http/Controllers/Api/QuizController.php`
- Modify: `backend/app/Http/Controllers/Api/ExportController.php`

- [ ] **Step 1: Ubah middleware route hasil ujian dan export quiz**

```php
// backend/routes/api.php
Route::get('/exams/{exam}/results', [ExamController::class, 'results'])->middleware('role:admin,guru');
Route::get('/exams/{exam}/results/{studentId}', [ExamController::class, 'studentResult'])->middleware('role:admin,guru');

Route::get('/export/quiz-results/{quizId}', [ExportController::class, 'quizResults'])->middleware('role:admin');
```

- [ ] **Step 2: Ubah guard controller hasil ujian ke admin-or-owner**

```php
// backend/app/Http/Controllers/Api/ExamController.php
if ($user->role !== 'admin' && $exam->teacher_id !== $user->id) {
    return response()->json([
        'success' => false,
        'message' => 'Anda tidak memiliki akses ke hasil ujian ini',
    ], 403);
}
```

- [ ] **Step 3: Tegaskan guard controller hasil quiz + pesan konsisten**

```php
// backend/app/Http/Controllers/Api/QuizController.php
if ($user->role !== 'admin' && $quiz->teacher_id !== $user->id) {
    return response()->json([
        'success' => false,
        'message' => 'Anda tidak memiliki akses ke hasil quiz ini',
    ], 403);
}
```

- [ ] **Step 4: Tambah defense-in-depth admin-only di export quiz**

```php
// backend/app/Http/Controllers/Api/ExportController.php
if ($request->user()?->role !== 'admin') {
    return response()->json([
        'success' => false,
        'message' => 'Hanya admin yang dapat mengekspor hasil quiz',
    ], 403);
}
```

- [ ] **Step 5: Jalankan ulang test target untuk memastikan GREEN**

Run:
```powershell
cd backend; php artisan test tests/Feature/ExamResultsAdminOnlyAccessTest.php tests/Feature/QuizResultsAccessTest.php
```

Expected: PASS untuk semua skenario matriks akses.

- [ ] **Step 6: Commit backend authorization changes**

```bash
git add backend/routes/api.php backend/app/Http/Controllers/Api/ExamController.php backend/app/Http/Controllers/Api/QuizController.php backend/app/Http/Controllers/Api/ExportController.php
git commit -m "feat: restore teacher-owned results access and keep exports admin-only"
```

### Task 3: Pulihkan UX hasil ujian di frontend (admin + guru owner)

**Files:**
- Modify: `src/app/ujian/page.tsx`
- Modify: `src/app/ujian/[id]/results/page.tsx`
- Modify: `src/app/ujian/[id]/hasil/[studentId]/page.tsx`

- [ ] **Step 1: Tampilkan kembali tombol “Lihat Hasil” di daftar ujian untuk guru**

```tsx
// src/app/ujian/page.tsx
{(exam.status === 'scheduled' || exam.status === 'active') && (
  <Link href={`/ujian/${exam.id}/results`} className="flex-1">
    <Button fullWidth>
      <Users className="w-4 h-4 mr-2" />
      Lihat Hasil
    </Button>
  </Link>
)}

{(exam.status === 'completed') && (
  <Link href={`/ujian/${exam.id}/results`} className="flex-1">
    <Button variant="outline" fullWidth>Lihat Hasil</Button>
  </Link>
)}
```

- [ ] **Step 2: Hapus hard-block admin-only di halaman list hasil ujian**

```tsx
// src/app/ujian/[id]/results/page.tsx
const fetchResults = useCallback(async () => {
  try {
    const response = await api.get(`/exams/${examId}/results`, { ... });
    // set state
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 403) {
      router.replace('/ujian');
      return;
    }
  } finally {
    setLoading(false);
  }
}, [examId, filterClass, router]);
```

- [ ] **Step 3: Hapus hard-block admin-only di halaman detail hasil ujian**

```tsx
// src/app/ujian/[id]/hasil/[studentId]/page.tsx
const fetchData = useCallback(async () => {
  try {
    const response = await api.get(`/exams/${examId}/results/${studentId}`);
    setResult(response.data?.data?.result ?? null);
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 403) {
      toast.error('Anda tidak memiliki akses ke hasil ujian ini');
      router.replace('/ujian');
      return;
    }
  } finally {
    setLoading(false);
  }
}, [examId, studentId, toast, router]);
```

- [ ] **Step 4: Pastikan snapshot pelanggaran tetap hanya tampil untuk admin**

```tsx
// src/app/ujian/[id]/hasil/[studentId]/page.tsx
const canViewSnapshots = user?.role === 'admin';
{canViewSnapshots && snapshots.length > 0 && (
  // panel snapshot
)}
```

- [ ] **Step 5: Jalankan lint frontend untuk area terkait**

Run:
```powershell
npm run lint
```

Expected: PASS tanpa error lint baru.

- [ ] **Step 6: Commit perubahan frontend ujian**

```bash
git add src/app/ujian/page.tsx src/app/ujian/[id]/results/page.tsx src/app/ujian/[id]/hasil/[studentId]/page.tsx
git commit -m "fix: restore exam results UI access for teacher owners"
```

### Task 4: Selaraskan UX hasil quiz dengan kebijakan export admin-only

**Files:**
- Modify: `src/app/quiz/[id]/hasil/page.tsx`
- Modify: `src/app/quiz/[id]/hasil/[studentId]/page.tsx`

- [ ] **Step 1: Tambah role awareness di halaman hasil quiz**

```tsx
// src/app/quiz/[id]/hasil/page.tsx
import { useAuth } from '@/context/AuthContext';

const { user } = useAuth();
const isAdmin = user?.role === 'admin';
```

- [ ] **Step 2: Sembunyikan tombol export untuk non-admin**

```tsx
// src/app/quiz/[id]/hasil/page.tsx
{isAdmin && (
  <div className="flex items-center gap-2">
    <Button ...>Excel</Button>
    <Button ...>PDF</Button>
  </div>
)}
```

- [ ] **Step 3: Tangani 403 pada fetch hasil quiz (redirect + toast)**

```tsx
// src/app/quiz/[id]/hasil/page.tsx
} catch (error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    toast.error('Anda tidak memiliki akses ke hasil quiz ini');
    router.replace('/quiz');
    return;
  }
  toast.error('Gagal memuat data hasil quiz');
} finally {
  setLoading(false);
}
```

- [ ] **Step 4: Tangani 403 pada detail hasil quiz siswa**

```tsx
// src/app/quiz/[id]/hasil/[studentId]/page.tsx
} catch (error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 403) {
    toast.error('Anda tidak memiliki akses ke hasil quiz ini');
    router.replace(`/quiz/${quizId}/hasil`);
    return;
  }
  toast.error('Gagal memuat data hasil quiz');
}
```

- [ ] **Step 5: Jalankan lint frontend ulang**

Run:
```powershell
npm run lint
```

Expected: PASS dan tidak ada error type/lint pada halaman quiz hasil.

- [ ] **Step 6: Commit perubahan frontend quiz**

```bash
git add src/app/quiz/[id]/hasil/page.tsx src/app/quiz/[id]/hasil/[studentId]/page.tsx
git commit -m "fix: align quiz results UI with owner access and admin-only export"
```

### Task 5: Verifikasi end-to-end dan penutupan

**Files:**
- Modify (if needed): `docs/superpowers/specs/2026-04-20-guru-results-partial-revert-design.md` (hanya jika ada deviasi)

- [ ] **Step 1: Jalankan seluruh test backend**

Run:
```powershell
cd backend; php artisan test
```

Expected: PASS, termasuk test akses hasil ujian/quiz yang baru.

- [ ] **Step 2: Jalankan build frontend**

Run:
```powershell
npm run build
```

Expected: BUILD SUCCESS tanpa error TypeScript.

- [ ] **Step 3: Verifikasi cepat manual skenario akses**

```text
1) Login admin -> bisa buka hasil ujian+quiz dan export.
2) Login guru owner -> bisa buka hasil ujian+quiz, export tidak tampil dan endpoint export = 403.
3) Login guru non-owner (direct URL) -> halaman redirect, API 403.
```

- [ ] **Step 4: Commit final (jika ada perubahan tambahan)**

```bash
git add .
git commit -m "chore: finalize partial revert of teacher results access policy"
```
