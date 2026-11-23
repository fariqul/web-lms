<?php

namespace Tests\Unit;

use App\Jobs\AnalyzeSnapshotJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class AnalyzeSnapshotJobQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_analyze_snapshot_job_uses_proctoring_queue(): void
    {
        $job = new AnalyzeSnapshotJob(1, 1, 1, 1);

        $this->assertSame('proctoring', $job->queue);
    }

    public function test_snapshot_multi_face_rule_defaults_to_face_only(): void
    {
        $this->assertSame('face_only', config('proctoring.snapshot_multi_face_rule'));

        $job = new AnalyzeSnapshotJob(1, 12, 22, 32);
        $method = new \ReflectionMethod(AnalyzeSnapshotJob::class, 'isMultiFace');
        $method->setAccessible(true);

        $this->assertFalse($method->invoke($job, ['person_count' => 2], ['face_count' => 1]));
        $this->assertTrue($method->invoke($job, ['person_count' => 1], ['face_count' => 2]));
    }

    public function test_snapshot_multi_face_rule_is_independent_from_experiment_rule(): void
    {
        config([
            'proctoring.multi_face_rule'          => 'face_only',
            'proctoring.snapshot_multi_face_rule' => 'person_or_face',
        ]);

        $job = new AnalyzeSnapshotJob(1, 12, 22, 32);
        $method = new \ReflectionMethod(AnalyzeSnapshotJob::class, 'isMultiFace');
        $method->setAccessible(true);

        $this->assertTrue($method->invoke($job, ['person_count' => 2], ['face_count' => 1]));
        $this->assertTrue($method->invoke($job, ['person_count' => 1], ['face_count' => 2]));
    }

    public function test_should_emit_alert_returns_false_when_recent_duplicate_exists(): void
    {
        Cache::flush();
        $job = new AnalyzeSnapshotJob(1, 10, 20, 30);

        $method = new \ReflectionMethod(AnalyzeSnapshotJob::class, 'shouldEmitAlert');
        $method->setAccessible(true);

        $first = $method->invoke($job, 'multi_face', 15);
        $second = $method->invoke($job, 'multi_face', 15);

        $this->assertTrue($first);
        $this->assertFalse($second);
    }

    public function test_should_emit_alert_returns_true_when_duplicate_is_outside_window(): void
    {
        Cache::flush();
        $job = new AnalyzeSnapshotJob(1, 11, 21, 31);

        $method = new \ReflectionMethod(AnalyzeSnapshotJob::class, 'shouldEmitAlert');
        $method->setAccessible(true);

        $phoneFirst = $method->invoke($job, 'object_detected', 'cell phone');
        $bookFirst = $method->invoke($job, 'object_detected', 'book');
        $phoneSecond = $method->invoke($job, 'object_detected', 'cell phone');

        $this->assertTrue($phoneFirst);
        $this->assertTrue($bookFirst);
        $this->assertFalse($phoneSecond);
    }
}
