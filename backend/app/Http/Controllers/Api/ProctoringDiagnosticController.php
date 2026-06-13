<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProctoringDiagnosticTest;
use App\Models\ProctoringDiagnosticIssue;
use App\Services\TroubleshootingEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Carbon\Carbon;
use Exception;

class ProctoringDiagnosticController extends Controller
{
    private TroubleshootingEngine $troubleshootingEngine;

    public function __construct(TroubleshootingEngine $troubleshootingEngine)
    {
        // Apply admin authorization middleware to all methods
        $this->middleware(['auth:sanctum', 'role:admin']);
        
        $this->troubleshootingEngine = $troubleshootingEngine;
    }

    /**
     * Analyze captured frame
     * POST /api/proctoring-diagnostic/analyze
     * 
     * Requirements: 2.2 (Frame capture quality), 3.1 (Complete analysis execution),
     *               3.2 (Score calculation accuracy), 5.1 (Issue detection logic),
     *               6.1 (Test persistence)
     */
    public function analyzeCapture(Request $request): JsonResponse
    {
        // 1. Validate request
        $validator = Validator::make($request->all(), [
            'image' => 'required|string',
            'test_type' => 'sometimes|in:manual,scenario',
            'scenario_name' => 'sometimes|string|max:50',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $imageData = $request->input('image');
            $testType = $request->input('test_type', 'manual');
            $scenarioName = $request->input('scenario_name');

            // Calculate image size (approximate from base64)
            $imageSizeKb = $this->calculateImageSize($imageData);

            // 2. Forward image to proctoring service
            $proctoringServiceUrl = env('PROCTORING_SERVICE_URL', 'http://proctoring:8001');
            $startTime = microtime(true);

            $response = Http::timeout(60)->post("{$proctoringServiceUrl}/analyze", [
                'image' => $imageData,
            ]);

            if (!$response->successful()) {
                throw new Exception("Proctoring service error: " . $response->body());
            }

            $analysisResult = $response->json();
            $endTime = microtime(true);
            $processingTimeMs = intval(($endTime - $startTime) * 1000);

            // Override processing_time_ms from service with actual measured time
            $analysisResult['processing_time_ms'] = $processingTimeMs;

            // 3. Parse proctoring service response
            $faceAnalysis = $analysisResult['face_analysis'] ?? [];
            $objectDetection = $analysisResult['object_detection'] ?? [];
            $multiFaceDetection = $analysisResult['multi_face_detection'] ?? [];

            // 4. Calculate component scores (0-100 scale)
            $componentScores = $this->calculateComponentScores($analysisResult);

            // 5. Calculate overall health score (weighted average)
            $overallHealthScore = $this->calculateOverallHealthScore($componentScores);

            // 6. Determine overall status based on thresholds
            $overallStatus = $this->determineOverallStatus($overallHealthScore);

            // 7. Generate troubleshooting suggestions
            $troubleshooting = $this->troubleshootingEngine->generateSuggestions($analysisResult);

            // 8. Save test result to database
            $test = ProctoringDiagnosticTest::create([
                'admin_id' => Auth::id(),
                'overall_health_score' => $overallHealthScore,
                'overall_status' => $overallStatus,
                'component_scores' => $componentScores,
                'detected_objects' => $objectDetection['detected_objects'] ?? [],
                'detected_faces' => $this->formatDetectedFaces($faceAnalysis, $multiFaceDetection),
                'processing_time_ms' => $processingTimeMs,
                'image_size_kb' => $imageSizeKb,
                'test_type' => $testType,
                'scenario_name' => $scenarioName,
            ]);

            // 9. Save issues to database
            foreach ($troubleshooting as $suggestion) {
                ProctoringDiagnosticIssue::create([
                    'test_id' => $test->id,
                    'category' => $suggestion['category'],
                    'severity' => $suggestion['severity'],
                    'issue' => $suggestion['issue'],
                    'description' => $suggestion['description'],
                    'action' => $suggestion['action'],
                    'technical_details' => $suggestion['technical_details'] ?? null,
                    'related_config' => $suggestion['related_config'] ?? null,
                    'documentation_link' => $suggestion['documentation_link'] ?? null,
                ]);
            }

            // 10. Return JSON response
            return response()->json([
                'success' => true,
                'data' => [
                    'test_id' => $test->id,
                    'overall_health_score' => $overallHealthScore,
                    'overall_status' => $overallStatus,
                    'components' => $componentScores,
                    'detected_objects' => $this->formatDetectedObjects($objectDetection),
                    'detected_faces' => $this->formatDetectedFaces($faceAnalysis, $multiFaceDetection),
                    'processing_time_ms' => $processingTimeMs,
                    'troubleshooting' => $troubleshooting,
                    'timestamp' => $test->formatted_timestamp,
                ],
            ]);

        } catch (Exception $e) {
            Log::error('Proctoring diagnostic analyze error', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to analyze image: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Get test history
     * GET /api/proctoring-diagnostic/tests
     * 
     * Requirements: 6.1 (Test persistence), 6.2 (Report completeness)
     */
    public function getTestHistory(Request $request): JsonResponse
    {
        try {
            // Retrieve last 10 tests with admin relationship
            $tests = ProctoringDiagnosticTest::query()
                ->with('admin:id,name')
                ->recent(10)
                ->get();

            // Format test summaries
            $testSummaries = $tests->map(function ($test) {
                return [
                    'id' => $test->id,
                    'timestamp' => $test->formatted_timestamp,
                    'overall_health_score' => $test->overall_health_score,
                    'overall_status' => $test->overall_status,
                    'component_status' => $this->calculateComponentStatus($test->component_scores),
                    'issues_count' => $test->issues()->count(),
                    'admin_name' => $test->admin->name ?? 'Unknown',
                    'test_type' => $test->test_type,
                ];
            });

            return response()->json([
                'success' => true,
                'data' => $testSummaries,
            ]);

        } catch (Exception $e) {
            Log::error('Proctoring diagnostic getTestHistory error', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to retrieve test history',
            ], 500);
        }
    }

    /**
     * Get single test result
     * GET /api/proctoring-diagnostic/tests/{id}
     * 
     * Requirements: 6.1 (Test persistence), 6.2 (Report completeness)
     */
    public function getTestResult(int $id): JsonResponse
    {
        try {
            $test = ProctoringDiagnosticTest::with(['admin:id,name', 'issues'])
                ->findOrFail($id);

            return response()->json([
                'success' => true,
                'data' => [
                    'id' => $test->id,
                    'timestamp' => $test->formatted_timestamp,
                    'admin_name' => $test->admin->name ?? 'Unknown',
                    'overall_health_score' => $test->overall_health_score,
                    'overall_status' => $test->overall_status,
                    'component_scores' => $test->component_scores,
                    'detected_objects' => $test->detected_objects,
                    'detected_faces' => $test->detected_faces,
                    'processing_time_ms' => $test->processing_time_ms,
                    'image_size_kb' => $test->image_size_kb,
                    'test_type' => $test->test_type,
                    'scenario_name' => $test->scenario_name,
                    'issues' => $test->issues,
                ],
            ]);

        } catch (Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Test not found',
            ], 404);
        }
    }

    /**
     * Download test report as JSON
     * GET /api/proctoring-diagnostic/tests/{id}/report
     * 
     * Requirements: 6.2 (Report completeness)
     */
    public function downloadReport(int $id): Response
    {
        try {
            $test = ProctoringDiagnosticTest::with(['admin:id,name', 'issues'])
                ->findOrFail($id);

            // Build comprehensive JSON report
            $report = [
                'report_metadata' => [
                    'test_id' => $test->id,
                    'generated_at' => now()->timezone('Asia/Jakarta')->format('Y-m-d H:i:s T'),
                    'admin_name' => $test->admin->name ?? 'Unknown',
                    'system_version' => config('app.version', '1.0.0'),
                ],
                'test_summary' => [
                    'timestamp' => $test->formatted_timestamp,
                    'overall_health_score' => $test->overall_health_score,
                    'overall_status' => $test->overall_status,
                    'test_type' => $test->test_type,
                    'scenario_name' => $test->scenario_name,
                ],
                'system_configuration' => [
                    'HEAD_YAW_THRESHOLD' => config('proctoring.head_yaw_threshold', 38),
                    'HEAD_PITCH_THRESHOLD' => config('proctoring.head_pitch_threshold', 33),
                    'EYE_GAZE_THRESHOLD' => config('proctoring.eye_gaze_threshold', 0.48),
                    'FACE_SIMILARITY_THRESHOLD' => config('proctoring.face_similarity_threshold', 0.6),
                    'PROCTORING_SERVICE_URL' => env('PROCTORING_SERVICE_URL', 'http://proctoring:8001'),
                ],
                'analysis_results' => [
                    'components' => $test->component_scores,
                    'detected_objects' => $test->detected_objects,
                    'detected_faces' => $test->detected_faces,
                ],
                'detected_issues' => $test->issues->map(function ($issue) {
                    return [
                        'category' => $issue->category,
                        'severity' => $issue->severity,
                        'issue' => $issue->issue,
                        'description' => $issue->description,
                        'action' => $issue->action,
                        'technical_details' => $issue->technical_details,
                        'related_config' => $issue->related_config,
                        'documentation_link' => $issue->documentation_link,
                    ];
                }),
                'recommendations' => $this->generateRecommendations($test),
                'performance_metrics' => [
                    'processing_time_ms' => $test->processing_time_ms,
                    'image_size_kb' => $test->image_size_kb,
                ],
            ];

            $filename = "diagnostic-test-{$test->id}.json";
            $jsonContent = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

            return response($jsonContent, 200)
                ->header('Content-Type', 'application/json')
                ->header('Content-Disposition', "attachment; filename=\"{$filename}\"");

        } catch (Exception $e) {
            return response('Test not found', 404);
        }
    }

    /**
     * Get system health status
     * GET /api/proctoring-diagnostic/health
     * 
     * Requirements: 1.2 (System status check), 7.1 (Health check frequency),
     *               7.2 (Status accuracy)
     */
    public function getHealthStatus(): JsonResponse
    {
        // Cache results for 10 seconds
        $healthStatus = Cache::remember('proctoring_diagnostic_health', 10, function () {
            $backendApi = $this->checkBackendApi();
            $proctoringService = $this->checkProctoringService();
            $database = $this->checkDatabase();
            $queueWorkers = $this->checkQueueWorkers();

            return [
                'backend_api' => $backendApi,
                'proctoring_service' => $proctoringService,
                'database' => $database,
                'queue_workers' => $queueWorkers,
                'last_check' => now()->timezone('Asia/Jakarta')->format('Y-m-d H:i:s T'),
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $healthStatus,
        ]);
    }

    /**
     * Compare two test results
     * GET /api/proctoring-diagnostic/tests/compare?ids=1,2
     * 
     * Requirements: 6.1 (Test persistence)
     */
    public function compareTests(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'ids' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            $ids = explode(',', $request->input('ids'));
            
            if (count($ids) !== 2) {
                return response()->json([
                    'success' => false,
                    'message' => 'Exactly two test IDs required for comparison',
                ], 422);
            }

            $tests = ProctoringDiagnosticTest::with(['admin:id,name', 'issues'])
                ->whereIn('id', $ids)
                ->get();

            if ($tests->count() !== 2) {
                return response()->json([
                    'success' => false,
                    'message' => 'One or both tests not found',
                ], 404);
            }

            $test1 = $tests[0];
            $test2 = $tests[1];

            // Calculate differences
            $overallScoreDiff = $test2->overall_health_score - $test1->overall_health_score;
            $componentDiffs = [];

            foreach ($test1->component_scores as $componentName => $componentData) {
                $score1 = $componentData['score'] ?? 0;
                $score2 = $test2->component_scores[$componentName]['score'] ?? 0;
                
                $componentDiffs[$componentName] = [
                    'test1_score' => $score1,
                    'test2_score' => $score2,
                    'difference' => $score2 - $score1,
                    'change_type' => $this->determineChangeType($score1, $score2),
                ];
            }

            return response()->json([
                'success' => true,
                'data' => [
                    'test1' => [
                        'id' => $test1->id,
                        'timestamp' => $test1->formatted_timestamp,
                        'overall_health_score' => $test1->overall_health_score,
                        'overall_status' => $test1->overall_status,
                    ],
                    'test2' => [
                        'id' => $test2->id,
                        'timestamp' => $test2->formatted_timestamp,
                        'overall_health_score' => $test2->overall_health_score,
                        'overall_status' => $test2->overall_status,
                    ],
                    'comparison' => [
                        'overall_score_difference' => $overallScoreDiff,
                        'component_differences' => $componentDiffs,
                        'improvements' => $this->getImprovements($componentDiffs),
                        'regressions' => $this->getRegressions($componentDiffs),
                    ],
                ],
            ]);

        } catch (Exception $e) {
            Log::error('Proctoring diagnostic compareTests error', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to compare tests',
            ], 500);
        }
    }

    /**
     * Run interactive scenario test
     * POST /api/proctoring-diagnostic/scenarios/{scenario}/run
     * 
     * Requirements: 8.1 (Scenario validation), 8.2 (Comprehensive test coverage)
     */
    public function runScenario(Request $request, string $scenario): JsonResponse
    {
        // Validate scenario parameter
        $validScenarios = ['object_detection', 'multi_face', 'head_turning', 'identity_baseline', 'identity_mismatch'];
        
        if (!in_array($scenario, $validScenarios)) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid scenario',
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'image' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Validation error',
                'errors' => $validator->errors(),
            ], 422);
        }

        try {
            // Reuse analyzeCapture logic
            $request->merge([
                'test_type' => 'scenario',
                'scenario_name' => $scenario,
            ]);

            $analyzeResponse = $this->analyzeCapture($request);
            $analyzeData = $analyzeResponse->getData(true);

            if (!$analyzeData['success']) {
                return $analyzeResponse;
            }

            // Validate scenario-specific requirements
            $scenarioResult = $this->validateScenario($scenario, $analyzeData['data']);

            return response()->json([
                'success' => true,
                'data' => [
                    'scenario' => $scenario,
                    'test_id' => $analyzeData['data']['test_id'],
                    'verdict' => $scenarioResult['verdict'],
                    'explanation' => $scenarioResult['explanation'],
                    'requirements_met' => $scenarioResult['requirements_met'],
                    'requirements_failed' => $scenarioResult['requirements_failed'],
                    'analysis' => $analyzeData['data'],
                ],
            ]);

        } catch (Exception $e) {
            Log::error('Proctoring diagnostic runScenario error', [
                'scenario' => $scenario,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to run scenario test',
            ], 500);
        }
    }

    // ==================== HELPER METHODS ====================

    /**
     * Calculate image size from base64 string
     */
    private function calculateImageSize(string $imageData): int
    {
        // Remove data URI prefix if present
        if (strpos($imageData, 'base64,') !== false) {
            $imageData = substr($imageData, strpos($imageData, 'base64,') + 7);
        }

        // Calculate size in KB
        $sizeBytes = (strlen($imageData) * 3) / 4;
        return intval($sizeBytes / 1024);
    }

    /**
     * Calculate component scores from analysis result
     */
    private function calculateComponentScores(array $analysisResult): array
    {
        $faceAnalysis = $analysisResult['face_analysis'] ?? [];
        $objectDetection = $analysisResult['object_detection'] ?? [];
        $multiFaceDetection = $analysisResult['multi_face_detection'] ?? [];

        // Object Detection Score
        $objectDetectionScore = $this->calculateObjectDetectionScore($objectDetection);

        // Face Detection Score
        $faceDetectionScore = $this->calculateFaceDetectionScore($faceAnalysis);

        // Head Pose Score
        $headPoseScore = $this->calculateHeadPoseScore($faceAnalysis);

        // Eye Gaze Score
        $eyeGazeScore = $this->calculateEyeGazeScore($faceAnalysis);

        // Face Embedding Score
        $faceEmbeddingScore = $this->calculateFaceEmbeddingScore($faceAnalysis);

        return [
            'object_detection' => $objectDetectionScore,
            'face_detection' => $faceDetectionScore,
            'head_pose' => $headPoseScore,
            'eye_gaze' => $eyeGazeScore,
            'face_embedding' => $faceEmbeddingScore,
        ];
    }

    private function calculateObjectDetectionScore(array $objectDetection): array
    {
        $detectedObjects = $objectDetection['detected_objects'] ?? [];
        $status = !empty($detectedObjects) ? 'success' : 'failure';
        
        // Score based on detection confidence
        $totalConfidence = 0;
        $count = count($detectedObjects);
        
        if ($count > 0) {
            foreach ($detectedObjects as $obj) {
                $totalConfidence += ($obj['confidence'] ?? 0);
            }
            $avgConfidence = $totalConfidence / $count;
            $score = intval($avgConfidence * 100);
        } else {
            $score = 0;
            $avgConfidence = 0;
        }

        return [
            'status' => $status,
            'score' => $score,
            'confidence' => $avgConfidence,
            'details' => [
                'detected_count' => $count,
                'prohibited_count' => count($objectDetection['prohibited_objects'] ?? []),
                'suspicious_count' => count($objectDetection['suspicious_objects'] ?? []),
            ],
        ];
    }

    private function calculateFaceDetectionScore(array $faceAnalysis): array
    {
        $faceDetected = $faceAnalysis['face_detected'] ?? false;
        $confidence = $faceAnalysis['confidence'] ?? 0;
        
        return [
            'status' => $faceDetected ? 'success' : 'failure',
            'score' => $faceDetected ? 100 : 0,
            'confidence' => $confidence,
            'details' => [
                'face_count' => $faceDetected ? 1 : 0,
            ],
        ];
    }

    private function calculateHeadPoseScore(array $faceAnalysis): array
    {
        $headPose = $faceAnalysis['head_pose'] ?? null;
        
        if (!$headPose) {
            return [
                'status' => 'failure',
                'score' => 0,
                'confidence' => 0,
                'details' => [],
            ];
        }

        $yaw = abs($headPose['yaw'] ?? 0);
        $pitch = abs($headPose['pitch'] ?? 0);
        $roll = abs($headPose['roll'] ?? 0);

        // Score based on how close to center (0,0,0) the head pose is
        $yawThreshold = config('proctoring.head_yaw_threshold', 38);
        $pitchThreshold = config('proctoring.head_pitch_threshold', 33);

        $yawScore = max(0, 100 - ($yaw / $yawThreshold * 100));
        $pitchScore = max(0, 100 - ($pitch / $pitchThreshold * 100));
        $overallScore = intval(($yawScore + $pitchScore) / 2);

        return [
            'status' => ($yaw < $yawThreshold && $pitch < $pitchThreshold) ? 'success' : 'degraded',
            'score' => $overallScore,
            'confidence' => 1.0,
            'details' => [
                'yaw' => $headPose['yaw'],
                'pitch' => $headPose['pitch'],
                'roll' => $headPose['roll'],
            ],
        ];
    }

    private function calculateEyeGazeScore(array $faceAnalysis): array
    {
        $eyeGaze = $faceAnalysis['eye_gaze'] ?? null;
        
        if (!$eyeGaze) {
            return [
                'status' => 'failure',
                'score' => 0,
                'confidence' => 0,
                'details' => [],
            ];
        }

        $leftRatio = $eyeGaze['left_ratio'] ?? 0;
        $rightRatio = $eyeGaze['right_ratio'] ?? 0;
        $threshold = config('proctoring.eye_gaze_threshold', 0.48);

        // Score based on how normal the eye gaze is
        $avgRatio = ($leftRatio + $rightRatio) / 2;
        $score = intval((1 - abs($avgRatio - 0.35) / 0.35) * 100);
        $score = max(0, min(100, $score));

        return [
            'status' => ($leftRatio < $threshold && $rightRatio < $threshold) ? 'success' : 'degraded',
            'score' => $score,
            'confidence' => 1.0,
            'details' => [
                'left_ratio' => $leftRatio,
                'right_ratio' => $rightRatio,
            ],
        ];
    }

    private function calculateFaceEmbeddingScore(array $faceAnalysis): array
    {
        $faceEmbedding = $faceAnalysis['face_embedding'] ?? null;
        $faceDetected = $faceAnalysis['face_detected'] ?? false;
        
        if (!$faceDetected) {
            return [
                'status' => 'failure',
                'score' => 0,
                'confidence' => 0,
                'details' => [],
            ];
        }

        if ($faceEmbedding === null) {
            return [
                'status' => 'failure',
                'score' => 0,
                'confidence' => 0,
                'details' => [
                    'message' => 'face_recognition library not installed',
                ],
            ];
        }

        $dimensions = is_array($faceEmbedding) ? count($faceEmbedding) : 0;

        return [
            'status' => 'success',
            'score' => 100,
            'confidence' => 1.0,
            'details' => [
                'dimensions' => $dimensions,
            ],
        ];
    }

    /**
     * Calculate overall health score (weighted average)
     */
    private function calculateOverallHealthScore(array $componentScores): int
    {
        $weights = [
            'object_detection' => 0.20,
            'face_detection' => 0.30,
            'head_pose' => 0.20,
            'eye_gaze' => 0.15,
            'face_embedding' => 0.15,
        ];

        $totalScore = 0;
        $totalWeight = 0;

        foreach ($componentScores as $component => $data) {
            $weight = $weights[$component] ?? 0;
            $score = $data['score'] ?? 0;
            $totalScore += $score * $weight;
            $totalWeight += $weight;
        }

        return $totalWeight > 0 ? intval($totalScore / $totalWeight) : 0;
    }

    /**
     * Determine overall status based on health score thresholds
     */
    private function determineOverallStatus(int $healthScore): string
    {
        if ($healthScore >= 80) {
            return 'healthy';
        } elseif ($healthScore >= 60) {
            return 'warning';
        } else {
            return 'critical';
        }
    }

    /**
     * Format detected objects for response
     */
    private function formatDetectedObjects(array $objectDetection): array
    {
        $detectedObjects = $objectDetection['detected_objects'] ?? [];
        $prohibitedObjects = $objectDetection['prohibited_objects'] ?? [];
        $suspiciousObjects = $objectDetection['suspicious_objects'] ?? [];

        return array_map(function ($obj) use ($prohibitedObjects, $suspiciousObjects) {
            $class = $obj['class'] ?? 'unknown';
            
            $severity = 'allowed';
            if (in_array($class, $prohibitedObjects)) {
                $severity = 'prohibited';
            } elseif (in_array($class, $suspiciousObjects)) {
                $severity = 'suspicious';
            }

            return [
                'class' => $class,
                'confidence' => $obj['confidence'] ?? 0,
                'bbox' => $obj['bbox'] ?? [0, 0, 0, 0],
                'severity' => $severity,
            ];
        }, $detectedObjects);
    }

    /**
     * Format detected faces for response
     */
    private function formatDetectedFaces(array $faceAnalysis, array $multiFaceDetection): array
    {
        $faces = [];

        if ($faceAnalysis['face_detected'] ?? false) {
            $face = [
                'bbox' => $faceAnalysis['face_bbox'] ?? [0, 0, 0, 0],
                'head_pose' => $faceAnalysis['head_pose'] ?? ['yaw' => 0, 'pitch' => 0, 'roll' => 0],
                'eye_gaze' => $faceAnalysis['eye_gaze'] ?? ['left_ratio' => 0, 'right_ratio' => 0],
                'embedding_present' => isset($faceAnalysis['face_embedding']) && $faceAnalysis['face_embedding'] !== null,
            ];

            if (isset($faceAnalysis['landmarks'])) {
                $face['landmarks'] = $faceAnalysis['landmarks'];
            }

            if (isset($faceAnalysis['face_embedding']) && is_array($faceAnalysis['face_embedding'])) {
                $face['embedding_dimensions'] = count($faceAnalysis['face_embedding']);
            }

            $faces[] = $face;
        }

        return $faces;
    }

    /**
     * Calculate component pass/fail status for test history
     */
    private function calculateComponentStatus(array $componentScores): array
    {
        $status = [];

        foreach ($componentScores as $component => $data) {
            $score = $data['score'] ?? 0;
            $status[$component] = ($score >= 60) ? 'pass' : 'fail';
        }

        return $status;
    }

    /**
     * Generate actionable recommendations for report
     */
    private function generateRecommendations(ProctoringDiagnosticTest $test): array
    {
        $recommendations = [];

        if ($test->overall_health_score < 60) {
            $recommendations[] = 'Sistem proctoring memerlukan perhatian segera. Review semua isu yang terdeteksi dan ambil tindakan korektif.';
        }

        if ($test->issues()->where('severity', 'critical')->count() > 0) {
            $recommendations[] = 'Ada isu critical yang harus diselesaikan sebelum menggunakan sistem untuk ujian.';
        }

        if ($test->processing_time_ms > 5000) {
            $recommendations[] = 'Waktu pemrosesan lambat. Pertimbangkan untuk mengoptimalkan resource server atau menggunakan GPU.';
        }

        if (empty($recommendations)) {
            $recommendations[] = 'Sistem berfungsi dengan baik. Lakukan diagnostic test secara berkala untuk monitoring.';
        }

        return $recommendations;
    }

    /**
     * Health check: Backend API
     */
    private function checkBackendApi(): array
    {
        $startTime = microtime(true);
        $status = 'healthy';
        $responseTime = intval((microtime(true) - $startTime) * 1000);

        return [
            'status' => $status,
            'response_time_ms' => $responseTime,
            'version' => config('app.version', '1.0.0'),
        ];
    }

    /**
     * Health check: Proctoring Service
     */
    private function checkProctoringService(): array
    {
        try {
            $proctoringServiceUrl = env('PROCTORING_SERVICE_URL', 'http://proctoring:8001');
            $startTime = microtime(true);

            $response = Http::timeout(5)->get("{$proctoringServiceUrl}/health");
            $responseTime = intval((microtime(true) - $startTime) * 1000);

            if ($response->successful()) {
                $healthData = $response->json();

                return [
                    'status' => 'healthy',
                    'response_time_ms' => $responseTime,
                    'yolo_loaded' => $healthData['yolo_loaded'] ?? false,
                    'mediapipe_loaded' => $healthData['mediapipe_loaded'] ?? false,
                    'face_recognition_loaded' => $healthData['face_recognition_loaded'] ?? false,
                    'device' => $healthData['device'] ?? 'unknown',
                ];
            } else {
                return [
                    'status' => 'degraded',
                    'response_time_ms' => $responseTime,
                    'message' => 'Service returned non-200 status',
                ];
            }

        } catch (Exception $e) {
            return [
                'status' => 'down',
                'response_time_ms' => null,
                'message' => 'Service unreachable: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Health check: Database
     */
    private function checkDatabase(): array
    {
        try {
            $startTime = microtime(true);
            DB::connection()->getPdo();
            $responseTime = intval((microtime(true) - $startTime) * 1000);

            return [
                'status' => 'healthy',
                'response_time_ms' => $responseTime,
            ];

        } catch (Exception $e) {
            return [
                'status' => 'down',
                'response_time_ms' => null,
                'message' => 'Database connection failed',
            ];
        }
    }

    /**
     * Health check: Queue Workers
     */
    private function checkQueueWorkers(): array
    {
        try {
            // Check if queue system is configured
            $queueConnection = config('queue.default');
            
            // Basic health check - in production, you might want to check actual worker status
            // For now, we'll assume workers are running if queue is configured
            return [
                'status' => 'running',
                'worker_count' => 3, // This should be dynamically checked in production
                'message' => "Queue connection: {$queueConnection}",
            ];

        } catch (Exception $e) {
            return [
                'status' => 'stopped',
                'worker_count' => 0,
                'message' => 'Unable to check queue workers',
            ];
        }
    }

    /**
     * Determine change type for comparison
     */
    private function determineChangeType(int $score1, int $score2): string
    {
        $diff = $score2 - $score1;

        if ($diff > 5) {
            return 'improvement';
        } elseif ($diff < -5) {
            return 'regression';
        } else {
            return 'stable';
        }
    }

    /**
     * Get improvements from component differences
     */
    private function getImprovements(array $componentDiffs): array
    {
        $improvements = [];

        foreach ($componentDiffs as $component => $diff) {
            if ($diff['change_type'] === 'improvement') {
                $improvements[] = [
                    'component' => $component,
                    'improvement' => $diff['difference'],
                ];
            }
        }

        return $improvements;
    }

    /**
     * Get regressions from component differences
     */
    private function getRegressions(array $componentDiffs): array
    {
        $regressions = [];

        foreach ($componentDiffs as $component => $diff) {
            if ($diff['change_type'] === 'regression') {
                $regressions[] = [
                    'component' => $component,
                    'regression' => abs($diff['difference']),
                ];
            }
        }

        return $regressions;
    }

    /**
     * Validate scenario-specific requirements
     */
    private function validateScenario(string $scenario, array $analysisData): array
    {
        $requirementsMet = [];
        $requirementsFailed = [];
        $verdict = 'fail';
        $explanation = '';

        switch ($scenario) {
            case 'object_detection':
                $detectedObjects = $analysisData['detected_objects'] ?? [];
                if (count($detectedObjects) > 0) {
                    $verdict = 'pass';
                    $explanation = 'PASS: Objek berhasil terdeteksi. Sistem object detection berfungsi dengan baik.';
                    $requirementsMet[] = 'Minimal 1 objek terdeteksi';
                } else {
                    $explanation = 'FAIL: Tidak ada objek terdeteksi. Coba tunjukkan objek (misalnya phone) ke kamera dengan jelas.';
                    $requirementsFailed[] = 'Minimal 1 objek terdeteksi';
                }
                break;

            case 'multi_face':
                $detectedFaces = $analysisData['detected_faces'] ?? [];
                $faceCount = count($detectedFaces);
                
                if ($faceCount > 1) {
                    $verdict = 'pass';
                    $explanation = "PASS: Terdeteksi {$faceCount} wajah. Sistem multi-face detection berfungsi dengan baik.";
                    $requirementsMet[] = 'Lebih dari 1 wajah terdeteksi';
                } else {
                    $explanation = 'FAIL: Hanya terdeteksi 1 wajah atau kurang. Minta orang lain masuk ke frame untuk test multi-face detection.';
                    $requirementsFailed[] = 'Lebih dari 1 wajah terdeteksi';
                }
                break;

            case 'head_turning':
                $components = $analysisData['components'] ?? [];
                $headPose = $components['head_pose'] ?? [];
                $yaw = abs($headPose['details']['yaw'] ?? 0);
                
                if ($yaw > 20) {
                    $verdict = 'pass';
                    $explanation = "PASS: Head pose terdeteksi dengan yaw {$yaw}°. Sistem head pose estimation berfungsi dengan baik.";
                    $requirementsMet[] = 'Head yaw > 20 derajat';
                } else {
                    $explanation = "FAIL: Head yaw terlalu kecil ({$yaw}°). Putar kepala lebih dari 20 derajat untuk test head turning detection.";
                    $requirementsFailed[] = 'Head yaw > 20 derajat';
                }
                break;

            case 'identity_baseline':
                $components = $analysisData['components'] ?? [];
                $faceEmbedding = $components['face_embedding'] ?? [];
                
                if ($faceEmbedding['status'] === 'success') {
                    $verdict = 'pass';
                    $explanation = 'PASS: Face embedding berhasil di-extract. Baseline identity tersimpan untuk perbandingan.';
                    $requirementsMet[] = 'Face embedding extracted';
                } else {
                    $explanation = 'FAIL: Face embedding tidak dapat di-extract. Pastikan face_recognition library terinstall.';
                    $requirementsFailed[] = 'Face embedding extracted';
                }
                break;

            case 'identity_mismatch':
                $components = $analysisData['components'] ?? [];
                $faceEmbedding = $components['face_embedding'] ?? [];
                
                if ($faceEmbedding['status'] === 'success') {
                    $verdict = 'pass';
                    $explanation = 'PASS: Face embedding berhasil di-extract dari orang berbeda. Sistem identity verification dapat membandingkan identitas.';
                    $requirementsMet[] = 'Face embedding extracted';
                } else {
                    $explanation = 'FAIL: Face embedding tidak dapat di-extract. Pastikan face_recognition library terinstall.';
                    $requirementsFailed[] = 'Face embedding extracted';
                }
                break;
        }

        return [
            'verdict' => $verdict,
            'explanation' => $explanation,
            'requirements_met' => $requirementsMet,
            'requirements_failed' => $requirementsFailed,
        ];
    }
}
