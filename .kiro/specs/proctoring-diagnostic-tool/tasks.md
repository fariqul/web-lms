# Implementation Plan: Proctoring Diagnostic Tool

## Overview

This implementation plan converts the Proctoring Diagnostic Tool design into a series of coding tasks. The tool provides admins with real-time testing and validation of the proctoring system's AI components, including comprehensive analysis results, visual overlays, automated troubleshooting suggestions, and historical tracking.

**Technology Stack:**
- Frontend: TypeScript, React, Next.js
- Backend: PHP, Laravel
- Database: MySQL
- Cache: Redis

## Tasks

- [ ] 1. Set up database schema and backend models
  - [x] 1.1 Create database migration for proctoring_diagnostic_tests table
    - Create migration file with complete schema (id, admin_id, overall_health_score, overall_status, component_scores JSON, detected_objects JSON, detected_faces JSON, processing_time_ms, image_size_kb, test_type ENUM, scenario_name, created_at, indexes)
    - _Requirements: 6.1 (Test persistence), 8.2 (Comprehensive test coverage)_
  
  - [x] 1.2 Create database migration for proctoring_diagnostic_issues table
    - Create migration file with complete schema (id, test_id FK, category ENUM, severity ENUM, issue, description, action, technical_details, related_config JSON, documentation_link, created_at, indexes)
    - _Requirements: 5.1 (Issue detection logic), 5.2 (Actionable suggestions)_
  
  - [ ] 1.3 Create ProctoringDiagnosticTest Eloquent model
    - Define fillable fields, casts (JSON fields to array, created_at to datetime)
    - Add relationships: admin() BelongsTo User, issues() HasMany
    - Add accessor: getFormattedTimestampAttribute() for timezone formatting
    - Add scope: scopeRecent($query, $limit) for retrieving recent tests
    - _Requirements: 6.1 (Test persistence), 6.2 (Report completeness)_
  
  - [x] 1.4 Create ProctoringDiagnosticIssue Eloquent model
    - Define fillable fields, disable default timestamps
    - Add casts: related_config to array, created_at to datetime
    - Add relationship: test() BelongsTo ProctoringDiagnosticTest
    - _Requirements: 5.1 (Issue detection logic), 5.2 (Actionable suggestions)_
  
  - [ ] 1.5 Run migrations to create database tables
    - Execute migrations: php artisan migrate
    - Verify tables created with correct schema and indexes
    - _Requirements: 6.1 (Test persistence)_

- [x] 2. Implement backend TroubleshootingEngine service
  - [x] 2.1 Create TroubleshootingEngine class with rule-based issue detection
    - Create backend/app/Services/TroubleshootingEngine.php
    - Implement generateSuggestions() method that analyzes analysis results
    - Add rules for camera issues (no face detected, low resolution, poor lighting)
    - Add rules for service issues (proctoring service unreachable, face_recognition not installed, request timeout)
    - Add rules for configuration issues (confidence below threshold, false positives)
    - Add rules for performance issues (slow processing, low confidence)
    - Implement createSuggestion() helper method for consistent suggestion structure
    - Return array of TroubleshootingSuggestion objects with category, severity, issue, description, action, technical_details, related_config, documentation_link
    - _Requirements: 5.1 (Issue detection logic), 5.2 (Actionable suggestions)_
  
  - [ ]* 2.2 Write unit tests for TroubleshootingEngine
    - Test camera issue detection (no face, low resolution)
    - Test service issue detection (face_recognition missing)
    - Test configuration issue detection (confidence below threshold)
    - Test suggestion structure and completeness
    - _Requirements: 5.1, 5.2_

- [x] 3. Implement backend ProctoringDiagnosticController
  - [x] 3.1 Create ProctoringDiagnosticController with admin authorization
    - Create backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php
    - Apply 'auth:sanctum' and 'role:admin' middleware to all methods
    - _Requirements: 1.1 (Admin-only access), 1.2 (System status check)_
  
  - [x] 3.2 Implement analyzeCapture() endpoint
    - Validate request: image field required (base64 or file upload)
    - Forward image to proctoring service POST http://proctoring:8001/analyze
    - Parse proctoring service response (face_analysis, object_detection, multi_face_detection, processing_time_ms)
    - Calculate component scores: object_detection, face_detection, head_pose, eye_gaze, face_embedding (0-100 scale)
    - Calculate overall_health_score as weighted average of component scores
    - Determine overall_status (healthy/warning/critical) based on score thresholds
    - Inject TroubleshootingEngine and call generateSuggestions()
    - Save test result to ProctoringDiagnosticTest model
    - Save issues to ProctoringDiagnosticIssue model
    - Return JSON response with test_id, overall_health_score, overall_status, components, detected_objects, detected_faces, processing_time_ms, troubleshooting, timestamp
    - Handle errors: service unreachable, timeout, invalid response
    - _Requirements: 2.2 (Frame capture quality), 3.1 (Complete analysis execution), 3.2 (Score calculation accuracy), 5.1 (Issue detection logic), 6.1 (Test persistence)_
  
  - [x] 3.3 Implement getTestHistory() endpoint
    - Retrieve last 10 tests using ProctoringDiagnosticTest::recent(10)
    - Load admin relationship eager loading
    - Format timestamps with timezone (Asia/Jakarta)
    - Calculate component_status (pass/fail) for each test
    - Count issues for each test
    - Return JSON response with array of test summaries
    - _Requirements: 6.1 (Test persistence), 6.2 (Report completeness)_
  
  - [x] 3.4 Implement getTestResult() endpoint
    - Retrieve single test by ID with admin and issues relationships
    - Verify admin role authorization
    - Return detailed test result with all component scores, detected objects/faces, issues
    - Return 404 if test not found
    - _Requirements: 6.1 (Test persistence), 6.2 (Report completeness)_
  
  - [x] 3.5 Implement downloadReport() endpoint
    - Retrieve test result by ID with relationships
    - Build comprehensive JSON report structure: report_metadata (test_id, generated_at, admin_name, system_version), test_summary (timestamp, overall_health_score, overall_status, test_type), system_configuration (thresholds from env), analysis_results (components, detected_objects, detected_faces), detected_issues (array of issues), recommendations (actionable steps), performance_metrics (processing_time, image_size)
    - Set response headers: Content-Type application/json, Content-Disposition attachment with filename
    - Return downloadable JSON file
    - _Requirements: 6.2 (Report completeness)_
  
  - [x] 3.6 Implement getHealthStatus() endpoint
    - Check backend API status (self-check, always healthy)
    - Check proctoring service via GET http://proctoring:8001/health
    - Parse proctoring service response: yolo_loaded, mediapipe_loaded, face_recognition_loaded, device
    - Check database connection via DB::connection()->getPdo()
    - Check queue workers status via Laravel Queue monitoring
    - Measure response times for each check
    - Cache results in Redis with 10-second TTL
    - Return aggregated health status JSON
    - _Requirements: 1.2 (System status check), 7.1 (Health check frequency), 7.2 (Status accuracy)_
  
  - [x] 3.7 Implement compareTests() endpoint
    - Validate request: ids parameter required (comma-separated test IDs)
    - Retrieve both tests with relationships
    - Calculate differences in overall_health_score, component scores
    - Identify improvements and regressions
    - Return comparison data with side-by-side component scores
    - _Requirements: 6.1 (Test persistence)_
  
  - [x] 3.8 Implement runScenario() endpoint for interactive scenario testing
    - Validate scenario parameter (object_detection, multi_face, head_turning, identity_baseline, identity_mismatch)
    - Accept image capture from client
    - Forward to analyzeCapture() logic
    - Validate scenario-specific requirements met
    - Return verdict (pass/fail) with explanation and requirements_met/requirements_failed arrays
    - _Requirements: 8.1 (Scenario validation), 8.2 (Comprehensive test coverage)_
  
  - [ ]* 3.9 Write integration tests for ProctoringDiagnosticController
    - Test analyzeCapture with mock proctoring service response
    - Test getTestHistory with seeded test data
    - Test downloadReport file generation
    - Test getHealthStatus with various service states
    - Test admin-only access control (403 for non-admin)
    - _Requirements: 1.1, 3.1, 6.1, 7.2_

- [ ] 4. Register backend API routes
  - [x] 4.1 Add proctoring-diagnostic routes to backend/routes/api.php
    - Apply middleware: auth:sanctum, role:admin
    - Route group prefix: proctoring-diagnostic
    - POST /analyze → ProctoringDiagnosticController@analyzeCapture
    - GET /tests → ProctoringDiagnosticController@getTestHistory
    - GET /tests/{id} → ProctoringDiagnosticController@getTestResult
    - GET /tests/compare → ProctoringDiagnosticController@compareTests
    - GET /tests/{id}/report → ProctoringDiagnosticController@downloadReport
    - GET /health → ProctoringDiagnosticController@getHealthStatus
    - POST /scenarios/{scenario}/run → ProctoringDiagnosticController@runScenario
    - _Requirements: 1.1 (Admin-only access)_

- [ ] 5. Checkpoint - Verify backend API implementation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend TypeScript interfaces and types
  - [x] 6.1 Create diagnostic type definitions
    - Create src/types/diagnostic.ts
    - Define interfaces: DiagnosticPageState, CameraState, AnalysisResult, ComponentScore, DetectedObject, DetectedFace, TroubleshootingSuggestion, HistoricalTest, SystemHealth, ServiceStatus, ProctoringServiceStatus, QueueStatus, TestScenario, ScenarioResult
    - Define type unions: testStatus ('idle' | 'capturing' | 'analyzing' | 'complete' | 'error'), cameraStatus, healthStatus, severityLevel, categoryType
    - _Requirements: 2.1 (Camera initialization), 3.1 (Complete analysis execution), 5.1 (Issue detection logic), 7.2 (Status accuracy), 8.1 (Scenario validation)_

- [x] 7. Implement frontend CameraPreview component
  - [x] 7.1 Create CameraPreview component with camera permission handling
    - Create src/components/diagnostic/CameraPreview.tsx
    - Implement state management: CameraState (status, stream, resolution, errorMessage)
    - Implement handleStartCamera(): call navigator.mediaDevices.getUserMedia({video: true})
    - Handle permission granted: set stream, display video preview, show resolution
    - Handle permission denied: show placeholder with troubleshooting instructions
    - Handle camera not found: show error message
    - Implement handleCapture(): capture frame from video element to canvas, convert to Blob
    - Provide "Start Camera Test" button when status is idle
    - Provide "Capture & Analyze" button when camera is active
    - Display camera status indicators (Active, Permission Denied, Not Found)
    - Display resolution information (e.g., "1280x720")
    - Cleanup: stop media stream on component unmount
    - _Requirements: 2.1 (Camera initialization), 2.2 (Frame capture quality)_
  
  - [ ]* 7.2 Write unit tests for CameraPreview component
    - Test camera permission request flow
    - Test permission denied handling
    - Test frame capture logic
    - Test cleanup on unmount
    - _Requirements: 2.1, 2.2_

- [x] 8. Implement frontend AnalysisResults component
  - [x] 8.1 Create AnalysisResults display component
    - Create src/components/diagnostic/AnalysisResults.tsx
    - Display overall_health_score with color coding (green ≥80, yellow ≥60, red <60)
    - Display overall_status badge (Healthy, Warning, Critical)
    - Render component scores table: object_detection, face_detection, head_pose, eye_gaze, face_embedding
    - For each component: show score bar (0-100), confidence percentage, status icon (✓/✗)
    - Display detected objects count and list
    - Display detected faces count
    - Show processing_time_ms with "⚡" icon
    - Provide "Download Report" button that calls onDownloadReport(test_id)
    - _Requirements: 3.1 (Complete analysis execution), 3.2 (Score calculation accuracy), 6.2 (Report completeness)_
  
  - [ ]* 8.2 Write unit tests for AnalysisResults component
    - Test color coding logic for health scores
    - Test component score rendering
    - Test download report button click
    - _Requirements: 3.2, 6.2_

- [x] 9. Implement frontend DetectionOverlay component
  - [x] 9.1 Create DetectionOverlay canvas rendering component
    - Create src/components/diagnostic/DetectionOverlay.tsx
    - Implement useEffect to draw on canvas when imageUrl or detections change
    - Load image onto canvas element
    - Draw object bounding boxes with color coding: red (prohibited), yellow (suspicious), green (allowed)
    - Draw labels above boxes with object class and confidence percentage
    - Draw face bounding boxes (blue)
    - Optionally draw facial landmarks as small circles (toggleable via showLandmarks prop)
    - Draw head pose direction arrows (yaw/pitch indicators)
    - Draw eye gaze indicators (lines or markers)
    - Display face count badge in top-right corner
    - Display face embedding badge if embedding_present is true (show "Embedding: ✓ {dimensions}-dim")
    - Provide toggle button for landmarks visibility
    - _Requirements: 4.1 (Visual accuracy), 6.1 (Test persistence - face_embedding with dimensions)_
  
  - [ ]* 9.2 Write unit tests for DetectionOverlay component
    - Test bounding box drawing logic
    - Test color coding for different object severities
    - Test landmarks toggle functionality
    - _Requirements: 4.1_

- [x] 10. Implement frontend TroubleshootingSuggestions component
  - [x] 10.1 Create TroubleshootingSuggestions display component
    - Create src/components/diagnostic/TroubleshootingSuggestions.tsx
    - Group suggestions by category (camera, network, configuration, performance)
    - Render category sections with headers
    - For each suggestion: show severity badge (Critical=red, Warning=yellow, Info=blue), issue title, description text, action instructions (step-by-step or paragraph)
    - Display related_config parameters if present
    - Provide "Copy Technical Details" button for suggestions with technical_details
    - Implement copy-to-clipboard functionality using navigator.clipboard.writeText()
    - Show documentation_link as clickable link if present
    - When suggestions array is empty: display "✓ All systems operational" success message (no copy buttons)
    - _Requirements: 5.1 (Issue detection logic), 5.2 (Actionable suggestions)_
  
  - [ ]* 10.2 Write unit tests for TroubleshootingSuggestions component
    - Test suggestion categorization
    - Test severity badge rendering
    - Test copy-to-clipboard functionality
    - Test "all systems operational" state
    - _Requirements: 5.1, 5.2_

- [x] 11. Implement frontend TestHistory component
  - [x] 11.1 Create TestHistory display component with trend chart
    - Create src/components/diagnostic/TestHistory.tsx
    - Display last 10 tests in collapsible cards (use Accordion or Details/Summary)
    - For each test card header: show timestamp (formatted with timezone), overall_health_score with color badge, issues_count badge
    - For each test card body: show component_status as icons (✓ pass / ✗ fail), admin_name, test_type
    - Provide "Compare" checkboxes for selecting two tests
    - Implement onCompare callback when two tests selected
    - Render trend chart when tests.length ≥ 3 using recharts LineChart
    - Chart X-axis: timestamps, Y-axis: overall_health_score (0-100), line color based on score
    - Show placeholder message "Trend chart will appear after 3 tests are completed" when tests.length < 3
    - Handle empty state (no tests yet)
    - _Requirements: 6.1 (Test persistence), 6.2 (Report completeness)_
  
  - [ ]* 11.2 Write unit tests for TestHistory component
    - Test collapsible card rendering
    - Test comparison selection logic
    - Test trend chart visibility conditions
    - _Requirements: 6.1_

- [x] 12. Implement frontend LiveHealthMonitor component
  - [x] 12.1 Create LiveHealthMonitor with polling logic
    - Create src/components/diagnostic/LiveHealthMonitor.tsx
    - Implement state: SystemHealth (backend_api, proctoring_service, database, queue_workers, last_check)
    - Implement useEffect polling: call fetchHealthStatus() every refreshInterval (default 10000ms)
    - Implement fetchHealthStatus(): GET /api/proctoring-diagnostic/health
    - Display service status cards in grid layout
    - For each service card: show status indicator (✓ Healthy green, ⚠ Degraded yellow, ✗ Down red), response_time_ms, version number
    - For proctoring service: show additional details (yolo_loaded, mediapipe_loaded, face_recognition_loaded, device CPU/GPU) as sub-badges
    - For queue_workers: show worker_count and status
    - Display last_check timestamp
    - Show notification toast when service status changes (use browser Notification API or toast library)
    - Cleanup: clear interval on component unmount
    - _Requirements: 1.2 (System status check), 7.1 (Health check frequency), 7.2 (Status accuracy)_
  
  - [ ]* 12.2 Write unit tests for LiveHealthMonitor component
    - Test polling interval setup
    - Test health status display
    - Test status change detection
    - Test cleanup on unmount
    - _Requirements: 7.1, 7.2_

- [ ] 13. Implement frontend InteractiveScenarioTester component
  - [x] 13.1 Create InteractiveScenarioTester with scenario workflows
    - Create src/components/diagnostic/InteractiveScenarioTester.tsx
    - Define scenario buttons: "Test Object Detection", "Test Multi-face", "Test Head Turning", "Test Identity Baseline", "Test Identity Mismatch"
    - For each scenario button: onClick calls onRunScenario(scenario) and displays instructions overlay
    - Implement instructions overlay modal/popup showing scenario-specific prompts (e.g., "Show phone to camera", "Turn head left 45°")
    - Display countdown timer (5 seconds) before auto-capture
    - After capture and analysis, validate scenario requirements in result
    - Show verdict badge (PASS green, FAIL red) with explanation text
    - Display requirements_met and requirements_failed lists
    - Implement "Run All Scenarios" button
    - For "Run All Scenarios": loop through all scenarios with 10-second countdown between each, collect results, display summary table with pass/fail counts and overall_test_score
    - _Requirements: 8.1 (Scenario validation), 8.2 (Comprehensive test coverage)_
  
  - [ ]* 13.2 Write unit tests for InteractiveScenarioTester component
    - Test scenario button rendering
    - Test instructions overlay display
    - Test verdict display logic
    - Test "Run All Scenarios" sequential execution
    - _Requirements: 8.1, 8.2_

- [ ] 14. Implement main DiagnosticPage component with route protection
  - [ ] 14.1 Create DiagnosticPage with admin authorization check
    - Create src/app/admin/proctoring-diagnostic/page.tsx
    - Implement useEffect: check user role via GET /api/auth/me
    - If user role !== 'admin': redirect to /dashboard with error toast
    - Implement state: DiagnosticPageState (testStatus, currentTest, testHistory, healthStatus)
    - Implement handleCapture callback: set testStatus to 'analyzing', call POST /api/proctoring-diagnostic/analyze with image, update currentTest with response, set testStatus to 'complete', reload testHistory
    - Implement handleDownloadReport callback: call GET /api/proctoring-diagnostic/tests/{id}/report, trigger file download
    - Implement handleCompareTests callback: call GET /api/proctoring-diagnostic/tests/compare?ids=id1,id2, display comparison modal
    - Implement handleRunScenario callback: display scenario instructions, capture image, call POST /api/proctoring-diagnostic/scenarios/{scenario}/run, return ScenarioResult
    - Layout: header with title "Proctoring Diagnostic Tool", LiveHealthMonitor in top section, CameraPreview in left column, AnalysisResults + DetectionOverlay in middle column, TroubleshootingSuggestions in right column, InteractiveScenarioTester below camera, TestHistory at bottom
    - Handle errors: show error toast, set testStatus to 'error'
    - _Requirements: 1.1 (Admin-only access), 1.2 (System status check), 2.1 (Camera initialization), 3.1 (Complete analysis execution), 5.1 (Issue detection logic), 6.1 (Test persistence), 7.1 (Health check frequency), 8.1 (Scenario validation)_
  
  - [ ]* 14.2 Write integration tests for DiagnosticPage
    - Test admin role check and redirect
    - Test capture and analyze flow
    - Test download report functionality
    - Test scenario testing workflow
    - _Requirements: 1.1, 3.1, 8.1_

- [ ] 15. Checkpoint - Verify frontend implementation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Integration and final wiring
  - [ ] 16.1 Verify end-to-end flow from camera capture to analysis to troubleshooting
    - Test complete workflow: admin logs in → navigates to /admin/proctoring-diagnostic → starts camera → captures frame → receives analysis with detection overlays → sees troubleshooting suggestions → downloads report → views test history
    - Verify admin-only access control
    - Verify proctoring service integration
    - Verify database persistence of test results and issues
    - Verify health monitoring polling
    - Verify scenario testing workflows
    - _Requirements: All requirements integrated_
  
  - [ ] 16.2 Add loading states and error handling throughout UI
    - Add loading spinners during camera initialization, frame analysis, report download, health checks
    - Add error boundaries to catch and display component errors gracefully
    - Add retry mechanisms for failed API calls
    - Add timeout handling for long-running requests
    - _Requirements: Non-functional - Usability, Reliability_
  
  - [ ] 16.3 Optimize performance and responsiveness
    - Lazy load heavy components (TestHistory, DetectionOverlay canvas)
    - Debounce health check polling if page is inactive
    - Optimize canvas rendering for large images
    - Add memoization for expensive calculations (score computation, trend data)
    - _Requirements: Non-functional - Performance_
  
  - [ ]* 16.4 Write end-to-end integration tests
    - Test full diagnostic workflow with mock proctoring service
    - Test error scenarios (service down, camera denied, invalid data)
    - Test admin vs non-admin access
    - Test report generation and download
    - _Requirements: All functional requirements_

- [ ] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of backend and frontend separately before integration
- The design uses specific programming languages (TypeScript/React/Next.js for frontend, PHP/Laravel for backend), so no language selection was needed
- Frontend components use modern React patterns (hooks, functional components)
- Backend follows Laravel best practices (controllers, models, services, middleware)
- Database uses JSON columns for flexible storage of component scores and detection results
- Visual overlays use HTML Canvas API for high-performance rendering
- Health monitoring uses polling with Redis caching to minimize backend load
- Troubleshooting suggestions use rule-based logic for deterministic and explainable recommendations
- Test history includes trend visualization for pattern recognition
- Scenario testing provides interactive workflows for comprehensive validation
- All API endpoints require admin authentication via Laravel Sanctum and role middleware
- The proctoring service `/analyze` endpoint is already implemented and requires no changes

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "6.1"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"] },
    { "id": 5, "tasks": ["3.9", "4.1"] },
    { "id": 6, "tasks": ["7.1", "8.1", "9.1", "10.1", "11.1", "12.1", "13.1"] },
    { "id": 7, "tasks": ["7.2", "8.2", "9.2", "10.2", "11.2", "12.2", "13.2", "14.1"] },
    { "id": 8, "tasks": ["14.2", "16.1", "16.2", "16.3"] },
    { "id": 9, "tasks": ["16.4"] }
  ]
}
```
