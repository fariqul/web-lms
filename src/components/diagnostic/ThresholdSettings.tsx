'use client';

import React, { useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Save,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { updateDraft } from '@/services/proctoring-config';
import { PARAM_DESCRIPTIONS } from '@/types/proctoring-config';
import type { ConfigState, ProctoringConfig } from '@/types/proctoring-config';

// ==================== Types ====================

interface ThresholdSettingsProps {
  configState: ConfigState;
  onSaved: () => void;
}

type ScoreWeightKey = keyof ProctoringConfig['score_weights'];

type DraftState = Omit<ProctoringConfig, 'per_class_confidence' | 'notes'> & {
  per_class_confidence: Record<string, number> | null;
  notes?: string | null;
};

// ==================== Section definitions ====================

interface ParamSection {
  title: string;
  keys: (keyof typeof PARAM_DESCRIPTIONS)[];
}

const SECTIONS: ParamSection[] = [
  {
    title: 'Deteksi Wajah & Pose',
    keys: ['head_yaw_threshold', 'head_pitch_threshold', 'eye_gaze_threshold'],
  },
  {
    title: 'Identitas',
    keys: ['face_similarity_threshold', 'confidence_threshold'],
  },
  {
    title: 'Alert',
    keys: ['alert_dedup_window_sec'],
  },
  {
    title: 'Scoring & Risiko',
    keys: [
      'risk_violation_min',
      'risk_alert_any_min',
      'risk_alert_high_min',
      'risk_alert_crit_min',
      'risk_level_medium_min',
      'risk_level_high_min',
      'risk_level_critical_min',
    ],
  },
  {
    title: 'Client-side (Ujian)',
    keys: ['snapshot_interval_sec', 'anomaly_trigger_sec', 'anomaly_cooldown_sec'],
  },
];

const WEIGHT_LABELS: Record<ScoreWeightKey, string> = {
  object_detection: 'Deteksi Objek',
  identity_mismatch: 'Mismatch Identitas',
  multi_face: 'Multi Wajah',
  no_face: 'Tidak Ada Wajah',
  head_turn: 'Kepala Menoleh',
  eye_gaze: 'Arah Mata',
  tab_switch: 'Pindah Tab',
};

// ==================== Sub-components ====================

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 hover:bg-gray-750 text-gray-100 font-medium text-sm transition-colors"
        aria-expanded={open}
      >
        <span>{title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="divide-y divide-gray-700/50">{children}</div>}
    </div>
  );
}

interface ParamRowProps {
  paramKey: string;
  value: number;
  defaultValue: number;
  onChange: (key: string, value: number) => void;
  onReset: (key: string) => void;
}

function ParamRow({ paramKey, value, defaultValue, onChange, onReset }: ParamRowProps) {
  const meta = PARAM_DESCRIPTIONS[paramKey];
  if (!meta) return null;

  const isModified = Math.abs(value - defaultValue) > 1e-9;
  const inputId = `param-${paramKey}`;
  const sliderId = `slider-${paramKey}`;

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseFloat(e.target.value);
    if (!isNaN(parsed)) {
      onChange(paramKey, Math.min(meta.max, Math.max(meta.min, parsed)));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(paramKey, parseFloat(e.target.value));
  };

  return (
    <div
      className="px-4 py-3 hover:bg-gray-800/50 transition-colors"
      title={meta.desc}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-gray-200 flex items-center gap-2"
        >
          {meta.label}
          {meta.unit && (
            <span className="text-xs text-gray-400">({meta.unit})</span>
          )}
          {isModified && (
            <span className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              diubah
            </span>
          )}
        </label>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="number"
            value={value}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            onChange={handleNumberChange}
            className="w-24 px-2 py-1 rounded bg-gray-900 border border-gray-600 text-gray-100 text-sm text-right focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            aria-label={`${meta.label} nilai`}
          />
          {isModified && (
            <button
              type="button"
              onClick={() => onReset(paramKey)}
              className="p-1 rounded text-gray-400 hover:text-amber-400 hover:bg-gray-700 transition-colors"
              title={`Reset ke default (${defaultValue})`}
              aria-label={`Reset ${meta.label} ke default`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <input
        id={sliderId}
        type="range"
        value={value}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onChange={handleSliderChange}
        className="w-full h-1.5 rounded-full accent-blue-500 bg-gray-700 cursor-pointer"
        aria-label={`${meta.label} slider`}
      />
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>{meta.min}</span>
        <span className="text-gray-400">default: {defaultValue}</span>
        <span>{meta.max}</span>
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function ThresholdSettings({ configState, onSaved }: ThresholdSettingsProps) {
  const [draft, setDraft] = useState<DraftState>({ ...configState.draft });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check if any value differs from the saved draft
  const hasChanges = useCallback((): boolean => {
    const original = configState.draft;
    // Check numeric params
    for (const key of Object.keys(PARAM_DESCRIPTIONS)) {
      const k = key as keyof ProctoringConfig;
      if ((draft[k] as number) !== (original[k] as number)) return true;
    }
    // Check weights
    const weightsKeys = Object.keys(draft.score_weights) as ScoreWeightKey[];
    for (const k of weightsKeys) {
      if (draft.score_weights[k] !== original.score_weights[k]) return true;
    }
    return false;
  }, [draft, configState.draft]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const handleParamChange = (key: string, value: number) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleParamReset = (key: string) => {
    const defaultValue = configState.defaults[key as keyof ProctoringConfig] as number;
    setDraft((prev) => ({ ...prev, [key]: defaultValue }));
  };

  const handleWeightChange = (key: ScoreWeightKey, value: number) => {
    setDraft((prev) => ({
      ...prev,
      score_weights: { ...prev.score_weights, [key]: value },
    }));
  };

  const handleResetAll = () => {
    setDraft({ ...configState.defaults });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasChanges()) return;
    setSaving(true);
    try {
      // Build partial update with only changed params
      const partial: Partial<ProctoringConfig> = {};
      for (const key of Object.keys(PARAM_DESCRIPTIONS)) {
        const k = key as keyof ProctoringConfig;
        partial[k] = draft[k] as never;
      }
      partial.score_weights = { ...draft.score_weights };

      await updateDraft(partial);
      showToast('success', 'Draft konfigurasi berhasil disimpan.');
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan draft.';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  // Score weights total
  const weightKeys = Object.keys(draft.score_weights) as ScoreWeightKey[];
  const weightTotal = weightKeys.reduce((sum, k) => sum + draft.score_weights[k], 0);
  const weightValid = Math.abs(weightTotal - 1.0) <= 0.01;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Toast */}
      {toast && (
        <div
          role="alert"
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border ${
            toast.type === 'success'
              ? 'bg-green-900/40 border-green-700 text-green-300'
              : 'bg-red-900/40 border-red-700 text-red-300'
          }`}
        >
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          {toast.message}
        </div>
      )}

      {/* Param sections */}
      {SECTIONS.map((section) => (
        <CollapsibleSection key={section.title} title={section.title}>
          {section.keys.map((key) => (
            <ParamRow
              key={key}
              paramKey={key}
              value={draft[key as keyof DraftState] as number}
              defaultValue={configState.defaults[key as keyof ProctoringConfig] as number}
              onChange={handleParamChange}
              onReset={handleParamReset}
            />
          ))}
        </CollapsibleSection>
      ))}

      {/* Score Weights */}
      <CollapsibleSection title="Score Weights">
        <div className="px-4 py-3 space-y-3">
          {!weightValid && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-900/30 border border-red-700 text-red-300 text-xs"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Total weight harus = 1.0 — saat ini {weightTotal.toFixed(3)}
            </div>
          )}
          {weightKeys.map((key) => {
            const pct = Math.min(100, Math.max(0, draft.score_weights[key] * 100));
            const inputId = `weight-${key}`;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor={inputId}
                    className="text-sm text-gray-300"
                  >
                    {WEIGHT_LABELS[key]}
                  </label>
                  <input
                    id={inputId}
                    type="number"
                    value={draft.score_weights[key]}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) handleWeightChange(key, Math.min(1, Math.max(0, v)));
                    }}
                    className="w-20 px-2 py-0.5 rounded bg-gray-900 border border-gray-600 text-gray-100 text-xs text-right focus:outline-none focus:border-blue-500"
                    aria-label={`Weight ${WEIGHT_LABELS[key]}`}
                  />
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={draft.score_weights[key]}
                    aria-valuemin={0}
                    aria-valuemax={1}
                    aria-label={`${WEIGHT_LABELS[key]} progress`}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex justify-end pt-1">
            <span
              className={`text-xs font-mono font-semibold ${
                weightValid ? 'text-green-400' : 'text-red-400'
              }`}
            >
              Total: {weightTotal.toFixed(3)}
            </span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Action bar */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleResetAll}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-gray-100 text-sm transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset Semua ke Default
        </button>
        <button
          type="submit"
          disabled={!hasChanges() || saving}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Menyimpan…' : 'Simpan Draft'}
        </button>
      </div>
    </form>
  );
}
