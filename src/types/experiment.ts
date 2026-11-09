/**
 * Type definitions for the Experiment Session (Tahap 2 — Pengambilan Data Otomatis)
 * backend API at /api/experiment-sessions.
 */

export type Lighting = 'bright' | 'normal' | 'dim' | 'backlit' | 'other';
export type DatasetSplit = 'calibration' | 'test';
export type ConfigScope = 'draft' | 'active';
export type SessionStatus = 'created' | 'running' | 'paused' | 'completed' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Ground-truth boolean labels shared by sessions and trials. */
export interface GroundTruth {
  gt_no_face: boolean;
  gt_multi_face: boolean;
  gt_phone: boolean;
  gt_book: boolean;
  gt_head_turn: boolean;
  gt_eye_gaze_away: boolean;
  gt_identity_mismatch: boolean;
}

export interface ExperimentSession {
  id: number;
  name: string;
  researcher_name: string;
  lighting: Lighting;
  device_info: string | null;
  distance_cm: number | null;
  notes: string | null;
  dataset_split: DatasetSplit;
  config_scope: ConfigScope;
  config_version_id: number | null;
  status: SessionStatus;
  started_at: string | null;
  completed_at: string | null;
  fastapi_device: string | null;
  fastapi_model: string | null;
  baseline_embedding: number[] | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  /** Present when the list endpoint uses withCount('trials'). */
  trials_count?: number;
}

export interface ExperimentTrial extends GroundTruth {
  id: number;
  session_id: number;
  scenario: string | null;
  snapshot_path: string | null;
  image_width: number | null;
  image_height: number | null;
  image_size_kb: number | null;
  person_count: number | null;
  face_count: number | null;
  face_detected: boolean | null;
  face_confidence: number | null;
  face_bbox: number[] | null;
  head_yaw: number | null;
  head_pitch: number | null;
  head_roll: number | null;
  eye_gaze_ratio: number | null;
  face_distance: number | null;
  all_detections: Array<Record<string, unknown>> | null;
  client_face_detected: boolean | null;
  client_face_count: number | null;
  client_face_confidence: number | null;
  client_face_bbox: number[] | null;
  client_model: string | null;
  client_latency_ms: number | null;
  client_error: string | null;
  risk_score_raw: number | null;
  fastapi_detections: Array<unknown> | null;
  score_no_face: number | null;
  score_multi_face: number | null;
  score_head_turn: number | null;
  score_eye_gaze: number | null;
  score_object_detection: number | null;
  score_identity_mismatch: number | null;
  total_score: number | null;
  risk_level: RiskLevel | null;
  pred_no_face: boolean | null;
  pred_multi_face: boolean | null;
  pred_head_turn: boolean | null;
  pred_eye_gaze_away: boolean | null;
  pred_phone: boolean | null;
  pred_book: boolean | null;
  pred_identity_mismatch: boolean | null;
  config_version_id: number | null;
  config_scope_used: ConfigScope | null;
  inference_ms: number | null;
  server_total_ms: number | null;
  end_to_end_ms: number | null;
  is_invalid: boolean;
  invalidation_reason: string | null;
  trial_number: number;
  captured_at: string;
  created_at: string;
  updated_at: string;
}

export interface CategoryMetrics {
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  support: number;
  total: number;
}

export interface OverallMetrics {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface LatencyStat {
  mean: number | null;
  median: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface ExperimentMetrics {
  per_category: Record<string, CategoryMetrics>;
  overall: OverallMetrics;
  latency: {
    inference_ms: LatencyStat;
    server_total_ms: LatencyStat;
    end_to_end_ms: LatencyStat;
  };
  trial_count: number;
  valid_trial_count: number;
}

export interface SweepPoint {
  threshold: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
}

export interface SweepResult {
  param: string;
  category: string;
  sweep: SweepPoint[];
}

export interface CaptureResponse {
  data: ExperimentTrial;
  active_exam_warning: boolean;
}

export interface SessionDetailResponse {
  data: ExperimentSession;
  trial_counts_by_scenario: Record<string, number>;
}

/** Laravel paginator envelope (subset of fields used by the UI). */
export interface Paginated<T> {
  data: T[];
  total: number;
  current_page: number;
  last_page: number;
  per_page: number;
  from: number | null;
  to: number | null;
}

export interface SetBaselineResponse {
  success: boolean;
  message: string;
  face_detected: boolean;
}

export interface DeleteResponse {
  message: string;
}

export interface CreateSessionPayload {
  name: string;
  researcher_name: string;
  lighting: Lighting;
  device_info?: string;
  distance_cm?: number;
  notes?: string;
  dataset_split: DatasetSplit;
  config_scope: ConfigScope;
}

/** The seven ground-truth / prediction category keys, in display order. */
export const EXPERIMENT_CATEGORIES = [
  'no_face',
  'multi_face',
  'phone',
  'book',
  'head_turn',
  'eye_gaze_away',
  'identity_mismatch',
] as const;

export type ExperimentCategory = (typeof EXPERIMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ExperimentCategory, string> = {
  no_face: 'Tidak Ada Wajah',
  multi_face: 'Multi Wajah',
  phone: 'HP',
  book: 'Buku',
  head_turn: 'Menoleh',
  eye_gaze_away: 'Pandangan Menyimpang',
  identity_mismatch: 'Identitas Berbeda',
};
