/**
 * Service layer for the Experiment Session API (Tahap 2 — Pengambilan Data
 * Otomatis). Endpoints live under /api/experiment-sessions and
 * /api/experiment-trials.
 *
 * The capture and set-baseline endpoints expect multipart form data (a real
 * file upload), so those calls bypass the JSON-only `apiPost` helper and use
 * a small inline multipart fetch that lets the browser set the boundary.
 */

import { apiGet, apiPost, apiDelete, apiRequest, getApiUrl } from '@/lib/api';
import type { ClientFaceObservation } from '@/utils/faceDetection';
import type {
  CaptureResponse,
  CreateSessionPayload,
  DeleteResponse,
  ExperimentMetrics,
  ExperimentSession,
  ExperimentTrial,
  GroundTruth,
  Paginated,
  SessionDetailResponse,
  SetBaselineResponse,
  SweepResult,
} from '@/types/experiment';

// ──────────────────────────────────────────────────────────────────────────
// Error helper
// ──────────────────────────────────────────────────────────────────────────

async function extractError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return json?.message ?? json?.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Multipart upload (file + scalar fields)
// ──────────────────────────────────────────────────────────────────────────

async function multipartPost(
  endpoint: string,
  image: Blob,
  fields?: Record<string, string | number | undefined>,
): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const formData = new FormData();

  const ext = image.type === 'image/png' ? 'png' : image.type === 'image/webp' ? 'webp' : 'jpg';
  formData.append('image', image, `capture_${Date.now()}.${ext}`);

  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      formData.append(key, String(value));
    }
  }

  // Deliberately omit Content-Type so the browser sets the multipart boundary.
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(getApiUrl(endpoint), {
    method: 'POST',
    headers,
    body: formData,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Session CRUD + lifecycle
// ──────────────────────────────────────────────────────────────────────────

export async function listSessions(
  filters: { status?: string; dataset_split?: string; page?: number } = {},
): Promise<Paginated<ExperimentSession>> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.dataset_split) params.set('dataset_split', filters.dataset_split);
  if (filters.page) params.set('page', String(filters.page));

  const qs = params.toString();
  const res = await apiGet(`/api/experiment-sessions${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function createSession(
  payload: CreateSessionPayload,
): Promise<ExperimentSession> {
  const res = await apiPost('/api/experiment-sessions', payload);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function getSession(id: number): Promise<SessionDetailResponse> {
  const res = await apiGet(`/api/experiment-sessions/${id}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function startSession(id: number): Promise<ExperimentSession> {
  const res = await apiPost(`/api/experiment-sessions/${id}/start`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function pauseSession(id: number): Promise<ExperimentSession> {
  const res = await apiPost(`/api/experiment-sessions/${id}/pause`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function resumeSession(id: number): Promise<ExperimentSession> {
  const res = await apiPost(`/api/experiment-sessions/${id}/resume`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function completeSession(id: number): Promise<ExperimentSession> {
  const res = await apiPost(`/api/experiment-sessions/${id}/complete`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function cancelSession(id: number): Promise<ExperimentSession> {
  const res = await apiPost(`/api/experiment-sessions/${id}/cancel`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function deleteSession(id: number): Promise<DeleteResponse> {
  const res = await apiDelete(`/api/experiment-sessions/${id}?confirm=true`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Baseline + trials + capture
// ──────────────────────────────────────────────────────────────────────────

export async function setBaseline(
  sessionId: number,
  image: Blob,
): Promise<SetBaselineResponse> {
  const res = await multipartPost(`/api/experiment-sessions/${sessionId}/set-baseline`, image);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function listTrials(
  sessionId: number,
  filters: {
    scenario?: string;
    is_invalid?: boolean;
    page?: number;
  } = {},
): Promise<Paginated<ExperimentTrial>> {
  const params = new URLSearchParams();
  if (filters.scenario) params.set('scenario', filters.scenario);
  if (filters.is_invalid !== undefined) params.set('is_invalid', String(filters.is_invalid));
  if (filters.page) params.set('page', String(filters.page));

  const qs = params.toString();
  const res = await apiGet(`/api/experiment-sessions/${sessionId}/trials${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export interface CaptureOptions extends GroundTruth {
  scenario?: string;
  end_to_end_ms?: number;
  client?: ClientFaceObservation;
}

export async function captureTrial(
  sessionId: number,
  image: Blob,
  options: CaptureOptions,
): Promise<CaptureResponse> {
  const fields: Record<string, string | number | undefined> = {
    scenario: options.scenario,
    end_to_end_ms: options.end_to_end_ms,
    gt_no_face: options.gt_no_face ? '1' : '0',
    gt_multi_face: options.gt_multi_face ? '1' : '0',
    gt_phone: options.gt_phone ? '1' : '0',
    gt_book: options.gt_book ? '1' : '0',
    gt_head_turn: options.gt_head_turn ? '1' : '0',
    gt_eye_gaze_away: options.gt_eye_gaze_away ? '1' : '0',
    gt_identity_mismatch: options.gt_identity_mismatch ? '1' : '0',
  };

  if (options.client) {
    const client = options.client;
    fields.client_face_detected = client.detected === null ? undefined : client.detected ? '1' : '0';
    fields.client_face_count = client.count ?? undefined;
    fields.client_face_confidence = client.confidence ?? undefined;
    fields.client_face_bbox = client.box
      ? JSON.stringify([client.box.x, client.box.y, client.box.width, client.box.height])
      : undefined;
    fields.client_model = client.model;
    fields.client_latency_ms = client.latencyMs ?? undefined;
    fields.client_error = client.error ?? undefined;
  }

  const res = await multipartPost(`/api/experiment-sessions/${sessionId}/capture`, image, fields);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Trial update (ground-truth labels / invalidation)
// ──────────────────────────────────────────────────────────────────────────

export interface TrialUpdatePayload {
  gt_no_face?: boolean;
  gt_multi_face?: boolean;
  gt_phone?: boolean;
  gt_book?: boolean;
  gt_head_turn?: boolean;
  gt_eye_gaze_away?: boolean;
  gt_identity_mismatch?: boolean;
  is_invalid?: boolean;
  invalidation_reason?: string | null;
}

export async function updateTrial(
  trialId: number,
  payload: TrialUpdatePayload,
): Promise<ExperimentTrial> {
  // PATCH is not exposed as a dedicated helper in lib/api; use the generic
  // apiRequest which forwards method + body as JSON.
  const res = await apiRequest(`/api/experiment-trials/${trialId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Metrics + threshold sweep + CSV export
// ──────────────────────────────────────────────────────────────────────────

export async function getMetrics(sessionId: number): Promise<ExperimentMetrics> {
  const res = await apiGet(`/api/experiment-sessions/${sessionId}/metrics`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export interface SweepParams {
  param: string;
  category: string;
  min: number;
  max: number;
  steps?: number;
}

export async function getSweep(sessionId: number, params: SweepParams): Promise<SweepResult> {
  const qs = new URLSearchParams({
    param: params.param,
    category: params.category,
    min: String(params.min),
    max: String(params.max),
  });
  if (params.steps) qs.set('steps', String(params.steps));

  const res = await apiGet(`/api/experiment-sessions/${sessionId}/sweep?${qs.toString()}`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.json();
}

export async function exportCsv(sessionId: number): Promise<Blob> {
  const res = await apiGet(`/api/experiment-sessions/${sessionId}/export`);
  if (!res.ok) throw new Error(await extractError(res));
  return res.blob();
}

/** Trigger a browser download for the CSV export. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
