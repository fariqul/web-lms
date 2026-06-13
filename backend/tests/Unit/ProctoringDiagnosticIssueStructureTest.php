<?php

namespace Tests\Unit;

use App\Models\ProctoringDiagnosticIssue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProctoringDiagnosticIssueStructureTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test model can be instantiated with all fillable attributes
     */
    public function test_model_can_be_instantiated_with_all_attributes(): void
    {
        $attributes = [
            'test_id' => 1,
            'category' => 'camera',
            'severity' => 'warning',
            'issue' => 'No face detected',
            'description' => 'Camera tidak mendeteksi wajah pada gambar yang di-capture.',
            'action' => 'Pastikan wajah terlihat jelas di kamera dengan pencahayaan yang cukup.',
            'technical_details' => 'Face detection confidence: 0.23',
            'related_config' => ['CONFIDENCE_THRESHOLD', 'FACE_DETECTION_MODEL'],
            'documentation_link' => 'https://docs.example.com/troubleshooting',
        ];

        $issue = new ProctoringDiagnosticIssue($attributes);

        $this->assertEquals(1, $issue->test_id);
        $this->assertEquals('camera', $issue->category);
        $this->assertEquals('warning', $issue->severity);
        $this->assertEquals('No face detected', $issue->issue);
        $this->assertIsArray($issue->related_config);
        $this->assertCount(2, $issue->related_config);
    }

    /**
     * Test that enum categories match design specification
     */
    public function test_valid_category_values(): void
    {
        $validCategories = ['camera', 'network', 'configuration', 'performance'];
        
        foreach ($validCategories as $category) {
            $issue = new ProctoringDiagnosticIssue(['category' => $category]);
            $this->assertEquals($category, $issue->category);
        }
    }

    /**
     * Test that enum severity levels match design specification
     */
    public function test_valid_severity_values(): void
    {
        $validSeverities = ['critical', 'warning', 'info'];
        
        foreach ($validSeverities as $severity) {
            $issue = new ProctoringDiagnosticIssue(['severity' => $severity]);
            $this->assertEquals($severity, $issue->severity);
        }
    }

    /**
     * Test that related_config properly handles array data
     */
    public function test_related_config_handles_array_properly(): void
    {
        $configKeys = ['HEAD_YAW_THRESHOLD', 'HEAD_PITCH_THRESHOLD', 'EYE_GAZE_THRESHOLD'];
        
        $issue = new ProctoringDiagnosticIssue([
            'related_config' => $configKeys,
        ]);

        $this->assertIsArray($issue->related_config);
        $this->assertEquals($configKeys, $issue->related_config);
    }

    /**
     * Test that nullable fields accept null values
     */
    public function test_nullable_fields_accept_null(): void
    {
        $issue = new ProctoringDiagnosticIssue([
            'test_id' => 1,
            'category' => 'camera',
            'severity' => 'info',
            'issue' => 'Test issue',
            'description' => 'Test description',
            'action' => 'Test action',
            'technical_details' => null,
            'related_config' => null,
            'documentation_link' => null,
        ]);

        $this->assertNull($issue->technical_details);
        $this->assertNull($issue->related_config);
        $this->assertNull($issue->documentation_link);
    }

    /**
     * Test model matches requirements 5.1 and 5.2
     */
    public function test_model_supports_requirements_5_1_and_5_2(): void
    {
        // Requirement 5.1: Issue detection logic
        // Model should store issue detection results
        $issue = new ProctoringDiagnosticIssue([
            'category' => 'camera',
            'severity' => 'critical',
            'issue' => 'Camera permission denied',
            'description' => 'User denied camera access',
        ]);

        $this->assertNotEmpty($issue->issue);
        $this->assertNotEmpty($issue->description);

        // Requirement 5.2: Actionable suggestions
        // Model should store actionable recommendations
        $issue->action = 'Enable camera permission in browser settings';
        $issue->technical_details = 'navigator.permissions.query({name: "camera"})';
        
        $this->assertNotEmpty($issue->action);
        $this->assertGreaterThan(20, strlen($issue->action)); // Per property 5.2
    }
}
