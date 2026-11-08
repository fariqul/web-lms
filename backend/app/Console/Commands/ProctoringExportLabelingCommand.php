<?php

namespace App\Console\Commands;

use App\Models\ProctoringCalibrationLog;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

/**
 * php artisan proctoring:export-labeling --exam=43 --exam=44
 *
 * Creates an offline labeling package from existing exam snapshots:
 *
 *   export-<timestamp>/
 *     ├── viewer.html   ← open in a browser, label frames, export CSV
 *     ├── labels.csv    ← same rows with empty gt_* columns (fallback)
 *     └── images/       ← copied snapshots (so retention cleanup cannot delete them)
 *
 * Sampling is stratified: a share of AI-flagged frames plus unflagged frames,
 * deduplicated per student per time window, with a per-student cap.
 * AI predictions are embedded in the viewer but hidden by default (blind labeling).
 */
class ProctoringExportLabelingCommand extends Command
{
    protected $signature = 'proctoring:export-labeling
                            {--exam=*             : Exam ID(s) to sample from (repeatable)}
                            {--limit=300          : Total frames in the export}
                            {--positive-ratio=0.5 : Share of AI-flagged frames (0-1)}
                            {--dedupe-seconds=12  : Keep one frame per student per window (0 = off)}
                            {--max-per-student=8  : Max frames per student}
                            {--output=            : Output directory, relative to storage/app}
                            {--seed=              : Random seed (for reproducible sampling)}
                            {--zip                : Also create a .zip archive}';

    protected $description = 'Export a sample of exam snapshots + offline HTML labeling viewer';

    private const GT_COLUMNS = [
        'gt_no_face',
        'gt_multi_face',
        'gt_head_turn',
        'gt_eye_gaze',
        'gt_object_detected',
        'gt_identity_mismatch',
    ];

    public function handle(): int
    {
        $exams = array_values(array_filter(array_map('intval', (array) $this->option('exam'))));
        if ($exams === []) {
            $this->error('Sebutkan minimal satu exam, mis. --exam=43 --exam=44');
            return Command::FAILURE;
        }

        $limit          = max(1, (int) $this->option('limit'));
        $ratio          = min(1.0, max(0.0, (float) $this->option('positive-ratio')));
        $dedupeSeconds  = max(0, (int) $this->option('dedupe-seconds'));
        $maxPerStudent  = max(1, (int) $this->option('max-per-student'));
        $seed           = $this->option('seed') !== null
            ? (int) $this->option('seed')
            : random_int(1, 1_000_000_000);

        mt_srand($seed);

        $exportId   = 'export-' . now()->format('Ymd_His') . '_seed' . $seed;
        $outputRel  = $this->option('output') ?: 'labeling/' . $exportId;
        $exportId   = basename(str_replace('\\', '/', $outputRel));
        $outDir     = storage_path('app/' . trim($outputRel, '/\\'));

        if (!is_dir($outDir . '/images') && !mkdir($outDir . '/images', 0755, true) && !is_dir($outDir . '/images')) {
            $this->error("Tidak bisa membuat direktori: {$outDir}");
            return Command::FAILURE;
        }

        $this->info('Mengambil kandidat calibration log...');

        $disk = Storage::disk('public');

        $candidates = ProctoringCalibrationLog::query()
            ->with(['student:id,name', 'snapshot:id,image_path,file_deleted_at'])
            ->whereIn('exam_id', $exams)
            ->whereNotNull('snapshot_id')
            ->whereNull('ground_truth_is_violation')
            ->get()
            ->filter(fn ($row) => $row->snapshot
                && $row->snapshot->image_path
                && $row->snapshot->file_deleted_at === null
                && $disk->exists($row->snapshot->image_path))
            ->unique('snapshot_id')
            ->values();

        if ($candidates->isEmpty()) {
            $this->warn('Tidak ada snapshot yang bisa diekspor (sudah dilabeli, file terhapus, atau exam tidak punya data).');
            return Command::SUCCESS;
        }

        $this->line("  Kandidat: {$candidates->count()} frame (setelah filter file tersedia)");

        $deduped = $this->dedupePerStudentWindow($candidates, $dedupeSeconds);
        $this->line("  Setelah dedupe {$dedupeSeconds}s: {$deduped->count()} frame");

        $capped = $this->capPerStudent($deduped, $maxPerStudent);
        $this->line("  Setelah cap {$maxPerStudent}/siswa: {$capped->count()} frame");

        $positiveAvailable = $capped->filter(fn ($r) => (bool) $r->ai_is_violation)->count();
        $negativeAvailable = $capped->count() - $positiveAvailable;
        $this->line("  Tersedia: {$positiveAvailable} flagged AI, {$negativeAvailable} tidak flagged");

        $selected = $this->balance($capped, $limit, $ratio);

        $copied  = 0;
        $missing = 0;
        $rows    = [];

        $this->info('Menyalin gambar...');

        foreach ($selected as $row) {
            $imagePath = $row->snapshot->image_path;
            $extension = strtolower(pathinfo($imagePath, PATHINFO_EXTENSION) ?: 'jpg');
            $filename  = sprintf('s%06d_l%06d.%s', $row->snapshot_id, $row->id, $extension);
            $relative  = 'images/' . $filename;
            $destination = $outDir . '/' . $relative;

            try {
                $stream = $disk->readStream($imagePath);
                if (!$stream) {
                    $missing++;
                    $this->warn("  File tidak ada: {$imagePath}");
                    continue;
                }

                $output = fopen($destination, 'wb');
                if (!$output) {
                    fclose($stream);
                    throw new \RuntimeException("tidak bisa menulis {$destination}");
                }

                stream_copy_to_stream($stream, $output);
                fclose($output);
                fclose($stream);
            } catch (\Throwable $e) {
                $missing++;
                $this->warn("  Gagal menyalin {$imagePath}: {$e->getMessage()}");
                continue;
            }

            $rows[] = ['row' => $row, 'image' => $relative];
            $copied++;
        }

        if ($rows === []) {
            $this->error('Tidak ada gambar yang berhasil disalin.');
            return Command::FAILURE;
        }

        $this->writeLabelsCsv($outDir . '/labels.csv', $rows);
        $this->writeViewer($outDir . '/viewer.html', $rows, $exportId, $exams, $seed);

        $zipPath = null;
        if ($this->option('zip')) {
            $zipPath = $this->zipDirectory($outDir, $outDir . '.zip');
        }

        $this->newLine();
        $this->info("Selesai: {$copied} frame diekspor" . ($missing > 0 ? " ({$missing} file hilang dilewati)" : ''));

        if ($copied < $limit) {
            $this->warn("Target {$limit} frame tidak terpenuhi — kandidat yang tersedia hanya {$copied}.");
        }

        $this->line('  Viewer : storage/app/' . $outputRel . '/viewer.html');
        $this->line('  CSV    : storage/app/' . $outputRel . '/labels.csv');
        if ($zipPath) {
            $this->line('  ZIP    : storage/app/' . $outputRel . '.zip');
        }
        $this->newLine();
        $this->line('  Buka viewer.html di browser (double-click), label frame, lalu Export CSV.');
        $this->line('  Import hasil label:');
        $this->line('    php artisan proctoring:import-labeling ' . $outputRel . '/labels-*.csv');
        $this->line('  Setelah import:');
        $this->line('    php artisan proctoring:calibration-report');

        return Command::SUCCESS;
    }

    /**
     * Keep at most one frame per student per time window.
     */
    private function dedupePerStudentWindow(Collection $rows, int $windowSeconds): Collection
    {
        if ($windowSeconds <= 0) {
            return $rows->values();
        }

        $deduped = collect();

        foreach ($rows->groupBy(fn ($r) => $r->exam_id . ':' . $r->student_id) as $group) {
            $sorted = $group->sortBy(fn ($r) => $r->captured_at?->getTimestamp() ?? 0)->values();
            $bucketRows    = [];
            $currentBucket = null;

            foreach ($sorted as $row) {
                $bucket = intdiv($row->captured_at?->getTimestamp() ?? 0, $windowSeconds);

                if ($currentBucket !== null && $bucket !== $currentBucket) {
                    $deduped->push($bucketRows[array_rand($bucketRows)]);
                    $bucketRows = [];
                }

                $bucketRows[]  = $row;
                $currentBucket = $bucket;
            }

            if ($bucketRows !== []) {
                $deduped->push($bucketRows[array_rand($bucketRows)]);
            }
        }

        return $deduped->values();
    }

    private function capPerStudent(Collection $rows, int $maxPerStudent): Collection
    {
        $capped = collect();

        foreach ($rows->groupBy(fn ($r) => $r->exam_id . ':' . $r->student_id) as $group) {
            $capped = $capped->merge($group->shuffle()->take($maxPerStudent));
        }

        return $capped->values();
    }

    /**
     * Take roughly `$limit * $ratio` AI-flagged frames and fill the rest with
     * unflagged frames. If one side is short, fill from the other side.
     */
    private function balance(Collection $rows, int $limit, float $ratio): Collection
    {
        $targetPositive = (int) round($limit * $ratio);
        $targetNegative = $limit - $targetPositive;

        $positive = $rows->filter(fn ($r) => (bool) $r->ai_is_violation)->shuffle()->values();
        $negative = $rows->filter(fn ($r) => !(bool) $r->ai_is_violation)->shuffle()->values();

        $pickedPositive = $positive->take($targetPositive);
        $pickedNegative = $negative->take($targetNegative);

        if ($pickedPositive->count() < $targetPositive) {
            $need = $targetPositive - $pickedPositive->count();
            $pickedNegative = $pickedNegative->merge($negative->slice($pickedNegative->count())->take($need));
        } elseif ($pickedNegative->count() < $targetNegative) {
            $need = $targetNegative - $pickedNegative->count();
            $pickedPositive = $pickedPositive->merge($positive->slice($pickedPositive->count())->take($need));
        }

        return $pickedPositive
            ->merge($pickedNegative)
            ->unique('id')
            ->take($limit)
            ->sortBy(fn ($r) => sprintf(
                '%010d:%010d:%010d',
                $r->exam_id,
                $r->student_id,
                $r->captured_at?->getTimestamp() ?? 0
            ))
            ->values();
    }

    /**
     * @param array<int, array{row: ProctoringCalibrationLog, image: string}> $rows
     */
    private function writeLabelsCsv(string $path, array $rows): void
    {
        $handle = fopen($path, 'w');
        if (!$handle) {
            throw new \RuntimeException("Tidak bisa menulis {$path}");
        }

        fputcsv($handle, array_merge(
            ['log_id', 'exam_id', 'student_id', 'snapshot_id', 'image', 'captured_at'],
            self::GT_COLUMNS
        ));

        foreach ($rows as $item) {
            $row = $item['row'];
            fputcsv($handle, array_merge([
                $row->id,
                $row->exam_id,
                $row->student_id,
                $row->snapshot_id,
                $item['image'],
                $row->captured_at?->format('Y-m-d H:i:s') ?? '',
            ], array_fill(0, count(self::GT_COLUMNS), '')));
        }

        fclose($handle);
    }

    /**
     * @param array<int, array{row: ProctoringCalibrationLog, image: string}> $rows
     * @param array<int, int> $exams
     */
    private function writeViewer(string $path, array $rows, string $exportId, array $exams, int $seed): void
    {
        $templatePath = resource_path('views/proctoring/labeling-viewer.html');
        $template     = file_get_contents($templatePath);

        if ($template === false) {
            throw new \RuntimeException("Template viewer tidak ditemukan: {$templatePath}");
        }

        $viewerRows = [];

        foreach ($rows as $item) {
            $row = $item['row'];

            $viewerRows[] = [
                'id'       => (int) $row->id,
                'image'    => $item['image'],
                'exam'     => (int) $row->exam_id,
                'student'  => (int) $row->student_id,
                'name'     => $row->student?->name ?? '',
                'snapshot' => (int) $row->snapshot_id,
                'captured' => $row->captured_at?->format('Y-m-d H:i:s') ?? '',
                'ai'       => [
                    'no_face'           => (bool) $row->ai_no_face,
                    'multi_face'        => (bool) $row->ai_multi_face,
                    'head_turn'         => (bool) $row->ai_head_turn,
                    'eye_gaze'          => (bool) $row->ai_eye_gaze,
                    'object_detected'   => (bool) $row->ai_object_detected,
                    'identity_mismatch' => (bool) $row->ai_identity_mismatch,
                    'is_violation'      => (bool) $row->ai_is_violation,
                    'risk'              => $row->risk_level,
                    'score'             => (int) $row->total_score,
                ],
            ];
        }

        $json = json_encode(
            $viewerRows,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );

        $html = str_replace(
            ['__ROWS_JSON__', '__EXPORT_ID__', '__GENERATED_AT__', '__EXAMS__', '__SEED__'],
            [
                $json,
                $exportId,
                now()->format('Y-m-d H:i:s'),
                '# ' . implode(', #', $exams),
                (string) $seed,
            ],
            $template
        );

        file_put_contents($path, $html);
    }

    private function zipDirectory(string $dir, string $zipPath): ?string
    {
        if (!class_exists(\ZipArchive::class)) {
            $this->warn('ZipArchive tidak tersedia — lewati pembuatan ZIP.');
            return null;
        }

        $zip = new \ZipArchive();
        if ($zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
            $this->warn("Tidak bisa membuat {$zipPath}");
            return null;
        }

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($files as $file) {
            if (!$file->isFile()) {
                continue;
            }

            $relative = str_replace('\\', '/', substr($file->getPathname(), strlen($dir) + 1));
            $zip->addFile($file->getPathname(), $relative);
        }

        $zip->close();

        return $zipPath;
    }
}
