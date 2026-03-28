<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SummativeScore;
use App\Models\SummativeScoreLock;
use App\Models\User;
use App\Models\Schedule;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SummativeScoreController extends Controller
{
    private function normalizeSubject(string $subject): string
    {
        return mb_strtolower(trim($subject));
    }

    private function canManageClassSubject(User $user, int $classId, string $subject): bool
    {
        if ($user->role === 'admin') {
            return true;
        }

        if ($user->role !== 'guru') {
            return false;
        }

        return Schedule::query()
            ->where('teacher_id', $user->id)
            ->where('class_id', $classId)
            ->whereRaw('LOWER(subject) = ?', [$this->normalizeSubject($subject)])
            ->exists();
    }

    private function calculate(array $sumatifItems, float $sumatifAkhir): array
    {
        $normalizedItems = array_slice(array_pad($sumatifItems, 13, null), 0, 13);
        $validItems = array_values(array_filter($normalizedItems, fn ($v) => $v !== null));

        $nilaiSumatif = count($validItems) > 0
            ? round(array_sum($validItems) / count($validItems), 2)
            : 0.0;

        $bobot70 = round($nilaiSumatif * 0.7, 2);
        $bobot30 = round($sumatifAkhir * 0.3, 2);
        $nilaiRapor = round($bobot70 + $bobot30, 2);

        return [
            'sumatif_items' => $normalizedItems,
            'nilai_sumatif' => $nilaiSumatif,
            'sumatif_akhir' => round($sumatifAkhir, 2),
            'bobot_70' => $bobot70,
            'bobot_30' => $bobot30,
            'nilai_rapor' => $nilaiRapor,
        ];
    }

    private function getLock(int $classId, string $subject, string $academicYear, string $semester): ?SummativeScoreLock
    {
        return SummativeScoreLock::query()
            ->where('class_id', $classId)
            ->whereRaw('LOWER(subject) = ?', [$this->normalizeSubject($subject)])
            ->where('academic_year', $academicYear)
            ->where('semester', $semester)
            ->with('lockedByUser:id,name')
            ->first();
    }

    private function canEdit(User $user, ?SummativeScoreLock $lock): bool
    {
        if (!$lock) {
            return true;
        }

        return $user->role === 'admin';
    }

    public function subjects(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'class_id' => 'required|integer|exists:classes,id',
        ]);

        $classId = (int) $request->input('class_id');

        $query = Schedule::query()->where('class_id', $classId);
        if ($user->role === 'guru') {
            $query->where('teacher_id', $user->id);
        }

        $subjects = $query
            ->select('subject')
            ->distinct()
            ->orderBy('subject')
            ->pluck('subject')
            ->values();

        return response()->json([
            'success' => true,
            'data' => $subjects,
        ]);
    }

    public function index(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'class_id' => 'required|integer|exists:classes,id',
            'subject' => 'required|string|max:255',
            'academic_year' => 'required|string|max:50',
            'semester' => 'required|in:ganjil,genap',
        ]);

        $classId = (int) $request->input('class_id');
        $subject = trim((string) $request->input('subject'));
        $academicYear = trim((string) $request->input('academic_year'));
        $semester = (string) $request->input('semester');

        if (!$this->canManageClassSubject($user, $classId, $subject)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak punya akses ke kelas/mapel ini',
            ], 403);
        }

        $students = User::query()
            ->where('role', 'siswa')
            ->where('class_id', $classId)
            ->orderBy('name')
            ->get(['id', 'name', 'nisn']);

        $scores = SummativeScore::query()
            ->where('class_id', $classId)
            ->whereRaw('LOWER(subject) = ?', [$this->normalizeSubject($subject)])
            ->where('academic_year', $academicYear)
            ->where('semester', $semester)
            ->get()
            ->keyBy('student_id');

        $lock = $this->getLock($classId, $subject, $academicYear, $semester);
        $canEdit = $this->canEdit($user, $lock);
        $canLock = in_array($user->role, ['admin', 'guru'], true) && !$lock;
        $canUnlock = $user->role === 'admin' && (bool) $lock;

        $data = $students->map(function (User $student) use ($scores) {
            /** @var SummativeScore|null $score */
            $score = $scores->get($student->id);

            return [
                'student_id' => $student->id,
                'student_name' => $student->name,
                'student_nis' => $student->nisn ?? '',
                'sumatif_items' => $score?->sumatif_items ?? array_fill(0, 13, null),
                'nilai_sumatif' => $score?->nilai_sumatif ?? 0,
                'sumatif_akhir' => $score?->sumatif_akhir ?? 0,
                'bobot_70' => $score?->bobot_70 ?? 0,
                'bobot_30' => $score?->bobot_30 ?? 0,
                'nilai_rapor' => $score?->nilai_rapor ?? 0,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data' => $data,
            'meta' => [
                'lock' => [
                    'locked' => (bool) $lock,
                    'locked_at' => $lock?->locked_at?->toISOString(),
                    'locked_by' => $lock?->lockedByUser ? [
                        'id' => $lock->lockedByUser->id,
                        'name' => $lock->lockedByUser->name,
                    ] : null,
                    'can_edit' => $canEdit,
                    'can_lock' => $canLock,
                    'can_unlock' => $canUnlock,
                ],
            ],
        ]);
    }

    public function bulkUpsert(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'class_id' => 'required|integer|exists:classes,id',
            'subject' => 'required|string|max:255',
            'academic_year' => 'required|string|max:50',
            'semester' => 'required|in:ganjil,genap',
            'scores' => 'required|array|min:1',
            'scores.*.student_id' => 'required|integer|exists:users,id',
            'scores.*.sumatif_items' => 'required|array|size:13',
            'scores.*.sumatif_items.*' => 'nullable|numeric|min:0|max:100',
            'scores.*.sumatif_akhir' => 'nullable|numeric|min:0|max:100',
        ]);

        $classId = (int) $request->input('class_id');
        $subject = trim((string) $request->input('subject'));
        $academicYear = trim((string) $request->input('academic_year'));
        $semester = (string) $request->input('semester');
        $scores = $request->input('scores', []);

        if (!$this->canManageClassSubject($user, $classId, $subject)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak punya akses ke kelas/mapel ini',
            ], 403);
        }

        $lock = $this->getLock($classId, $subject, $academicYear, $semester);
        if ($lock && $user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Nilai sumatif sudah difinalisasi dan dikunci. Hanya admin yang bisa mengubah.',
            ], 423);
        }

        $validStudentIds = User::query()
            ->where('role', 'siswa')
            ->where('class_id', $classId)
            ->pluck('id')
            ->all();
        $validStudentLookup = array_flip($validStudentIds);

        DB::transaction(function () use (
            $scores,
            $validStudentLookup,
            $classId,
            $user,
            $subject,
            $academicYear,
            $semester
        ) {
            foreach ($scores as $row) {
                $studentId = (int) $row['student_id'];
                if (!isset($validStudentLookup[$studentId])) {
                    continue;
                }

                $sumatifItems = array_map(
                    fn ($v) => $v === null || $v === '' ? null : (float) $v,
                    (array) ($row['sumatif_items'] ?? [])
                );
                $sumatifAkhir = (float) ($row['sumatif_akhir'] ?? 0);

                $computed = $this->calculate($sumatifItems, $sumatifAkhir);

                SummativeScore::updateOrCreate(
                    [
                        'class_id' => $classId,
                        'student_id' => $studentId,
                        'subject' => $subject,
                        'academic_year' => $academicYear,
                        'semester' => $semester,
                    ],
                    [
                        'teacher_id' => $user->id,
                        'sumatif_items' => $computed['sumatif_items'],
                        'nilai_sumatif' => $computed['nilai_sumatif'],
                        'sumatif_akhir' => $computed['sumatif_akhir'],
                        'bobot_70' => $computed['bobot_70'],
                        'bobot_30' => $computed['bobot_30'],
                        'nilai_rapor' => $computed['nilai_rapor'],
                    ]
                );
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Nilai sumatif berhasil disimpan',
        ]);
    }

    public function lock(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'class_id' => 'required|integer|exists:classes,id',
            'subject' => 'required|string|max:255',
            'academic_year' => 'required|string|max:50',
            'semester' => 'required|in:ganjil,genap',
        ]);

        $classId = (int) $request->input('class_id');
        $subject = trim((string) $request->input('subject'));
        $academicYear = trim((string) $request->input('academic_year'));
        $semester = (string) $request->input('semester');

        if (!$this->canManageClassSubject($user, $classId, $subject)) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak punya akses ke kelas/mapel ini',
            ], 403);
        }

        $existing = $this->getLock($classId, $subject, $academicYear, $semester);
        if ($existing) {
            return response()->json([
                'success' => false,
                'message' => 'Nilai sumatif sudah dalam keadaan terkunci',
            ], 422);
        }

        SummativeScoreLock::create([
            'class_id' => $classId,
            'subject' => $subject,
            'academic_year' => $academicYear,
            'semester' => $semester,
            'locked_by' => $user->id,
            'locked_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Nilai sumatif berhasil difinalisasi dan dikunci',
        ]);
    }

    public function unlock(Request $request)
    {
        $user = $request->user();

        if ($user->role !== 'admin') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya admin yang dapat membuka kunci nilai sumatif',
            ], 403);
        }

        $request->validate([
            'class_id' => 'required|integer|exists:classes,id',
            'subject' => 'required|string|max:255',
            'academic_year' => 'required|string|max:50',
            'semester' => 'required|in:ganjil,genap',
        ]);

        $classId = (int) $request->input('class_id');
        $subject = trim((string) $request->input('subject'));
        $academicYear = trim((string) $request->input('academic_year'));
        $semester = (string) $request->input('semester');

        $lock = $this->getLock($classId, $subject, $academicYear, $semester);
        if (!$lock) {
            return response()->json([
                'success' => false,
                'message' => 'Data belum dalam keadaan terkunci',
            ], 422);
        }

        $lock->delete();

        return response()->json([
            'success' => true,
            'message' => 'Kunci nilai sumatif berhasil dibuka',
        ]);
    }
}
