<?php

namespace App\Services;

use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use Illuminate\Support\Collection;

class ExperimentMetricsService
{
    /**
     * The seven binary classification categories tracked per trial.
     */
    private const CATEGORIES = [
        'no_face',
        'multi_face',
        'phone',
        'book',
        'head_turn',
        'eye_gaze_away',
        'identity_mismatch',
    ];

    /**
     * Compute per-category and macro-averaged classification metrics
     * for a collection of ExperimentTrial instances.
     *
     * @param  Collection<ExperimentTrial>  $trials
     * @return array{per_category: array, overall: array}
     */
    public function computeMetrics(Collection $trials): array
    {
        $perCategory = [];

        foreach (self::CATEGORIES as $category) {
            $gtField   = "gt_{$category}";
            $predField = "pred_{$category}";

            $tp = 0;
            $tn = 0;
            $fp = 0;
            $fn = 0;

            foreach ($trials as $trial) {
                $gt   = (bool) $trial->{$gtField};
                // pred may be null — treat as false when null
                $pred = $trial->{$predField} !== null ? (bool) $trial->{$predField} : null;

                if ($pred === null) {
                    continue;
                }

                if ($gt && $pred) {
                    $tp++;
                } elseif (!$gt && !$pred) {
                    $tn++;
                } elseif (!$gt && $pred) {
                    $fp++;
                } elseif ($gt && !$pred) {
                    $fn++;
                }
            }

            $total   = $tp + $tn + $fp + $fn;
            $support = $tp + $fn;

            // Accuracy
            $accuracy = $total > 0 ? ($tp + $tn) / $total : null;

            // Precision
            $precision = ($tp + $fp) > 0 ? $tp / ($tp + $fp) : null;

            // Recall
            $recall = ($tp + $fn) > 0 ? $tp / ($tp + $fn) : null;

            // F1
            $f1 = null;
            if ($precision !== null && $recall !== null && ($precision + $recall) > 0) {
                $f1 = 2 * $precision * $recall / ($precision + $recall);
            }

            $perCategory[$category] = [
                'tp'        => $tp,
                'tn'        => $tn,
                'fp'        => $fp,
                'fn'        => $fn,
                'accuracy'  => $accuracy !== null ? round($accuracy, 4) : null,
                'precision' => $precision !== null ? round($precision, 4) : null,
                'recall'    => $recall !== null ? round($recall, 4) : null,
                'f1'        => $f1 !== null ? round($f1, 4) : null,
                'support'   => $support,
                'total'     => $total,
            ];
        }

        $overall = $this->macroAverage($perCategory);

        return [
            'per_category' => $perCategory,
            'overall'      => $overall,
        ];
    }

    /**
     * Compute macro-averaged metrics across all categories,
     * skipping null values in each metric.
     */
    private function macroAverage(array $perCategory): array
    {
        $metrics = ['accuracy', 'precision', 'recall', 'f1'];
        $result  = [];

        foreach ($metrics as $metric) {
            $values = [];
            foreach ($perCategory as $cat) {
                if ($cat[$metric] !== null) {
                    $values[] = $cat[$metric];
                }
            }
            $result[$metric] = count($values) > 0
                ? round(array_sum($values) / count($values), 4)
                : null;
        }

        return $result;
    }

    /**
     * Sweep a single numeric threshold parameter over a range of values and
     * report precision / recall / F1 for the given detection category.
     *
     * Supported params:  head_yaw | head_pitch | eye_gaze | confidence | face_distance
     * Supported categories: head_turn | eye_gaze_away | phone | book | identity_mismatch
     *
     * @param  Collection<ExperimentTrial>  $trials
     * @param  string  $param      Threshold parameter name
     * @param  float[] $values     Array of threshold values to test
     * @param  string  $category   Detection category to evaluate
     * @return array<array{threshold: float, precision: float|null, recall: float|null, f1: float|null}>
     */
    public function thresholdSweep(Collection $trials, string $param, array $values, string $category): array
    {
        $results = [];

        foreach ($values as $threshold) {
            $threshold = (float) $threshold;

            $tp = 0;
            $fp = 0;
            $fn = 0;

            foreach ($trials as $trial) {
                $pred = $this->predictWithThreshold($trial, $param, $threshold, $category);
                if ($pred === null) {
                    continue;
                }

                $gt = $this->getGroundTruth($trial, $category);

                if ($gt && $pred) {
                    $tp++;
                } elseif (!$gt && $pred) {
                    $fp++;
                } elseif ($gt && !$pred) {
                    $fn++;
                }
            }

            $precision = ($tp + $fp) > 0 ? round($tp / ($tp + $fp), 4) : null;
            $recall    = ($tp + $fn) > 0 ? round($tp / ($tp + $fn), 4) : null;
            $f1        = null;
            if ($precision !== null && $recall !== null && ($precision + $recall) > 0) {
                $f1 = round(2 * $precision * $recall / ($precision + $recall), 4);
            }

            $results[] = [
                'threshold' => $threshold,
                'precision' => $precision,
                'recall'    => $recall,
                'f1'        => $f1,
            ];
        }

        return $results;
    }

    /**
     * Apply the given threshold to a single trial and return the binary prediction.
     * Returns null when the required field is missing (skip trial).
     *
     * Accepts any object exposing the required public properties so the service
     * can be exercised with lightweight test doubles (stdClass) as well as
     * real ExperimentTrial models.
     */
    private function predictWithThreshold(
        object $trial,
        string $param,
        float $threshold,
        string $category
    ): ?bool {
        switch ($param) {
            case 'head_yaw':
                if ($trial->head_yaw === null) {
                    return null;
                }
                return abs((float) $trial->head_yaw) > $threshold;

            case 'head_pitch':
                if ($trial->head_pitch === null) {
                    return null;
                }
                return abs((float) $trial->head_pitch) > $threshold;

            case 'eye_gaze':
                if ($trial->eye_gaze_ratio === null) {
                    return null;
                }
                return (float) $trial->eye_gaze_ratio > $threshold;

            case 'confidence':
                // For phone / book: check all_detections for matching class
                $allDetections = $trial->all_detections ?? [];
                if ($category === 'phone') {
                    foreach ($allDetections as $det) {
                        $className  = $det['class_name'] ?? ($det['class'] ?? '');
                        $confidence = (float) ($det['confidence'] ?? 0);
                        if (in_array(strtolower($className), ['cell phone', 'phone', 'mobile phone'])
                            && $confidence > $threshold) {
                            return true;
                        }
                    }
                    return false;
                }
                if ($category === 'book') {
                    foreach ($allDetections as $det) {
                        $className  = $det['class_name'] ?? ($det['class'] ?? '');
                        $confidence = (float) ($det['confidence'] ?? 0);
                        if (strtolower($className) === 'book' && $confidence > $threshold) {
                            return true;
                        }
                    }
                    return false;
                }
                return null;

            case 'face_distance':
                if ($trial->face_distance === null) {
                    return null;
                }
                return (float) $trial->face_distance > $threshold;

            default:
                return null;
        }
    }

    /**
     * Return the ground-truth boolean for the given category from a trial.
     */
    private function getGroundTruth(object $trial, string $category): bool
    {
        $map = [
            'head_turn'          => 'gt_head_turn',
            'eye_gaze_away'      => 'gt_eye_gaze_away',
            'phone'              => 'gt_phone',
            'book'               => 'gt_book',
            'identity_mismatch'  => 'gt_identity_mismatch',
            'no_face'            => 'gt_no_face',
            'multi_face'         => 'gt_multi_face',
        ];

        $field = $map[$category] ?? null;
        return $field ? (bool) $trial->{$field} : false;
    }

    /**
     * Compute latency statistics (mean, median, p95, min, max, count)
     * for inference_ms, server_total_ms, and end_to_end_ms.
     *
     * @param  Collection<ExperimentTrial>  $trials
     * @return array{inference_ms: array, server_total_ms: array, end_to_end_ms: array}
     */
    public function latencyStats(Collection $trials): array
    {
        $fields = ['inference_ms', 'server_total_ms', 'end_to_end_ms'];
        $result = [];

        foreach ($fields as $field) {
            $values = $trials
                ->pluck($field)
                ->filter(fn($v) => $v !== null)
                ->map(fn($v) => (float) $v)
                ->values()
                ->all();

            if (count($values) === 0) {
                $result[$field] = [
                    'mean'   => null,
                    'median' => null,
                    'p95'    => null,
                    'min'    => null,
                    'max'    => null,
                    'count'  => 0,
                ];
                continue;
            }

            sort($values);
            $count = count($values);

            $mean   = array_sum($values) / $count;
            $median = $this->percentile($values, 50);
            $p95    = $this->percentile($values, 95);

            $result[$field] = [
                'mean'   => round($mean, 2),
                'median' => round($median, 2),
                'p95'    => round($p95, 2),
                'min'    => $values[0],
                'max'    => $values[$count - 1],
                'count'  => $count,
            ];
        }

        return $result;
    }

    /**
     * Interpolated percentile calculation on a pre-sorted array.
     *
     * @param  float[]  $sortedValues
     */
    private function percentile(array $sortedValues, float $percent): float
    {
        $count = count($sortedValues);
        if ($count === 1) {
            return $sortedValues[0];
        }

        $index = ($percent / 100) * ($count - 1);
        $lower = (int) floor($index);
        $upper = (int) ceil($index);

        if ($lower === $upper) {
            return $sortedValues[$lower];
        }

        $fraction = $index - $lower;
        return $sortedValues[$lower] + $fraction * ($sortedValues[$upper] - $sortedValues[$lower]);
    }

    /**
     * Generate a UTF-8 BOM CSV string from a collection of trials.
     *
     * @param  Collection<ExperimentTrial>  $trials
     * @param  ExperimentSession            $session
     * @return string  Full CSV content including BOM
     */
    public function exportToCsv(Collection $trials, ExperimentSession $session): string
    {
        $bom     = "\xEF\xBB\xBF";
        $columns = [
            'trial_number', 'captured_at', 'scenario', 'snapshot_path',
            'gt_no_face', 'gt_multi_face', 'gt_phone', 'gt_book',
            'gt_head_turn', 'gt_eye_gaze_away', 'gt_identity_mismatch',
            'person_count', 'face_count', 'face_detected',
            'head_yaw', 'head_pitch', 'head_roll',
            'eye_gaze_ratio', 'face_distance',
            'client_face_detected', 'client_face_count', 'client_face_confidence',
            'client_face_bbox', 'client_model', 'client_latency_ms', 'client_error',
            'risk_score_raw', 'total_score', 'risk_level',
            'pred_no_face', 'pred_multi_face', 'pred_phone', 'pred_book',
            'pred_head_turn', 'pred_eye_gaze_away', 'pred_identity_mismatch',
            'inference_ms', 'server_total_ms', 'end_to_end_ms',
            'is_invalid', 'invalidation_reason', 'config_scope_used',
        ];

        $boolFields = [
            'gt_no_face', 'gt_multi_face', 'gt_phone', 'gt_book',
            'gt_head_turn', 'gt_eye_gaze_away', 'gt_identity_mismatch',
            'face_detected', 'client_face_detected',
            'pred_no_face', 'pred_multi_face', 'pred_phone', 'pred_book',
            'pred_head_turn', 'pred_eye_gaze_away', 'pred_identity_mismatch',
            'is_invalid',
        ];

        $lines = [];

        // Header row
        $lines[] = implode(',', $columns);

        // Data rows
        foreach ($trials as $trial) {
            $row = [];
            foreach ($columns as $col) {
                $value = $trial->{$col} ?? '';

                // Format datetime
                if ($col === 'captured_at' && $value instanceof \Carbon\Carbon) {
                    $value = $value->toISOString();
                } elseif ($col === 'captured_at' && $value !== '') {
                    $value = (string) $value;
                }

                // Booleans as 1 / 0
                if (in_array($col, $boolFields)) {
                    $value = $value !== null && $value !== '' ? ($value ? '1' : '0') : '';
                }

                if (is_array($value)) {
                    $value = json_encode($value);
                }

                // Escape CSV field
                if (is_string($value) && (
                    str_contains($value, ',') ||
                    str_contains($value, '"') ||
                    str_contains($value, "\n")
                )) {
                    $value = '"' . str_replace('"', '""', $value) . '"';
                }

                $row[] = (string) $value;
            }
            $lines[] = implode(',', $row);
        }

        return $bom . implode("\n", $lines) . "\n";
    }
}
