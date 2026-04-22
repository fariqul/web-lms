<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ClassRoom;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\File;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ClassController extends Controller
{
    private const CLASS_IMPORT_PREVIEW_TTL_SECONDS = 1800;

    /**
     * Display a listing of classes - OPTIMIZED
     */
    public function index(Request $request)
    {
        $query = ClassRoom::withCount('students');

        // Filter by grade level
        if ($request->has('grade_level')) {
            $query->where('grade_level', $request->grade_level);
        }

        // Search
        if ($request->has('search')) {
            $query->where('name', 'like', "%{$request->search}%");
        }

        $classes = $query->orderBy('grade_level')
            ->orderBy('name')
            ->get(['id', 'name', 'grade_level', 'academic_year']);

        return response()->json([
            'success' => true,
            'data' => $classes,
        ]);
    }

    /**
     * Store a newly created class
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:classes',
            'grade_level' => 'required|in:X,XI,XII',
            'academic_year' => 'required|string',
        ]);

        $class = ClassRoom::create([
            'name' => $request->name,
            'grade_level' => $request->grade_level,
            'academic_year' => $request->academic_year,
        ]);

        return response()->json([
            'success' => true,
            'data' => $class,
            'message' => 'Kelas berhasil ditambahkan',
        ], 201);
    }

    /**
     * Display the specified class - OPTIMIZED
     */
    public function show(ClassRoom $class)
    {
        $class->loadCount('students');
        $class->load(['students:id,class_id,name,nisn,email,photo']);

        return response()->json([
            'success' => true,
            'data' => $class,
        ]);
    }

    /**
     * Update the specified class
     */
    public function update(Request $request, ClassRoom $class)
    {
        $request->validate([
            'name' => 'sometimes|string|max:255|unique:classes,name,' . $class->id,
            'grade_level' => 'sometimes|in:X,XI,XII',
            'academic_year' => 'sometimes|string',
        ]);

        if ($request->has('name')) {
            $class->name = $request->name;
        }
        if ($request->has('grade_level')) {
            $class->grade_level = $request->grade_level;
        }
        if ($request->has('academic_year')) {
            $class->academic_year = $request->academic_year;
        }

        $class->save();

        return response()->json([
            'success' => true,
            'data' => $class,
            'message' => 'Kelas berhasil diupdate',
        ]);
    }

    /**
     * Remove the specified class
     */
    public function destroy(ClassRoom $class)
    {
        // Check if class has students
        if ($class->students()->count() > 0) {
            return response()->json([
                'success' => false,
                'message' => 'Tidak dapat menghapus kelas yang masih memiliki siswa',
            ], 422);
        }

        $class->delete();

        return response()->json([
            'success' => true,
            'message' => 'Kelas berhasil dihapus',
        ]);
    }

    /**
     * Preview class import (upsert by class name)
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
            $preview = $this->buildClassImportPreview($rows);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'File tidak dapat diproses. Pastikan format CSV/XLSX valid.',
            ], 422);
        }

        $token = (string) Str::uuid();
        Cache::put($this->classImportPreviewCacheKey($token), $preview, self::CLASS_IMPORT_PREVIEW_TTL_SECONDS);

        return response()->json([
            'success' => true,
            'message' => 'Preview import kelas berhasil dibuat',
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

    public function importConfirm(Request $request)
    {
        $request->validate([
            'preview_token' => 'required|string',
        ]);

        $cacheKey = $this->classImportPreviewCacheKey((string) $request->preview_token);
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

            $validation = $this->validateImportedClassPayload($payload, null);
            if ($validation['invalid']) {
                $skipped[] = ['row' => $item['row'] ?? null, 'message' => $validation['message']];
                continue;
            }

            $class = new ClassRoom();
            $class->name = $payload['name'];
            $class->grade_level = $payload['grade_level'];
            $class->academic_year = $payload['academic_year'];
            $class->save();
            $created++;
        }

        foreach ($preview['to_update'] ?? [] as $item) {
            $classId = (int) ($item['class_id'] ?? 0);
            $payload = $item['payload'] ?? null;
            if ($classId <= 0 || !is_array($payload)) {
                continue;
            }

            $class = ClassRoom::query()->find($classId);
            if (!$class instanceof ClassRoom) {
                $skipped[] = ['row' => $item['row'] ?? null, 'message' => 'Kelas tujuan tidak ditemukan saat konfirmasi'];
                continue;
            }

            $validation = $this->validateImportedClassPayload($payload, $class);
            if ($validation['invalid']) {
                $skipped[] = ['row' => $item['row'] ?? null, 'message' => $validation['message']];
                continue;
            }

            $class->name = $payload['name'];
            $class->grade_level = $payload['grade_level'];
            $class->academic_year = $payload['academic_year'];
            $class->save();
            $updated++;
        }

        Cache::forget($cacheKey);

        return response()->json([
            'success' => true,
            'message' => "Import kelas selesai: {$created} ditambahkan, {$updated} diupdate, " . count($skipped) . ' dilewati',
            'data' => [
                'created' => $created,
                'updated' => $updated,
                'skipped' => count($skipped),
                'errors' => array_slice($skipped, 0, 100),
            ],
        ]);
    }

    public function export(Request $request)
    {
        $request->validate([
            'format' => 'nullable|in:xlsx,csv',
            'grade_level' => 'nullable|in:X,XI,XII',
        ]);

        $format = (string) ($request->input('format') ?: 'xlsx');
        $query = ClassRoom::query()->withCount('students')->orderBy('grade_level')->orderBy('name');
        if ($request->filled('grade_level')) {
            $query->where('grade_level', $request->input('grade_level'));
        }
        $classes = $query->get(['id', 'name', 'grade_level', 'academic_year']);

        $headers = ['name', 'grade_level', 'academic_year', 'students_count'];
        $rows = $classes->map(function (ClassRoom $class): array {
            return [
                $class->name,
                $class->grade_level,
                $class->academic_year,
                (int) ($class->students_count ?? 0),
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
            }, 'classes_export_' . now()->format('Ymd_His') . '.csv', [
                'Content-Type' => 'text/csv; charset=UTF-8',
            ]);
        }

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Classes');
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
        }, 'classes_export_' . now()->format('Ymd_His') . '.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function classImportPreviewCacheKey(string $token): string
    {
        return 'import_preview:classes:' . $token;
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

        $headers = array_map(fn ($header) => strtolower(trim((string) $header)), $rawRows[0] ?? []);
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
    private function buildClassImportPreview(array $rows): array
    {
        $existingClasses = ClassRoom::query()->get(['id', 'name', 'grade_level', 'academic_year'])
            ->keyBy(fn (ClassRoom $class) => mb_strtolower(trim($class->name), 'UTF-8'));

        $toCreate = [];
        $toUpdate = [];
        $toSkip = [];
        $previewRows = [];
        $seenClassKeys = [];

        foreach ($rows as $row) {
            $rowNumber = (int) $row['row_number'];
            $data = $row['data'];

            $name = $this->pickRowValue($data, ['name', 'nama_kelas', 'kelas']);
            if ($name === '') {
                $toSkip[] = ['row' => $rowNumber, 'message' => 'Nama kelas wajib diisi'];
                continue;
            }
            $nameKey = mb_strtolower($name, 'UTF-8');
            if (isset($seenClassKeys[$nameKey])) {
                $toSkip[] = ['row' => $rowNumber, 'message' => 'Nama kelas duplikat dalam file import'];
                continue;
            }
            $seenClassKeys[$nameKey] = true;

            $existing = $existingClasses->get($nameKey);
            $gradeLevel = $this->normalizeGradeLevel($this->pickRowValue($data, ['grade_level', 'tingkat']));
            $academicYear = $this->pickRowValue($data, ['academic_year', 'tahun_ajaran']);

            $payload = [
                'name' => $name,
                'grade_level' => $gradeLevel ?: ($existing?->grade_level ?: ''),
                'academic_year' => $academicYear !== '' ? $academicYear : ($existing?->academic_year ?: ''),
            ];

            $validation = $this->validateImportedClassPayload($payload, $existing);
            if ($validation['invalid']) {
                $toSkip[] = ['row' => $rowNumber, 'message' => $validation['message']];
                continue;
            }

            if ($existing instanceof ClassRoom) {
                $toUpdate[] = [
                    'row' => $rowNumber,
                    'class_id' => $existing->id,
                    'payload' => $payload,
                ];
                $previewRows[] = [
                    'row' => $rowNumber,
                    'action' => 'update',
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
    private function validateImportedClassPayload(array $payload, ?ClassRoom $existing): array
    {
        $validator = Validator::make($payload, [
            'name' => 'required|string|max:255',
            'grade_level' => 'required|in:X,XI,XII',
            'academic_year' => 'required|string|max:255',
        ]);

        if ($validator->fails()) {
            return ['invalid' => true, 'message' => $validator->errors()->first()];
        }

        $query = ClassRoom::query()->whereRaw('LOWER(name) = ?', [mb_strtolower((string) $payload['name'], 'UTF-8')]);
        if ($existing instanceof ClassRoom) {
            $query->where('id', '!=', $existing->id);
        }
        if ($query->exists()) {
            return ['invalid' => true, 'message' => 'Nama kelas sudah digunakan'];
        }

        return ['invalid' => false, 'message' => ''];
    }

    /**
     * @param array<string,mixed> $row
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

    private function normalizeGradeLevel(string $value): string
    {
        $normalized = strtoupper(trim($value));
        if ($normalized === '10') {
            return 'X';
        }
        if ($normalized === '11') {
            return 'XI';
        }
        if ($normalized === '12') {
            return 'XII';
        }
        return $normalized;
    }
}
