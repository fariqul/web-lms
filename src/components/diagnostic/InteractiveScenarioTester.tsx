'use client';

import React, { useState } from 'react';
import { Play, Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { ScenarioTesterProps, TestScenario, ScenarioResult } from '@/types/diagnostic';
import { SCENARIO_CONFIGS } from '@/types/diagnostic';

export function InteractiveScenarioTester({ onRunScenario, onRunAllScenarios }: ScenarioTesterProps) {
  const [running, setRunning] = useState(false);
  const [currentScenario, setCurrentScenario] = useState<TestScenario | null>(null);
  const [results, setResults] = useState<Map<TestScenario, ScenarioResult>>(new Map());
  const [countdown, setCountdown] = useState<number | null>(null);

  const runScenario = async (scenario: TestScenario) => {
    setCurrentScenario(scenario);
    setRunning(true);

    // Countdown
    const config = SCENARIO_CONFIGS[scenario];
    for (let i = config.countdown; i > 0; i--) {
      setCountdown(i);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(null);

    try {
      const result = await onRunScenario(scenario);
      setResults((prev) => new Map(prev).set(scenario, result));
    } catch (error) {
      console.error('Scenario failed:', error);
    } finally {
      setRunning(false);
      setCurrentScenario(null);
    }
  };

  const runAllScenarios = async () => {
    setResults(new Map());
    for (const scenario of Object.keys(SCENARIO_CONFIGS) as TestScenario[]) {
      await runScenario(scenario);
      if (scenario !== 'identity_mismatch') {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Interactive Scenario Testing</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {(Object.entries(SCENARIO_CONFIGS) as [TestScenario, typeof SCENARIO_CONFIGS[TestScenario]][]).map(
            ([id, config]) => {
              const result = results.get(id);
              return (
                <button
                  key={id}
                  onClick={() => runScenario(id)}
                  disabled={running}
                  className="p-4 border-2 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-blue-500 dark:border-gray-700"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl">{config.icon}</span>
                    {result && (
                      result.verdict === 'pass' ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )
                    )}
                  </div>
                  <div className="mt-2 font-medium text-sm text-gray-900 dark:text-white">{config.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{config.instructions.substring(0, 50)}...</div>
                </button>
              );
            }
          )}
        </div>

        <button
          onClick={runAllScenarios}
          disabled={running}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {running ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
          Run All Scenarios
        </button>
      </div>

      {/* Countdown Modal */}
      {countdown !== null && currentScenario && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 text-center max-w-md">
            <div className="text-6xl mb-4">{SCENARIO_CONFIGS[currentScenario].icon}</div>
            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {SCENARIO_CONFIGS[currentScenario].name}
            </h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {SCENARIO_CONFIGS[currentScenario].instructions}
            </p>
            <div className="text-5xl font-bold text-blue-600">{countdown}</div>
          </div>
        </div>
      )}

      {/* Results Summary */}
      {results.size > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Test Results</h4>
          <div className="space-y-3">
            {Array.from(results.entries()).map(([scenario, result]) => (
              <div key={scenario} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span>{SCENARIO_CONFIGS[scenario].icon}</span>
                    <span className="font-medium text-sm">{SCENARIO_CONFIGS[scenario].name}</span>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    result.verdict === 'pass' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {result.verdict.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{result.explanation}</p>
                {result.requirements_met.length > 0 && (
                  <div className="mt-2 text-xs text-green-600">✓ {result.requirements_met.join(', ')}</div>
                )}
                {result.requirements_failed.length > 0 && (
                  <div className="mt-2 text-xs text-red-600">✗ {result.requirements_failed.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
          
          {results.size === Object.keys(SCENARIO_CONFIGS).length && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm font-medium text-blue-900 dark:text-blue-300">
                Overall Score: {Array.from(results.values()).filter((r) => r.verdict === 'pass').length}/{results.size} ({Math.round((Array.from(results.values()).filter((r) => r.verdict === 'pass').length / results.size) * 100)}%)
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
