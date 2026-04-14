<?php

namespace Tests\Unit;

use App\Jobs\AnalyzeSnapshotJob;
use PHPUnit\Framework\TestCase;

class AnalyzeSnapshotJobQueueTest extends TestCase
{
    public function test_analyze_snapshot_job_uses_proctoring_queue(): void
    {
        $job = new AnalyzeSnapshotJob(1, 1, 1, 1);

        $this->assertSame('proctoring', $job->queue);
    }
}
