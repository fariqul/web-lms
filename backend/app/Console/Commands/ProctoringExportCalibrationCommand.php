<?php

namespace App\Console\Commands;

use App\Models\ProctoringCalibrationLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * php artisan proctoring:export-calibration
 *
 * Exports proctoring_calibration_logs to a CSV file.
 * Rows that have ground_truth_* filled include computed TP/TN/FP/FN columns
 * per indicator, ready for spreadsheet analysis.
 *
 * Options:
 *   --exam=ID            Filter by exam_id
 *   --scenario=LABEL     Filter by scenario_label
 *   --labeled-only       Only export rows where ground_truth_is_violation is set
 *   --output=PATH        Output file path (relative to storage/app). Default: proctoring-calibration.csv
 *   --from=DATE          Filter captured_at >= DATE (Y-m-d)
 *   --to=DATE            Filter captured_at <= DATE (Y-m-d)
 */
class ProctoringExportCalibrationCommand extends Command
{
    protected $signature = 'proctoring:export-calibration
                            {--exam=            : Filter by exam_id}
                            {--scenario=        : Filter by scenario_label}
                            {--labeled-only     : Only rows with ground_truth_is_violation set}
                            {--output=          : Output file (relative to storage/app)}
                            {--from=            : Start date filter (Y-m-d)}
                            {--to=              : End date filter (Y-m-d)}';

    protected $description = 'Export calibration log to CSV with TP/TN/FP/FN columns per indicator';

    /** Indicators to evaluate */
    private const INDICATORS = [
        'no_face',
        'multi_face',
        'head_turn',
        'eye_gaze',
        'object_detected',
        'identity_mismatch',
        'is_violation',
    ];

    public function handle(): int
    {
        $outputPath = $this->option('output') ?: 'proctoring-calibration-' . now()->format('Ymd_His') . '.csv';
        $fullPath   = storage_path('app/' . $outputPath);

        $this->info("Building query...");

        $query = ProctoringCalibrationLog::with(['student:id,name,nisn', 'snapshot:id,image_path'])
            ->orderBy('captured_at');

        if ($this->option('exam')) {
            $query->where('exam_id', (int) $this->option('exam'));
        }

        if ($this->option('scenario')) {
            $query->where('scenario_label', $this->option('scenario'));
        }

        if ($this->option('labeled-only')) {
            $query->whereNotNull('ground_truth_is_violation');
        }

        if ($this->option('from')) {
            $query->where('captured_at', '>=', $this->option('from') . ' 00:00:00');
        }

        if ($this->option('to')) {
            $query->where('captured_at', '<=', $this->option('to') . ' 23:59:59');
        }

        $total = $query->count();
        if ($total === 0) {
            $this->warn('No rows found with the given filters.');
            return Command::SUCCESS;
        }

        $this->info("Exporting {$total} rows to: {$fullPath}");

        // Ensure output directory exists
        $dir = dirname($fullPath);
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $handle = fopen($fullPath, 'w');
        if (!$handle) {
            $this->error("Cannot open file for writing: {$fullPath}");
            return Command::FAILURE;
        }

        // ── CSV header ────────────────────────────────────────────────────────
        $header = [
            'id', 'exam_id', 'student_id', 'student_name', 'student_nisn',
            'snapshot_id', 'exam_result_id',
            'captured_at', 'scenario_label',
            'risk_score_raw', 'total_score', 'risk_level',
            'processing_time_ms',
            // Raw scores
            'no_face_raw', 'multi_face_raw', 'head_turn_raw',
            'eye_gaze_raw', 'object_detection_raw', 'identity_mismatch_raw',
            // AI decisions
            'ai_no_face', 'ai_multi_face', 'ai_head_turn',
            'ai_eye_gaze', 'ai_object_detected', 'ai_identity_mismatch', 'ai_is_violation',
            // Ground truth
            'gt_no_face', 'gt_multi_face', 'gt_head_turn',
            'gt_eye_gaze', 'gt_object_detected', 'gt_identity_mismatch', 'gt_is_violation',
        ];

        // TP/TN/FP/FN columns per indicator
        foreach (self::INDICATORS as $ind) {
            $header[] = "tp_{$ind}";
            $header[] = "tn_{$ind}";
            $header[] = "fp_{$ind}";
            $header[] = "fn_{$ind}";
        }

        fputcsv($handle, $header);

        // ── Rows ──────────────────────────────────────────────────────────────
        $bar = $this->output->createProgressBar($total);
        $bar->start();

        $query->chunkById(500, function ($rows) use ($handle, $bar) {
            foreach ($rows as $row) {
                $line = [
                    $row->id,
                    $row->exam_id,
                    $row->student_id,
                    $row->student?->name ?? '',
                    $row->student?->nisn ?? '',
                    $row->snapshot_id ?? '',
                    $row->exam_result_id ?? '',
                    $row->captured_at?->format('Y-m-d H:i:s') ?? '',
                    $row->scenario_label ?? '',
                    $row->risk_score_raw,
                    $row->total_score,
                    $row->risk_level ?? '',
                    $row->processing_time_ms ?? '',
                    // Raw scores
                    $row->no_face_raw,
                    $row->multi_face_raw,
                    $row->head_turn_raw,
                    $row->eye_gaze_raw,
                    $row->object_detection_raw,
                    $row->identity_mismatch_raw,
                    // AI decisions
                    $this->boolInt($row->ai_no_face),
                    $this->boolInt($row->ai_multi_face),
                    $this->boolInt($row->ai_head_turn),
                    $this->boolInt($row->ai_eye_gaze),
                    $this->boolInt($row->ai_object_detected),
                    $this->boolInt($row->ai_identity_mismatch),
                    $this->boolInt($row->ai_is_violation),
                    // Ground truth
                    $this->boolIntNullable($row->ground_truth_no_face),
                    $this->boolIntNullable($row->ground_truth_multi_face),
                    $this->boolIntNullable($row->ground_truth_head_turn),
                    $this->boolIntNullable($row->ground_truth_eye_gaze),
                    $this->boolIntNullable($row->ground_truth_object_detected),
                    $this->boolIntNullable($row->ground_truth_identity_mismatch),
                    $this->boolIntNullable($row->ground_truth_is_violation),
                ];

                // TP/TN/FP/FN per indicator
                foreach (self::INDICATORS as $ind) {
                    $cell = $row->confusionCell($ind);
                    $line[] = $cell['tp'] ?? '';
                    $line[] = $cell['tn'] ?? '';
                    $line[] = $cell['fp'] ?? '';
                    $line[] = $cell['fn'] ?? '';
                }

                fputcsv($handle, $line);
                $bar->advance();
            }
        });

        $bar->finish();
        fclose($handle);

        $this->newLine(2);
        $this->info("✅ Exported {$total} rows to: {$fullPath}");
        $this->line("   Copy from container: docker cp lms-backend:/var/www/html/storage/app/{$outputPath} ./");

        return Command::SUCCESS;
    }

    private function boolInt(?bool $val): int
    {
        return $val ? 1 : 0;
    }

    private function boolIntNullable(?bool $val): string
    {
        return $val === null ? '' : ($val ? '1' : '0');
    }
}
