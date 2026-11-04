'use client';

import React, { useState } from 'react';
import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getSweep, type SweepParams } from '@/services/experiment';
import type { SweepResult } from '@/types/experiment';
import { Loader2 } from 'lucide-react';

interface Props {
  sessionId: number;
}

const PARAM_OPTIONS = [
  { value: 'head_yaw', label: 'Head Yaw' },
  { value: 'head_pitch', label: 'Head Pitch' },
  { value: 'eye_gaze', label: 'Eye Gaze Ratio' },
  { value: 'confidence', label: 'Confidence (HP/Buku)' },
  { value: 'face_distance', label: 'Face Distance' },
];

// Category must match the selected param's meaning; the backend validates the
// pairing server-side. We expose the valid category per param client-side too.
const CATEGORY_BY_PARAM: Record<string, { value: string; label: string }[]> = {
  head_yaw: [{ value: 'head_turn', label: 'Menoleh' }],
  head_pitch: [{ value: 'head_turn', label: 'Menoleh' }],
  eye_gaze: [{ value: 'eye_gaze_away', label: 'Pandangan Menyimpang' }],
  confidence: [
    { value: 'phone', label: 'HP' },
    { value: 'book', label: 'Buku' },
  ],
  face_distance: [{ value: 'identity_mismatch', label: 'Identitas Berbeda' }],
};

export function ExperimentSweepChart({ sessionId }: Props) {
  const [param, setParam] = useState('head_yaw');
  const [category, setCategory] = useState('head_turn');
  const [min, setMin] = useState('5');
  const [max, setMax] = useState('60');
  const [steps, setSteps] = useState('20');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SweepResult | null>(null);

  const categories = CATEGORY_BY_PARAM[param] ?? [];

  const handleParamChange = (value: string) => {
    setParam(value);
    const first = CATEGORY_BY_PARAM[value]?.[0];
    if (first) setCategory(first.value);
  };

  const runSweep = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params: SweepParams = {
        param,
        category,
        min: parseFloat(min),
        max: parseFloat(max),
        steps: parseInt(steps, 10) || 20,
      };
      const data = await getSweep(sessionId, params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat sweep');
    } finally {
      setLoading(false);
    }
  };

  const chartData = (result?.sweep ?? []).map((p) => ({
    threshold: Number(p.threshold.toFixed(3)),
    Precision: p.precision,
    Recall: p.recall,
    F1: p.f1,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
        Threshold Sweep — Cari Ambang Optimal
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Field label="Parameter">
          <select
            value={param}
            onChange={(e) => handleParamChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          >
            {PARAM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Kategori">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          >
            {categories.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Min">
          <input
            type="number"
            step="any"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          />
        </Field>
        <Field label="Max">
          <input
            type="number"
            step="any"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          />
        </Field>
        <Field label="Steps">
          <input
            type="number"
            min={2}
            max={100}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white"
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={runSweep}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Jalankan Sweep
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {chartData.length > 0 && (
        <div className="mt-5 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="threshold" tick={{ fontSize: 11, fill: '#9ca3af' }} label={{ value: 'Threshold', position: 'insideBottom', offset: -2, fill: '#9ca3af', fontSize: 11 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <Tooltip formatter={(v) => { const n = typeof v === 'number' ? v : Number(Array.isArray(v) ? v[0] : v); return Number.isNaN(n) ? '—' : n.toFixed(3); }} contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Precision" stroke="#3b82f6" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="Recall" stroke="#10b981" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="F1" stroke="#f59e0b" dot={false} strokeWidth={2.5} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
