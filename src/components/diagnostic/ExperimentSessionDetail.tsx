'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CameraPreview } from '@/components/diagnostic/CameraPreview';
import { ExperimentMetricsView } from '@/components/diagnostic/ExperimentMetricsView';
import { ExperimentSweepChart } from '@/components/diagnostic/ExperimentSweepChart';
import {
  cancelSession,
  captureTrial,
  completeSession,
  deleteSession,
  downloadBlob,
  exportCsv,
  getSession,
  getMetrics,
  listTrials,
  pauseSession,
  resumeSession,
  setBaseline,
  startSession,
  updateTrial,
  type CaptureOptions,
} from '@/services/experiment';
import {
  CATEGORY_LABELS,
  EXPERIMENT_CATEGORIES,
  type ExperimentCategory,
  type ExperimentMetrics,
  type ExperimentSession,
  type ExperimentTrial,
  type GroundTruth,
  type SessionStatus,
} from '@/types/experiment';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';

const EMPTY_GT: GroundTruth = {
  gt_no_face: false,
  gt_multi_face: false,
  gt_phone: false,
  gt_book: false,
  gt_head_turn: false,
  gt_eye_gaze_away: false,
  gt_identity_mismatch: false,
};

interface Props {
  sessionId: number;
  onBack: () => void;
}

type InnerTab = 'trials' | 'metrics' | 'sweep';

export function ExperimentSessionDetail({ sessionId, onBack }: Props) {
  const [session, setSession] = useState<ExperimentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ground-truth category for the next capture ('normal' = no violation enacted).
  // Single-select: exactly one category per trial.
  const [gtCategory, setGtCategory] = useState<ExperimentCategory | 'normal'>('normal');
  const [scenario, setScenario] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [activeExamWarning, setActiveExamWarning] = useState(false);

  // Trials
  const [trials, setTrials] = useState<ExperimentTrial[]>([]);
  const [trialsTotal, setTrialsTotal] = useState(0);
  const [trialsPage, setTrialsPage] = useState(1);
  const [trialsLastPage, setTrialsLastPage] = useState(1);
  const [trialsLoading, setTrialsLoading] = useState(false);

  // Inner tab
  const [innerTab, setInnerTab] = useState<InnerTab>('trials');
  const [metrics, setMetrics] = useState<ExperimentMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Load session ──────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSession(sessionId);
      setSession(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat sesi');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const loadTrials = useCallback(async (page = 1) => {
    setTrialsLoading(true);
    try {
      const res = await listTrials(sessionId, { page });
      setTrials(res.data);
      setTrialsTotal(res.total);
      setTrialsPage(res.current_page);
      setTrialsLastPage(res.last_page);
    } catch (err) {
      console.error('[ExperimentDetail] loadTrials', err);
    } finally {
      setTrialsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSession();
    loadTrials(1);
  }, [loadSession, loadTrials]);

  // ── Lifecycle actions ─────────────────────────────────────────────────
  const runLifecycle = useCallback(
    async (
      action: 'start' | 'pause' | 'resume' | 'complete' | 'cancel',
      fn: (id: number) => Promise<ExperimentSession>,
    ) => {
      setBusy(true);
      setError(null);
      try {
        const updated = await fn(sessionId);
        setSession(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Gagal ${action} sesi`);
      } finally {
        setBusy(false);
      }
    },
    [sessionId],
  );

  // ── Baseline (delegated to CameraPreview's onSetBaseline) ──────────────
  const handleSetBaseline = useCallback(
    async (imageBlob: Blob) => {
      setCaptureError(null);
      try {
        const res = await setBaseline(sessionId, imageBlob);
        if (!res.face_detected) {
          setCaptureError(res.message || 'Wajah tidak terdeteksi');
          return;
        }
        await loadSession();
      } catch (err) {
        setCaptureError(err instanceof Error ? err.message : 'Gagal set baseline');
      }
    },
    [sessionId, loadSession],
  );

  // ── Capture a trial ────────────────────────────────────────────────────
  const handleCapture = useCallback(
    async (imageBlob: Blob) => {
      if (!session) return;
      if (session.status !== 'running') {
        setCaptureError('Sesi tidak running. Mulai sesi terlebih dahulu.');
        return;
      }

      setCapturing(true);
      setCaptureError(null);
      const start = performance.now();
      try {
        const opts: CaptureOptions = {
          ...EMPTY_GT,
          ...(gtCategory !== 'normal' ? { [`gt_${gtCategory}`]: true } : {}),
          scenario: scenario || undefined,
        };
        const res = await captureTrial(sessionId, imageBlob, opts);
        opts.end_to_end_ms = Math.round(performance.now() - start);

        setActiveExamWarning(res.active_exam_warning ?? false);
        // Prepend the new trial to the local list and refresh counts.
        setTrials((prev) => [res.data, ...prev]);
        setTrialsTotal((t) => t + 1);
        setGtCategory('normal'); // reset label for the next trial
        await loadSession(); // refresh trial_counts_by_scenario
      } catch (err) {
        setCaptureError(err instanceof Error ? err.message : 'Gagal capture');
      } finally {
        setCapturing(false);
      }
    },
    [session, gtCategory, scenario, sessionId, loadSession],
  );

  // ── Metrics ─────────────────────────────────────────────────────────────
  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const data = await getMetrics(sessionId);
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat metrics');
    } finally {
      setMetricsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (innerTab === 'metrics' && !metrics) loadMetrics();
  }, [innerTab, metrics, loadMetrics]);

  // ── Export CSV ─────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    try {
      const blob = await exportCsv(sessionId);
      downloadBlob(blob, `experiment_session_${sessionId}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal export CSV');
    }
  }, [sessionId]);

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    setBusy(true);
    try {
      await deleteSession(sessionId);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus sesi');
      setBusy(false);
    }
  }, [sessionId, onBack]);

  // ── Toggle a ground-truth label on a trial row ─────────────────────────
  const toggleTrialGt = useCallback(
    async (trial: ExperimentTrial, field: keyof GroundTruth, value: boolean) => {
      const prevValue = trial[field];
      // Optimistic update
      setTrials((prev) =>
        prev.map((t) => (t.id === trial.id ? { ...t, [field]: value } : t)),
      );
      try {
        await updateTrial(trial.id, { [field]: value });
      } catch (err) {
        // Revert on failure
        setTrials((prev) =>
          prev.map((t) => (t.id === trial.id ? { ...t, [field]: prevValue } : t)),
        );
        console.error('[ExperimentDetail] toggleTrialGt', err);
      }
    },
    [],
  );

  const toggleTrialInvalid = useCallback(
    async (trial: ExperimentTrial, value: boolean, reason?: string) => {
      setTrials((prev) =>
        prev.map((t) =>
          t.id === trial.id ? { ...t, is_invalid: value, invalidation_reason: reason ?? t.invalidation_reason } : t,
        ),
      );
      try {
        await updateTrial(trial.id, { is_invalid: value, invalidation_reason: reason });
      } catch (err) {
        console.error('[ExperimentDetail] toggleTrialInvalid', err);
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 dark:text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-sm">Memuat sesi…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 dark:text-red-400 mb-4">{error ?? 'Sesi tidak ditemukan'}</p>
        <button onClick={onBack} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm">
          Kembali
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> Daftar Sesi
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-sm font-medium text-red-700 dark:text-red-300"
          >
            <Trash2 className="w-4 h-4" /> Hapus
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Session header + status + lifecycle controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{session.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Peneliti: {session.researcher_name} · Lighting: {session.lighting} · Split:{' '}
              {session.dataset_split} · Config: {session.config_scope}
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <StatusBadge status={session.status} />
              <span className="text-xs text-gray-500">Trial: {trialsTotal}</span>
              {session.fastapi_device && (
                <span className="text-xs text-gray-500">Device: {session.fastapi_device}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${session.baseline_embedding ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700'}`}>
                {session.baseline_embedding ? 'Baseline ✓' : 'Belum baseline'}
              </span>
            </div>
          </div>

          {/* Lifecycle buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {(session.status === 'created' || session.status === 'paused') && (
              <LifeBtn onClick={() => runLifecycle('start', startSession)} disabled={busy} icon={<Play className="w-4 h-4" />} label="Start" tone="green" />
            )}
            {session.status === 'running' && (
              <LifeBtn onClick={() => runLifecycle('pause', pauseSession)} disabled={busy} icon={<Pause className="w-4 h-4" />} label="Pause" tone="amber" />
            )}
            {session.status === 'paused' && (
              <LifeBtn onClick={() => runLifecycle('resume', resumeSession)} disabled={busy} icon={<RotateCcw className="w-4 h-4" />} label="Resume" tone="blue" />
            )}
            {session.status !== 'completed' && session.status !== 'cancelled' && (
              <>
                <LifeBtn onClick={() => runLifecycle('complete', completeSession)} disabled={busy} icon={<Check className="w-4 h-4" />} label="Selesai" tone="blue" />
                <LifeBtn onClick={() => runLifecycle('cancel', cancelSession)} disabled={busy} icon={<XCircle className="w-4 h-4" />} label="Batal" tone="gray" />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Capture section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Capture Trial {session.status !== 'running' && <span className="text-red-500">(mulai sesi dulu)</span>}
        </h3>

        {/* Ground-truth category for the NEXT capture — pilih tepat satu.
            Otomatis kembali ke Normal setelah tiap capture. */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <div className="col-span-2 md:col-span-4 lg:col-span-8 mb-1">
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Skenario (opsional)</label>
            <input
              type="text"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              placeholder="cth: phone_normal_light"
              className="w-full max-w-md rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
            />
          </div>
          <label
            className={`flex items-center gap-1.5 text-xs rounded-lg border px-2 py-1.5 cursor-pointer ${
              gtCategory === 'normal'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'
            }`}
          >
            <input
              type="radio"
              name="gt-category"
              checked={gtCategory === 'normal'}
              onChange={() => setGtCategory('normal')}
              className="rounded"
            />
            Normal
          </label>
          {EXPERIMENT_CATEGORIES.map((cat) => (
            <label
              key={cat}
              className={`flex items-center gap-1.5 text-xs rounded-lg border px-2 py-1.5 cursor-pointer ${
                gtCategory === cat
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'
              }`}
            >
              <input
                type="radio"
                name="gt-category"
                checked={gtCategory === cat}
                onChange={() => setGtCategory(cat)}
                className="rounded"
              />
              {CATEGORY_LABELS[cat as ExperimentCategory]}
            </label>
          ))}
        </div>

        {captureError && (
          <div className="mb-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
            {captureError}
          </div>
        )}
        {activeExamWarning && (
          <div className="mb-3 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded p-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Ada ujian aktif sedang berlangsung — capture tetap tersimpan.
          </div>
        )}

        <div className="max-w-md">
          <CameraPreview
            onCapture={handleCapture}
            onSetBaseline={handleSetBaseline}
            onPermissionDenied={() => setCaptureError('Izin kamera ditolak. Aktifkan di pengaturan browser.')}
            onError={(e) => setCaptureError(`Kamera error: ${e}`)}
          />
          {capturing && (
            <p className="mt-2 text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
              <Loader2 className="w-4 h-4 animate-spin" /> Menganalisis & menyimpan trial…
            </p>
          )}
        </div>
      </div>

      {/* Inner tabs: Trials / Metrics / Sweep */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
        <nav className="flex gap-1">
          {(
            [
              { key: 'trials' as const, label: 'Review Trial' },
              { key: 'metrics' as const, label: 'Metrics' },
              { key: 'sweep' as const, label: 'Threshold Sweep' },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setInnerTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                innerTab === t.key
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {innerTab === 'trials' && (
        <TrialsTable
          trials={trials}
          loading={trialsLoading}
          page={trialsPage}
          lastPage={trialsLastPage}
          onPageChange={loadTrials}
          onToggleGt={toggleTrialGt}
          onToggleInvalid={toggleTrialInvalid}
        />
      )}

      {innerTab === 'metrics' && (
        metricsLoading || !metrics ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">Menghitung metrics…</span>
          </div>
        ) : (
          <ExperimentMetricsView metrics={metrics} />
        )
      )}

      {innerTab === 'sweep' && <ExperimentSweepChart sessionId={sessionId} />}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Hapus Sesi?</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
              Semua trial dan file snapshot untuk sesi ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Trials table with inline ground-truth labeling
// ──────────────────────────────────────────────────────────────────────────

interface TrialsTableProps {
  trials: ExperimentTrial[];
  loading: boolean;
  page: number;
  lastPage: number;
  onPageChange: (page: number) => void;
  onToggleGt: (trial: ExperimentTrial, field: keyof GroundTruth, value: boolean) => void;
  onToggleInvalid: (trial: ExperimentTrial, value: boolean, reason?: string) => void;
}

function TrialsTable({
  trials,
  loading,
  page,
  lastPage,
  onPageChange,
  onToggleGt,
  onToggleInvalid,
}: TrialsTableProps) {
  if (loading && trials.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Memuat trial…</span>
      </div>
    );
  }

  if (trials.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-10 text-center text-gray-500 dark:text-gray-400 text-sm">
        Belum ada trial. Mulai sesi lalu capture frame pertama.
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Waktu</th>
              <th className="px-2 py-2 text-left">Skenario</th>
              <th className="px-2 py-2 text-center">Risk</th>
              <th className="px-2 py-2 text-center">Score</th>
              {EXPERIMENT_CATEGORIES.map((cat) => (
                <th key={cat} className="px-2 py-2 text-center" title={CATEGORY_LABELS[cat as ExperimentCategory]}>
                  {cat === 'no_face' ? 'NoFace' : cat === 'multi_face' ? 'Multi' : cat === 'eye_gaze_away' ? 'Gaze' : cat === 'identity_mismatch' ? 'ID' : CATEGORY_LABELS[cat as ExperimentCategory]}
                </th>
              ))}
              <th className="px-2 py-2 text-center">Invalid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {trials.map((t) => (
              <tr
                key={t.id}
                className={t.is_invalid ? 'bg-red-50/40 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'}
              >
                <td className="px-2 py-2 font-medium text-gray-900 dark:text-white">{t.trial_number}</td>
                <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(t.captured_at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit' })}
                </td>
                <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{t.scenario ?? '—'}</td>
                <td className="px-2 py-2 text-center">
                  <RiskBadge level={t.risk_level} />
                </td>
                <td className="px-2 py-2 text-center text-gray-700 dark:text-gray-300">{t.total_score ?? 0}</td>
                {EXPERIMENT_CATEGORIES.map((cat) => {
                  const field = `gt_${cat}` as keyof GroundTruth;
                  return (
                    <td key={cat} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!t[field]}
                        onChange={(e) => onToggleGt(t, field, e.target.checked)}
                        className="rounded"
                        title={`GT ${CATEGORY_LABELS[cat as ExperimentCategory]}`}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!t.is_invalid}
                    onChange={(e) => onToggleInvalid(t, e.target.checked)}
                    className="rounded"
                    title="Tandai trial tidak valid"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-sm">
          <span className="text-gray-500">Halaman {page} / {lastPage}</span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= lastPage}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Small presentational helpers
// ──────────────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<SessionStatus, string> = {
  created: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  running: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

function StatusBadge({ status }: { status: SessionStatus }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[status]}`}>{status}</span>;
}

const RISK_STYLES: Record<string, string> = {
  low: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-gray-400">—</span>;
  return <span className={`text-xs px-1.5 py-0.5 rounded ${RISK_STYLES[level] ?? ''}`}>{level}</span>;
}

interface LifeBtnProps {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  tone: 'green' | 'amber' | 'blue' | 'gray';
}

const TONE_STYLES: Record<LifeBtnProps['tone'], string> = {
  green: 'bg-green-600 hover:bg-green-500 text-white',
  amber: 'bg-amber-500 hover:bg-amber-400 text-white',
  blue: 'bg-blue-600 hover:bg-blue-500 text-white',
  gray: 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200',
};

function LifeBtn({ onClick, disabled, icon, label, tone }: LifeBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${TONE_STYLES[tone]}`}
    >
      {icon} {label}
    </button>
  );
}
