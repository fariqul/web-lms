<?php

namespace Tests\Feature;

use Tests\TestCase;

class ReliabilityReportCommandTest extends TestCase
{
    private string $csvA;

    private string $csvB;

    private string $output;

    protected function setUp(): void
    {
        parent::setUp();

        $this->csvA = storage_path('app/reliability-test-a-'.uniqid().'.csv');
        $this->csvB = storage_path('app/reliability-test-b-'.uniqid().'.csv');
        $this->output = storage_path('app/reliability-test-out-'.uniqid().'.csv');
    }

    protected function tearDown(): void
    {
        foreach ([$this->csvA, $this->csvB, $this->output] as $path) {
            if (is_file($path)) {
                unlink($path);
            }
        }

        parent::tearDown();
    }

    /**
     * @param  array<int, array{0:int,1:int,2:int,3:int}>  $rows  [trial, no_face, phone, head_turn]
     */
    private function writeCsv(string $path, array $rows): void
    {
        $handle = fopen($path, 'w');
        fputcsv($handle, ['trial_number', 'pred_no_face', 'pred_phone', 'pred_head_turn']);

        foreach ($rows as [$trial, $noFace, $phone, $headTurn]) {
            fputcsv($handle, [$trial, $noFace, $phone, $headTurn]);
        }

        fclose($handle);
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function readOutput(): array
    {
        $handle = fopen($this->output, 'r');
        $header = fgetcsv($handle);
        $rows = [];

        while (($line = fgetcsv($handle)) !== false) {
            $row = array_combine($header, $line);
            $rows[$row['category']] = $row;
        }

        fclose($handle);

        return $rows;
    }

    public function test_reports_agreement_kappa_and_mcnemar_per_category(): void
    {
        // [trial, no_face, phone, head_turn]
        $a = [
            [1, 1, 1, 1],
            [2, 0, 1, 1],
            [3, 1, 0, 1],
            [4, 0, 0, 1],
            [5, 0, 0, 1],
            [6, 0, 1, 1],
            [7, 0, 0, 0],
            [8, 0, 0, 0],
        ];
        $b = [
            [1, 1, 1, 0],
            [2, 0, 1, 0],
            [3, 0, 0, 0],
            [4, 1, 0, 0],
            [5, 0, 0, 0],
            [6, 0, 0, 0],
            [7, 0, 0, 0],
            [8, 0, 0, 0],
        ];

        $this->writeCsv($this->csvA, $a);
        $this->writeCsv($this->csvB, $b);

        $this->artisan('proctoring:reliability-report', [
            'csv-a' => $this->csvA,
            'csv-b' => $this->csvB,
            '--output' => $this->output,
        ])->assertExitCode(0);

        $rows = $this->readOutput();

        $this->assertSame('8', $rows['no_face']['pairs']);
        $this->assertSame('1', $rows['no_face']['both_true']);
        $this->assertSame('5', $rows['no_face']['both_false']);
        $this->assertSame('1', $rows['no_face']['a_only']);
        $this->assertSame('1', $rows['no_face']['b_only']);
        $this->assertEqualsWithDelta(0.75, (float) $rows['no_face']['agreement'], 1e-9);
        $this->assertEqualsWithDelta(0.3333, (float) $rows['no_face']['kappa'], 1e-4);
        $this->assertEqualsWithDelta(1.0, (float) $rows['no_face']['mcnemar_p'], 1e-9);
        // Resamples where every pair agrees on "no face" make kappa undefined and are dropped.
        $this->assertGreaterThanOrEqual(1900, (int) $rows['no_face']['bootstrap_n']);
        $this->assertLessThanOrEqual(2000, (int) $rows['no_face']['bootstrap_n']);
        $this->assertLessThanOrEqual(
            (float) $rows['no_face']['kappa_ci_high'],
            (float) $rows['no_face']['kappa_ci_low']
        );

        $this->assertSame('2', $rows['phone']['both_true']);
        $this->assertSame('5', $rows['phone']['both_false']);
        $this->assertSame('1', $rows['phone']['a_only']);
        $this->assertSame('0', $rows['phone']['b_only']);
        $this->assertEqualsWithDelta(0.875, (float) $rows['phone']['agreement'], 1e-9);
        $this->assertEqualsWithDelta(0.7143, (float) $rows['phone']['kappa'], 1e-4);

        $this->assertSame('6', $rows['head_turn']['a_only']);
        $this->assertSame('2', $rows['head_turn']['both_false']);
        $this->assertEqualsWithDelta(0.25, (float) $rows['head_turn']['agreement'], 1e-9);
        $this->assertEqualsWithDelta(0.0, (float) $rows['head_turn']['kappa'], 1e-4);
        $this->assertEqualsWithDelta(0.03125, (float) $rows['head_turn']['mcnemar_p'], 1e-6);
        $this->assertSame('6', $rows['head_turn']['pos_a']);
        $this->assertSame('0', $rows['head_turn']['pos_b']);

        // No pair is (false, true), so every resample has b_only = 0 and kappa stays 0.
        $this->assertEqualsWithDelta(0.0, (float) $rows['head_turn']['kappa_ci_low'], 1e-9);
        $this->assertEqualsWithDelta(0.0, (float) $rows['head_turn']['kappa_ci_high'], 1e-9);
    }

    public function test_bootstrap_ci_can_be_disabled(): void
    {
        $this->writeCsv($this->csvA, [[1, 1, 1, 1], [2, 0, 0, 0], [3, 1, 0, 1]]);
        $this->writeCsv($this->csvB, [[1, 1, 0, 1], [2, 0, 0, 0], [3, 0, 0, 0]]);

        $this->artisan('proctoring:reliability-report', [
            'csv-a' => $this->csvA,
            'csv-b' => $this->csvB,
            '--output' => $this->output,
            '--bootstrap' => 0,
        ])->assertExitCode(0);

        $rows = $this->readOutput();

        $this->assertSame('0', $rows['no_face']['bootstrap_n']);
        $this->assertSame('', $rows['no_face']['kappa_ci_low']);
        $this->assertSame('', $rows['no_face']['kappa_ci_high']);
    }

    public function test_bootstrap_ci_is_reproducible_with_seed(): void
    {
        $a = [
            [1, 1, 1, 1], [2, 0, 1, 1], [3, 1, 0, 1], [4, 0, 0, 1],
            [5, 0, 0, 1], [6, 0, 1, 1], [7, 0, 0, 0], [8, 0, 0, 0],
        ];
        $b = [
            [1, 1, 1, 0], [2, 0, 1, 0], [3, 0, 0, 0], [4, 1, 0, 0],
            [5, 0, 0, 0], [6, 0, 0, 0], [7, 0, 0, 0], [8, 0, 0, 0],
        ];

        $this->writeCsv($this->csvA, $a);
        $this->writeCsv($this->csvB, $b);

        $args = [
            'csv-a' => $this->csvA,
            'csv-b' => $this->csvB,
            '--output' => $this->output,
            '--bootstrap' => 500,
            '--seed' => 7,
        ];

        $this->artisan('proctoring:reliability-report', $args)->assertExitCode(0);
        $first = $this->readOutput();

        $this->artisan('proctoring:reliability-report', $args)->assertExitCode(0);
        $second = $this->readOutput();

        foreach (['no_face', 'phone', 'head_turn'] as $category) {
            $this->assertSame($first[$category]['kappa_ci_low'], $second[$category]['kappa_ci_low']);
            $this->assertSame($first[$category]['kappa_ci_high'], $second[$category]['kappa_ci_high']);
        }
    }

    public function test_fails_when_trial_numbers_do_not_overlap(): void
    {
        $this->writeCsv($this->csvA, [[1, 1, 0, 0]]);
        $this->writeCsv($this->csvB, [[2, 1, 0, 0]]);

        $this->artisan('proctoring:reliability-report', [
            'csv-a' => $this->csvA,
            'csv-b' => $this->csvB,
            '--output' => $this->output,
        ])->assertExitCode(1);

        $this->assertFileDoesNotExist($this->output);
    }
}
