<?php

namespace Tests\Unit;

use App\Models\ProctoringDiagnosticIssue;
use App\Models\ProctoringDiagnosticTest;
use Tests\TestCase;

/**
 * Test for Task 1.4: ProctoringDiagnosticIssue Model Relationship
 * 
 * This test verifies that the ProctoringDiagnosticIssue model correctly
 * defines the test() BelongsTo relationship to ProctoringDiagnosticTest.
 */
class ProctoringDiagnosticRelationshipTest extends TestCase
{
    /**
     * Test that ProctoringDiagnosticIssue.test() relationship is correctly defined
     * 
     * Requirements: 5.1 (Issue detection logic), 5.2 (Actionable suggestions)
     */
    public function test_issue_test_relationship_is_correctly_defined(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        
        // Verify the relationship exists
        $relation = $issue->test();
        
        // Verify it's a BelongsTo relationship
        $this->assertInstanceOf(
            \Illuminate\Database\Eloquent\Relations\BelongsTo::class,
            $relation
        );
        
        // Verify it points to the correct model
        $this->assertInstanceOf(
            ProctoringDiagnosticTest::class,
            $relation->getRelated()
        );
        
        // Verify the foreign key is correct
        $this->assertEquals('test_id', $relation->getForeignKeyName());
    }

    /**
     * Test that relationship metadata is correct
     */
    public function test_relationship_configuration(): void
    {
        $issue = new ProctoringDiagnosticIssue();
        $relation = $issue->test();
        
        // Verify the parent model is ProctoringDiagnosticTest
        $this->assertEquals(
            ProctoringDiagnosticTest::class,
            get_class($relation->getRelated())
        );
        
        // Verify the owner key (primary key of ProctoringDiagnosticTest)
        $this->assertEquals('id', $relation->getOwnerKeyName());
    }

    /**
     * Test that all required issue categories are supported
     * 
     * Per Requirements 5.1 and 5.2, issues must support categorization
     */
    public function test_issue_supports_all_requirement_categories(): void
    {
        // Categories from design document (Requirements 5.1, 5.2)
        $requiredCategories = ['camera', 'network', 'configuration', 'performance'];
        
        foreach ($requiredCategories as $category) {
            $issue = new ProctoringDiagnosticIssue([
                'test_id' => 1,
                'category' => $category,
                'severity' => 'warning',
                'issue' => "Test {$category} issue",
                'description' => "Description for {$category}",
                'action' => "Action for {$category}",
            ]);
            
            $this->assertEquals($category, $issue->category);
            $this->assertNotNull($issue->test());
        }
    }
}
