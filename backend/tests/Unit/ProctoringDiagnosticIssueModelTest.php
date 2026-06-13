<?php

namespace Tests\Unit;

use App\Models\ProctoringDiagnosticIssue;
use App\Models\ProctoringDiagnosticTest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProctoringDiagnosticIssueModelTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test that model has correct fillable attributes
     */
    public function test_model_has_correct_fillable_attributes(): void
    {
        $expectedFillable = [
            'test_id',
            'category',
            'severity',
            'issue',
            'description',
            'action',
            'technical_details',
            'related_config',
            'documentation_link',
        ];

        $issue = new ProctoringDiagnosticIssue();
        
        $this->assertEquals($expectedFillable, $issue->getFillable());
    }

    /**
     * Test that timestamps are disabled
     */
    public function test_timestamps_are_disabled(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        
        $this->assertFalse($issue->timestamps);
    }

    /**
     * Test that related_config is cast to array
     */
    public function test_related_config_is_cast_to_array(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        
        $casts = $issue->getCasts();
        
        $this->assertArrayHasKey('related_config', $casts);
        $this->assertEquals('array', $casts['related_config']);
    }

    /**
     * Test that created_at is cast to datetime
     */
    public function test_created_at_is_cast_to_datetime(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        
        $casts = $issue->getCasts();
        
        $this->assertArrayHasKey('created_at', $casts);
        $this->assertEquals('datetime', $casts['created_at']);
    }

    /**
     * Test that test() relationship returns BelongsTo instance
     */
    public function test_test_relationship_is_belongs_to(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        
        $relation = $issue->test();
        
        $this->assertInstanceOf(\Illuminate\Database\Eloquent\Relations\BelongsTo::class, $relation);
    }

    /**
     * Test that test() relationship points to correct model
     */
    public function test_test_relationship_points_to_correct_model(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        
        $relation = $issue->test();
        
        $this->assertInstanceOf(ProctoringDiagnosticTest::class, $relation->getRelated());
    }
}
