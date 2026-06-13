'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import type { TestHistoryProps, HistoricalTest } from '@/types/diagnostic';
import { getHealthScoreColor, formatTimestamp } from '@/types/diagnostic';

/**
 * TestHistory Component with Trend Chart
 * Requirements: 6.1 (Test persistence), 6.2 (Report completeness)
 */
export function TestHistory({ tests, onCompare }: TestHistoryProps) {
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());
  const [selectedTests, setSelectedTests] = useState<Set<number>>(new Set());

  const toggleExpand = (testId: number) => {
    setExpandedTests((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        newSet.add(testId);
      }
      return newSet;
    });
  };

  const toggleSelect = (testId: number) => {
    setSelectedTests((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(testId)) {
        newSet.delete(testId);
      } else {
        if (newSet.size >= 2) {
          // Only allow 2 selections
          newSet.clear();
        }
        newSet.add(testId);
      }
      return newSet;
    });
  };

  const handleCompare = () => {
    if (selectedTests.size === 2) {
      const [id1, id2] = Array.from(selectedTests);
      onCompare(id1, id2);
    }
  };

  if (tests.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Belum ada test history. Jalankan test pertama untuk mulai tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trend Chart */}
      {tests.length >= 3 ? (
        <TrendChart tests={tests} />
      ) : (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 text-center">
          <TrendingUp className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Trend chart akan muncul setelah 3 test selesai ({tests.length}/3)
          </p>
        </div>
      )}

      {/* Test History List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Test History ({tests.length})
          </h3>
          {selectedTests.size === 2 && (
            <button
              onClick={handleCompare}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Compare Selected
            </button>
          )}
        </div>

        <div className="space-y-2">
          {tests.map((test) => (
            <TestCard
              key={test.id}
              test={test}
              isExpanded={expandedTests.has(test.id)}
              isSelected={selectedTests.has(test.id)}
              onToggleExpand={() => toggleExpand(test.id)}
              onToggleSelect={() => toggleSelect(test.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TestCardProps {
  test: HistoricalTest;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}

function TestCard({ test, isExpanded, isSelected, onToggleExpand, onToggleSelect }: TestCardProps) {
  const scoreColor = getHealthScoreColor(test.overall_health_score);

  return (
    <div className={`border rounded-lg transition-colors ${
      isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'
    }`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="w-4 h-4 text-blue-600 rounded"
          />
          
          <button onClick={onToggleExpand} className="flex-1 flex items-center justify-between text-left">
            <div className="flex items-center gap-3 flex-1">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {formatTimestamp(test.timestamp)}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: `${scoreColor}20` }}>
                  <span className="text-lg font-bold" style={{ color: scoreColor }}>
                    {test.overall_health_score}
                  </span>
                </div>
              </div>
              {test.issues_count > 0 && (
                <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 rounded-full text-xs font-medium">
                  {test.issues_count} issues
                </span>
              )}
            </div>
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Object.entries(test.component_status).map(([component, status]) => (
              <div key={component} className="flex items-center gap-1.5 text-xs">
                {status === 'pass' ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="text-gray-700 dark:text-gray-300 capitalize">
                  {component.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
            <span>Admin: {test.admin_name}</span>
            <span>Type: {test.test_type}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendChart({ tests }: { tests: HistoricalTest[] }) {
  const maxScore = 100;
  const chartHeight = 120;
  const chartWidth = 100;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Health Score Trend</h3>
      <div className="relative" style={{ height: chartHeight + 40 }}>
        <svg width="100%" height={chartHeight + 40} className="overflow-visible">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((y) => (
            <g key={y}>
              <line
                x1="40"
                y1={chartHeight - (y / maxScore) * chartHeight + 20}
                x2={`${chartWidth}%`}
                y2={chartHeight - (y / maxScore) * chartHeight + 20}
                stroke="currentColor"
                strokeWidth="1"
                className="text-gray-200 dark:text-gray-700"
              />
              <text
                x="5"
                y={chartHeight - (y / maxScore) * chartHeight + 24}
                fontSize="10"
                className="fill-gray-500 dark:fill-gray-400"
              >
                {y}
              </text>
            </g>
          ))}

          {/* Line chart */}
          <polyline
            points={tests
              .slice()
              .reverse()
              .map((test, idx) => {
                const x = 40 + (idx / (tests.length - 1)) * (chartWidth - 45);
                const y = chartHeight - (test.overall_health_score / maxScore) * chartHeight + 20;
                return `${x},${y}`;
              })
              .join(' ')}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
          />

          {/* Data points */}
          {tests
            .slice()
            .reverse()
            .map((test, idx) => {
              const x = 40 + (idx / (tests.length - 1)) * (chartWidth - 45);
              const y = chartHeight - (test.overall_health_score / maxScore) * chartHeight + 20;
              return (
                <circle
                  key={test.id}
                  cx={x}
                  cy={y}
                  r="4"
                  fill={getHealthScoreColor(test.overall_health_score)}
                />
              );
            })}
        </svg>
      </div>
    </div>
  );
}
