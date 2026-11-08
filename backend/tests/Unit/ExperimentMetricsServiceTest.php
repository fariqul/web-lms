<?php

namespace Tests\Unit;

use App\Models\ExperimentTrial;
use App\Services\ExperimentMetricsService;
use Illuminate\Support\Collection;
use PHPUnit\Framework\TestCase;

class ExperimentMetricsServiceTest extends TestCase
{
    private ExperimentMetricsService $svc;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = new ExperimentMetricsService();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helper — build a lightweight trial-like object (stdClass)
    // The service accesses properties directly, so a plain object works.
    // ──────────────────────────────────────────────────────────────────────

    private function makeTrial(array $attrs): object
    {
        $defaults = [
            'gt_no_face'             => false,
            'gt_multi_face'          => false,
            'gt_phone'               => false,
            'gt_book'                => false,
            'gt_head_turn'           => false,
            'gt_eye_gaze_away'       => false,
            'gt_identity_mismatch'   => false,
            'pred_no_face'           => null,
            'pred_multi_face'        => null,
            'pred_phone'             => null,
            'pred_book'              => null,
            'pred_head_turn'         => null,
            'pred_eye_gaze_away'     => null,
            'pred_identity_mismatch' => null,
            'head_yaw'               => null,
            'head_pitch'             => null,
            'eye_gaze_ratio'         => null,
            'face_distance'          => null,
            'all_detections'         => [],
            'inference_ms'           => null,
            'server_total_ms'        => null,
            'end_to_end_ms'          => null,
        ];

        $merged = array_merge($defaults, $attrs);
        $obj    = new \stdClass();
        foreach ($merged as $key => $value) {
            $obj->{$key} = $value;
        }

        return $obj;
    }

    private function collect(array $items): Collection
    {
        return new Collection($items);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 1. TP/TN/FP/FN calculated correctly
    // ──────────────────────────────────────────────────────────────────────

    public function test_tp_tn_fp_fn_calculated_correctly(): void
    {
        $trials = $this->collect([
            $this->makeTrial(['gt_no_face' => true,  'pred_no_face' => true]),   // TP
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => false]),  // TN
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => true]),   // FP
            $this->makeTrial(['gt_no_face' => true,  'pred_no_face' => false]),  // FN
        ]);

        $result  = $this->svc->computeMetrics($trials);
        $noFace  = $result['per_category']['no_face'];

        $this->assertEquals(1, $noFace['tp']);
        $this->assertEquals(1, $noFace['tn']);
        $this->assertEquals(1, $noFace['fp']);
        $this->assertEquals(1, $noFace['fn']);
        $this->assertEquals(4, $noFace['total']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. Precision null when TP + FP = 0
    // ──────────────────────────────────────────────────────────────────────

    public function test_precision_null_when_tp_plus_fp_zero(): void
    {
        // All TN and FN — no positive predictions
        $trials = $this->collect([
            $this->makeTrial(['gt_no_face' => true,  'pred_no_face' => false]), // FN
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => false]), // TN
        ]);

        $result = $this->svc->computeMetrics($trials);

        $this->assertNull($result['per_category']['no_face']['precision']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Recall null when TP + FN = 0
    // ──────────────────────────────────────────────────────────────────────

    public function test_recall_null_when_tp_plus_fn_zero(): void
    {
        // All TN and FP — no positive ground truths
        $trials = $this->collect([
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => true]),  // FP
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => false]), // TN
        ]);

        $result = $this->svc->computeMetrics($trials);

        $this->assertNull($result['per_category']['no_face']['recall']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. F1 null when precision or recall is null
    // ──────────────────────────────────────────────────────────────────────

    public function test_f1_null_when_precision_or_recall_null(): void
    {
        // Only TN — precision = null, recall = null
        $trials = $this->collect([
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => false]),
        ]);

        $result = $this->svc->computeMetrics($trials);
        $noFace = $result['per_category']['no_face'];

        $this->assertNull($noFace['precision']);
        $this->assertNull($noFace['recall']);
        $this->assertNull($noFace['f1']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 5. Accuracy = 1.0 for perfect classifier
    // ──────────────────────────────────────────────────────────────────────

    public function test_accuracy_one_for_perfect_classifier(): void
    {
        $trials = $this->collect([
            $this->makeTrial(['gt_no_face' => true,  'pred_no_face' => true]),
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => false]),
            $this->makeTrial(['gt_no_face' => true,  'pred_no_face' => true]),
        ]);

        $result = $this->svc->computeMetrics($trials);

        $this->assertEquals(1.0, $result['per_category']['no_face']['accuracy']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 6. Threshold sweep returns ordered array with correct count
    // ──────────────────────────────────────────────────────────────────────

    public function test_threshold_sweep_returns_ordered_array(): void
    {
        $trials = $this->collect([
            $this->makeTrial(['gt_head_turn' => true,  'head_yaw' => 45.0]),
            $this->makeTrial(['gt_head_turn' => false, 'head_yaw' => 10.0]),
            $this->makeTrial(['gt_head_turn' => true,  'head_yaw' => 30.0]),
        ]);

        $values = [10.0, 20.0, 30.0, 40.0, 50.0];
        $result = $this->svc->thresholdSweep($trials, 'head_yaw', $values, 'head_turn');

        $this->assertCount(5, $result);

        foreach ($result as $item) {
            $this->assertArrayHasKey('threshold', $item);
            $this->assertArrayHasKey('precision', $item);
            $this->assertArrayHasKey('recall', $item);
            $this->assertArrayHasKey('f1', $item);
        }

        // Thresholds should match input values in order
        $thresholds = array_column($result, 'threshold');
        $this->assertEquals($values, $thresholds);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 7. Latency stats: mean, median, p95 computed correctly
    // ──────────────────────────────────────────────────────────────────────

    public function test_latency_stats_mean_median_p95_correct(): void
    {
        // inference_ms: [100, 200, 300, 400, 500]
        $trials = $this->collect(array_map(
            fn($ms) => $this->makeTrial(['inference_ms' => $ms]),
            [100, 200, 300, 400, 500]
        ));

        $stats = $this->svc->latencyStats($trials);

        $inference = $stats['inference_ms'];

        $this->assertEquals(300.0,  $inference['mean']);
        $this->assertEquals(300.0,  $inference['median']);
        $this->assertEquals(100,    $inference['min']);
        $this->assertEquals(500,    $inference['max']);
        $this->assertEquals(5,      $inference['count']);
        // p95 of [100,200,300,400,500] = 500 * 0.95 index => 480
        $this->assertGreaterThanOrEqual(450, $inference['p95']);
        $this->assertLessThanOrEqual(500,   $inference['p95']);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 8. exportToCsv has BOM and all required columns
    // ──────────────────────────────────────────────────────────────────────

    public function test_export_csv_has_bom_and_all_columns(): void
    {
        $session = new \stdClass();
        $session->id = 1;

        // We need an ExperimentSession instance but with minimal state
        // Use a real model in memory-only mode (no DB needed for unit test)
        $sessionModel = new \App\Models\ExperimentSession();
        $sessionModel->id = 1;

        $trial = $this->makeTrial([
            'trial_number'    => 1,
            'captured_at'     => null,
            'scenario'        => 'normal',
            'snapshot_path'   => '1/photo.jpg',
            'gt_phone'        => true,
            'pred_phone'      => false,
            'is_invalid'      => false,
            'config_scope_used' => 'draft',
        ]);
        // Cast to object array for the collection
        $collection = new Collection([$trial]);

        $csv = $this->svc->exportToCsv($collection, $sessionModel);

        // BOM check
        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv);

        // Column headers
        $requiredColumns = [
            'trial_number', 'captured_at', 'scenario', 'snapshot_path',
            'gt_no_face', 'gt_multi_face', 'gt_phone',
            'pred_no_face', 'pred_phone', 'pred_identity_mismatch',
            'inference_ms', 'is_invalid', 'config_scope_used',
        ];

        foreach ($requiredColumns as $col) {
            $this->assertStringContainsString($col, $csv, "Column '{$col}' missing from CSV header.");
        }

        $this->assertStringContainsString('1/photo.jpg', $csv);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 9. Macro average skips null values
    // ──────────────────────────────────────────────────────────────────────

    public function test_macro_average_skips_null_values(): void
    {
        // Only provide data for no_face — all other categories will have null metrics
        $trials = $this->collect([
            $this->makeTrial(['gt_no_face' => true,  'pred_no_face' => true]),
            $this->makeTrial(['gt_no_face' => false, 'pred_no_face' => false]),
        ]);

        $result  = $this->svc->computeMetrics($trials);
        $overall = $result['overall'];

        // Accuracy should not be null (at least no_face has data)
        $this->assertNotNull($overall['accuracy']);

        // All overall values should be floats or null, never causing division-by-zero
        foreach (['accuracy', 'precision', 'recall', 'f1'] as $metric) {
            $this->assertTrue(
                $overall[$metric] === null || is_float($overall[$metric]) || is_int($overall[$metric]),
                "Overall metric '{$metric}' should be numeric or null."
            );
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 10. Empty trials collection returns zero/null metrics gracefully
    // ──────────────────────────────────────────────────────────────────────

    public function test_empty_trials_return_zero_metrics_gracefully(): void
    {
        $trials = $this->collect([]);

        $result = $this->svc->computeMetrics($trials);

        // Every category should have total=0 and null metrics
        foreach ($result['per_category'] as $category => $metrics) {
            $this->assertEquals(0, $metrics['total'],    "{$category}: total should be 0");
            $this->assertNull($metrics['accuracy'],      "{$category}: accuracy should be null");
            $this->assertNull($metrics['precision'],     "{$category}: precision should be null");
            $this->assertNull($metrics['recall'],        "{$category}: recall should be null");
            $this->assertNull($metrics['f1'],            "{$category}: f1 should be null");
        }

        // Overall metrics should be null
        $this->assertNull($result['overall']['accuracy']);
        $this->assertNull($result['overall']['precision']);
        $this->assertNull($result['overall']['recall']);
        $this->assertNull($result['overall']['f1']);

        // Latency stats on empty set
        $latency = $this->svc->latencyStats($trials);
        $this->assertEquals(0, $latency['inference_ms']['count']);
        $this->assertNull($latency['inference_ms']['mean']);
    }
}
