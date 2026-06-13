<?php

namespace Tests\Unit;

use App\Services\TroubleshootingEngine;
use Tests\TestCase;

class TroubleshootingEngineTest extends TestCase
{
    private TroubleshootingEngine $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = new TroubleshootingEngine();
    }

    /**
     * Test no suggestions when all systems operational
     */
    public function test_no_suggestions_when_all_operational(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => true,
                'confidence' => 0.95,
                'face_embedding' => array_fill(0, 128, 0.1),
            ],
            'object_detection' => [
                'detected_objects' => [],
                'prohibited_objects' => [],
            ],
            'multi_face_detection' => [
                'face_count' => 1,
            ],
            'processing_time_ms' => 250,
            'status' => 'success',
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertIsArray($suggestions);
        $this->assertEmpty($suggestions, 'Should have no suggestions when all systems operational');
    }

    /**
     * Test camera issue - no face detected
     */
    public function test_camera_issue_no_face_detected(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => false,
            ],
            'processing_time_ms' => 200,
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $this->assertEquals('camera', $suggestions[0]['category']);
        $this->assertEquals('warning', $suggestions[0]['severity']);
        $this->assertStringContainsString('Wajah tidak terdeteksi', $suggestions[0]['issue']);
        $this->assertArrayHasKey('description', $suggestions[0]);
        $this->assertArrayHasKey('action', $suggestions[0]);
    }

    /**
     * Test camera issue - poor lighting (low confidence)
     */
    public function test_camera_issue_poor_lighting(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => true,
                'confidence' => 0.55,
            ],
            'processing_time_ms' => 200,
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $cameraIssues = array_filter($suggestions, fn($s) => $s['category'] === 'camera');
        $this->assertNotEmpty($cameraIssues);
        
        $poorLightingSuggestion = array_values(array_filter($cameraIssues, fn($s) => 
            str_contains($s['issue'], 'Kualitas deteksi wajah rendah')
        ));
        
        $this->assertNotEmpty($poorLightingSuggestion);
        $this->assertEquals('info', $poorLightingSuggestion[0]['severity']);
    }

    /**
     * Test service issue - face_recognition not installed
     */
    public function test_service_issue_face_recognition_not_installed(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => true,
                'face_embedding' => null,
            ],
            'processing_time_ms' => 200,
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $serviceIssues = array_filter($suggestions, fn($s) => $s['category'] === 'network');
        $this->assertNotEmpty($serviceIssues);
        
        $faceRecognitionIssue = array_values(array_filter($serviceIssues, fn($s) => 
            str_contains($s['issue'], 'face_recognition')
        ));
        
        $this->assertNotEmpty($faceRecognitionIssue);
        $this->assertEquals('critical', $faceRecognitionIssue[0]['severity']);
        $this->assertArrayHasKey('technical_details', $faceRecognitionIssue[0]);
        $this->assertArrayHasKey('documentation_link', $faceRecognitionIssue[0]);
        $this->assertEquals('IDENTITY_MISMATCH_DETECTION.md', $faceRecognitionIssue[0]['documentation_link']);
    }

    /**
     * Test service issue - proctoring service unreachable
     */
    public function test_service_issue_proctoring_unreachable(): void
    {
        $analysisResult = [
            'status' => 'error',
            'message' => 'Connection refused',
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $serviceIssues = array_filter($suggestions, fn($s) => $s['category'] === 'network');
        $this->assertNotEmpty($serviceIssues);
        
        $unreachableIssue = array_values(array_filter($serviceIssues, fn($s) => 
            str_contains($s['issue'], 'tidak dapat dijangkau')
        ));
        
        $this->assertNotEmpty($unreachableIssue);
        $this->assertEquals('critical', $unreachableIssue[0]['severity']);
    }

    /**
     * Test service issue - request timeout
     */
    public function test_service_issue_request_timeout(): void
    {
        $analysisResult = [
            'processing_time_ms' => 35000, // 35 seconds
            'face_analysis' => [
                'face_detected' => true,
            ],
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $serviceIssues = array_filter($suggestions, fn($s) => $s['category'] === 'network');
        $this->assertNotEmpty($serviceIssues);
        
        $timeoutIssue = array_values(array_filter($serviceIssues, fn($s) => 
            str_contains($s['issue'], 'timeout')
        ));
        
        $this->assertNotEmpty($timeoutIssue);
        $this->assertEquals('warning', $timeoutIssue[0]['severity']);
    }

    /**
     * Test configuration issue - multiple prohibited objects
     */
    public function test_configuration_issue_multiple_prohibited_objects(): void
    {
        $analysisResult = [
            'object_detection' => [
                'prohibited_objects' => ['cell phone', 'book', 'laptop'],
            ],
            'face_analysis' => [
                'face_detected' => true,
            ],
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $configIssues = array_filter($suggestions, fn($s) => $s['category'] === 'configuration');
        $this->assertNotEmpty($configIssues);
        
        $prohibitedIssue = array_values(array_filter($configIssues, fn($s) => 
            str_contains($s['issue'], 'objek terlarang')
        ));
        
        $this->assertNotEmpty($prohibitedIssue);
        $this->assertEquals('warning', $prohibitedIssue[0]['severity']);
        $this->assertArrayHasKey('related_config', $prohibitedIssue[0]);
        $this->assertContains('PROHIBITED_OBJECTS', $prohibitedIssue[0]['related_config']);
    }

    /**
     * Test configuration issue - multiple faces detected
     */
    public function test_configuration_issue_multiple_faces(): void
    {
        $analysisResult = [
            'multi_face_detection' => [
                'face_count' => 3,
            ],
            'face_analysis' => [
                'face_detected' => true,
            ],
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $configIssues = array_filter($suggestions, fn($s) => $s['category'] === 'configuration');
        $this->assertNotEmpty($configIssues);
        
        $multiFaceIssue = array_values(array_filter($configIssues, fn($s) => 
            str_contains($s['issue'], 'Multiple wajah')
        ));
        
        $this->assertNotEmpty($multiFaceIssue);
        $this->assertEquals('warning', $multiFaceIssue[0]['severity']);
        $this->assertArrayHasKey('related_config', $multiFaceIssue[0]);
    }

    /**
     * Test performance issue - slow processing
     */
    public function test_performance_issue_slow_processing(): void
    {
        $analysisResult = [
            'processing_time_ms' => 8000, // 8 seconds
            'face_analysis' => [
                'face_detected' => true,
            ],
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $perfIssues = array_filter($suggestions, fn($s) => $s['category'] === 'performance');
        $this->assertNotEmpty($perfIssues);
        
        $slowIssue = array_values(array_filter($perfIssues, fn($s) => 
            str_contains($s['issue'], 'Processing time lambat')
        ));
        
        $this->assertNotEmpty($slowIssue);
        $this->assertEquals('warning', $slowIssue[0]['severity']);
    }

    /**
     * Test suggestion structure
     */
    public function test_suggestion_structure(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => false,
            ],
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $suggestion = $suggestions[0];

        // Required fields
        $this->assertArrayHasKey('category', $suggestion);
        $this->assertArrayHasKey('severity', $suggestion);
        $this->assertArrayHasKey('issue', $suggestion);
        $this->assertArrayHasKey('description', $suggestion);
        $this->assertArrayHasKey('action', $suggestion);

        // Valid category values
        $this->assertContains($suggestion['category'], ['camera', 'network', 'configuration', 'performance']);

        // Valid severity values
        $this->assertContains($suggestion['severity'], ['critical', 'warning', 'info']);

        // Non-empty required fields
        $this->assertNotEmpty($suggestion['issue']);
        $this->assertNotEmpty($suggestion['description']);
        $this->assertNotEmpty($suggestion['action']);
    }

    /**
     * Test multiple issues detection
     */
    public function test_multiple_issues_detection(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => true,
                'confidence' => 0.55,
                'face_embedding' => null,
            ],
            'object_detection' => [
                'prohibited_objects' => ['cell phone', 'book', 'laptop'],
                'detected_objects' => [
                    ['class' => 'cell phone', 'confidence' => 0.65],
                ],
            ],
            'multi_face_detection' => [
                'face_count' => 2,
            ],
            'processing_time_ms' => 7000,
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        
        // Should have suggestions from multiple categories
        $categories = array_unique(array_column($suggestions, 'category'));
        $this->assertGreaterThan(1, count($categories), 'Should detect issues in multiple categories');
    }

    /**
     * Test optional fields in suggestions
     */
    public function test_optional_fields_in_suggestions(): void
    {
        $analysisResult = [
            'face_analysis' => [
                'face_detected' => true,
                'face_embedding' => null,
            ],
        ];

        $suggestions = $this->engine->generateSuggestions($analysisResult);

        $this->assertNotEmpty($suggestions);
        $suggestion = $suggestions[0];

        // This issue should have technical_details and documentation_link
        $this->assertArrayHasKey('technical_details', $suggestion);
        $this->assertArrayHasKey('documentation_link', $suggestion);
        $this->assertStringContainsString('pip install face_recognition', $suggestion['technical_details']);
    }
}
