/**
 * Type definitions for Proctoring Configuration
 */

// ==================== Core Config Types ====================

export interface ProctoringConfig {
  head_yaw_threshold: number;
  head_pitch_threshold: number;
  eye_gaze_threshold: number;
  face_similarity_threshold: number;
  confidence_threshold: number;
  per_class_confidence: Record<string, number> | null;
  alert_dedup_window_sec: number;
  score_weights: {
    object_detection: number;
    identity_mismatch: number;
    multi_face: number;
    no_face: number;
    head_turn: number;
    eye_gaze: number;
    tab_switch: number;
  };
  score_increments: {
    object_per_item: number;
    multi_face: number;
    no_face: number;
    head_turn: number;
    eye_gaze: number;
    identity_base: number;
  };
  risk_violation_min: number;
  risk_alert_any_min: number;
  risk_alert_high_min: number;
  risk_alert_crit_min: number;
  risk_level_medium_min: number;
  risk_level_high_min: number;
  risk_level_critical_min: number;
  snapshot_interval_sec: number;
  anomaly_trigger_sec: number;
  anomaly_cooldown_sec: number;
  notes?: string | null;
}

export interface ConfigVersion {
  id: number;
  version_number: number;
  snapshot: ProctoringConfig;
  changed_by: { id: number; name: string } | null;
  notes: string | null;
  created_at: string;
  diff: Record<string, { from: unknown; to: unknown }>;
}

export interface ConfigState {
  draft: ProctoringConfig;
  active: ProctoringConfig;
  defaults: ProctoringConfig;
  active_version: number | null;
  draft_is_same_as_active: boolean;
}

// ==================== Parameter Metadata ====================

export interface ParamDescription {
  label: string;
  desc: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

export const PARAM_DESCRIPTIONS: Record<string, ParamDescription> = {
  head_yaw_threshold: {
    label: 'Ambang Yaw Kepala',
    desc: 'Batas derajat rotasi kepala kiri/kanan sebelum dianggap menoleh',
    unit: '°',
    min: 11,
    max: 90,
    step: 1,
  },
  head_pitch_threshold: {
    label: 'Ambang Pitch Kepala',
    desc: 'Batas derajat rotasi kepala atas/bawah',
    unit: '°',
    min: 11,
    max: 80,
    step: 1,
  },
  eye_gaze_threshold: {
    label: 'Ambang Arah Mata',
    desc: 'Rasio deviasi iris (0=tengah, 1=ekstrem)',
    unit: '',
    min: 0.1,
    max: 1.0,
    step: 0.01,
  },
  face_similarity_threshold: {
    label: 'Ambang Kecocokan Wajah',
    desc: 'Euclidean distance maksimum antara embedding wajah dengan baseline — di bawah threshold = cocok',
    unit: '',
    min: 0.3,
    max: 1.0,
    step: 0.01,
  },
  confidence_threshold: {
    label: 'Ambang Confidence YOLO',
    desc: 'Confidence minimum untuk deteksi objek YOLO',
    unit: '',
    min: 0.1,
    max: 1.0,
    step: 0.01,
  },
  alert_dedup_window_sec: {
    label: 'Jendela Dedup Alert',
    desc: 'Interval minimum (detik) antar alert sejenis per siswa',
    unit: 'detik',
    min: 5,
    max: 300,
    step: 1,
  },
  snapshot_interval_sec: {
    label: 'Interval Snapshot',
    desc: 'Seberapa sering snapshot dikirim saat ujian berlangsung',
    unit: 'detik',
    min: 10,
    max: 300,
    step: 5,
  },
  anomaly_trigger_sec: {
    label: 'Trigger Anomali',
    desc: 'Waktu deteksi berturut-turut sebelum snapshot anomali dikirim',
    unit: 'detik',
    min: 1,
    max: 30,
    step: 1,
  },
  anomaly_cooldown_sec: {
    label: 'Cooldown Anomali',
    desc: 'Waktu tunggu setelah snapshot anomali sebelum bisa trigger lagi',
    unit: 'detik',
    min: 5,
    max: 120,
    step: 1,
  },
  risk_violation_min: {
    label: 'Min Skor Pelanggaran',
    desc: 'Skor risk_score FastAPI minimum untuk dianggap pelanggaran',
    unit: 'poin',
    min: 0,
    max: 100,
    step: 1,
  },
  risk_alert_any_min: {
    label: 'Min Skor Alert',
    desc: 'Skor minimum untuk broadcast alert',
    unit: 'poin',
    min: 0,
    max: 100,
    step: 1,
  },
  risk_alert_high_min: {
    label: 'Min Skor Alert Tinggi',
    desc: 'Skor minimum untuk alert severity warning',
    unit: 'poin',
    min: 0,
    max: 100,
    step: 1,
  },
  risk_alert_crit_min: {
    label: 'Min Skor Alert Kritis',
    desc: 'Skor minimum untuk alert severity critical',
    unit: 'poin',
    min: 0,
    max: 100,
    step: 1,
  },
  risk_level_medium_min: {
    label: 'Min Level Medium',
    desc: 'Skor total minimum untuk level risiko Medium',
    unit: 'poin',
    min: 1,
    max: 100,
    step: 1,
  },
  risk_level_high_min: {
    label: 'Min Level Tinggi',
    desc: 'Skor total minimum untuk level risiko High',
    unit: 'poin',
    min: 1,
    max: 100,
    step: 1,
  },
  risk_level_critical_min: {
    label: 'Min Level Kritis',
    desc: 'Skor total minimum untuk level risiko Critical',
    unit: 'poin',
    min: 1,
    max: 100,
    step: 1,
  },
};
