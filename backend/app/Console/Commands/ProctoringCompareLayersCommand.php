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

        foreach (self::CLIENT_CATEGORIES as $category) {
            $this->newLine();
            $this->compareCategory($category, $trials, $csvRows);
        }

        $output = (string) ($this->option('output')
            ?: 'reanalysis/layers-experiment-' . $session->id . '-' . now()->format('YmdHis') . '.csv');
        $absolute = $this->writeCsv($output, $csvRows);
        if ($absolute !== null) {
            $this->newLine();
            $this->info("CSV: {$absolute}");
        }

        return Command::SUCCESS;
    }

    private function compareCategory(string $category, Collection $trials, array &$csvRows): void
    {
        $gtField   = "gt_{$category}";
        $predField = "pred_{$category}";

        $pairs = [
            'server'       => [],
            'server_wajah' => [],
            'klien'        => [],
            'gabungan_or'  => [],
            'gabungan_and' => [],
        ];
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
            $serverFace = $this->serverFaceSignal($category, $trial);
            $client = $this->clientSignal($category, $trial);

            if ($server !== null) {
                $pairs['server'][] = [$gt, $server];
            }
            if ($serverFace !== null) {
                $pairs['server_wajah'][] = [$gt, $serverFace];
            }
            if ($client !== null) {
                $pairs['klien'][] = [$gt, $client];
            } else {
                $missingClient++;
            }
            if ($client !== null && $server !== null) {
                $pairs['gabungan_or'][]  = [$gt, $server || $client];
                $pairs['gabungan_and'][] = [$gt, $server && $client];

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

        $modeLabels = [
            'server'       => 'server',
            'server_wajah' => 'server (wajah saja)',
            'klien'        => 'klien saja',
            'gabungan_or'  => 'gabungan OR',
            'gabungan_and' => 'gabungan AND',
        ];

        $rows = [];
        foreach ($pairs as $mode => $modePairs) {
            if ($mode === 'server_wajah' && $category !== 'multi_face') {
                continue;
            }
            if ($modePairs === []) {
                continue;
            }

            $metrics = $this->metrics($modePairs);
            $rows[]  = [
                $modeLabels[$mode],
                $metrics['tp'], $metrics['tn'], $metrics['fp'], $metrics['fn'],
                $this->fmt($metrics['accuracy']),
                $this->fmt($metrics['precision']),
                $this->fmt($metrics['recall']),
                $this->fmt($metrics['f1']),
                $metrics['n'],
            ];

            $csvRows[] = array_merge(['category' => $category, 'mode' => $mode], $metrics);
        }

        $this->table(
            ['Mode', 'TP', 'TN', 'FP', 'FN', 'Acc', 'Prec', 'Rec', 'F1', 'n'],
            $rows
        );

        $this->line(sprintf(
            'Kesepakatan klien vs server — K+S+: %d | K+S-: %d | K-S+: %d | K-S-: %d',
            $agreement['ks_ps'], $agreement['ks_pn'], $agreement['kn_ps'], $agreement['kn_pn']
        ));

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
            'tp'        => $tp,
            'tn'        => $tn,
            'fp'        => $fp,
            'fn'        => $fn,
            'accuracy'  => $total > 0 ? round(($tp + $tn) / $total, 4) : null,
            'precision' => $precision !== null ? round($precision, 4) : null,
            'recall'    => $recall !== null ? round($recall, 4) : null,
            'f1'        => $f1 !== null ? round($f1, 4) : null,
            'support'   => $tp + $fn,
            'n'         => $total,
        ];
    }

    private function fmt(?float $value): string
    {
        return $value === null ? '-' : number_format($value, 3);
    }

    private function writeCsv(string $path, array $rows): ?string
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

        fputcsv($handle, [
            'category', 'mode', 'tp', 'tn', 'fp', 'fn',
            'accuracy', 'precision', 'recall', 'f1', 'support', 'n',
        ]);

        foreach ($rows as $row) {
            fputcsv($handle, [
                $row['category'], $row['mode'],
                $row['tp'], $row['tn'], $row['fp'], $row['fn'],
                $row['accuracy'], $row['precision'], $row['recall'], $row['f1'],
                $row['support'], $row['n'],
            ]);
        }

        fclose($handle);

        return $fullPath;
    }
}
