'use client';

import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  EXPERIMENT_CATEGORIES,
  CATEGORY_LABELS,
  type ExperimentCategory,
  type ExperimentMetrics,
} from '@/types/experiment';

interface Props {
  metrics: ExperimentMetrics;
}

function fmt(v: number | null): string {
  if (v === null) return '—';
  return (v * 100).toFixed(1) + '%';
}

function fmtNum(v: number | null): string {
  if (v === null) return '—';
  return v.toFixed(3);
}

/** Colour helper: green = good, red = bad, used for the F1 bar chart. */
function f1Color(f1: number | null): string {
  if (f1 === null) return '#9ca3af';
  if (f1 >= 0.8) return '#16a34a';
  if (f1 >= 0.5) return '#eab308';
  return '#dc2626';
}

export function ExperimentMetricsView({ metrics }: Props) {
  const { per_category, overall, latency, trial_count, valid_trial_count } = metrics;

  const chartData = EXPERIMENT_CATEGORIES.map((cat) => ({
    category: CATEGORY_LABELS[cat as ExperimentCategory],
    f1: per_category[cat]?.f1 ?? null,
    color: f1Color(per_category[cat]?.f1 ?? null),
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard label="Total Trial" value={String(trial_count)} />
        <SummaryCard label="Valid Trial" value={String(valid_trial_count)} />
        <SummaryCard label="Accuracy" value={fmt(overall.accuracy)} />
        <SummaryCard label="Precision" value={fmt(overall.precision)} />
        <SummaryCard label="F1 (macro)" value={fmt(overall.f1)} />
      </div>

      {/* Per-category confusion matrix */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Confusion Matrix per Kategori
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kategori</th>
                <th className="px-3 py-2 text-right font-medium">TP</th>
                <th className="px-3 py-2 text-right font-medium">TN</th>
                <th className="px-3 py-2 text-right font-medium">FP</th>
                <th className="px-3 py-2 text-right font-medium">FN</th>
                <th className="px-3 py-2 text-right font-medium">Precision</th>
                <th className="px-3 py-2 text-right font-medium">Recall</th>
                <th className="px-3 py-2 text-right font-medium">F1</th>
                <th className="px-3 py-2 text-right font-medium">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {EXPERIMENT_CATEGORIES.map((cat) => {
                const m = per_category[cat];
                if (!m) return null;
                return (
                  <tr key={cat} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                      {CATEGORY_LABELS[cat as ExperimentCategory]}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{m.tp}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.tn}</td>
                    <td className="px-3 py-2 text-right text-orange-600 dark:text-orange-400">{m.fp}</td>
                    <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">{m.fn}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(m.precision)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(m.recall)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmtNum(m.f1)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.support}</td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 dark:bg-gray-900/40 font-semibold">
                <td className="px-3 py-2 text-gray-900 dark:text-white">Macro Average</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right">{fmtNum(overall.precision)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(overall.recall)}</td>
                <td className="px-3 py-2 text-right">{fmtNum(overall.f1)}</td>
                <td className="px-3 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* F1 per category chart */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          F1-Score per Kategori
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#9ca3af' }} angle={-15} textAnchor="end" height={60} interval={0} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `${v}`} />
              <Tooltip
                formatter={(value) => {
                  const num = typeof value === 'number' ? value : Number(Array.isArray(value) ? value[0] : value);
                  return [Number.isNaN(num) ? '—' : num.toFixed(3), 'F1'];
                }}
                contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12 }}
              />
              <Bar dataKey="f1" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Latency stats */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Latensi (ms)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-600 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tahap</th>
                <th className="px-3 py-2 text-right font-medium">Count</th>
                <th className="px-3 py-2 text-right font-medium">Min</th>
                <th className="px-3 py-2 text-right font-medium">Mean</th>
                <th className="px-3 py-2 text-right font-medium">Median</th>
                <th className="px-3 py-2 text-right font-medium">P95</th>
                <th className="px-3 py-2 text-right font-medium">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {(['inference_ms', 'server_total_ms', 'end_to_end_ms'] as const).map((field) => {
                const s = latency[field];
                const label = field === 'inference_ms' ? 'Inferensi FastAPI' : field === 'server_total_ms' ? 'Server Total' : 'End-to-End';
                return (
                  <tr key={field} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{label}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{s.count}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(s.min)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(s.mean)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(s.median)}</td>
                    <td className="px-3 py-2 text-right text-orange-600 dark:text-orange-400">{fmtNum(s.p95)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(s.max)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-xl font-bold text-gray-900 dark:text-white mt-1">{value}</div>
    </div>
  );
}
