'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ExperimentSessionDetail } from '@/components/diagnostic/ExperimentSessionDetail';
import { createSession, listSessions } from '@/services/experiment';
import type {
  ConfigScope,
  CreateSessionPayload,
  DatasetSplit,
  ExperimentSession,
  Lighting,
  Paginated,
} from '@/types/experiment';
import { Beaker, Loader2, Plus, Search, X } from 'lucide-react';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Semua Status' },
  { value: 'created', label: 'Created' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const SPLIT_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Semua Split' },
  { value: 'calibration', label: 'Calibration' },
  { value: 'test', label: 'Test' },
];

const STATUS_STYLES: Record<string, string> = {
  created: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  running: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function ExperimentManager() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState<Paginated<ExperimentSession> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [splitFilter, setSplitFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listSessions({
        status: statusFilter || undefined,
        dataset_split: splitFilter || undefined,
        page: currentPage,
      });
      setPage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat sesi');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, splitFilter, currentPage]);

  useEffect(() => {
    load();
  }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, splitFilter]);

  if (selectedId) {
    return <ExperimentSessionDetail sessionId={selectedId} onBack={() => { setSelectedId(null); load(); }} />;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Beaker className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Experiment Sessions
          </h2>
          <span className="text-xs text-gray-500">Pengambilan Data Otomatis (Tahap 2)</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Sesi Baru
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Search className="w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={splitFilter}
            onChange={(e) => setSplitFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          >
            {SPLIT_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Memuat…</span>
          </div>
        ) : !page || page.data.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400 text-sm">
            Belum ada sesi. Klik “Sesi Baru” untuk membuat sesi pengambilan data pertama.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Nama</th>
                    <th className="px-4 py-3 text-left font-medium">Peneliti</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                    <th className="px-4 py-3 text-center font-medium">Split</th>
                    <th className="px-4 py-3 text-center font-medium">Trial</th>
                    <th className="px-4 py-3 text-left font-medium">Dibuat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {page.data.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="cursor-pointer hover:bg-blue-50/40 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{s.researcher_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[s.status] ?? ''}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{s.dataset_split}</td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{s.trials_count ?? 0}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(s.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {page.last_page > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 text-sm">
                <span className="text-gray-500">{page.total} sesi · hal. {page.current_page}/{page.last_page}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={page.current_page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs disabled:opacity-50"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(page.last_page, p + 1))}
                    disabled={page.current_page >= page.last_page}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs disabled:opacity-50"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <CreateSessionDialog
          onClose={() => setShowCreate(false)}
          onCreated={(s) => {
            setShowCreate(false);
            setSelectedId(s.id);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Create session dialog
// ──────────────────────────────────────────────────────────────────────────

interface CreateDialogProps {
  onClose: () => void;
  onCreated: (session: ExperimentSession) => void;
}

const LIGHTING_OPTIONS: { value: Lighting; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'bright', label: 'Terang' },
  { value: 'dim', label: 'Redup' },
  { value: 'backlit', label: 'Backlit' },
  { value: 'other', label: 'Lainnya' },
];

function CreateSessionDialog({ onClose, onCreated }: CreateDialogProps) {
  const [form, setForm] = useState<CreateSessionPayload>({
    name: '',
    researcher_name: '',
    lighting: 'normal',
    device_info: '',
    distance_cm: undefined,
    notes: '',
    dataset_split: 'calibration',
    config_scope: 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.researcher_name.trim()) {
      setError('Nama dan peneliti wajib diisi');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: CreateSessionPayload = {
        ...form,
        device_info: form.device_info?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        distance_cm: form.distance_cm || undefined,
      };
      const session = await createSession(payload);
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat sesi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Sesi Experiment Baru</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <Input label="Nama Sesi *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="cth: Kalibrasi HP normal" />
          <Input label="Nama Peneliti *" value={form.researcher_name} onChange={(v) => setForm((f) => ({ ...f, researcher_name: v }))} placeholder="cth: Andi" />

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Pencahayaan" value={form.lighting} onChange={(v) => setForm((f) => ({ ...f, lighting: v as Lighting }))}>
              {LIGHTING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectField>
            <SelectField label="Dataset Split" value={form.dataset_split} onChange={(v) => setForm((f) => ({ ...f, dataset_split: v as DatasetSplit }))}>
              <option value="calibration">Calibration</option>
              <option value="test">Test</option>
            </SelectField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Info Device" value={form.device_info ?? ''} onChange={(v) => setForm((f) => ({ ...f, device_info: v }))} placeholder="cth: Logitech C920" />
            <Input
              label="Jarak (cm)"
              type="number"
              value={form.distance_cm?.toString() ?? ''}
              onChange={(v) => setForm((f) => ({ ...f, distance_cm: v ? Number(v) : undefined }))}
              placeholder="50"
            />
          </div>

          <SelectField label="Config Scope" value={form.config_scope} onChange={(v) => setForm((f) => ({ ...f, config_scope: v as ConfigScope }))}>
            <option value="draft">Draft (uji coba threshold)</option>
            <option value="active">Active (config produksi)</option>
          </SelectField>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Catatan</label>
            <textarea
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Catatan opsional…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200">
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Buat Sesi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
      >
        {children}
      </select>
    </div>
  );
}
