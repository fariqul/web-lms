<?php

namespace App\Console\Commands;

use App\Models\ProctoringCalibrationLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * php artisan proctoring:calibration-report
 *
 * Reads labeled rows from proctoring_calibration_logs and prints a
 * per-indicator confusion matrix + Accuracy / Precision / Recall / F1.
 *
 * Only rows where ground_truth_is_violation IS NOT NULL are included
 * in the aggregate "violation" metric.
 * For indicator-level metrics, only rows where that indicator's ground_truth
 * is set are included in that indicator's calculation.
 *
 * Options:
 *   --exam=ID         Filter by exam_id
 *   --scenario=LABEL  Filter by scenario_label
 *   --from=DATE       Filter captured_at >= DATE (Y-m-d)
 *   --to=DATE         Filter captured_at <= DATE (Y-m-d)
 */
class ProctoringCalibrationReportCommand extends Command
{
    protected $signature = 'proctoring:calibration-report
                            {--exam=      : Filter by exam_id}
                            {--scenario=  : Filter by scenario_label}
                            {--from=      : Start date filter (Y-m-d)}
                            {--to=        : End date filter (Y-m-d)}';

    protected $description = 'Print per-indicator Accuracy / Precision / Recall / F1 from labeled calibration data';

    private const INDICATORS = [
        'no_face'            => 'Tanpa Wajah',
        'multi_face'         => 'Wajah Ganda',
        'head_turn'          => 'Kepala Menoleh',
        'eye_gaze'           => 'Mata Menyimpang',
        'object_detected'    => 'Objek Terlarang',
        'identity_mismatch'  => 'Identitas Tidak Cocok',
        'is_violation'       => '★ Total Violation (Composite)',
    ];

    public function handle(): int
    {
        $query = $this->buildBaseQuery();
        $totalRows = $query->count();

        if ($totalRows === 0) {
            $this->warn('No calibration rows found. Check filters or run a proctoring session first.');
            return Command::SUCCESS;
        }

        $labeledRows = (clone $query)->whereNotNull('ground_truth_is_violation')->count();

        $this->newLine();
        $this->line('  <fg=cyan;options=bold>AI Proctoring — Calibration Report</>');
        $this->line('  ' . str_repeat('─', 60));
        $this->line("  Total rows in dataset  : <fg=white>{$totalRows}</>");
        $this->line("  Labeled rows           : <fg=white>{$labeledRows}</> (ground truth filled)");

        if ($this->option('exam')) {
            $this->line("  Exam filter            : #{$this->option('exam')}");
        }
        if ($this->option('scenario')) {
            $this->line("  Scenario               : {$this->option('scenario')}");
        }

        $this->newLine();

        if ($labeledRows === 0) {
            $this->warn('  No labeled rows yet. Fill ground_truth_* columns to generate metrics.');
            $this->line('  Tip: export first with:');
            $this->line('       php artisan proctoring:export-calibration');
            $this->line('  Then update ground_truth_* columns in the CSV / database.');
            $this->newLine();
            return Command::SUCCESS;
        }

        // ── Compute metrics per indicator ─────────────────────────────────────
        $tableData = [];

        foreach (self::INDICATORS as $indicator => $label) {
            $gtCol = "ground_truth_{$indicator}";
            $aiCol = "ai_{$indicator}";

            // Only count rows where this indicator's ground truth is labeled
            $indicatorQuery = (clone $query)->whereNotNull($gtCol);
            $n = $indicatorQuery->count();

            if ($n === 0) {
                $tableData[] = [
                    $label, '-', '-', '-', '-', '-', '-', '-', '-', '0',
                ];
                continue;
            }

            // Aggregate TP/TN/FP/FN in one DB query
            $agg = $indicatorQuery->selectRaw("
                SUM(CASE WHEN {$aiCol} = 1 AND {$gtCol} = 1 THEN 1 ELSE 0 END) as tp,
                SUM(CASE WHEN {$aiCol} = 0 AND {$gtCol} = 0 THEN 1 ELSE 0 END) as tn,
                SUM(CASE WHEN {$aiCol} = 1 AND {$gtCol} = 0 THEN 1 ELSE 0 END) as fp,
                SUM(CASE WHEN {$aiCol} = 0 AND {$gtCol} = 1 THEN 1 ELSE 0 END) as fn
            ")->first();

            $tp = (int) ($agg->tp ?? 0);
            $tn = (int) ($agg->tn ?? 0);
            $fp = (int) ($agg->fp ?? 0);
            $fn = (int) ($agg->fn ?? 0);

            $accuracy  = $this->safeDiv($tp + $tn, $tp + $tn + $fp + $fn);
            $precision = $this->safeDiv($tp, $tp + $fp);
            $recall    = $this->safeDiv($tp, $tp + $fn);
            $f1        = $this->safeDiv(2 * $precision * $recall, $precision + $recall);

            $tableData[] = [
                $label,
                $tp,
                $tn,
                $fp,
                $fn,
                $this->pct($accuracy),
                $this->pct($precision),
                $this->pct($recall),
                $this->pct($f1),
                $n,
            ];
        }

        $this->table(
            ['Indicator', 'TP', 'TN', 'FP', 'FN', 'Accuracy', 'Precision', 'Recall', 'F1', 'N'],
            $tableData,
        );

        // ── Risk level distribution ───────────────────────────────────────────
        $this->newLine();
        $this->line('  <fg=cyan>Risk Level Distribution (all rows)</>');

        $distRows = (clone $query)
            ->select('risk_level', DB::raw('COUNT(*) as count'))
            ->groupBy('risk_level')
            ->orderByRaw("FIELD(risk_level, 'critical', 'high', 'medium', 'low')")
            ->get();

        $distTable = $distRows->map(fn ($r) => [
            $r->risk_level ?? '(null)',
            $r->count,
            $this->riskBar($r->count, $totalRows),
        ])->toArray();

        $this->table(['Risk Level', 'Count', 'Distribution'], $distTable);

        // ── Score statistics ──────────────────────────────────────────────────
        $this->newLine();
        $this->line('  <fg=cyan>Score Statistics (total_score)</>');

        $stats = (clone $query)->selectRaw('
            MIN(total_score)  as min_score,
            MAX(total_score)  as max_score,
            AVG(total_score)  as avg_score,
            STDDEV(total_score) as std_score
        ')->first();

        $this->table(
            ['Min', 'Max', 'Average', 'Std Dev'],
            [[
                $stats->min_score ?? '-',
                $stats->max_score ?? '-',
                $stats->avg_score  !== null ? round((float) $stats->avg_score, 1) : '-',
                $stats->std_score  !== null ? round((float) $stats->std_score, 1) : '-',
            ]],
        );

        $this->newLine();
        $this->line('  Tip: export labeled data with:');
        $this->line('       <fg=yellow>php artisan proctoring:export-calibration --labeled-only</>');
        $this->newLine();

        return Command::SUCCESS;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function buildBaseQuery(): \Illuminate\Database\Eloquent\Builder
    {
        $query = ProctoringCalibrationLog::query();

        if ($this->option('exam')) {
            $query->where('exam_id', (int) $this->option('exam'));
        }
        if ($this->option('scenario')) {
            $query->where('scenario_label', $this->option('scenario'));
        }
        if ($this->option('from')) {
            $query->where('captured_at', '>=', $this->option('from') . ' 00:00:00');
        }
        if ($this->option('to')) {
            $query->where('captured_at', '<=', $this->option('to') . ' 23:59:59');
        }

        return $query;
    }

    private function safeDiv(float $numerator, float $denominator): float
    {
        return $denominator == 0 ? 0.0 : $numerator / $denominator;
    }

    private function pct(float $val): string
    {
        $p = round($val * 100, 1);

        if ($p >= 90) return "<fg=green>{$p}%</>";
        if ($p >= 70) return "<fg=yellow>{$p}%</>";
        return "<fg=red>{$p}%</>";
    }

    private function riskBar(int $count, int $total): string
    {
        $pct  = $total > 0 ? ($count / $total) * 100 : 0;
        $bars = (int) round($pct / 5);  // 1 bar per 5%
        return str_repeat('█', $bars) . ' ' . round($pct, 1) . '%';
    }
}
