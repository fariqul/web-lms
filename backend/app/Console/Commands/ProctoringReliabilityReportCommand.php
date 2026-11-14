<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * php artisan proctoring:reliability-report a.csv b.csv
 *
 * Compares two reanalyze-experiment CSVs trial-by-trial and reports per-category
 * agreement, Cohen's kappa and McNemar exact p-value. Read-only.
 */
class ProctoringReliabilityReportCommand extends Command
{
    protected $signature = 'proctoring:reliability-report
                            {csv-a : CSV reanalyze sesi A (absolut atau relatif storage/app)}
                            {csv-b : CSV reanalyze sesi B}
                            {--output= : Path CSV hasil (default reliability/reliability-report-WAKTU.csv)}';

    protected $description = 'Hitung konsistensi prediksi antar dua CSV reanalyse (agreement, Cohen kappa, McNemar)';

    private const CATEGORIES = [
        'no_face' => ['label' => 'Tanpa Wajah', 'column' => 'pred_no_face'],
        'multi_face_person_or_face' => ['label' => 'Wajah Ganda (person_or_face)', 'column' => 'pred_multi_face_person_or_face'],
        'multi_face_face_only' => ['label' => 'Wajah Ganda (face_only)', 'column' => 'pred_multi_face_face_only'],
        'phone' => ['label' => 'HP', 'column' => 'pred_phone'],
        'book' => ['label' => 'Buku', 'column' => 'pred_book'],
        'head_turn' => ['label' => 'Kepala Menoleh', 'column' => 'pred_head_turn'],
        'eye_gaze_away' => ['label' => 'Mata Menyimpang', 'column' => 'pred_eye_gaze_away'],
        'identity_mismatch' => ['label' => 'Identitas Tidak Cocok', 'column' => 'pred_identity_mismatch'],
    ];

    public function handle(): int
    {
        $pathA = $this->resolvePath((string) $this->argument('csv-a'));
        $pathB = $this->resolvePath((string) $this->argument('csv-b'));

        if ($pathA === null || $pathB === null) {
            $this->error('File CSV tidak ditemukan.');

            return Command::FAILURE;
        }

        $rowsA = $this->readCsv($pathA);
        $rowsB = $this->readCsv($pathB);

        if ($rowsA === null || $rowsB === null) {
            return Command::FAILURE;
        }

        if ($rowsA === [] || $rowsB === []) {
            $this->error('Salah satu CSV tidak berisi baris trial.');

            return Command::FAILURE;
        }

        $this->line("CSV A: {$pathA} (".count($rowsA).' trial)');
        $this->line("CSV B: {$pathB} (".count($rowsB).' trial)');

        $shared = array_values(array_intersect(array_keys($rowsA), array_keys($rowsB)));
        $onlyA = array_values(array_diff(array_keys($rowsA), array_keys($rowsB)));
        $onlyB = array_values(array_diff(array_keys($rowsB), array_keys($rowsA)));

        if ($shared === []) {
            $this->error('Tidak ada trial_number yang sama di kedua CSV — tidak ada pasangan untuk dibandingkan.');

            return Command::FAILURE;
        }

        $this->line(sprintf(
            'Pasangan trial: %d | hanya di A: %d | hanya di B: %d',
            count($shared),
            count($onlyA),
            count($onlyB)
        ));

        $available = array_filter(
            self::CATEGORIES,
            fn (array $meta): bool => $this->hasColumn($rowsA, $meta['column'])
                && $this->hasColumn($rowsB, $meta['column'])
        );

        if ($available === []) {
            $this->error('Tidak ada kolom pred_* yang sama di kedua CSV.');

            return Command::FAILURE;
        }

        $missing = array_diff_key(self::CATEGORIES, $available);
        foreach ($missing as $meta) {
            $this->warn("Kolom {$meta['column']} tidak ada di salah satu CSV — kategori dilewati.");
        }

        $csvRows = [];
        $table = [];

        foreach ($available as $key => $meta) {
            $stats = $this->compare($rowsA, $rowsB, $shared, $meta['column']);

            if ($stats['pairs'] === 0) {
                $this->warn("Tidak ada pasangan nilai untuk {$meta['label']} — kategori dilewati.");

                continue;
            }

            $table[] = [
                $meta['label'],
                $stats['pairs'],
                $stats['both_true'],
                $stats['both_false'],
                $stats['a_only'],
                $stats['b_only'],
                $this->fmtPercent($stats['agreement']),
                $this->fmtNum($stats['kappa']),
                $this->fmtP($stats['mcnemar_p']),
                $stats['pos_a'].'/'.$stats['pos_b'],
            ];

            $csvRows[] = array_merge(['category' => $key], $stats);
        }

        if ($csvRows === []) {
            $this->error('Tidak ada kategori yang bisa dihitung.');

            return Command::FAILURE;
        }

        $this->newLine();
        $this->table(
            ['Kategori', 'n', 'Sama +', 'Sama −', 'A saja', 'B saja', 'Agreement', 'κ', 'McNemar p', 'Pos A/B'],
            $table
        );

        $this->line('Agreement = (Sama + dan Sama −) / n. McNemar exact dua sisi dari pasangan tidak sepakat (A saja vs B saja).');

        $output = (string) ($this->option('output')
            ?: 'reliability/reliability-report-'.now()->format('YmdHis').'.csv');
        $absolute = $this->writeCsv($output, $csvRows);
        if ($absolute !== null) {
            $this->newLine();
            $this->info("CSV: {$absolute}");
        }

        return Command::SUCCESS;
    }

    /**
     * @return array<int, array<string, string>>|null
     */
    private function readCsv(string $path): ?array
    {
        $handle = fopen($path, 'r');
        if (! $handle) {
            $this->error("Tidak bisa membaca: {$path}");

            return null;
        }

        $header = fgetcsv($handle);
        if (! $header) {
            fclose($handle);
            $this->error("CSV kosong: {$path}");

            return null;
        }

        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
        $header = array_map(fn ($h) => strtolower(trim((string) $h)), $header);

        if (! in_array('trial_number', $header, true)) {
            fclose($handle);
            $this->error("Kolom trial_number tidak ditemukan di {$path}.");

            return null;
        }

        $rows = [];
        $duplicates = 0;

        while (($line = fgetcsv($handle)) !== false) {
            if ($line === [null] || $line === []) {
                continue;
            }

            $row = array_combine($header, array_slice(array_pad($line, count($header), ''), 0, count($header)));

            $number = (int) ($row['trial_number'] ?? 0);
            if ($number <= 0) {
                continue;
            }

            if (isset($rows[$number])) {
                $duplicates++;

                continue;
            }

            $rows[$number] = $row;
        }

        fclose($handle);

        if ($duplicates > 0) {
            $this->warn(basename($path).": {$duplicates} trial_number duplikat — baris pertama dipakai.");
        }

        return $rows;
    }

    /**
     * @param  array<int, array<string, string>>  $rowsA
     * @param  array<int, array<string, string>>  $rowsB
     * @param  array<int, int>  $shared
     * @return array{pairs:int,both_true:int,both_false:int,a_only:int,b_only:int,agreement:float,kappa:?float,mcnemar_p:?float,pos_a:int,pos_b:int}
     */
    private function compare(array $rowsA, array $rowsB, array $shared, string $column): array
    {
        $bothTrue = $bothFalse = $aOnly = $bOnly = 0;

        foreach ($shared as $number) {
            $a = $this->parseBool($rowsA[$number][$column] ?? '');
            $b = $this->parseBool($rowsB[$number][$column] ?? '');

            if ($a === null || $b === null) {
                continue;
            }

            if ($a && $b) {
                $bothTrue++;
            } elseif (! $a && ! $b) {
                $bothFalse++;
            } elseif ($a) {
                $aOnly++;
            } else {
                $bOnly++;
            }
        }

        $pairs = $bothTrue + $bothFalse + $aOnly + $bOnly;
        $agreement = $pairs > 0 ? ($bothTrue + $bothFalse) / $pairs : null;

        return [
            'pairs' => $pairs,
            'both_true' => $bothTrue,
            'both_false' => $bothFalse,
            'a_only' => $aOnly,
            'b_only' => $bOnly,
            'agreement' => $agreement !== null ? round($agreement, 4) : 0.0,
            'kappa' => $this->kappa($bothTrue, $bothFalse, $aOnly, $bOnly),
            'mcnemar_p' => $this->mcnemarP($aOnly, $bOnly),
            'pos_a' => $bothTrue + $aOnly,
            'pos_b' => $bothTrue + $bOnly,
        ];
    }

    private function kappa(int $a, int $d, int $b, int $c): ?float
    {
        $n = $a + $b + $c + $d;
        if ($n === 0) {
            return null;
        }

        $po = ($a + $d) / $n;
        $pe = ((($a + $b) / $n) * (($a + $c) / $n))
            + ((($c + $d) / $n) * (($b + $d) / $n));

        if (abs(1 - $pe) < 1e-12) {
            return null;
        }

        return round(($po - $pe) / (1 - $pe), 4);
    }

    /**
     * Two-sided exact binomial McNemar test on the discordant pairs.
     */
    private function mcnemarP(int $b, int $c): ?float
    {
        $n = $b + $c;
        if ($n === 0) {
            return 1.0;
        }

        $k = min($b, $c);
        $coef = 1.0;
        $sum = 0.0;
        for ($i = 0; $i <= $k; $i++) {
            if ($i > 0) {
                $coef = $coef * ($n - $i + 1) / $i;
            }
            $sum += $coef;
        }

        $p = 2 * $sum / (2 ** $n);

        return min(1.0, round($p, 6));
    }

    private function parseBool(string $value): ?bool
    {
        $value = strtolower(trim($value));

        if ($value === '') {
            return null;
        }

        if (in_array($value, ['1', 'true', 'ya', 'yes'], true)) {
            return true;
        }

        if (in_array($value, ['0', 'false', 'tidak', 'no'], true)) {
            return false;
        }

        return is_numeric($value) ? (float) $value !== 0.0 : null;
    }

    /**
     * @param  array<int, array<string, string>>  $rows
     */
    private function hasColumn(array $rows, string $column): bool
    {
        $first = reset($rows);

        return is_array($first) && array_key_exists($column, $first);
    }

    private function resolvePath(string $path): ?string
    {
        $absolute = preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $path) === 1;
        $fullPath = $absolute ? $path : storage_path('app/'.$path);

        return is_file($fullPath) ? $fullPath : null;
    }

    private function fmtPercent(?float $value): string
    {
        return $value === null ? '-' : number_format($value * 100, 1).'%';
    }

    private function fmtNum(?float $value): string
    {
        return $value === null ? '-' : number_format($value, 3);
    }

    private function fmtP(?float $value): string
    {
        if ($value === null) {
            return '-';
        }

        return $value < 0.001 ? '<0.001' : number_format($value, 3);
    }

    private function writeCsv(string $path, array $rows): ?string
    {
        $absolute = preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $path) === 1;
        $fullPath = $absolute ? $path : storage_path('app/'.$path);

        $directory = dirname($fullPath);
        if (! is_dir($directory) && ! mkdir($directory, 0755, true) && ! is_dir($directory)) {
            $this->error("Tidak bisa membuat direktori {$directory}");

            return null;
        }

        $handle = fopen($fullPath, 'w');
        if (! $handle) {
            $this->error("Tidak bisa menulis {$fullPath}");

            return null;
        }

        fputcsv($handle, [
            'category', 'pairs', 'both_true', 'both_false', 'a_only', 'b_only',
            'agreement', 'kappa', 'mcnemar_p', 'pos_a', 'pos_b',
        ]);

        foreach ($rows as $row) {
            fputcsv($handle, [
                $row['category'], $row['pairs'], $row['both_true'], $row['both_false'],
                $row['a_only'], $row['b_only'], $row['agreement'],
                $row['kappa'] ?? '', $row['mcnemar_p'] ?? '', $row['pos_a'], $row['pos_b'],
            ]);
        }

        fclose($handle);

        return $fullPath;
    }
}
