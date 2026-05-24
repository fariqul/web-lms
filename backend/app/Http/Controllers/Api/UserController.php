<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\ClassRoom;
use App\Models\StudentEnrollment;
use Carbon\Carbon;
use App\Services\SocketBroadcastService;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\File;
use Illuminate\Validation\Rule;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class UserController extends Controller
{
    private const USER_IMPORT_PREVIEW_TTL_SECONDS = 1800;
    private const USER_DEFAULT_IMPORT_PASSWORD = 'Password123';

    private function broadcastBlockedForceLogout(User $user, ?string $message = null): void
    {
        if (!in_array($user->role, ['siswa', 'guru'])) {
            return;
        }

        try {
            app(SocketBroadcastService::class)->notifyUser($user->id, [
                'type' => 'force_logout',
                'reason' => 'blocked',
                'message' => $message ?: ($user->block_reason ?: 'Akun Anda diblokir oleh admin.'),
                'user_id' => $user->id,
                'timestamp' => now()->toIso8601String(),
            ]);
        } catch (\Exception $e) {
            Log::warning('Broadcast blocked force logout failed: ' . $e->getMessage(), [
                'user_id' => $user->id,
            ]);
        }
    }

    /**
     * Display a listing of users - OPTIMIZED
     */
    public function index(Request $request)
    {
        $query = User::query();

        // Filter by role
        if ($request->has('role') && $request->role !== '') {
            $query->where('role', $request->role);
        }

        // Filter by class
        if ($request->has('class_id') && $request->class_id !== '') {
            $query->where('class_id', $request->class_id);
        }

        // Filter by status (active/blocked)
        if ($request->has('status') && $request->status !== '' && $request->status !== 'all') {
            $query->where('is_blocked', $request->status === 'blocked');
        }

        // Search - uses index on name, email
        if ($request->has('search') && $request->search !== '') {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('nisn', 'like', "%{$search}%")
                    ->orWhere('nis', 'like', "%{$search}%")
                    ->orWhere('nip', 'like', "%{$search}%")
                    ->orWhere('nomor_tes', 'like', "%{$search}%");
            });
        }

        // Check if we only need the matching IDs (useful for bulk actions on filtered sets)
        if ($request->boolean('ids_only')) {
            $ids = $query->pluck('id');
            return response()->json([
                'success' => true,
                'data' => $ids,
            ]);
        }

        // Summary counts
        $totalStudents = User::where('role', 'siswa')->count();
        $blockedStudents = User::whereIn('role', ['siswa', 'guru'])->where('is_blocked', true)->count();
        $classStudentCount = 0;
        if ($request->has('class_id') && $request->class_id !== '') {
            $classStudentCount = User::where('role', 'siswa')->where('class_id', $request->class_id)->count();
        }

        // Load class relationship if not just fetching IDs
        $query->with('classRoom:id,name');

        // Sorting
        $sortBy = $request->input('sort_by', 'name');
        $sortOrder = $request->input('sort_order', 'asc');

        if (in_array($sortBy, ['name', 'nomor_tes', 'email', 'role'])) {
            if ($sortBy === 'nomor_tes') {
                $query->orderByRaw('LENGTH(nomor_tes) ' . ($sortOrder === 'desc' ? 'desc' : 'asc'))
                      ->orderBy('nomor_tes', $sortOrder === 'desc' ? 'desc' : 'asc');
            } else {
                $query->orderBy($sortBy, $sortOrder === 'desc' ? 'desc' : 'asc');
            }
        } else {
            $query->orderBy('name', 'asc');
        }

        // Pagination
        $perPage = min($request->input('per_page', 25), 100);
        $users = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $users,
            'summary' => [
                'total_students' => $totalStudents,
                'blocked_students' => $blockedStudents,
                'class_students' => $classStudentCount,
            ],
        ]);
    }

    /**
     * Store a newly created user - OPTIMIZED
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => [
                'required',
                'min:8',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/', // At least 1 lowercase, 1 uppercase, 1 number
            ],
            'role' => 'required|in:admin,guru,siswa',
            'jenis_kelamin' => 'nullable|in:L,P',
            'nisn' => 'nullable|string|unique:users',
            'nis' => 'nullable|string',
            'nip' => 'nullable|string|unique:users',
            'nomor_tes' => 'nullable|string|max:50|unique:users',
            'class_id' => 'nullable|exists:classes,id',
        ], [
            'password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        $user = new User();
        $user->fill($request->only(['name', 'email', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes', 'class_id']));
        $user->email = strtolower($request->email);
        $user->password = Hash::make($request->password);
        $user->role = $request->role;
        $user->save();

        if ($user->role === 'siswa') {
            $this->syncStudentEnrollment($user, $user->class_id);
        }

        $user->load('classRoom:id,name');

        return response()->json([
            'success' => true,
            'data' => $user,
            'message' => 'User berhasil ditambahkan',
        ], 201);
    }

    /**
     * Display the specified user - OPTIMIZED
     */
    public function show(User $user)
    {
        $user->load('classRoom:id,name');

        return response()->json([
            'success' => true,
            'data' => $user,
        ]);
    }

    /**
     * Update the specified user
     */
    public function update(Request $request, User $user)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', Rule::unique('users')->ignore($user->id)],
            'password' => [
                'sometimes',
                'min:8',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/',
            ],
            'role' => 'sometimes|in:admin,guru,siswa',
            'jenis_kelamin' => 'nullable|in:L,P',
            'nisn' => ['nullable', 'string', Rule::unique('users')->ignore($user->id)],
            'nis' => 'nullable|string',
            'nip' => ['nullable', 'string', Rule::unique('users')->ignore($user->id)],
            'nomor_tes' => ['nullable', 'string', 'max:50', Rule::unique('users')->ignore($user->id)],
            'class_id' => 'nullable|exists:classes,id',
        ], [
            'password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        $previousRole = $user->role;
        $previousClassId = $user->class_id;

        if ($request->has('name')) {
            $user->name = $request->name;
        }
        if ($request->has('jenis_kelamin')) {
            $user->jenis_kelamin = $request->jenis_kelamin;
        }
        if ($request->has('email')) {
            $user->email = strtolower($request->email);
        }
        if ($request->has('password')) {
            $user->password = Hash::make($request->password);
        }
        if ($request->has('role')) {
            $user->role = $request->role;
        }
        if ($request->has('nisn')) {
            $user->nisn = $request->nisn;
        }
        if ($request->has('nis')) {
            $user->nis = $request->nis;
        }
        if ($request->has('nip')) {
            $user->nip = $request->nip;
        }
        if ($request->has('nomor_tes')) {
            $user->nomor_tes = $request->nomor_tes;
        }
        if ($request->has('class_id')) {
            $user->class_id = $request->class_id;
        }

        $user->save();
        $user->load('classRoom:id,name');

        if ($user->role === 'siswa') {
            if ($previousRole !== 'siswa' || $previousClassId !== $user->class_id) {
                $this->syncStudentEnrollment($user, $user->class_id);
            }
        } elseif ($previousRole === 'siswa') {
            $this->syncStudentEnrollment($user, null);
        }

        return response()->json([
            'success' => true,
            'data' => $user,
            'message' => 'User berhasil diupdate',
        ]);
    }

    /**
     * Remove the specified user
     */
    public function destroy(User $user)
    {
        $user->delete();

        return response()->json([
            'success' => true,
            'message' => 'User berhasil dihapus',
        ]);
    }

    /**
     * Get students by class
     */
    public function studentsByClass($classId)
    {
        $students = User::where('role', 'siswa')
            ->whereHas('enrollments', function ($query) use ($classId) {
                $query->where('class_id', $classId)
                    ->where('is_active', true);
            })
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $students,
        ]);
    }

    /**
     * Get all teachers
     */
    public function teachers()
    {
        $teachers = User::where('role', 'guru')
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $teachers,
        ]);
    }

    /**
     * Reset user password (admin only)
     */
    public function resetPassword(Request $request, User $user)
    {
        $request->validate([
            'new_password' => [
                'required',
                'min:8',
                'regex:/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/',
            ],
        ], [
            'new_password.regex' => 'Password harus mengandung minimal 1 huruf kecil, 1 huruf besar, dan 1 angka.',
        ]);

        $user->password = Hash::make($request->new_password);
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Password berhasil direset untuk ' . $user->name,
        ]);
    }

    /**
     * Preview user import (upsert by email)
     */
    public function importPreview(Request $request)
    {
        $request->validate([
            'import_file' => ['required', File::types(['xlsx', 'csv'])->max(10 * 1024)],
        ]);

        try {
            $rows = $this->readSpreadsheetRows($request->file('import_file'));
            if (count($rows) === 0) {
                return response()->json([
                    'success' => false,
                    'message' => 'File import tidak berisi data yang dapat diproses',
                ], 422);
            }
            $preview = $this->buildUserImportPreview($rows);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'File tidak dapat diproses. Pastikan format CSV/XLSX valid.',
            ], 422);
        }

        $token = (string) Str::uuid();
        Cache::put($this->userImportPreviewCacheKey($token), $preview, self::USER_IMPORT_PREVIEW_TTL_SECONDS);

        return response()->json([
            'success' => true,
            'message' => 'Preview import berhasil dibuat',
            'data' => [
                'preview_token' => $token,
                'summary' => [
                    'total_rows' => count($rows),
                    'to_create' => count($preview['to_create']),
                    'to_update' => count($preview['to_update']),
                    'to_skip' => count($preview['to_skip']),
                ],
                'preview_rows' => array_slice($preview['preview_rows'], 0, 30),
                'errors' => $preview['to_skip'],
            ],
        ]);
    }

    /**
     * Confirm user import from preview token
     */
    public function importConfirm(Request $request)
    {
        $request->validate([
            'preview_token' => 'required|string',
        ]);

        $cacheKey = $this->userImportPreviewCacheKey((string) $request->preview_token);
        $preview = Cache::get($cacheKey);

        if (!is_array($preview)) {
            return response()->json([
                'success' => false,
                'message' => 'Preview import tidak ditemukan atau sudah kedaluwarsa',
            ], 422);
        }

        $created = 0;
        $updated = 0;
        $skipped = $preview['to_skip'] ?? [];

        foreach ($preview['to_create'] ?? [] as $item) {
            $payload = $item['payload'] ?? null;
            if (!is_array($payload)) {
                continue;
            }

            if (User::query()->where('email', $payload['email'])->exists()) {
                $skipped[] = [
                    'row' => $item['row'] ?? null,
                    'message' => 'Email sudah terpakai saat proses konfirmasi',
                ];
                continue;
            }

            $validation = $this->validateImportedUserPayload($payload, null);
            if ($validation['invalid']) {
                $skipped[] = [
                    'row' => $item['row'] ?? null,
                    'message' => $validation['message'],
                ];
                continue;
            }

            $user = new User();
            $user->fill(Arr::only($payload, ['name', 'email', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes', 'class_id']));
            $user->email = strtolower((string) $payload['email']);
            $user->role = $payload['role'];
            $user->password = Hash::make(self::USER_DEFAULT_IMPORT_PASSWORD);
            $user->save();
            if ($user->role === 'siswa') {
                $this->syncStudentEnrollment($user, $user->class_id);
            }
            $created++;
        }

        foreach ($preview['to_update'] ?? [] as $item) {
            $userId = (int) ($item['user_id'] ?? 0);
            $payload = $item['payload'] ?? null;
            if ($userId <= 0 || !is_array($payload)) {
                continue;
            }

            $user = User::query()->find($userId);
            if (!$user instanceof User) {
                $skipped[] = [
                    'row' => $item['row'] ?? null,
                    'message' => 'User tujuan tidak ditemukan saat konfirmasi',
                ];
                continue;
            }

            $validation = $this->validateImportedUserPayload($payload, $user);
            if ($validation['invalid']) {
                $skipped[] = [
                    'row' => $item['row'] ?? null,
                    'message' => $validation['message'],
                ];
                continue;
            }

            $user->fill(Arr::only($payload, ['name', 'email', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes', 'class_id']));
            $user->email = strtolower((string) $payload['email']);
            $user->role = $payload['role'];
            $user->save();
            if ($user->role === 'siswa') {
                $this->syncStudentEnrollment($user, $user->class_id);
            } else {
                $this->syncStudentEnrollment($user, null);
            }
            $updated++;
        }

        Cache::forget($cacheKey);

        return response()->json([
            'success' => true,
            'message' => "Import pengguna selesai: {$created} ditambahkan, {$updated} diupdate, " . count($skipped) . ' dilewati',
            'data' => [
                'created' => $created,
                'updated' => $updated,
                'skipped' => count($skipped),
                'errors' => array_slice($skipped, 0, 100),
            ],
        ]);
    }

    /**
     * Export users to XLSX/CSV
     */
    public function export(Request $request)
    {
        $request->validate([
            'format' => 'nullable|in:xlsx,csv',
            'role' => 'nullable|in:admin,guru,siswa',
            'class_id' => 'nullable|exists:classes,id',
        ]);

        $format = (string) ($request->input('format') ?: 'xlsx');
        $query = User::query()->with('classRoom:id,name')->orderBy('name');

        if ($request->filled('role')) {
            $query->where('role', $request->input('role'));
        }
        if ($request->filled('class_id')) {
            $query->where('class_id', $request->input('class_id'));
        }

        $users = $query->get();
        $headers = ['nama', 'email', 'role', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes', 'class_name', 'class_id'];
        $rows = $users->map(function (User $user): array {
            return [
                $user->name,
                $user->email,
                $user->role,
                $user->jenis_kelamin ?: '',
                $user->nisn ?: '',
                $user->nis ?: '',
                $user->nip ?: '',
                $user->nomor_tes ?: '',
                $user->classRoom?->name ?: '',
                $user->class_id ?: '',
            ];
        })->all();

        if ($format === 'csv') {
            return response()->streamDownload(function () use ($headers, $rows) {
                $handle = fopen('php://output', 'wb');
                fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));
                fputcsv($handle, $headers);
                foreach ($rows as $row) {
                    fputcsv($handle, $row);
                }
                fclose($handle);
            }, 'users_export_' . now()->format('Ymd_His') . '.csv', [
                'Content-Type' => 'text/csv; charset=UTF-8',
            ]);
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Users');
        foreach ($headers as $index => $header) {
            $sheet->setCellValue([$index + 1, 1], $header);
        }
        foreach ($rows as $rowIndex => $rowValues) {
            foreach ($rowValues as $columnIndex => $value) {
                $sheet->setCellValue([$columnIndex + 1, $rowIndex + 2], $value);
            }
        }

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, 'users_export_' . now()->format('Ymd_His') . '.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * Download user import template (XLSX/CSV)
     */
    public function importTemplate(Request $request)
    {
        $request->validate([
            'format' => 'nullable|in:xlsx,csv',
        ], [
            'format.in' => 'Format template harus xlsx atau csv.',
        ]);

        $format = (string) ($request->input('format') ?: 'xlsx');
        $headers = ['nama', 'email', 'role', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes', 'class_name', 'class_id'];
        $exampleRow = ['Contoh Siswa', 'contoh.siswa@example.com', 'siswa', 'L', '1234567890', '12345', '', 'TES-001', 'X IPA 1', '1'];

        if ($format === 'csv') {
            return response()->streamDownload(function () use ($headers, $exampleRow) {
                $handle = fopen('php://output', 'wb');
                fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));
                fputcsv($handle, $headers);
                fputcsv($handle, $exampleRow);
                fclose($handle);
            }, 'users_import_template.csv', [
                'Content-Type' => 'text/csv; charset=UTF-8',
            ]);
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Template Import Users');

        foreach ($headers as $index => $header) {
            $sheet->setCellValue([$index + 1, 1], $header);
        }

        foreach ($exampleRow as $index => $value) {
            $sheet->setCellValue([$index + 1, 2], $value);
        }

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, 'users_import_template.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    /**
     * Bulk import nomor_tes from Excel/CSV (by NISN lookup).
     * Expects columns: NISN + NO. TES (or nomor_tes / no_tes).
     */
    public function importNomorTes(Request $request)
    {
        $request->validate([
            'import_file' => ['required', File::types(['xlsx', 'csv'])->max(10 * 1024)],
        ]);

        try {
            $spreadsheet = IOFactory::load($request->file('import_file')->getRealPath());
            $sheet = $spreadsheet->getActiveSheet();
            $rawRows = $sheet->toArray(null, true, true, false);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'File tidak dapat diproses. Pastikan format XLSX/CSV valid.',
            ], 422);
        }

        if (count($rawRows) < 2) {
            return response()->json([
                'success' => false,
                'message' => 'File kosong atau hanya berisi header.',
            ], 422);
        }

        // Find NISN and NO TES column indexes from header row
        $headers = array_map(fn($h) => strtolower(trim((string) $h)), $rawRows[0]);
        $nisnAliases = ['nisn'];
        $noTesAliases = ['no. tes', 'no.tes', 'no tes', 'no_tes', 'nomor_tes', 'nomor tes', 'nomer_tes', 'nomer tes'];

        $nisnIdx = null;
        $noTesIdx = null;
        foreach ($headers as $idx => $header) {
            if (in_array($header, $nisnAliases)) $nisnIdx = $idx;
            if (in_array($header, $noTesAliases)) $noTesIdx = $idx;
        }

        if ($nisnIdx === null || $noTesIdx === null) {
            return response()->json([
                'success' => false,
                'message' => 'Kolom NISN dan/atau NO. TES tidak ditemukan di header file. Header yang ditemukan: ' . implode(', ', array_filter($headers)),
            ], 422);
        }

        // Build NISN -> nomor_tes map from rows
        $importMap = [];
        $duplicates = [];
        $emptyRows = 0;

        for ($i = 1; $i < count($rawRows); $i++) {
            $row = $rawRows[$i];
            $nisn = trim((string) ($row[$nisnIdx] ?? ''));
            $noTes = trim((string) ($row[$noTesIdx] ?? ''));

            if ($nisn === '' || $noTes === '') {
                $emptyRows++;
                continue;
            }

            // Normalize nomor_tes
            $noTes = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{FEFF}]+/u', '', $noTes) ?? $noTes;
            $noTes = mb_strtoupper($noTes, 'UTF-8');

            if (isset($importMap[$nisn])) {
                $duplicates[] = "Baris " . ($i + 1) . ": NISN {$nisn} duplikat";
                continue;
            }
            $importMap[$nisn] = $noTes;
        }

        if (empty($importMap)) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak ada data valid yang ditemukan. Pastikan kolom NISN dan NO. TES terisi.',
            ], 422);
        }

        // Fetch all students with matching NISNs
        $students = User::where('role', 'siswa')
            ->whereIn('nisn', array_keys($importMap))
            ->get(['id', 'nisn', 'name', 'nomor_tes']);

        $updated = 0;
        $skipped = 0;
        $notFound = [];
        $conflicts = [];

        // Check for nomor_tes uniqueness conflicts
        $allNewValues = array_values($importMap);
        $existingNomorTes = User::where('role', 'siswa')
            ->whereIn('nomor_tes', $allNewValues)
            ->whereNotIn('nisn', array_keys($importMap))
            ->pluck('nomor_tes', 'name')
            ->toArray();

        $studentsByNisn = $students->keyBy('nisn');

        foreach ($importMap as $nisn => $noTes) {
            $student = $studentsByNisn->get($nisn);

            if (!$student) {
                $notFound[] = $nisn;
                continue;
            }

            // Check conflict with students outside import set
            $conflictOwner = array_search($noTes, $existingNomorTes);
            if ($conflictOwner !== false) {
                $conflicts[] = "NISN {$nisn}: nomor tes {$noTes} sudah dipakai oleh {$conflictOwner}";
                $skipped++;
                continue;
            }

            if ($student->nomor_tes === $noTes) {
                $skipped++;
                continue;
            }

            $student->nomor_tes = $noTes;
            $student->save();
            $updated++;
        }

        $totalInFile = count($importMap);
        $message = "Import nomor tes selesai: {$updated} diupdate";
        if ($skipped > 0) $message .= ", {$skipped} dilewati";
        if (count($notFound) > 0) $message .= ", " . count($notFound) . " NISN tidak ditemukan";

        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => [
                'total_in_file' => $totalInFile,
                'updated' => $updated,
                'skipped' => $skipped,
                'not_found_count' => count($notFound),
                'not_found_nisn' => array_slice($notFound, 0, 20),
                'conflicts' => array_slice($conflicts, 0, 20),
                'duplicates' => array_slice($duplicates, 0, 10),
            ],
        ]);
    }

    /**
     * Bulk clear nomor_tes for all students (admin only)
     * Used when exam period is over
     */
    public function clearNomorTes(Request $request)
    {
        $query = User::where('role', 'siswa')->whereNotNull('nomor_tes');

        // Optionally filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        $count = $query->count();
        $query->update(['nomor_tes' => null]);

        return response()->json([
            'success' => true,
            'message' => "Nomor tes berhasil dihapus dari {$count} siswa",
            'cleared_count' => $count,
        ]);
    }

    /**
     * Bulk normalize nomor_tes for students (admin only)
     * Normalization: trim, remove hidden/space chars, uppercase.
     */
    public function normalizeNomorTes(Request $request)
    {
        $request->validate([
            'class_id' => 'nullable|exists:classes,id',
        ]);

        $query = User::query()
            ->where('role', 'siswa')
            ->whereNotNull('nomor_tes');

        if ($request->filled('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        /** @var \Illuminate\Database\Eloquent\Collection<int, User> $students */
        $students = $query->get();

        if ($students->isEmpty()) {
            return response()->json([
                'success' => true,
                'message' => 'Tidak ada nomor tes yang perlu dinormalisasi',
                'processed_count' => 0,
                'normalized_count' => 0,
                'conflict_count' => 0,
                'conflicts' => [],
            ]);
        }

        $normalizedCount = 0;
        $conflicts = [];

        foreach ($students as $student) {
            /** @var User $student */
            $normalizedValue = $this->normalizeNomorTesValue($student->nomor_tes);

            if ($normalizedValue === $student->nomor_tes) {
                continue;
            }

            if ($normalizedValue !== null) {
                $hasConflict = User::query()
                    ->where('id', '!=', $student->id)
                    ->where('nomor_tes', $normalizedValue)
                    ->exists();

                if ($hasConflict) {
                    $conflicts[] = [
                        'id' => $student->id,
                        'name' => $student->name,
                        'from' => $student->nomor_tes,
                        'to' => $normalizedValue,
                    ];
                    continue;
                }
            }

            $student->nomor_tes = $normalizedValue;
            $student->save();
            $normalizedCount++;
        }

        $conflictCount = count($conflicts);
        $scopeText = $request->filled('class_id') ? 'di kelas terpilih' : 'di seluruh siswa';
        $message = "Normalisasi nomor tes selesai {$scopeText}: {$normalizedCount} diubah";
        if ($conflictCount > 0) {
            $message .= ", {$conflictCount} konflik dilewati";
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'processed_count' => $students->count(),
            'normalized_count' => $normalizedCount,
            'conflict_count' => $conflictCount,
            // Batasi daftar konflik agar payload tetap ringan.
            'conflicts' => array_slice($conflicts, 0, 20),
        ]);
    }

    private function resolveSemester(Carbon $date): int
    {
        return $date->month >= 7 ? 1 : 2;
    }

    private function syncStudentEnrollment(User $user, ?int $classId): void
    {
        $effectiveDate = Carbon::now()->toDateString();

        $activeEnrollment = StudentEnrollment::query()
            ->where('student_id', $user->id)
            ->where('is_active', true)
            ->first();

        if ($user->role !== 'siswa') {
            if ($activeEnrollment) {
                $activeEnrollment->update([
                    'is_active' => false,
                    'end_date' => $effectiveDate,
                ]);
            }
            return;
        }

        if (!$classId) {
            if ($activeEnrollment) {
                $activeEnrollment->update([
                    'is_active' => false,
                    'end_date' => $effectiveDate,
                ]);
            }
            return;
        }

        $classRoom = ClassRoom::query()->find($classId);
        if (!$classRoom) {
            return;
        }

        if ($activeEnrollment && $activeEnrollment->class_id === $classId) {
            return;
        }

        if ($activeEnrollment) {
            $activeEnrollment->update([
                'is_active' => false,
                'end_date' => $effectiveDate,
            ]);
        }

        StudentEnrollment::create([
            'student_id' => $user->id,
            'class_id' => $classId,
            'academic_year' => $classRoom->academic_year,
            'semester' => $this->resolveSemester(Carbon::now()),
            'start_date' => $effectiveDate,
            'end_date' => null,
            'is_active' => true,
        ]);
    }

    private function normalizeNomorTesValue(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = trim((string) $value);
        $normalized = preg_replace('/[\s\x{00A0}\x{200B}-\x{200D}\x{FEFF}]+/u', '', $normalized) ?? $normalized;
        $normalized = mb_strtoupper($normalized, 'UTF-8');

        return $normalized === '' ? null : $normalized;
    }

    private function userImportPreviewCacheKey(string $token): string
    {
        return 'import_preview:users:' . $token;
    }

    /**
     * @return array<int, array{row_number:int,data:array<string,mixed>}>
     */
    private function readSpreadsheetRows(UploadedFile $file): array
    {
        $spreadsheet = IOFactory::load($file->getRealPath());
        $sheet = $spreadsheet->getActiveSheet();
        $rawRows = $sheet->toArray(null, true, true, false);

        if (count($rawRows) < 2) {
            return [];
        }

        $headers = array_map(function ($header): string {
            return strtolower(trim((string) $header));
        }, $rawRows[0] ?? []);

        $rows = [];
        for ($i = 1; $i < count($rawRows); $i++) {
            $raw = $rawRows[$i];
            $normalized = [];
            foreach ($headers as $idx => $header) {
                if ($header === '') {
                    continue;
                }
                $normalized[$header] = isset($raw[$idx]) ? trim((string) $raw[$idx]) : '';
            }
            if (count(array_filter($normalized, fn ($value) => $value !== '')) === 0) {
                continue;
            }
            $rows[] = [
                'row_number' => $i + 1,
                'data' => $normalized,
            ];
        }

        return $rows;
    }

    /**
     * @param array<int, array{row_number:int,data:array<string,mixed>}> $rows
     * @return array{to_create:array<int,mixed>,to_update:array<int,mixed>,to_skip:array<int,mixed>,preview_rows:array<int,mixed>}
     */
    private function buildUserImportPreview(array $rows): array
    {
        $classByName = ClassRoom::query()->get(['id', 'name'])
            ->keyBy(fn (ClassRoom $classRoom) => mb_strtolower(trim($classRoom->name), 'UTF-8'));

        $existingUsers = User::query()->get(['id', 'email', 'name', 'role', 'class_id', 'jenis_kelamin', 'nisn', 'nis', 'nip', 'nomor_tes'])
            ->keyBy(fn (User $user) => strtolower((string) $user->email));

        $toCreate = [];
        $toUpdate = [];
        $toSkip = [];
        $previewRows = [];
        $seenEmails = [];

        foreach ($rows as $row) {
            $rowNumber = (int) $row['row_number'];
            $data = $row['data'];

            $email = strtolower((string) $this->pickRowValue($data, ['email']));
            if ($email === '') {
                $toSkip[] = ['row' => $rowNumber, 'message' => 'Email wajib diisi'];
                continue;
            }
            if (isset($seenEmails[$email])) {
                $toSkip[] = ['row' => $rowNumber, 'message' => 'Email duplikat dalam file import'];
                continue;
            }
            $seenEmails[$email] = true;

            $existing = $existingUsers->get($email);
            $hasClassColumns = $this->rowHasAnyKey($data, ['class_id', 'class_name', 'kelas', 'nama_kelas', 'class']);
            $classResolution = $this->resolveClassId(
                $data,
                $classByName,
                $hasClassColumns,
                $existing instanceof User && $existing->class_id ? (int) $existing->class_id : null
            );
            if (!$classResolution['valid']) {
                $toSkip[] = ['row' => $rowNumber, 'message' => $classResolution['message']];
                continue;
            }

            $roleRaw = strtolower((string) $this->pickRowValue($data, ['role']));
            $role = $roleRaw !== '' ? $roleRaw : ($existing?->role ?: 'siswa');
            $name = (string) $this->pickRowValue($data, ['nama', 'name']);
            $hasGenderColumn = $this->rowHasAnyKey($data, ['jenis_kelamin', 'gender']);
            $hasNisnColumn = $this->rowHasAnyKey($data, ['nisn']);
            $hasNisColumn = $this->rowHasAnyKey($data, ['nis']);
            $hasNipColumn = $this->rowHasAnyKey($data, ['nip']);
            $hasNomorTesColumn = $this->rowHasAnyKey($data, ['nomor_tes', 'nomor tes', 'no_tes']);
            $payload = [
                'name' => $name !== '' ? $name : ($existing?->name ?: ''),
                'email' => $email,
                'role' => $role,
                'jenis_kelamin' => $hasGenderColumn
                    ? (strtoupper((string) $this->pickRowValue($data, ['jenis_kelamin', 'gender'])) ?: null)
                    : ($existing?->jenis_kelamin ?: null),
                'nisn' => $hasNisnColumn
                    ? $this->nullableString($this->pickRowValue($data, ['nisn']))
                    : ($existing?->nisn ?: null),
                'nis' => $hasNisColumn
                    ? $this->nullableString($this->pickRowValue($data, ['nis']))
                    : ($existing?->nis ?: null),
                'nip' => $hasNipColumn
                    ? $this->nullableString($this->pickRowValue($data, ['nip']))
                    : ($existing?->nip ?: null),
                'nomor_tes' => $hasNomorTesColumn
                    ? $this->nullableString($this->pickRowValue($data, ['nomor_tes', 'nomor tes', 'no_tes']))
                    : ($existing?->nomor_tes ?: null),
                'class_id' => $classResolution['class_id'],
            ];

            $validation = $this->validateImportedUserPayload($payload, $existing);
            if ($validation['invalid']) {
                $toSkip[] = ['row' => $rowNumber, 'message' => $validation['message']];
                continue;
            }

            if ($existing instanceof User) {
                $toUpdate[] = [
                    'row' => $rowNumber,
                    'user_id' => $existing->id,
                    'payload' => $payload,
                ];
                $previewRows[] = [
                    'row' => $rowNumber,
                    'action' => 'update',
                    'email' => $email,
                    'name' => $payload['name'],
                ];
            } else {
                $toCreate[] = [
                    'row' => $rowNumber,
                    'payload' => $payload,
                ];
                $previewRows[] = [
                    'row' => $rowNumber,
                    'action' => 'create',
                    'email' => $email,
                    'name' => $payload['name'],
                ];
            }
        }

        return [
            'to_create' => $toCreate,
            'to_update' => $toUpdate,
            'to_skip' => $toSkip,
            'preview_rows' => $previewRows,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{invalid:bool,message:string}
     */
    private function validateImportedUserPayload(array $payload, ?User $existingUser): array
    {
        $validator = Validator::make($payload, [
            'name' => 'required|string|max:255',
            'email' => ['required', 'email'],
            'role' => 'required|in:admin,guru,siswa',
            'jenis_kelamin' => 'nullable|in:L,P',
            'nisn' => 'nullable|string|max:255',
            'nis' => 'nullable|string|max:255',
            'nip' => 'nullable|string|max:255',
            'nomor_tes' => 'nullable|string|max:50',
            'class_id' => 'nullable|exists:classes,id',
        ]);

        if ($validator->fails()) {
            return [
                'invalid' => true,
                'message' => $validator->errors()->first(),
            ];
        }

        $userId = $existingUser?->id;
        if ($payload['nisn'] && User::query()->where('nisn', $payload['nisn'])->when($userId, fn ($q) => $q->where('id', '!=', $userId))->exists()) {
            return ['invalid' => true, 'message' => 'NISN sudah digunakan user lain'];
        }
        if ($payload['nip'] && User::query()->where('nip', $payload['nip'])->when($userId, fn ($q) => $q->where('id', '!=', $userId))->exists()) {
            return ['invalid' => true, 'message' => 'NIP sudah digunakan user lain'];
        }
        if ($payload['nomor_tes'] && User::query()->where('nomor_tes', $payload['nomor_tes'])->when($userId, fn ($q) => $q->where('id', '!=', $userId))->exists()) {
            return ['invalid' => true, 'message' => 'Nomor tes sudah digunakan user lain'];
        }

        return ['invalid' => false, 'message' => ''];
    }

    /**
     * @param array<string, mixed> $row
     */
    private function pickRowValue(array $row, array $keys): string
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row)) {
                return trim((string) $row[$key]);
            }
        }
        return '';
    }

    /**
     * @param array<string, mixed> $row
     */
    private function rowHasAnyKey(array $row, array $keys): bool
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $row)) {
                return true;
            }
        }

        return false;
    }

    private function nullableString(?string $value): ?string
    {
        $normalized = trim((string) $value);
        return $normalized === '' ? null : $normalized;
    }

    /**
     * @param array<string, mixed> $row
     * @param \Illuminate\Support\Collection<string, ClassRoom> $classByName
     * @return array{valid:bool,class_id:?int,message:string}
     */
    private function resolveClassId(array $row, $classByName, bool $hasClassColumns, ?int $existingClassId = null): array
    {
        if (!$hasClassColumns) {
            return ['valid' => true, 'class_id' => $existingClassId, 'message' => ''];
        }

        $classIdRaw = $this->pickRowValue($row, ['class_id']);
        if ($classIdRaw !== '') {
            $classId = (int) $classIdRaw;
            if (!ClassRoom::query()->where('id', $classId)->exists()) {
                return ['valid' => false, 'class_id' => null, 'message' => 'Class ID tidak ditemukan'];
            }
            return ['valid' => true, 'class_id' => $classId, 'message' => ''];
        }

        $className = $this->pickRowValue($row, ['class_name', 'kelas', 'nama_kelas', 'class']);
        if ($className === '') {
            return ['valid' => true, 'class_id' => null, 'message' => ''];
        }

        $resolved = $classByName->get(mb_strtolower($className, 'UTF-8'));
        if (!$resolved instanceof ClassRoom) {
            return ['valid' => false, 'class_id' => null, 'message' => 'Nama kelas tidak ditemukan'];
        }

        return ['valid' => true, 'class_id' => (int) $resolved->id, 'message' => ''];
    }

    /**
     * Toggle block status for a student or teacher (admin only)
     */
    public function toggleBlock(Request $request, User $user)
    {
        // Students and teachers can be blocked
        if (!in_array($user->role, ['siswa', 'guru'])) {
            return response()->json([
                'success' => false,
                'message' => 'Hanya siswa dan guru yang dapat diblokir',
            ], 400);
        }

        $request->validate([
            'is_blocked' => 'required|boolean',
            'reason' => 'nullable|string|max:500',
        ]);

        $user->is_blocked = $request->is_blocked;
        
        if ($request->is_blocked) {
            $user->block_reason = $request->reason ?: 'Diblokir oleh admin';
            $user->blocked_at = now();
        } else {
            $user->block_reason = null;
            $user->blocked_at = null;
        }

        $user->save();
        $user->load('classRoom:id,name');

        if ($request->is_blocked) {
            $this->broadcastBlockedForceLogout($user, $user->block_reason);
        }

        $action = $request->is_blocked ? 'diblokir' : 'diaktifkan kembali';
        $roleLabel = $user->role === 'guru' ? 'guru' : 'siswa';

        return response()->json([
            'success' => true,
            'data' => $user,
            'message' => "Akun {$roleLabel} {$user->name} berhasil {$action}",
        ]);
    }

    /**
     * Get all blocked students and teachers (admin only)
     */
    public function blockedStudents(Request $request)
    {
        $query = User::with('classRoom:id,name')
            ->whereIn('role', ['siswa', 'guru'])
            ->where('is_blocked', true);

        // Filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        // Search
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('nisn', 'like', "%{$search}%")
                    ->orWhere('nis', 'like', "%{$search}%");
            });
        }

        $students = $query->orderBy('blocked_at', 'desc')
            ->paginate($request->per_page ?? 15);

        return response()->json([
            'success' => true,
            'data' => $students,
        ]);
    }

    /**
     * Bulk block/unblock students (admin only)
     */
    public function bulkToggleBlock(Request $request)
    {
        $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'exists:users,id',
            'is_blocked' => 'required|boolean',
            'reason' => 'nullable|string|max:500',
        ]);

        $users = User::whereIn('id', $request->user_ids)
            ->whereIn('role', ['siswa', 'guru'])
            ->get();

        if ($users->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak ada siswa/guru yang ditemukan',
            ], 404);
        }

        $updateData = [
            'is_blocked' => $request->is_blocked,
        ];

        if ($request->is_blocked) {
            $updateData['block_reason'] = $request->reason ?: 'Diblokir oleh admin';
            $updateData['blocked_at'] = now();
        } else {
            $updateData['block_reason'] = null;
            $updateData['blocked_at'] = null;
        }

        User::whereIn('id', $users->pluck('id'))->update($updateData);

        if ($request->is_blocked) {
            $reason = $request->reason ?: 'Diblokir oleh admin';
            foreach ($users as $student) {
                if ($student instanceof User) {
                    $this->broadcastBlockedForceLogout($student, $reason);
                }
            }
        }

        $action = $request->is_blocked ? 'diblokir' : 'diaktifkan kembali';

        return response()->json([
            'success' => true,
            'message' => "{$users->count()} siswa berhasil {$action}",
            'affected_count' => $users->count(),
        ]);
    }

    /**
     * Block/unblock all student and teacher accounts at once (admin only)
     */
    public function toggleAllStudentsBlock(Request $request)
    {
        $request->validate([
            'is_blocked' => 'required|boolean',
            'reason' => 'nullable|string|max:500',
        ]);

        $users = User::whereIn('role', ['siswa', 'guru'])->get();

        if ($users->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak ada akun siswa/guru yang ditemukan',
            ], 404);
        }

        $updateData = [
            'is_blocked' => $request->is_blocked,
        ];

        if ($request->is_blocked) {
            $updateData['block_reason'] = $request->reason ?: 'Diblokir massal oleh admin';
            $updateData['blocked_at'] = now();
        } else {
            $updateData['block_reason'] = null;
            $updateData['blocked_at'] = null;
        }

        User::whereIn('role', ['siswa', 'guru'])->update($updateData);

        if ($request->is_blocked) {
            $reason = $request->reason ?: 'Diblokir massal oleh admin';
            foreach ($users as $student) {
                if ($student instanceof User) {
                    $this->broadcastBlockedForceLogout($student, $reason);
                }
            }
        }

        $action = $request->is_blocked ? 'diblokir' : 'diaktifkan kembali';

        return response()->json([
            'success' => true,
            'message' => "Semua akun siswa & guru berhasil {$action}",
            'affected_count' => $users->count(),
        ]);
    }

    /**
     * Block/unblock student and teacher accounts by class (admin only)
     */
    public function toggleStudentsBlockByClass(Request $request)
    {
        $request->validate([
            'class_id' => 'required|exists:classes,id',
            'is_blocked' => 'required|boolean',
            'reason' => 'nullable|string|max:500',
        ]);

        $users = User::whereIn('role', ['siswa', 'guru'])
            ->where('class_id', $request->class_id)
            ->get();

        if ($users->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak ada akun siswa/guru di kelas tersebut',
            ], 404);
        }

        $updateData = [
            'is_blocked' => $request->is_blocked,
        ];

        if ($request->is_blocked) {
            $updateData['block_reason'] = $request->reason ?: 'Diblokir massal per kelas oleh admin';
            $updateData['blocked_at'] = now();
        } else {
            $updateData['block_reason'] = null;
            $updateData['blocked_at'] = null;
        }

        User::whereIn('role', ['siswa', 'guru'])
            ->where('class_id', $request->class_id)
            ->update($updateData);

        if ($request->is_blocked) {
            $reason = $request->reason ?: 'Diblokir massal per kelas oleh admin';
            foreach ($users as $student) {
                if ($student instanceof User) {
                    $this->broadcastBlockedForceLogout($student, $reason);
                }
            }
        }

        $className = ClassRoom::find($request->class_id)?->name ?? 'Kelas';
        $action = $request->is_blocked ? 'diblokir' : 'diaktifkan kembali';

        return response()->json([
            'success' => true,
            'message' => "{$users->count()} siswa di {$className} berhasil {$action}",
            'affected_count' => $users->count(),
        ]);
    }

    /**
     * Block/unblock student and teacher accounts by grade level (admin only)
     */
    public function toggleStudentsBlockByGradeLevel(Request $request)
    {
        $request->validate([
            'grade_level' => 'required|in:X,XI,XII',
            'is_blocked' => 'required|boolean',
            'reason' => 'nullable|string|max:500',
        ]);

        $classIds = ClassRoom::where('grade_level', $request->grade_level)->pluck('id');

        $users = User::whereIn('role', ['siswa', 'guru'])
            ->whereIn('class_id', $classIds)
            ->get();

        if ($users->isEmpty()) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak ada akun siswa/guru di angkatan tersebut',
            ], 404);
        }

        $updateData = [
            'is_blocked' => $request->is_blocked,
        ];

        if ($request->is_blocked) {
            $updateData['block_reason'] = $request->reason ?: 'Diblokir massal per angkatan oleh admin';
            $updateData['blocked_at'] = now();
        } else {
            $updateData['block_reason'] = null;
            $updateData['blocked_at'] = null;
        }

        User::whereIn('role', ['siswa', 'guru'])
            ->whereIn('class_id', $classIds)
            ->update($updateData);

        if ($request->is_blocked) {
            $reason = $request->reason ?: 'Diblokir massal per angkatan oleh admin';
            foreach ($users as $student) {
                if ($student instanceof User) {
                    $this->broadcastBlockedForceLogout($student, $reason);
                }
            }
        }

        $action = $request->is_blocked ? 'diblokir' : 'diaktifkan kembali';

        return response()->json([
            'success' => true,
            'message' => "{$users->count()} siswa di angkatan {$request->grade_level} berhasil {$action}",
            'affected_count' => $users->count(),
        ]);
    }
}
