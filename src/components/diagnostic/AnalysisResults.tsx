'use client';

import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import type { AnalysisResultsProps } from '@/types/diagnostic';
import { getHealthScoreColor, formatProcessingTime } from '@/types/diagnostic';

/**
 * AnalysisResults Component
 * 
 * Displays comprehensive analysis results with color-coded health scores
 * Requirements: 3.1 (Complete analysis execution), 3.2 (Score calculation accuracy),
 *               6.2 (Report completeness)
 */
export function AnalysisResults({ result, onDownloadReport }: AnalysisResultsProps) {
  const healthColor = getHealthScoreColor(result.overall_health_score);

  return (
    <div className="space-y-6">
      {/* Overall Health Score */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Overall Health Score
          </h3>
          <button
            onClick={() => onDownloadReport(result.test_id)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>

        <div className="flex items-center gap-6">
          {/* Score Circle */}
          <div className="relative w-32 h-32">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200 dark:text-gray-700"
              />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke={healthColor}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(result.overall_health_score / 100) * 352} 352`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold" style={{ color: healthColor }}>
                  {result.overall_health_score}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">/ 100</div>
              </div>
            </div>
          </div>

          {/* Status Badge & Info */}
          <div className="flex-1 space-y-3">
            <HealthStatusBadge status={result.overall_status} />
            
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                <span>{formatProcessingTime(result.processing_time_ms)}</span>
              </div>
              <div className="text-xs">
                Test ID: #{result.test_id}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Component Scores Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Component Analysis
        </h3>

        <div className="space-y-4">
          <ComponentScoreRow
            name="Object Detection"
            icon="🎯"
            component={result.components.object_detection}
          />
          <ComponentScoreRow
            name="Face Detection"
            icon="👤"
            component={result.components.face_detection}
          />
          <ComponentScoreRow
            name="Head Pose"
            icon="🔄"
            component={result.components.head_pose}
          />
          <ComponentScoreRow
            name="Eye Gaze"
            icon="👁️"
            component={result.components.eye_gaze}
          />
          <ComponentScoreRow
            name="Face Embedding"
            icon="🧬"
            component={result.components.face_embedding}
          />
        </div>
      </div>

      {/* Detection Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Detected Objects */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            📦 Detected Objects
            <span className="text-sm font-normal text-gray-500">
              ({result.detected_objects.length})
            </span>
          </h4>

          {result.detected_objects.length > 0 ? (
            <div className="space-y-2">
              {result.detected_objects.map((obj, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                    {obj.class}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {Math.round(obj.confidence * 100)}%
                    </span>
                    <SeverityBadge severity={obj.severity} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No objects detected
            </p>
          )}
        </div>

        {/* Detected Faces */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            👥 Detected Faces
            <span className="text-sm font-normal text-gray-500">
              ({result.detected_faces.length})
            </span>
          </h4>

          {result.detected_faces.length > 0 ? (
            <div className="space-y-3">
              {result.detected_faces.map((face, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg space-y-2"
                >
                  <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    Face #{idx + 1}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Yaw:</span>
                      <span className="ml-1 text-gray-900 dark:text-white font-mono">
                        {face.head_pose.yaw.toFixed(1)}°
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Pitch:</span>
                      <span className="ml-1 text-gray-900 dark:text-white font-mono">
                        {face.head_pose.pitch.toFixed(1)}°
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Eye L:</span>
                      <span className="ml-1 text-gray-900 dark:text-white font-mono">
                        {face.eye_gaze.left_ratio.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Eye R:</span>
                      <span className="ml-1 text-gray-900 dark:text-white font-mono">
                        {face.eye_gaze.right_ratio.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {face.embedding_present && face.embedding_dimensions && (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Embedding: {face.embedding_dimensions}-dim
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No faces detected
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Component Score Row
 */
interface ComponentScoreRowProps {
  name: string;
  icon: string;
  component: {
    status: 'success' | 'failure' | 'degraded';
    score: number;
    confidence: number;
    details: Record<string, any>;
  };
}

function ComponentScoreRow({ name, icon, component }: ComponentScoreRowProps) {
  const scoreColor = getHealthScoreColor(component.score);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {name}
          </span>
          <StatusIcon status={component.status} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {Math.round(component.confidence * 100)}%
          </span>
          <span className="text-sm font-semibold" style={{ color: scoreColor }}>
            {component.score}
          </span>
        </div>
      </div>

      {/* Score Bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500 rounded-full"
          style={{
            width: `${component.score}%`,
            backgroundColor: scoreColor,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Status Icon
 */
function StatusIcon({ status }: { status: 'success' | 'failure' | 'degraded' }) {
  if (status === 'success') {
    return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  }
  if (status === 'degraded') {
    return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  }
  return <XCircle className="w-4 h-4 text-red-500" />;
}

/**
 * Health Status Badge
 */
function HealthStatusBadge({ status }: { status: 'healthy' | 'warning' | 'critical' }) {
  const config = {
    healthy: {
      label: 'Healthy',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      icon: TrendingUp,
    },
    warning: {
      label: 'Warning',
      color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      icon: Minus,
    },
    critical: {
      label: 'Critical',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      icon: TrendingDown,
    },
  };

  const { label, color, icon: Icon } = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${color}`}>
      <Icon className="w-4 h-4" />
      {label}
    </span>
  );
}

/**
 * Severity Badge
 */
function SeverityBadge({ severity }: { severity: 'prohibited' | 'suspicious' | 'allowed' }) {
  const config = {
    prohibited: { label: 'Prohibited', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
    suspicious: { label: 'Suspicious', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' },
    allowed: { label: 'Allowed', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  };

  const { label, color } = config[severity];

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
