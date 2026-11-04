'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { History, RotateCcw, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { getVersionHistory, rollback } from '@/services/proctoring-config';
import { PARAM_DESCRIPTIONS } from '@/types/proctoring-config';
import type { ConfigVersion } from '@/types/proctoring-config';

// ==================== Types ====================

interface ConfigVersionHistoryProps {
  onRollbackSuccess: () => void;
}

// ==================== Helpers ====================

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDiffLabel(key: string): string {
  const meta = PARAM_DESCRIPTIONS[key];
  if (meta) return meta.label;
  // fallback: humanise key
  return key.replace(/_/g, ' ');
}

// ==================== Sub-components ====================

interface DiffBadgeProps {
  paramKey: string;
  from: unknown;
  to: unknown;
}

function DiffBadge({ paramKey, from, to }: DiffBadgeProps) {
  const label = getDiffLabel(paramKey);
  const fromNum = typeof from === 'number' ? from : parseFloat(String(from));
  const toNum = typeof to === 'number' ? to : parseFloat(String(to));
  const isNumeric = !isNaN(fromNum) && !isNaN(toNum);
  const direction = isNumeric ? (toNum > fromNum ? 'up' : 'down') : 'neutral';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        direction === 'up'
          ? 'bg-green-900/30 border-green-700 text-green-300'
          : direction === 'down'
          ? 'bg-red-900/30 border-red-700 text-red-300'
          : 'bg-gray-700/50 border-gray-600 text-gray-300'
      }`}
      title={`${label}: ${String(from)} → ${String(to)}`}
    >
      {label}
    </span>
  );
}

// ==================== Main Component ====================

export function ConfigVersionHistory({ onRollbackSuccess }: ConfigVersionHistoryProps) {
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getVersionHistory();
      // Sort descending by version_number
      const sorted = [...data].sort((a, b) => b.version_number - a.version_number);
      setVersions(sorted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat versi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const latestVersionNumber = versions.length > 0 ? versions[0].version_number : null;

  const handleRollback = async (version: ConfigVersion) => {
    const confirmed = window.confirm(
      `Rollback ke versi ${version.version_number}?\n\nTindakan ini akan menimpa konfigurasi aktif. Lanjutkan?`,
    );
    if (!confirmed) return;

    setRollingBack(version.id);
    setError(null);
    try {
      await rollback(version.id);
      showSuccess(`Rollback ke versi ${version.version_number} berhasil.`);
      await fetchHistory();
      onRollbackSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melakukan rollback.');
    } finally {
      setRollingBack(null);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
        <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          Riwayat Versi Konfigurasi
        </h3>
        <button
          type="button"
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 border border-gray-600 hover:bg-gray-800 hover:text-gray-200 transition-colors disabled:opacity-50"
          aria-label="Muat ulang riwayat"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCcw className="w-3.5 h-3.5" />
          )}
          Refresh
        </button>
      </div>

      {/* Toast messages */}
      <div className="px-5 pt-3 space-y-2">
        {successMessage && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-900/30 border border-green-700 text-green-300 text-sm"
          >
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {successMessage}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700 text-red-300 text-sm"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">Memuat riwayat…</span>
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-500">
          <History className="w-8 h-8" />
          <p className="text-sm">Belum ada riwayat versi konfigurasi.</p>
        </div>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="w-full text-sm border-separate border-spacing-y-1">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 text-left font-medium">Versi</th>
                <th className="px-3 py-2 text-left font-medium">Tanggal</th>
                <th className="px-3 py-2 text-left font-medium">Diubah Oleh</th>
                <th className="px-3 py-2 text-left font-medium">Catatan</th>
                <th className="px-3 py-2 text-left font-medium">Perubahan</th>
                <th className="px-3 py-2 text-center font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => {
                const isLatest = version.version_number === latestVersionNumber;
                const diffKeys = Object.keys(version.diff ?? {});
                const isRollingThisBack = rollingBack === version.id;

                return (
                  <tr
                    key={version.id}
                    className="bg-gray-800/40 hover:bg-gray-800/70 transition-colors rounded-lg"
                  >
                    {/* Versi */}
                    <td className="px-3 py-2.5 rounded-l-lg">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-gray-100">
                          v{version.version_number}
                        </span>
                        {isLatest && (
                          <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-600/20 text-blue-400 border border-blue-600/30">
                            aktif
                          </span>
                        )}
                      </span>
                    </td>

                    {/* Tanggal */}
                    <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">
                      {formatDateTime(version.created_at)}
                    </td>

                    {/* Diubah Oleh */}
                    <td className="px-3 py-2.5 text-gray-300">
                      {version.changed_by?.name ?? (
                        <span className="text-gray-500 italic">—</span>
                      )}
                    </td>

                    {/* Catatan */}
                    <td className="px-3 py-2.5 text-gray-400 max-w-[200px]">
                      {version.notes ? (
                        <span className="line-clamp-2">{version.notes}</span>
                      ) : (
                        <span className="italic text-gray-600">—</span>
                      )}
                    </td>

                    {/* Perubahan */}
                    <td className="px-3 py-2.5">
                      {diffKeys.length === 0 ? (
                        <span className="text-gray-600 italic text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {diffKeys.map((k) => (
                            <DiffBadge
                              key={k}
                              paramKey={k}
                              from={version.diff[k].from}
                              to={version.diff[k].to}
                            />
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="px-3 py-2.5 rounded-r-lg text-center">
                      {!isLatest ? (
                        <button
                          type="button"
                          onClick={() => handleRollback(version)}
                          disabled={isRollingThisBack || rollingBack !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-amber-600/50 text-amber-400 hover:bg-amber-900/30 hover:border-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          aria-label={`Rollback ke versi ${version.version_number}`}
                        >
                          {isRollingThisBack ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Rollback
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600 italic">terbaru</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
