# Requirements: Proctoring Diagnostic Tool

## Introduction

Fitur diagnostic tool untuk admin yang memungkinkan testing real-time akurasi sistem proctoring (kamera + AI) dengan hasil detail dan troubleshooting suggestions otomatis. Tool ini akan membantu admin verify bahwa sistem proctoring berfungsi dengan baik dan troubleshoot masalah dengan cepat.

## Glossary

- **Diagnostic Tool**: Interface untuk testing komponen proctoring secara real-time
- **AI Analysis**: Proses deteksi menggunakan YOLO, MediaPipe, dan face_recognition
- **Component Score**: Skor akurasi per komponen (0-100)
- **Health Status**: Status kesehatan sistem (Healthy, Warning, Critical)
- **Troubleshooting Suggestions**: Rekomendasi solusi otomatis berdasarkan hasil test

## Requirements

### Requirement 1: Admin Diagnostic Page Access

**User Story:** As an admin, I want to access a dedicated diagnostic tool page so that I can test the proctoring system anytime.

#### Acceptance Criteria

1. THE system SHALL provide a new route `/admin/proctoring-diagnostic` accessible only by admin role
2. THE page SHALL display a prominent "Start Camera Test" button on load
3. THE page SHALL show system status indicators (Backend API, Proctoring Service, Database) regardless of service operational status
4. THE page SHALL display current configuration values (thresholds, service URLs)
5. WHEN a non-admin user tries to access, THE system SHALL redirect to dashboard with error message

#### Correctness Properties

**Property 1.1: Admin-only access**
```
PROPERTY access_control:
  GIVEN user with role != 'admin'
  WHEN user navigates to /admin/proctoring-diagnostic
  THEN response.status = 403 OR redirect to /dashboard
```

**Property 1.2: System status check**
```
PROPERTY system_health_display:
  GIVEN admin on diagnostic page
  WHEN page loads
  THEN display shows:
    - Backend API status (reachable/unreachable)
    - Proctoring service status (ready/not ready)
    - Database connection status (connected/disconnected)
```

---

### Requirement 2: Real-time Camera Preview and Capture

**User Story:** As an admin, I want to see a live camera preview so that I can verify camera is working before running tests.

#### Acceptance Criteria

1. WHEN admin clicks "Start Camera Test", THE system SHALL request camera permission via browser API
2. WHERE camera permission is granted, THE system SHALL display live video preview with resolution display (e.g., "1280x720")
3. WHERE camera permission is denied, THE system SHALL show a placeholder in the preview area explaining the permission issue
4. THE system SHALL show camera status indicators (Active, Permission Denied, Not Found)
5. WHERE camera is active, THE system SHALL provide "Capture & Analyze" button
6. WHEN admin explicitly clicks "Capture & Analyze", THE system SHALL capture current frame and send to proctoring service
7. WHILE analysis is in progress, THE system SHALL show loading spinner with progress text
8. WHERE camera permission is denied, THE system SHALL display troubleshooting instructions below the placeholder

#### Correctness Properties

**Property 2.1: Camera initialization**
```
PROPERTY camera_start:
  GIVEN user grants camera permission
  WHEN "Start Camera Test" is clicked
  THEN camera preview displays within 3 seconds
  AND video stream.active = true
```

**Property 2.2: Frame capture quality**
```
PROPERTY capture_quality:
  GIVEN camera is active
  WHEN "Capture & Analyze" is clicked
  THEN captured frame size ≥ 640x480 pixels
  AND image format = jpeg OR png OR webp
```

---

### Requirement 3: Comprehensive AI Component Analysis

**User Story:** As an admin, I want to see detailed analysis results for all proctoring components so that I can identify which parts are working correctly.

#### Acceptance Criteria

1. THE system SHALL analyze the captured frame using all proctoring components:
   - Object Detection (YOLO)
   - Face Detection (MediaPipe)
   - Head Pose Estimation
   - Eye Gaze Detection
   - Face Embedding Extraction (for identity verification)
   - Multi-face Detection
2. THE system SHALL display individual scores for each component (0-100 scale)
3. THE system SHALL show confidence levels for each detection
4. THE system SHALL highlight detected objects with bounding boxes on preview image
5. THE system SHALL display numerical metrics (angles, ratios, similarity scores)
6. THE system SHALL calculate overall health score based on weighted average
7. WHEN analysis completes, THE system SHALL show processing time for performance monitoring

#### Correctness Properties

**Property 3.1: Complete analysis execution**
```
PROPERTY analysis_completeness:
  GIVEN valid image captured
  WHEN analysis is triggered
  THEN result includes:
    - object_detection_status: SUCCESS or FAILURE
    - face_detection_status: SUCCESS or FAILURE
    - head_pose_status: SUCCESS or FAILURE
    - eye_gaze_status: SUCCESS or FAILURE
    - face_embedding_status: SUCCESS or FAILURE
    - overall_health: HEALTHY or WARNING or CRITICAL
```

**Property 3.2: Score calculation accuracy**
```
PROPERTY score_calculation:
  GIVEN all component results
  WHEN overall health score is calculated
  THEN overall_score = weighted_sum(component_scores) / total_weight
  AND 0 ≤ overall_score ≤ 100
```

---

### Requirement 4: Visual Detection Overlay

**User Story:** As an admin, I want to see visual overlays of detected objects and faces so that I can verify detection accuracy visually.

#### Acceptance Criteria

1. THE system SHALL render captured image with detection overlays
2. FOR each detected object, THE system SHALL draw:
   - Bounding box with color coding (red=prohibited, yellow=suspicious, green=allowed)
   - Label with object name and confidence percentage
3. FOR detected face, THE system SHALL draw:
   - Face bounding box
   - Landmark points (optional, can be toggled)
   - Head pose arrows indicating yaw/pitch direction
   - Eye gaze direction indicators
4. THE system SHALL display face count badge on image
5. THE system SHALL allow toggling overlay visibility
6. WHERE face embedding is extracted, THE system SHALL display "Embedding: ✓ {actual_dimensions}-dim" badge showing the dynamic embedding dimension count

#### Correctness Properties

**Property 4.1: Visual accuracy**
```
PROPERTY overlay_accuracy:
  GIVEN detected objects/faces in response
  WHEN overlay is rendered
  THEN number_of_boxes_drawn = number_of_detections
  AND each box.position matches detection.bbox coordinates
```

---

### Requirement 5: Automated Troubleshooting Suggestions

**User Story:** As an admin, I want to receive automated troubleshooting suggestions when issues are detected so that I can fix problems quickly without deep technical knowledge.

#### Acceptance Criteria

1. THE system SHALL analyze test results and identify issues automatically
2. FOR each identified issue, THE system SHALL provide:
   - Issue description (plain language)
   - Severity level (Critical, Warning, Info)
   - Recommended action with step-by-step instructions
   - Related configuration parameters
3. WHERE suggestions are provided, THE system SHALL categorize them by component:
   - Camera issues (permission, resolution, lighting)
   - Network issues (service unreachable, timeout)
   - Configuration issues (thresholds too strict/lenient)
   - Performance issues (slow processing, low confidence)
4. WHERE issues are detected, THE system SHALL provide copy-to-clipboard buttons for technical details
5. WHEN no issues found, THE system SHALL display "✓ All systems operational" message without copy buttons

#### Acceptance Criteria Examples

**Camera Issues:**
- IF camera permission denied → "Enable camera permission in browser settings"
- IF resolution < 640x480 → "Camera resolution too low, use better camera"
- IF no face detected → "Ensure face is visible and well-lit"

**Service Issues:**
- IF proctoring service unreachable → "Check if proctoring service is running: docker ps"
- IF request timeout (>30s) → "Service is slow, check CPU/GPU usage"
- IF face_embedding = null → "face_recognition library not installed, see IDENTITY_MISMATCH_DETECTION.md"

**Configuration Issues:**
- IF confidence < threshold but detection valid → "Consider lowering CONFIDENCE_THRESHOLD"
- IF many false positives → "Head pose thresholds may be too strict"

#### Correctness Properties

**Property 5.1: Issue detection logic**
```
PROPERTY issue_identification:
  GIVEN analysis_result
  WHEN result.face_detected = false
  THEN suggestions includes {
    severity: "WARNING",
    category: "camera",
    issue: "No face detected",
    action: "Position yourself in front of camera with good lighting"
  }
```

**Property 5.2: Actionable suggestions**
```
PROPERTY suggestion_quality:
  GIVEN suggestion in suggestions_list
  THEN suggestion.action is not empty
  AND suggestion.action.length > 20 characters
  AND suggestion includes at least one of: [command, config_key, documentation_link]
```

---

### Requirement 6: Test History and Reporting

**User Story:** As an admin, I want to see history of diagnostic tests so that I can track improvements and recurring issues over time.

#### Acceptance Criteria

1. THE system SHALL save test results to database with timestamp
2. THE system SHALL display last 10 test results in collapsible cards
3. FOR each historical test, THE system SHALL show:
   - Timestamp (with timezone)
   - Overall health score
   - Component-level pass/fail status
   - Number of issues found
   - Admin who ran the test
4. THE system SHALL provide "Download Report" button for current test
5. THE report SHALL be in JSON format with human-readable summary
6. THE system SHALL allow comparison between two test results
7. WHERE 3 or more tests exist, THE system SHALL display trend chart (overall health over time) or show error message if chart rendering fails
8. WHERE fewer than 3 tests exist, THE system SHALL show a placeholder message indicating trend chart will appear after 3 tests are completed

#### Correctness Properties

**Property 6.1: Test persistence**
```
PROPERTY test_storage:
  GIVEN diagnostic test completed
  WHEN result is saved
  THEN database.proctoring_diagnostics.count increases by 1
  AND saved_record.timestamp = current_timestamp
  AND saved_record.admin_id = current_user.id
```

**Property 6.2: Report completeness**
```
PROPERTY report_content:
  GIVEN downloadable report
  THEN report includes:
    - test_id, timestamp, admin_name
    - system_config (thresholds, service_urls)
    - analysis_results (all component scores)
    - detected_issues (severity, descriptions)
    - recommendations (actionable steps)
    - performance_metrics (processing_time, image_size)
```

---

### Requirement 7: Live Component Health Monitoring

**User Story:** As an admin, I want to see real-time status of each proctoring component so that I can quickly identify which service is down.

#### Acceptance Criteria

1. THE system SHALL display component health cards with status indicators:
   - Backend API: ✓ Reachable (200ms) / ✗ Unreachable
   - Proctoring Service: ✓ Ready / ⚠ Degraded / ✗ Down
   - Database: ✓ Connected / ✗ Disconnected
   - Queue Workers: ✓ Running (3 workers) / ⚠ Slow / ✗ Stopped
2. THE system SHALL check health endpoints every 10 seconds automatically
3. WHEN a service status changes, THE system SHALL show notification toast
4. THE system SHALL display service version numbers (backend, proctoring service)
5. THE system SHALL show last check timestamp for each component
6. FOR proctoring service, THE system SHALL display:
   - YOLO model loaded: ✓/✗
   - MediaPipe loaded: ✓/✗
   - face_recognition loaded: ✓/✗
   - Device (CPU/GPU)

#### Correctness Properties

**Property 7.1: Health check frequency**
```
PROPERTY health_polling:
  GIVEN diagnostic page is open
  WHEN time_since_last_check ≥ 10 seconds
  THEN system triggers health check API call
  AND updates UI with latest status
```

**Property 7.2: Status accuracy**
```
PROPERTY status_detection:
  GIVEN health check response
  WHEN response.status = 200 AND response.yolo_loaded = true
  THEN UI shows "Proctoring Service: ✓ Ready"
  
  WHEN response.status = 503 OR timeout
  THEN UI shows "Proctoring Service: ✗ Down"
  
  WHEN response.face_recognition_loaded = false
  THEN UI shows "⚠ Degraded: Identity verification disabled"
```

---

### Requirement 8: Interactive Testing Scenarios

**User Story:** As an admin, I want to test specific scenarios (e.g., "simulate cheating") so that I can verify detection accuracy for known conditions.

#### Acceptance Criteria

1. THE system SHALL provide pre-defined test scenario buttons:
   - "Test Object Detection" (prompt: show phone to camera)
   - "Test Multi-face" (prompt: have another person in frame)
   - "Test Head Turning" (prompt: turn head left 45°)
   - "Test Identity Baseline" (capture baseline for comparison)
   - "Test Identity Mismatch" (prompt: have different person in frame)
2. FOR each scenario, THE system SHALL display instructions overlay on camera preview
3. THE system SHALL validate if scenario requirements are met in analysis result
4. THE system SHALL show scenario-specific pass/fail verdict with explanation
5. THE system SHALL provide "Run All Scenarios" button for comprehensive testing
6. WHEN running all scenarios, THE system SHALL execute them sequentially with countdown timers

#### Correctness Properties

**Property 8.1: Scenario validation**
```
PROPERTY scenario_object_detection:
  GIVEN scenario = "Test Object Detection"
  WHEN analysis_result.prohibited_objects.length > 0
  THEN verdict = "PASS: Object detected successfully"
  
  WHEN analysis_result.prohibited_objects.length = 0
  THEN verdict = "FAIL: No prohibited object detected. Try showing phone clearly."
```

**Property 8.2: Comprehensive test coverage**
```
PROPERTY all_scenarios_test:
  GIVEN "Run All Scenarios" executed
  WHEN all scenarios complete
  THEN results includes verdict for each:
    - object_detection: PASS/FAIL
    - multi_face: PASS/FAIL
    - head_pose: PASS/FAIL
    - identity_baseline: PASS/FAIL
  AND overall_test_score = (passed_count / total_count) × 100
```

---

## Non-Functional Requirements

### Performance

1. Camera preview SHALL render at minimum 15 FPS for smooth video
2. Frame capture and analysis SHALL complete within 5 seconds for 1280x720 image
3. UI SHALL remain responsive during analysis (no freezing)
4. Health checks SHALL not impact main application performance

### Security

1. Diagnostic page access SHALL be restricted to admin role only
2. Test results SHALL NOT expose sensitive user data (PII)
3. Downloaded reports SHALL NOT contain authentication tokens or secrets
4. Camera stream SHALL NOT be recorded or transmitted to external servers

### Usability

1. All instructions SHALL be in Bahasa Indonesia (consistent with app language)
2. Error messages SHALL be actionable (tell user what to do, not just what failed)
3. Color coding SHALL follow accessibility standards (contrast ratio ≥4.5:1)
4. UI SHALL work on desktop browsers (Chrome, Firefox, Edge)

### Reliability

1. System SHALL gracefully handle camera permission denial (no crash)
2. System SHALL handle proctoring service downtime without breaking UI
3. System SHALL retry failed health checks up to 3 times before marking as down
4. Test history SHALL persist across browser refreshes

## Success Metrics

1. **Diagnostic Adoption Rate:** ≥80% of admins use diagnostic tool at least once per month
2. **Issue Resolution Time:** Average time to resolve proctoring issues decreases by 50% (baseline: manual debugging)
3. **False Positive Reduction:** Admins can identify and fix configuration issues leading to 20% reduction in false positive complaints
4. **System Reliability:** 95% of diagnostic tests complete successfully without errors

## Out of Scope

1. Automated scheduled testing (not in v1)
2. Integration with alerting systems (Slack, email)
3. Historical trend analysis beyond simple line chart
4. Camera calibration or adjustment tools
5. Multi-camera testing
6. Mobile browser support (desktop only)

## Dependencies

1. Existing proctoring service API endpoints (`/health`, `/analyze`)
2. Backend API for storing test results
3. Browser WebRTC APIs (getUserMedia)
4. Admin authentication and authorization system

## Open Questions

1. Should we store captured images in test results for later review? (Consider privacy and storage)
2. Should diagnostic results be visible to teachers, or admin-only?
3. How long should we retain test history? (Suggest: 30 days)
4. Should we add export to PDF in addition to JSON?

## Assumptions

1. Admin has a working webcam available
2. Admin understands basic technical concepts (API, threshold, confidence)
3. Proctoring service is already deployed and accessible
4. Database has sufficient storage for test history
