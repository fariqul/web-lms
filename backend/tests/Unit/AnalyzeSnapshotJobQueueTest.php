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

        $phoneFirst = $method->invoke($job, 'object_detected', 15, 'cell phone');
        $bookFirst = $method->invoke($job, 'object_detected', 15, 'book');
        $phoneSecond = $method->invoke($job, 'object_detected', 15, 'cell phone');

        $this->assertTrue($phoneFirst);
        $this->assertTrue($bookFirst);
        $this->assertFalse($phoneSecond);
    }
}
