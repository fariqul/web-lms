<?php

namespace App\Console\Commands;

use App\Models\ProctoringCalibrationLog;
use Illuminate\Console\Command;

/**
 * php artisan proctoring:import-labeling labels-export-xxx.csv
 *
 * Reads a labeling CSV produced by viewer.html (or labels.csv) and writes the
 * ground_truth_* columns back into proctoring_calibration_logs.
 *
 * Cell values: 1/true/ya = true, 0/false/tidak = false, empty = not labeled.
 * Empty cells never overwrite existing labels.
 * ground_truth_is_violation is derived as "any labeled indicator is true".
 */
class ProctoringImportLabelingCommand extends Command
{
    protected $signature = 'proctoring:import-labeling
                            {file : Path to labels CSV (absolute, or relative to storage/app)}
                            {--dry-run : Parse and report without writing}';

    protected $description = 'Import human labels from a labeling CSV into proctoring_calibration_logs';

    private const GT_COLUMNS = [
        'no_face'           => 'ground_truth_no_face',
        'multi_face'        => 'ground_truth_multi_face',
        'head_turn'         => 'ground_truth_head_turn',
        'eye_gaze'          => 'ground_truth_eye_gaze',
        'object_detected'   => 'ground_truth_object_detected',
        'identity_mismatch' => 'ground_truth_identity_mismatch',
    ];

    public function handle(): int
    {
        $path = $this->resolvePath((string) $this->argument('file'));

        if ($path === null) {
            $this->error('File CSV tidak ditemukan.');
            return Command::FAILURE;
        }

        $handle = fopen($path, 'r');
        if (!$handle) {
            $this->error("Tidak bisa membaca: {$path}");
            return Command::FAILURE;
        }

        $header = fgetcsv($handle);
        if (!$header) {
            fclose($handle);
            $this->error('CSV kosong.');
            return Command::FAILURE;
        }

        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
        $header    = array_map(fn ($h) => strtolower(trim((string) $h)), $header);

        $logIndex = array_search('log_id', $header, true);
        if ($logIndex === false) {
            $logIndex = array_search('id', $header, true);
        }

        if ($logIndex === false) {
            fclose($handle);
            $this->error('Kolom log_id (atau id) tidak ditemukan di header CSV.');
            return Command::FAILURE;
        }

        $columnIndexes = [];
        foreach (self::GT_COLUMNS as $short => $dbColumn) {
            foreach (["gt_{$short}", $dbColumn] as $candidate) {
                $index = array_search($candidate, $header, true);
                if ($index !== false) {
                    $columnIndexes[$short] = $index;
                    break;
                }
            }
        }

        if ($columnIndexes === []) {
            fclose($handle);
            $this->error('Tidak ada kolom gt_* di header CSV.');
            return Command::FAILURE;
        }

        $dryRun       = (bool) $this->option('dry-run');
        $rowsRead     = 0;
        $updated      = 0;
        $unchanged    = 0;
        $notFound     = 0;
        $invalidCells = 0;

        if ($dryRun) {
            $this->warn('[DRY RUN] Tidak ada yang ditulis ke database.');
        }

        while (($line = fgetcsv($handle)) !== false) {
            $rowsRead++;

            $id = (int) ($line[$logIndex] ?? 0);
            if ($id <= 0) {
                continue;
            }

            $labels = [];
            foreach ($columnIndexes as $short => $index) {
                $value = $line[$index] ?? '';
                $parsed = $this->parseBool($value);

                if ($parsed === null && trim((string) $value) !== '') {
                    $invalidCells++;
                }

                if ($parsed !== null) {
                    $labels[$short] = $parsed;
                }
            }

            if ($labels === []) {
                $unchanged++;
                continue;
            }

            $log = ProctoringCalibrationLog::find($id);
            if (!$log) {
                $notFound++;
                continue;
            }

            $updates = [];
            foreach ($labels as $short => $value) {
                $updates[self::GT_COLUMNS[$short]] = $value;
            }

            // Derive the composite from the final row state, not only this CSV,
            // so a partial re-import cannot silently flip an existing label.
            $indicators = [];
            foreach (self::GT_COLUMNS as $dbColumn) {
                $indicators[] = $updates[$dbColumn] ?? $log->{$dbColumn};
            }
            $updates['ground_truth_is_violation'] = in_array(true, $indicators, true);

            if (!$dryRun) {
                $log->update($updates);
            }

            $updated++;
        }

        fclose($handle);

        $this->newLine();
        $this->info("CSV: {$path}");
        $this->table(
            ['Baris', 'Diperbarui', 'Tanpa label', 'Log tidak ditemukan', 'Sel tidak valid'],
            [[$rowsRead, $updated, $unchanged, $notFound, $invalidCells]]
        );

        $this->line('Catatan: ground_truth_is_violation dihitung otomatis = ada indikator yang true.');
        $this->newLine();
        $this->line('Langkah berikutnya:');
        $this->line('  php artisan proctoring:calibration-report');
        $this->line('  php artisan proctoring:export-calibration --labeled-only --output=calibration-labeled.csv');

        return Command::SUCCESS;
    }

    private function resolvePath(string $file): ?string
    {
        if ($file === '') {
            return null;
        }

        if (is_file($file)) {
            return $file;
        }

        $relative = ltrim($file, '/\\');
        $candidate = storage_path('app/' . $relative);

        return is_file($candidate) ? $candidate : null;
    }

    private function parseBool(?string $value): ?bool
    {
        $value = strtolower(trim((string) $value));

        if ($value === '') {
            return null;
        }

        if (in_array($value, ['1', 'true', 'ya', 'yes', 'y'], true)) {
            return true;
        }

        if (in_array($value, ['0', 'false', 'tidak', 'no', 'n'], true)) {
            return false;
        }

        return null;
    }
}
