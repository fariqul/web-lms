<?php

namespace App\Console\Commands;

use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use App\Models\ProctoringConfigVersion;
use App\Models\ProctoringConfiguration;
use App\Services\ExperimentMetricsService;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * php artisan proctoring:reanalyze-experiment {session}
 *
 * Re-runs every stored trial snapshot through the current proctoring service
 * and reports metrics for both multi-face rules. Read-only: experiment_trials
 * (frozen pred_*) is never modified; results go to a side CSV.
 */
class ProctoringReanalyzeExperimentCommand extends Command
{
    protected $signature = 'proctoring:reanalyze-experiment
                            {session          : ID sesi eksperimen}
                            {--service-url=   : Override URL proctoring service}
                            {--output=        : Path CSV (default reanalysis/experiment-ID-WAKTU.csv)}';

    protected $description = 'Analisis ulang snapshot trial eksperimen dengan service terbaru (pred_* tidak diubah)';

    private const RULES = ['face_only', 'person_or_face'];

    public function handle(ExperimentMetricsService $metricsService): int
    {
        $session = ExperimentSession::find((int) $this->argument('session'));
        if (!$session) {
            $this->error('Sesi eksperimen tidak ditemukan.');

            return Command::FAILURE;
        }

        [$config, $configSource] = $this->resolveConfig($session);
        $thresholds = $this->thresholds($config, $configSource);

        $serviceUrl = rtrim(
            (string) ($this->option('service-url') ?: config('proctoring.service_url', 'http://proctoring:8001')),
            '/'
        );

        $trials = $session->trials()->valid()->orderBy('trial_number')->get();
        if ($trials->isEmpty()) {
            $this->error('Sesi ini tidak punya trial valid.');

            return Command::FAILURE;
        }

        $rule = (string) config('proctoring.multi_face_rule', 'person_or_face');
        if (!in_array($rule, ['face_only', 'person_or_face'], true)) {
            $rule = 'person_or_face';
        }

        $thresholdConfig = json_encode([
            'head_yaw_threshold'        => $thresholds['yaw'],
            'head_pitch_threshold'      => $thresholds['pitch'],
            'eye_gaze_threshold'        => $thresholds['gaze'],
            'confidence_threshold'      => $thresholds['confidence'],
            'face_similarity_threshold' => $thresholds['face_similarity'],
            'multi_face_rule'           => $rule,
        ]);

        $rows = [];
        /** @var array<string, Collection<int, ExperimentTrial>> $metricTrials */
        $metricTrials = array_fill_keys(self::RULES, collect());
        $missing = 0;
        $failed = 0;
        $faceOnlyCount = 0;
        $personCountOverOne = 0;

        $bar = $this->output->createProgressBar($trials->count());
        $bar->start();

        foreach ($trials as $trial) {
            $bar->advance();

            $path = $trial->snapshot_path;
            if (!$path || !Storage::disk('experiment_snapshots')->exists($path)) {
                $missing++;
                continue;
            }

            try {
                $image = Storage::disk('experiment_snapshots')->get($path);
                $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
                $mime = ['png' => 'image/png', 'webp' => 'image/webp'][$ext] ?? 'image/jpeg';

                $response = Http::timeout(60)
                    ->attach('image', $image, basename($path), ['Content-Type' => $mime])
                    ->post("{$serviceUrl}/analyze", ['threshold_config' => $thresholdConfig]);

                if (!$response->successful()) {
                    $failed++;
                    continue;
                }

                $observation = $this->evaluate($response->json(), $session, $thresholds);
            } catch (\Throwable $e) {
                $failed++;
                continue;
            }

            if ((int) ($observation['face_count'] ?? 0) > 1) {
                $faceOnlyCount++;
            }
            if ((int) ($observation['person_count'] ?? 0) > 1) {
                $personCountOverOne++;
            }

            $rows[] = $this->csvRow($trial, $observation);

            foreach (self::RULES as $variant) {
                $metricTrials[$variant]->push(
                    $this->metricTrial($trial, $observation, $observation['multi_face'][$variant])
                );
            }
        }

        $bar->finish();
        $this->newLine(2);

        $this->line(sprintf(
            'Dianalisis: %d | file hilang: %d | gagal: %d | face_count>1: %d | person_count>1: %d',
            count($rows),
            $missing,
            $failed,
            $faceOnlyCount,
            $personCountOverOne
        ));

        if ($rows === []) {
            $this->error('Tidak ada snapshot yang berhasil dianalisis.');

            return Command::FAILURE;
        }

        $metrics = [];
        foreach (self::RULES as $variant) {
            $metrics[$variant] = $metricsService->computeMetrics($metricTrials[$variant]);
        }

        $this->printRuleComparison($metrics);
        $this->printPerCategory($metrics['face_only']);

        $output = (string) ($this->option('output')
            ?: 'reanalysis/experiment-' . $session->id . '-' . now()->format('YmdHis') . '.csv');
        $absolute = $this->writeCsv($output, $rows);
        if ($absolute !== null) {
            $this->info("CSV: {$absolute}");
        }

        return Command::SUCCESS;
    }

    /**
     * @return array{0: array, 1: string}
     */
    private function resolveConfig(ExperimentSession $session): array
    {
        if ($session->config_version_id) {
            $version = ProctoringConfigVersion::find($session->config_version_id);
            if ($version && is_array($version->snapshot)) {
                return [array_merge(ProctoringConfiguration::getDefaults(), $version->snapshot),
                    "versi #{$version->version_number}"];
            }
        }

        if ($session->config_scope === 'draft') {
            return [ProctoringConfiguration::getDraft(), 'draft aktif'];
        }

        return [ProctoringConfiguration::getActive(), 'config aktif'];
    }

    /**
     * @return array{yaw: float, pitch: float, gaze: float, confidence: float, face_similarity: float}
     */
    private function thresholds(array $config, string $source): array
    {
        $thresholds = [
            'yaw'             => (float) ($config['head_yaw_threshold'] ?? 38),
            'pitch'           => (float) ($config['head_pitch_threshold'] ?? 33),
            'gaze'            => (float) ($config['eye_gaze_threshold'] ?? 0.48),
            'confidence'      => (float) ($config['confidence_threshold'] ?? 0.45),
            'face_similarity' => (float) ($config['face_similarity_threshold'] ?? 0.6),
        ];

        $this->line(sprintf(
            'Config: %s | yaw %.1f | pitch %.1f | gaze %.2f | conf %.2f | similarity %.2f',
            $source,
            $thresholds['yaw'],
            $thresholds['pitch'],
            $thresholds['gaze'],
            $thresholds['confidence'],
            $thresholds['face_similarity']
        ));

        return $thresholds;
    }

    /**
     * Mirrors the capture path in ExperimentController so offline predictions
     * match what a fresh capture would record.
     */
    private function evaluate(array $result, ExperimentSession $session, array $t): array
    {
        $face = $result['face_analysis'] ?? [];
        $detections = $result['all_detections'] ?? [];

        $faceDetected = (bool) ($face['face_detected'] ?? $result['face_detected'] ?? false);
        $personCount = isset($result['person_count']) ? (int) $result['person_count'] : null;
        $faceCount = isset($face['face_count']) ? (int) $face['face_count'] : null;
        $yaw = $face['head_yaw'] ?? null;
        $pitch = $face['head_pitch'] ?? null;
        $gaze = $face['eye_gaze_ratio'] ?? null;

        $distance = $face['face_distance'] ?? $result['face_distance'] ?? null;
        if ($distance === null && $faceDetected) {
            $current = $face['face_embedding'] ?? null;
            $baseline = $session->baseline_embedding;
            if (is_array($current) && is_array($baseline) && count($current) === count($baseline)) {
                $distance = $this->euclideanDistance($baseline, $current);
            }
        }

        $predHeadTurn = ($yaw !== null && abs((float) $yaw) > $t['yaw'])
            || ($pitch !== null && abs((float) $pitch) > $t['pitch']);

        $predPhone = false;
        $predBook = false;
        foreach ($detections as $det) {
            $name = strtolower($det['class_name'] ?? ($det['class'] ?? ''));
            $confidence = (float) ($det['confidence'] ?? 0);
            if ($confidence <= $t['confidence']) {
                continue;
            }
            if (in_array($name, ['cell phone', 'phone', 'mobile phone'], true)) {
                $predPhone = true;
            }
            if ($name === 'book') {
                $predBook = true;
            }
        }

        return [
            'face_detected'           => $faceDetected,
            'face_confidence'         => $face['face_confidence'] ?? $face['confidence'] ?? null,
            'person_count'            => $personCount,
            'face_count'              => $faceCount,
            'head_yaw'                => $yaw,
            'head_pitch'              => $pitch,
            'eye_gaze_ratio'          => $gaze,
            'face_distance'           => $distance,
            'pred_no_face'            => !$faceDetected,
            'pred_head_turn'          => $predHeadTurn,
            'pred_eye_gaze_away'      => $gaze !== null && (float) $gaze > $t['gaze'],
            'pred_phone'              => $predPhone,
            'pred_book'               => $predBook,
            'pred_identity_mismatch'  => $distance !== null && (float) $distance > $t['face_similarity'],
            'multi_face'              => [
                'face_only'      => ($faceCount ?? 0) > 1,
                'person_or_face' => ($faceCount ?? 0) > 1 || ($personCount ?? 0) > 1,
            ],
            'risk_score_raw'          => $result['risk_score'] ?? null,
            'inference_ms'            => $result['processing_time_ms'] ?? $result['inference_ms'] ?? null,
        ];
    }

    private function metricTrial(ExperimentTrial $source, array $obs, bool $multiFace): ExperimentTrial
    {
        $trial = new ExperimentTrial();
        $trial->forceFill([
            'gt_no_face'             => $source->gt_no_face,
            'gt_multi_face'          => $source->gt_multi_face,
            'gt_phone'               => $source->gt_phone,
            'gt_book'                => $source->gt_book,
            'gt_head_turn'           => $source->gt_head_turn,
            'gt_eye_gaze_away'       => $source->gt_eye_gaze_away,
            'gt_identity_mismatch'   => $source->gt_identity_mismatch,
            'pred_no_face'           => $obs['pred_no_face'],
            'pred_multi_face'        => $multiFace,
            'pred_head_turn'         => $obs['pred_head_turn'],
            'pred_eye_gaze_away'     => $obs['pred_eye_gaze_away'],
            'pred_phone'             => $obs['pred_phone'],
            'pred_book'              => $obs['pred_book'],
            'pred_identity_mismatch' => $obs['pred_identity_mismatch'],
        ]);

        return $trial;
    }

    private function csvRow(ExperimentTrial $trial, array $obs): array
    {
        return [
            $trial->trial_number,
            optional($trial->captured_at)->toIso8601String(),
            $trial->snapshot_path,
            (int) $trial->gt_no_face,
            (int) $trial->gt_multi_face,
            (int) $trial->gt_phone,
            (int) $trial->gt_book,
            (int) $trial->gt_head_turn,
            (int) $trial->gt_eye_gaze_away,
            (int) $trial->gt_identity_mismatch,
            $obs['person_count'] ?? '',
            $obs['face_count'] ?? '',
            (int) $obs['face_detected'],
            $obs['face_confidence'] ?? '',
            $obs['head_yaw'] ?? '',
            $obs['head_pitch'] ?? '',
            $obs['eye_gaze_ratio'] ?? '',
            $obs['face_distance'] ?? '',
            (int) $obs['pred_no_face'],
            (int) $obs['multi_face']['person_or_face'],
            (int) $obs['multi_face']['face_only'],
            (int) $obs['pred_phone'],
            (int) $obs['pred_book'],
            (int) $obs['pred_head_turn'],
            (int) $obs['pred_eye_gaze_away'],
            (int) $obs['pred_identity_mismatch'],
            $obs['risk_score_raw'] ?? '',
            $obs['inference_ms'] ?? '',
        ];
    }

    private function printRuleComparison(array $metrics): void
    {
        $rows = [];
        foreach (self::RULES as $variant) {
            $c = $metrics[$variant]['per_category']['multi_face'];
            $rows[] = [
                $variant,
                $c['tp'], $c['tn'], $c['fp'], $c['fn'],
                $this->fmt($c['precision']),
                $this->fmt($c['recall']),
                $this->fmt($c['f1']),
            ];
        }

        $this->table(
            ['Varian multi-face', 'TP', 'TN', 'FP', 'FN', 'Precision', 'Recall', 'F1'],
            $rows
        );

        foreach (self::RULES as $variant) {
            $overall = $metrics[$variant]['overall'];
            $this->line(sprintf(
                '%s: macro precision %s | recall %s | F1 %s',
                $variant,
                $this->fmt($overall['precision']),
                $this->fmt($overall['recall']),
                $this->fmt($overall['f1'])
            ));
        }
    }

    private function printPerCategory(array $metrics): void
    {
        $rows = [];
        foreach ($metrics['per_category'] as $category => $c) {
            $rows[] = [
                $category,
                $c['tp'], $c['tn'], $c['fp'], $c['fn'],
                $this->fmt($c['precision']),
                $this->fmt($c['recall']),
                $this->fmt($c['f1']),
            ];
        }

        $this->line('Per kategori (varian face_only; kategori lain identik di kedua varian):');
        $this->table(
            ['Kategori', 'TP', 'TN', 'FP', 'FN', 'Precision', 'Recall', 'F1'],
            $rows
        );
    }

    private function fmt(mixed $value): string
    {
        return $value === null ? '-' : number_format((float) $value, 3);
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
            'trial_number', 'captured_at', 'snapshot_path',
            'gt_no_face', 'gt_multi_face', 'gt_phone', 'gt_book',
            'gt_head_turn', 'gt_eye_gaze_away', 'gt_identity_mismatch',
            'person_count', 'face_count', 'face_detected', 'face_confidence',
            'head_yaw', 'head_pitch', 'eye_gaze_ratio', 'face_distance',
            'pred_no_face', 'pred_multi_face_person_or_face', 'pred_multi_face_face_only',
            'pred_phone', 'pred_book', 'pred_head_turn', 'pred_eye_gaze_away',
            'pred_identity_mismatch', 'risk_score_raw', 'inference_ms',
        ]);

        foreach ($rows as $row) {
            fputcsv($handle, $row);
        }

        fclose($handle);

        return $fullPath;
    }

    private function euclideanDistance(array $a, array $b): float
    {
        $sum = 0.0;
        foreach ($a as $i => $val) {
            $diff = $val - $b[$i];
            $sum += $diff * $diff;
        }

        return sqrt($sum);
    }
}
