'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Info,
  Copy,
  Check,
  ExternalLink,
  Camera,
  Wifi,
  Settings,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import type { TroubleshootingProps, CategoryType } from '@/types/diagnostic';
import { getSeverityColor } from '@/types/diagnostic';

/**
 * TroubleshootingSuggestions Component
 * 
 * Displays categorized troubleshooting suggestions with copy-to-clipboard functionality
 * Requirements: 5.1 (Issue detection logic), 5.2 (Actionable suggestions)
 */
export function TroubleshootingSuggestions({ suggestions }: TroubleshootingProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Group suggestions by category
  const groupedSuggestions = suggestions.reduce((acc, suggestion, index) => {
    const category = suggestion.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({ ...suggestion, originalIndex: index });
    return acc;
  }, {} as Record<CategoryType, Array<TroubleshootingProps['suggestions'][0] & { originalIndex: number }>>);

  const handleCopyTechnicalDetails = async (details: string, index: number) => {
    try {
      await navigator.clipboard.writeText(details);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // If no suggestions, show success message
  if (suggestions.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            ✓ All Systems Operational
          </h3>
          <p className="text-gray-600 dark:text-gray-400 max-w-md">
            Tidak ada masalah yang terdeteksi. Sistem proctoring berfungsi dengan baik.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Troubleshooting Suggestions
        </h3>

        <div className="space-y-6">
          {Object.entries(groupedSuggestions).map(([category, categorySuggestions]) => (
            <CategorySection
              key={category}
              category={category as CategoryType}
              suggestions={categorySuggestions}
              copiedIndex={copiedIndex}
              onCopy={handleCopyTechnicalDetails}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Category Section Component
 */
interface CategorySectionProps {
  category: CategoryType;
  suggestions: Array<TroubleshootingProps['suggestions'][0] & { originalIndex: number }>;
  copiedIndex: number | null;
  onCopy: (details: string, index: number) => void;
}

function CategorySection({ category, suggestions, copiedIndex, onCopy }: CategorySectionProps) {
  const categoryConfig = {
    camera: { label: 'Camera Issues', icon: Camera, color: 'text-purple-600 dark:text-purple-400' },
    network: { label: 'Network & Service Issues', icon: Wifi, color: 'text-blue-600 dark:text-blue-400' },
    configuration: { label: 'Configuration Issues', icon: Settings, color: 'text-orange-600 dark:text-orange-400' },
    performance: { label: 'Performance Issues', icon: Zap, color: 'text-yellow-600 dark:text-yellow-400' },
  };

  const { label, icon: Icon, color } = categoryConfig[category];

  return (
    <div>
      <h4 className={`text-sm font-semibold ${color} mb-3 flex items-center gap-2`}>
        <Icon className="w-4 h-4" />
        {label}
      </h4>

      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.originalIndex}
            suggestion={suggestion}
            isCopied={copiedIndex === suggestion.originalIndex}
            onCopy={() => suggestion.technical_details && onCopy(suggestion.technical_details, suggestion.originalIndex)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Suggestion Card Component
 */
interface SuggestionCardProps {
  suggestion: TroubleshootingProps['suggestions'][0];
  isCopied: boolean;
  onCopy: () => void;
}

function SuggestionCard({ suggestion, isCopied, onCopy }: SuggestionCardProps) {
  const severityColor = getSeverityColor(suggestion.severity);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <SeverityIcon severity={suggestion.severity} />
          <div className="flex-1 min-w-0">
            <h5 className="font-medium text-gray-900 dark:text-white text-sm">
              {suggestion.issue}
            </h5>
            <SeverityBadge severity={suggestion.severity} color={severityColor} />
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
        {suggestion.description}
      </p>

      {/* Action Steps */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
        <div className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">
          ⚡ Recommended Action:
        </div>
        <div className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-line">
          {suggestion.action}
        </div>
      </div>

      {/* Technical Details */}
      {suggestion.technical_details && (
        <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400">Technical Details:</span>
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
            >
              {isCopied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="text-xs text-gray-300 font-mono overflow-x-auto">
            {suggestion.technical_details}
          </pre>
        </div>
      )}

      {/* Related Config */}
      {suggestion.related_config && suggestion.related_config.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500 dark:text-gray-400">Related config:</span>
          {suggestion.related_config.map((config) => (
            <code
              key={config}
              className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-mono"
            >
              {config}
            </code>
          ))}
        </div>
      )}

      {/* Documentation Link */}
      {suggestion.documentation_link && (
        <a
          href={`/${suggestion.documentation_link}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          View Documentation
        </a>
      )}
    </div>
  );
}

/**
 * Severity Icon Component
 */
function SeverityIcon({ severity }: { severity: 'critical' | 'warning' | 'info' }) {
  const config = {
    critical: { icon: AlertCircle, color: 'text-red-500' },
    warning: { icon: AlertTriangle, color: 'text-yellow-500' },
    info: { icon: Info, color: 'text-blue-500' },
  };

  const { icon: Icon, color } = config[severity];

  return (
    <div className="flex-shrink-0 mt-0.5">
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
  );
}

/**
 * Severity Badge Component
 */
function SeverityBadge({ severity, color }: { severity: string; color: string }) {
  return (
    <span
      className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium uppercase"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {severity}
    </span>
  );
}
