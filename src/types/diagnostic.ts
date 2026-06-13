/**
 * Type definitions for Proctoring Diagnostic Tool
 * 
 * Requirements: 2.1 (Camera initialization), 3.1 (Complete analysis execution),
 *               5.1 (Issue detection logic), 7.2 (Status accuracy), 8.1 (Scenario validation)
 */

// ==================== Camera Types ====================

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export interface CameraState {
  status: CameraStatus;
  stream: MediaStream | null;
  resolution: { width: number; height: number } | null;
  errorMessage: string | null;
}

// ==================== Analysis Result Types ====================

export type TestStatus = 'idle' | 'capturing' | 'analyzing' | 'complete' | 'error';
export type HealthStatus = 'healthy' | 'warning' | 'critical';
export type ComponentStatus = 'success' | 'failure' | 'degraded';

export interface ComponentScore {
  status: ComponentStatus;
  score: number; // 0-100
  confidence: number; // 0-1
  details: Record<string, any>;
}

export interface AnalysisResult {
  test_id: number;
  overall_health_score: number; // 0-100
  overall_status: HealthStatus;
  components: {
    object_detection: ComponentScore;
    face_detection: ComponentScore;
    head_pose: ComponentScore;
    eye_gaze: ComponentScore;
    face_embedding: ComponentScore;
  };
  detected_objects: DetectedObject[];
  detected_faces: DetectedFace[];
  processing_time_ms: number;
  troubleshooting: TroubleshootingSuggestion[];
  timestamp: string;
}

// ==================== Detection Types ====================

export type ObjectSeverity = 'prohibited' | 'suspicious' | 'allowed';

export interface DetectedObject {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  severity: ObjectSeverity;
}

export interface DetectedFace {
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  landmarks?: Array<[number, number]>;
  head_pose: {
    yaw: number;
    pitch: number;
    roll: number;
  };
  eye_gaze: {
    left_ratio: number;
    right_ratio: number;
  };
  embedding_present: boolean;
  embedding_dimensions?: number;
}

// ==================== Troubleshooting Types ====================

export type CategoryType = 'camera' | 'network' | 'configuration' | 'performance';
export type SeverityLevel = 'critical' | 'warning' | 'info';

export interface TroubleshootingSuggestion {
  category: CategoryType;
  severity: SeverityLevel;
  issue: string;
  description: string;
  action: string;
  technical_details?: string;
  related_config?: string[];
  documentation_link?: string;
}

// ==================== Test History Types ====================

export interface HistoricalTest {
  id: number;
  timestamp: string;
  overall_health_score: number;
  overall_status: HealthStatus;
  component_status: Record<string, 'pass' | 'fail'>;
  issues_count: number;
  admin_name: string;
  test_type: 'manual' | 'scenario';
}

// ==================== System Health Types ====================

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'down';
export type QueueWorkerStatus = 'running' | 'slow' | 'stopped';

export interface ServiceStatus {
  status: ServiceHealthStatus;
  response_time_ms: number | null;
  version?: string;
  message?: string;
}

export interface ProctoringServiceStatus extends ServiceStatus {
  yolo_loaded: boolean;
  mediapipe_loaded: boolean;
  face_recognition_loaded: boolean;
  device: 'cpu' | 'gpu' | 'unknown';
}

export interface QueueStatus {
  status: QueueWorkerStatus;
  worker_count: number;
  message?: string;
}

export interface SystemHealth {
  backend_api: ServiceStatus;
  proctoring_service: ProctoringServiceStatus;
  database: ServiceStatus;
  queue_workers: QueueStatus;
  last_check: string;
}

// ==================== Scenario Testing Types ====================

export type TestScenario = 
  | 'object_detection' 
  | 'multi_face' 
  | 'head_turning' 
  | 'identity_baseline' 
  | 'identity_mismatch';

export interface ScenarioResult {
  scenario: TestScenario;
  test_id: number;
  verdict: 'pass' | 'fail';
  explanation: string;
  requirements_met: string[];
  requirements_failed: string[];
  analysis: AnalysisResult;
}

// ==================== Page State Types ====================

export interface DiagnosticPageState {
  testStatus: TestStatus;
  currentTest: AnalysisResult | null;
  testHistory: HistoricalTest[];
  healthStatus: SystemHealth | null;
}

// ==================== API Response Types ====================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface AnalyzeRequest {
  image: string; // base64 encoded image
  test_type?: 'manual' | 'scenario';
  scenario_name?: string;
}

export interface CompareTestsResponse {
  test1: {
    id: number;
    timestamp: string;
    overall_health_score: number;
    overall_status: HealthStatus;
  };
  test2: {
    id: number;
    timestamp: string;
    overall_health_score: number;
    overall_status: HealthStatus;
  };
  comparison: {
    overall_score_difference: number;
    component_differences: Record<string, ComponentDifference>;
    improvements: Improvement[];
    regressions: Regression[];
  };
}

export interface ComponentDifference {
  test1_score: number;
  test2_score: number;
  difference: number;
  change_type: 'improvement' | 'regression' | 'stable';
}

export interface Improvement {
  component: string;
  improvement: number;
}

export interface Regression {
  component: string;
  regression: number;
}

// ==================== Component Props Types ====================

export interface CameraPreviewProps {
  onCapture: (imageBlob: Blob) => Promise<void>;
  onPermissionDenied: () => void;
  onError: (error: string) => void;
}

export interface AnalysisResultsProps {
  result: AnalysisResult;
  onDownloadReport: (testId: number) => void;
}

export interface DetectionOverlayProps {
  imageUrl: string;
  detections: {
    objects: DetectedObject[];
    faces: DetectedFace[];
  };
  showLandmarks: boolean;
  onToggleLandmarks: () => void;
}

export interface TroubleshootingProps {
  suggestions: TroubleshootingSuggestion[];
}

export interface TestHistoryProps {
  tests: HistoricalTest[];
  onCompare: (testId1: number, testId2: number) => void;
}

export interface LiveHealthProps {
  autoRefresh: boolean;
  refreshInterval: number; // milliseconds
}

export interface ScenarioTesterProps {
  onRunScenario: (scenario: TestScenario) => Promise<ScenarioResult>;
  onRunAllScenarios: () => Promise<void>;
}

// ==================== Utility Types ====================

export interface ScenarioConfig {
  id: TestScenario;
  name: string;
  instructions: string;
  countdown: number; // seconds
  icon: string;
}

export const SCENARIO_CONFIGS: Record<TestScenario, ScenarioConfig> = {
  object_detection: {
    id: 'object_detection',
    name: 'Test Object Detection',
    instructions: 'Tunjukkan objek terlarang (misalnya phone) ke kamera dengan jelas',
    countdown: 5,
    icon: '📱',
  },
  multi_face: {
    id: 'multi_face',
    name: 'Test Multi-face',
    instructions: 'Minta orang lain masuk ke frame untuk test multi-face detection',
    countdown: 5,
    icon: '👥',
  },
  head_turning: {
    id: 'head_turning',
    name: 'Test Head Turning',
    instructions: 'Putar kepala ke kiri atau kanan lebih dari 20 derajat',
    countdown: 5,
    icon: '↔️',
  },
  identity_baseline: {
    id: 'identity_baseline',
    name: 'Test Identity Baseline',
    instructions: 'Capture wajah Anda sebagai baseline untuk identity verification',
    countdown: 5,
    icon: '👤',
  },
  identity_mismatch: {
    id: 'identity_mismatch',
    name: 'Test Identity Mismatch',
    instructions: 'Minta orang lain untuk di-capture untuk test identity mismatch detection',
    countdown: 5,
    icon: '🔄',
  },
};

// ==================== Color Coding Constants ====================

export const HEALTH_SCORE_COLORS = {
  healthy: '#10b981', // green-500
  warning: '#f59e0b', // amber-500
  critical: '#ef4444', // red-500
} as const;

export const SEVERITY_COLORS = {
  critical: '#ef4444', // red-500
  warning: '#f59e0b', // amber-500
  info: '#3b82f6', // blue-500
} as const;

export const OBJECT_SEVERITY_COLORS = {
  prohibited: '#ef4444', // red-500
  suspicious: '#f59e0b', // amber-500
  allowed: '#10b981', // green-500
} as const;

// ==================== Helper Functions ====================

/**
 * Get color based on health score
 */
export function getHealthScoreColor(score: number): string {
  if (score >= 80) return HEALTH_SCORE_COLORS.healthy;
  if (score >= 60) return HEALTH_SCORE_COLORS.warning;
  return HEALTH_SCORE_COLORS.critical;
}

/**
 * Get color based on severity level
 */
export function getSeverityColor(severity: SeverityLevel): string {
  return SEVERITY_COLORS[severity];
}

/**
 * Get color based on object severity
 */
export function getObjectSeverityColor(severity: ObjectSeverity): string {
  return OBJECT_SEVERITY_COLORS[severity];
}

/**
 * Format timestamp to readable string
 */
export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format processing time to human readable
 */
export function formatProcessingTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}
