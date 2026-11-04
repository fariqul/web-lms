/**
 * Service layer for Proctoring Configuration API
 */

import { apiGet, apiPost } from '@/lib/api';
import type { ConfigState, ConfigVersion, ProctoringConfig } from '@/types/proctoring-config';

// ==================== Helper ====================

async function extractError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return json?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ==================== Service Functions ====================

/**
 * Ambil state konfigurasi (draft, active, defaults)
 */
export async function getConfig(): Promise<ConfigState> {
  const res = await apiGet('/api/proctoring-config');
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  return json.data as ConfigState;
}

/**
 * Simpan perubahan ke draft
 */
export async function updateDraft(
  data: Partial<ProctoringConfig>,
): Promise<{ success: boolean; message: string }> {
  const res = await apiPost('/api/proctoring-config/draft', data);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json();
}

/**
 * Terapkan draft ke konfigurasi aktif dan buat versi baru
 */
export async function applyToActive(
  notes?: string,
): Promise<{ success: boolean; message: string; data?: { version_number: number } }> {
  const res = await apiPost('/api/proctoring-config/apply', notes ? { notes } : undefined);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json();
}

/**
 * Ambil riwayat versi konfigurasi
 */
export async function getVersionHistory(): Promise<ConfigVersion[]> {
  const res = await apiGet('/api/proctoring-config/history');
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  const json = await res.json();
  return json.data as ConfigVersion[];
}

/**
 * Rollback ke versi konfigurasi tertentu
 */
export async function rollback(
  versionId: number,
): Promise<{ success: boolean; message: string }> {
  const res = await apiPost(`/api/proctoring-config/rollback/${versionId}`);
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json();
}

/**
 * Reset konfigurasi ke nilai default
 */
export async function resetToDefaults(
  scope: 'draft' | 'active',
): Promise<{ success: boolean; message: string }> {
  const res = await apiPost('/api/proctoring-config/reset', { scope });
  if (!res.ok) {
    throw new Error(await extractError(res));
  }
  return res.json();
}
