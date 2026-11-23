<?php

namespace App\Console\Commands;

use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;

class ProctoringCompareLayersCommand extends Command
{
    protected $signature = 'proctoring:compare-layers
                            {session : ID sesi eksperimen}
                            {--output= : Path CSV (default reanalysis/layers-experiment-ID-WAKTU.csv)}
                            {--top-disagreements=10 : Jumlah trial ketidaksepakatan yang ditampilkan}';

    protected $description = 'Bandingkan akurasi lapisan klien (face-api.js), server, dan gabungan tanpa memanggil ulang service';

    /**
     * Categories the browser layer can actually judge; the rest stay server-only.
     */
    private const CLIENT_CATEGORIES = ['no_face', 'multi_face'];

    private const MODE_LABELS = [
        'server'       => 'server',
        'server_wajah' => 'server (wajah saja)',
        'klien'        => 'klien saja',
        'gabungan_or'  => 'gabungan OR',
        'gabungan_and' => 'gabungan AND',
    ];

    public function handle(): int
    {
        $session = ExperimentSession::find((int) $this->argument('session'));
        if (!$session) {
            $this->error('Sesi eksperimen tidak ditemukan.');

            return Command::FAILURE;
        }

        $trials = $session->trials()->valid()->orderBy('trial_number')->get();
        if ($trials->isEmpty()) {
            $this->error('Sesi ini tidak punya trial valid.');

            return Command::FAILURE;
        }

        $this->line("Sesi #{$session->id} — {$session->name}");
        $this->line('Klien hanya menilai ada/tidaknya wajah; kategori lain (phone, book, head_turn, gaze, identity) tidak dibandingkan.');

        $csvRows = [];
        $mcnemarRows = [];

        foreach (self::CLIENT_CATEGORIES as $category) {
            $this->newLine();
            $this->compareCategory($category, $trials, $csvRows, $mcnemarRows);
        }

        $output = (string) ($this->option('output')
            ?: 'reanalysis/layers-experiment-' . $session->id . '-' . now()->format('YmdHis') . '.csv');
        $absolute = $this->writeCsv($output, $csvRows);
        if ($absolute !== null) {
            $this->newLine();
            $this->info("CSV metrik: {$absolute}");

            $mcnemarPath = preg_replace('/\.csv$/i', '', $absolute) . '-mcnemar.csv';
            $mcnemarAbsolute = $this->writeMcnemarCsv($mcnemarPath, $mcnemarRows);
            if ($mcnemarAbsolute !== null) {
                $this->info("CSV McNemar: {$mcnemarAbsolute}");
            }
        }

        return Command::SUCCESS;
    }

    private function compareCategory(string $category, Collection $trials, array &$csvRows, array &$mcnemarRows): void
    {
        $gtField   = "gt_{$category}";
        $predField = "pred_{$category}";

        $predictions   = [];
        $missingClient = 0;
        $support       = 0;
        $agreement     = ['ks_ps' => 0, 'ks_pn' => 0, 'kn_ps' => 0, 'kn_pn' => 0];
        $disagreements = [];
        $topDisagreements = max(0, (int) $this->option('top-disagreements'));

        foreach ($trials as $trial) {
            $gt = (bool) $trial->{$gtField};
            if ($gt) {
                $support++;
            }

            $server = $trial->{$predField} === null ? null : (bool) $trial->{$predField};
            // The face-only variant is only meaningful for multi_face.
            $serverFace = $category === 'multi_face' ? $this->serverFaceSignal($category, $trial) : null;
            $client = $this->clientSignal($category, $trial);

            if ($client === null) {
                $missingClient++;
            }

            $predictions[] = [
                'gt'           => $gt,
                'server'       => $server,
                'server_wajah' => $serverFace,
                'klien'        => $client,
                'gabungan_or'  => ($client !== null && $server !== null) ? ($server || $client) : null,
                'gabungan_and' => ($client !== null && $server !== null) ? ($server && $client) : null,
            ];

            if ($client !== null && $server !== null) {
                $agreement[($client ? 'ks' : 'kn') . '_' . ($server ? 'ps' : 'pn')]++;

                if ($client !== $server && count($disagreements) < $topDisagreements) {
                    $disagreements[] = [
                        $trial->trial_number,
                        $gt ? 'ya' : 'tidak',
                        $client ? 'ya' : 'tidak',
                        $server ? 'ya' : 'tidak',
                        $serverFace === null ? '-' : ($serverFace ? 'ya' : 'tidak'),
                    ];
                }
            }
        }

        $this->info(strtoupper($category) . " (GT positif: {$support})");
        $this->line(sprintf(
            'Trial valid: %d | punya data klien: %d | tanpa data klien: %d',
            $trials->count(),
            $trials->count() - $missingClient,
            $missingClient
        ));
        $this->line($category === 'multi_face'
            ? 'server = pred_multi_face tersimpan; server_wajah = face_count>1; klien = client_face_count>1.'
            : 'server = pred_no_face tersimpan; klien = client_face_count==0.');

        $rows = [];
        foreach (self::MODE_LABELS as $mode => $label) {
            $pairs = [];
            foreach ($predictions as $prediction) {
                if ($prediction[$mode] !== null) {
                    $pairs[] = [$prediction['gt'], $prediction[$mode]];
                }
            }
            if ($pairs === []) {
                continue;
            }

            $metrics = $this->metrics($pairs);

            $rows[] = [
                $label,
                $metrics['tp'], $metrics['tn'], $metrics['fp'], $metrics['fn'],
                $this->fmt($metrics['accuracy']) . ' (' . $this->fmtCi($metrics['accuracy_ci']) . ')',
                $this->fmt($metrics['precision']),
                $this->fmt($metrics['recall']),
                $this->fmt($metrics['f1']),
                $metrics['n'],
            ];

            $csvRows[] = array_merge(['category' => $category, 'mode' => $mode], $metrics, [
                'accuracy_ci_low'    => $metrics['accuracy_ci'][0] ?? null,
                'accuracy_ci_high'   => $metrics['accuracy_ci'][1] ?? null,
                'precision_ci_low'   => $metrics['precision_ci'][0] ?? null,
                'precision_ci_high'  => $metrics['precision_ci'][1] ?? null,
                'recall_ci_low'      => $metrics['recall_ci'][0] ?? null,
                'recall_ci_high'     => $metrics['recall_ci'][1] ?? null,
            ]);
        }

        $this->table(
            ['Mode', 'TP', 'TN', 'FP', 'FN', 'Acc (95% CI)', 'Prec', 'Rec', 'F1', 'n'],
            $rows
        );

        $this->line(sprintf(
            'Kesepakatan klien vs server — K+S+: %d | K+S-: %d | K-S+: %d | K-S-: %d',
            $agreement['ks_ps'], $agreement['ks_pn'], $agreement['kn_ps'], $agreement['kn_pn']
        ));

        $comparisons = [
            ['klien', 'server'],
            ['gabungan_or', 'server'],
            ['gabungan_or', 'klien'],
            ['gabungan_and', 'server'],
        ];
        if ($category === 'multi_face') {
            $comparisons[] = ['server_wajah', 'server'];
        }

        $this->newLine();
        $this->line('Uji McNemar pasangan berpasangan (α=0.05); b = A salah & B benar, c = A benar & B salah.');

        $comparisonRows = [];
        foreach ($comparisons as [$modeA, $modeB]) {
            $result = $this->mcnemar($predictions, $modeA, $modeB);

            $better = 'tidak berbeda';
            if ($result['discordant'] > 0 && $result['p'] < 0.05) {
                $better = $result['b'] > $result['c']
                    ? self::MODE_LABELS[$modeB]
                    : self::MODE_LABELS[$modeA];
            }

            $comparisonRows[] = [
                self::MODE_LABELS[$modeA] . ' vs ' . self::MODE_LABELS[$modeB],
                $result['b'],
                $result['c'],
                $result['statistic'] === null ? '-' : number_format($result['statistic'], 3),
                $result['method'] ?? '-',
                $this->fmtP($result['p']),
                $better,
            ];

            $mcnemarRows[] = [
                'category'    => $category,
                'comparison'  => self::MODE_LABELS[$modeA] . ' vs ' . self::MODE_LABELS[$modeB],
                'b'           => $result['b'],
                'c'           => $result['c'],
                'discordant'  => $result['discordant'],
                'statistic'   => $result['statistic'],
                'p_value'     => $result['p'],
                'method'      => $result['method'],
                'better'      => $better,
            ];
        }

        $this->table(
            ['A vs B', 'b', 'c', 'χ²', 'Metode', 'p', 'Lebih baik'],
            $comparisonRows
        );

        if ($disagreements !== []) {
            $this->line('Contoh ketidaksepakatan (klien vs server):');
            $this->table(
                ['Trial', 'GT', 'Klien', 'Server', 'Server wajah'],
                $disagreements
            );
        }
    }

    private function serverFaceSignal(string $category, ExperimentTrial $trial): ?bool
    {
        if ($category === 'multi_face') {
            return $trial->face_count === null ? null : $trial->face_count > 1;
        }

        return $trial->face_detected === null ? null : !$trial->face_detected;
    }

    private function clientSignal(string $category, ExperimentTrial $trial): ?bool
    {
        if ($category === 'no_face') {
            if ($trial->client_face_count !== null) {
                return $trial->client_face_count === 0;
            }

            return $trial->client_face_detected === null ? null : !$trial->client_face_detected;
        }

        return $trial->client_face_count === null ? null : $trial->client_face_count > 1;
    }

    /**
     * @param  array<int, array{0: bool, 1: bool}>  $pairs
     */
    private function metrics(array $pairs): array
    {
        $tp = $tn = $fp = $fn = 0;

        foreach ($pairs as [$gt, $pred]) {
            if ($gt && $pred) {
                $tp++;
            } elseif (!$gt && !$pred) {
                $tn++;
            } elseif (!$gt && $pred) {
                $fp++;
            } else {
                $fn++;
            }
        }

        $total     = $tp + $tn + $fp + $fn;
        $precision = ($tp + $fp) > 0 ? $tp / ($tp + $fp) : null;
        $recall    = ($tp + $fn) > 0 ? $tp / ($tp + $fn) : null;
        $f1        = ($precision !== null && $recall !== null && ($precision + $recall) > 0)
            ? 2 * $precision * $recall / ($precision + $recall)
            : null;

        return [
            'tp'           => $tp,
            'tn'           => $tn,
            'fp'           => $fp,
            'fn'           => $fn,
            'accuracy'     => $total > 0 ? round(($tp + $tn) / $total, 4) : null,
            'accuracy_ci'  => $this->wilson($tp + $tn, $total),
            'precision'    => $precision !== null ? round($precision, 4) : null,
            'precision_ci' => $this->wilson($tp, $tp + $fp),
            'recall'       => $recall !== null ? round($recall, 4) : null,
            'recall_ci'    => $this->wilson($tp, $tp + $fn),
            'f1'           => $f1 !== null ? round($f1, 4) : null,
            'support'      => $tp + $fn,
            'n'            => $total,
        ];
    }

    /**
     * Wilson score interval at 95% for a binomial proportion.
     *
     * @return array{0: float, 1: float}|null
     */
    private function wilson(int $successes, int $total): ?array
    {
        if ($total === 0) {
            return null;
        }

        $z      = 1.959963984540054;
        $p      = $successes / $total;
        $denom  = 1 + ($z * $z) / $total;
        $center = ($p + ($z * $z) / (2 * $total)) / $denom;
        $margin = ($z / $denom) * sqrt(($p * (1 - $p) + ($z * $z) / (4 * $total)) / $total);

        return [max(0.0, $center - $margin), min(1.0, $center + $margin)];
    }

    /**
     * McNemar test on the trials where both modes have a prediction.
     * b = A wrong and B right, c = A right and B wrong.
     * Exact binomial when discordant pairs < 25, otherwise chi-square with
     * continuity correction (df = 1).
     *
     * @param  array<int, array<string, bool|null>>  $predictions
     */
    private function mcnemar(array $predictions, string $modeA, string $modeB): array
    {
        $b = 0;
        $c = 0;

        foreach ($predictions as $prediction) {
            if ($prediction[$modeA] === null || $prediction[$modeB] === null) {
                continue;
            }

            $aCorrect = $prediction[$modeA] === $prediction['gt'];
            $bCorrect = $prediction[$modeB] === $prediction['gt'];

            if (!$aCorrect && $bCorrect) {
                $b++;
            } elseif ($aCorrect && !$bCorrect) {
                $c++;
            }
        }

        $n = $b + $c;

        if ($n === 0) {
            return ['b' => 0, 'c' => 0, 'discordant' => 0, 'statistic' => null, 'p' => 1.0, 'method' => null];
        }

        if ($n < 25) {
            $tail = 0.0;
            $pmf  = pow(0.5, $n);
            for ($i = 0; $i <= min($b, $c); $i++) {
                $tail += $pmf;
                $pmf *= ($n - $i) / ($i + 1);
            }

            return [
                'b'          => $b,
                'c'          => $c,
                'discordant' => $n,
                'statistic'  => null,
                'p'          => min(1.0, 2 * $tail),
                'method'     => 'eksak binomial',
            ];
        }

        $chi2 = ((abs($b - $c) - 1) ** 2) / $n;

        return [
            'b'          => $b,
            'c'          => $c,
            'discordant' => $n,
            'statistic'  => round($chi2, 4),
            'p'          => $this->twoSidedNormalP(sqrt($chi2)),
            'method'     => 'χ² koreksi kontinuitas',
        ];
    }

    private function twoSidedNormalP(float $z): float
    {
        return min(1.0, 2 * (1 - $this->normalCdf($z)));
    }

    /**
     * Standard normal CDF via Abramowitz & Stegun 26.2.17 (error < 7.5e-8).
     */
    private function normalCdf(float $z): float
    {
        $t = 1 / (1 + 0.2316419 * abs($z));
        $poly = (((((1.330274429 * $t - 1.821255978) * $t) + 1.781477937) * $t
            - 0.356563782) * $t + 0.319381530) * $t;
        $pdf = 0.3989422804014327 * exp(-0.5 * $z * $z);
        $cdf = 1 - $pdf * $poly;

        return $z >= 0 ? $cdf : 1 - $cdf;
    }

    private function fmt(?float $value): string
    {
        return $value === null ? '-' : number_format($value, 3);
    }

    private function fmtCi(?array $interval): string
    {
        return $interval === null
            ? '-'
            : number_format($interval[0], 3) . '–' . number_format($interval[1], 3);
    }

    private function fmtP(float $p): string
    {
        return $p < 0.0001 ? '<0.0001' : number_format($p, 4);
    }

    private function writeCsv(string $path, array $rows): ?string
    {
        $header = [
            'category', 'mode', 'tp', 'tn', 'fp', 'fn',
            'accuracy', 'accuracy_ci_low', 'accuracy_ci_high',
            'precision', 'precision_ci_low', 'precision_ci_high',
            'recall', 'recall_ci_low', 'recall_ci_high',
            'f1', 'support', 'n',
        ];

        $lines = [];
        foreach ($rows as $row) {
            $lines[] = array_map(fn ($key) => $row[$key] ?? null, $header);
        }

        return $this->writeAll($path, $header, $lines);
    }

    private function writeMcnemarCsv(string $path, array $rows): ?string
    {
        $header = [
            'category', 'comparison', 'b', 'c', 'discordant',
            'statistic', 'p_value', 'method', 'better',
        ];

        $lines = [];
        foreach ($rows as $row) {
            $lines[] = array_map(fn ($key) => $row[$key] ?? null, $header);
        }

        return $this->writeAll($path, $header, $lines);
    }

    private function writeAll(string $path, array $header, array $lines): ?string
    {
        $absolute = preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/)/', $path) === 1;
        $fullPath = $absolute ? $path : storage_path('app/' . $path);

        $directory = dirname($fullPath);
        if (!is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $handle = fopen($fullPath, 'w');
        if (!$handle) {
            $this->error("Tidak bisa menulis {$fullPath}");

            return null;
        }

        fputcsv($handle, $header);
        foreach ($lines as $line) {
            fputcsv($handle, $line);
        }

        fclose($handle);

        return $fullPath;
    }
}
