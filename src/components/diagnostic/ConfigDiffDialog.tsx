'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { PARAM_DESCRIPTIONS } from '@/types/proctoring-config';
import type { ConfigState, ProctoringConfig } from '@/types/proctoring-config';

// ==================== Types ====================

interface ConfigDiffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (notes: string) => Promise<void>;
  configState: ConfigState;
}

interface DiffRow {
  key: string;
  label: string;
  activeValue: number | string;
  draftValue: number | string;
  direction: 'up' | 'down' | 'same';
}

// ==================== Helpers ====================

function buildDiffRows(configState: ConfigState): DiffRow[] {
  const rows: DiffRow[] = [];
  const { draft, active } = configState;

  const numericKeys = Object.keys(PARAM_DESCRIPTIONS) as (keyof typeof PARAM_DESCRIPTIONS)[];

  for (const key of numericKeys) {
    const activeVal = active[key as keyof ProctoringConfig] as number;
    const draftVal = draft[key as keyof ProctoringConfig] as number;
    if (Math.abs(activeVal - draftVal) < 1e-9) continue;
    rows.push({
      key,
      label: PARAM_DESCRIPTIONS[key].label,
      activeValue: activeVal,
      draftValue: draftVal,
      direction: draftVal > activeVal ? 'up' : 'down',
    });
  }

  // Score weights
  const weightKeys = Object.keys(draft.score_weights) as (keyof ProctoringConfig['score_weights'])[];
  for (const k of weightKeys) {
    const activeVal = active.score_weights[k];
    const draftVal = draft.score_weights[k];
    if (Math.abs(activeVal - draftVal) < 1e-9) continue;
    rows.push({
      key: `score_weights.${k}`,
      label: `Weight: ${k.replace(/_/g, ' ')}`,
      activeValue: activeVal.toFixed(3),
      draftValue: draftVal.toFixed(3),
      direction: draftVal > activeVal ? 'up' : 'down',
    });
  }

  return rows;
}

// ==================== Component ====================

export function ConfigDiffDialog({
  isOpen,
  onClose,
  onConfirm,
  configState,
}: ConfigDiffDialogProps) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const notesId = 'config-diff-notes';

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setError(null);
      setLoading(false);
    }
  }, [isOpen]);

  // Focus trap — close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const diffRows = buildDiffRows(configState);
  const hasDiff = diffRows.length > 0;

  const handleConfirm = async () => {
    if (!hasDiff) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(notes);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menerapkan konfigurasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diff-dialog-title"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2
            id="diff-dialog-title"
            className="text-lg font-semibold text-gray-100 flex items-center gap-2"
          >
            <CheckCircle className="w-5 h-5 text-blue-400" />
            Terapkan Konfigurasi ke Active
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!hasDiff ? (
            <div className="flex items-center gap-3 py-6 text-gray-400 justify-center">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm">
                Draft sama dengan konfigurasi aktif — tidak ada perubahan
              </span>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-400">
                Perubahan berikut akan diterapkan ke konfigurasi aktif:
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                      <th className="px-4 py-2.5 text-left font-medium">Parameter</th>
                      <th className="px-4 py-2.5 text-right font-medium">Nilai Aktif</th>
                      <th className="px-3 py-2.5 text-center font-medium">
                        <ArrowRight className="w-3.5 h-3.5 mx-auto" />
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium">Nilai Draft</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/60">
                    {diffRows.map((row) => (
                      <tr
                        key={row.key}
                        className="hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-gray-200 font-medium">
                          {row.label}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 font-mono">
                          {String(row.activeValue)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <ArrowRight className="w-3.5 h-3.5 mx-auto text-gray-500" />
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-semibold ${
                            row.direction === 'up'
                              ? 'text-green-400'
                              : row.direction === 'down'
                              ? 'text-red-400'
                              : 'text-gray-300'
                          }`}
                        >
                          {String(row.draftValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Notes input */}
          <div>
            <label
              htmlFor={notesId}
              className="block text-sm font-medium text-gray-300 mb-1.5"
            >
              Catatan
            </label>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan perubahan (opsional)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 text-sm placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-gray-100 text-sm transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!hasDiff || loading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {loading ? 'Menerapkan…' : 'Terapkan'}
          </button>
        </div>
      </div>
    </div>
  );
}
