'use client';

import React, { useState, useCallback, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { CameraPreview } from '@/components/diagnostic/CameraPreview';
import { AnalysisResults } from '@/components/diagnostic/AnalysisResults';
import { DetectionOverlay } from '@/components/diagnostic/DetectionOverlay';
import { TroubleshootingSuggestions } from '@/components/diagnostic/TroubleshootingSuggestions';
import { TestHistory } from '@/components/diagnostic/TestHistory';
import { LiveHealthMonitor } from '@/components/diagnostic/LiveHealthMonitor';
import { InteractiveScenarioTester } from '@/components/diagnostic/InteractiveScenarioTester';
import type {
  DiagnosticPageState,
  AnalysisResult,
  HistoricalTest,
  TestScenario,
  ScenarioResult,
  ApiResponse,
  AnalyzeRequest,
  CompareTestsResponse,
} from '@/types/diagnostic';
import { AlertCircle, Activity, Loader2 } from 'lucide-react';

/**
 * DiagnosticPage Component
 * 
 * Main page component for the Proctoring Diagnostic Tool
 * Admin-only interface for testing and validating proctoring AI components
 * 
 * Requirements: 1.1 (Admin-only access), 1.2 (System status check), 2.1 (Camera initialization),
 *               3.1 (Complete analysis execution), 5.1 (Issue detection logic), 6.1 (Test persistence),
 *               7.1 (Health check frequency), 8.1 (Scenario validation)
 */
export default function DiagnosticPage() {
  const [pageState, setPageState] = useState<DiagnosticPageState>({
    testStatus: 'idle',
    currentTest: null,
    testHistory: [],
    healthStatus: null,
  });

  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [showLandmarks, setShowLandmarks] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Load test history on mount
   */
  useEffect(() => {
    loadTestHistory();
  }, []);

  /**
   * Load test history from backend
   * Requirement: 6.1 (Test persistence)
   */
  const loadTestHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('/api/proctoring-diagnostic/tests', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load test history');
      }

      const data: ApiResponse<HistoricalTest[]> = await response.json();
      
      if (data.success && data.data) {
        setPageState((prev) => ({ ...prev, testHistory: data.data! }));
      }
    } catch (error) {
      console.error('Error loading test history:', error);
    }
  }, []);

  /**
   * Handle camera frame capture and analysis
   * Requirements: 2.2 (Frame capture quality), 3.1 (Complete analysis execution)
   */
  const handleCapture = useCallback(async (imageBlob: Blob) => {
    setPageState((prev) => ({ ...prev, testStatus: 'analyzing' }));
    setErrorMessage(null);

    try {
      // Convert blob to base64
      const base64Image = await blobToBase64(imageBlob);
      
      // Create object URL for image display
      const imageUrl = URL.createObjectURL(imageBlob);
      setCapturedImageUrl(imageUrl);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Send to backend for analysis
      const requestBody: AnalyzeRequest = {
        image: base64Image,
        test_type: 'manual',
      };

      const response = await fetch('/api/proctoring-diagnostic/analyze', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Analysis failed');
      }

      const data: ApiResponse<AnalysisResult> = await response.json();

      if (data.success && data.data) {
        setPageState((prev) => ({
          ...prev,
          testStatus: 'complete',
          currentTest: data.data!,
        }));

        // Reload test history to include new test
        await loadTestHistory();
      } else {
        throw new Error(data.message || 'Analysis failed');
      }
    } catch (error) {
      const err = error as Error;
      console.error('Error during analysis:', err);
      setErrorMessage(err.message || 'Failed to analyze image');
      setPageState((prev) => ({ ...prev, testStatus: 'error' }));
    }
  }, [loadTestHistory]);

  /**
   * Handle camera permission denied
   */
  const handlePermissionDenied = useCallback(() => {
    setErrorMessage('Camera permission denied. Please enable camera access in your browser settings.');
  }, []);

  /**
   * Handle camera error
   */
  const handleCameraError = useCallback((error: string) => {
    setErrorMessage(`Camera error: ${error}`);
  }, []);

  /**
   * Handle report download
   * Requirement: 6.2 (Report completeness)
   */
  const handleDownloadReport = useCallback(async (testId: number) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`/api/proctoring-diagnostic/tests/${testId}/report`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to download report');
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="?(.+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `diagnostic-test-${testId}.json`;

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      const err = error as Error;
      console.error('Error downloading report:', err);
      setErrorMessage(`Failed to download report: ${err.message}`);
    }
  }, []);

  /**
   * Handle test comparison
   * Requirement: 6.1 (Test persistence)
   */
  const handleCompareTests = useCallback(async (testId1: number, testId2: number) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(
        `/api/proctoring-diagnostic/tests/compare?ids=${testId1},${testId2}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to compare tests');
      }

      const data: ApiResponse<CompareTestsResponse> = await response.json();

      if (data.success && data.data) {
        // Display comparison in a modal or alert
        // For now, show in console and alert
        console.log('Test Comparison:', data.data);
        const comparison = data.data.comparison;
        const message = `
Test Comparison:
Overall Score Difference: ${comparison.overall_score_difference > 0 ? '+' : ''}${comparison.overall_score_difference}

Improvements: ${comparison.improvements.length}
${comparison.improvements.map(i => `- ${i.component}: +${i.improvement}`).join('\n')}

Regressions: ${comparison.regressions.length}
${comparison.regressions.map(r => `- ${r.component}: ${r.regression}`).join('\n')}
        `.trim();
        alert(message);
      }
    } catch (error) {
      const err = error as Error;
      console.error('Error comparing tests:', err);
      setErrorMessage(`Failed to compare tests: ${err.message}`);
    }
  }, []);

  /**
   * Handle scenario testing
   * Requirement: 8.1 (Scenario validation)
   */
  const handleRunScenario = useCallback(
    async (scenario: TestScenario): Promise<ScenarioResult> => {
      // This will be called by InteractiveScenarioTester after it captures an image
      // We need to return a placeholder that tells the tester to capture first
      throw new Error('Scenario testing requires image capture from InteractiveScenarioTester');
    },
    []
  );

  /**
   * Handle "Run All Scenarios"
   * Requirement: 8.2 (Comprehensive test coverage)
   */
  const handleRunAllScenarios = useCallback(async () => {
    // This will be handled by InteractiveScenarioTester component
    console.log('Run all scenarios triggered');
  }, []);

  /**
   * Convert Blob to base64 string
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-[1920px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Proctoring Diagnostic Tool
            </h1>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Real-time testing and validation of proctoring AI components
          </p>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{errorMessage}</p>
              </div>
              <button
                onClick={() => setErrorMessage(null)}
                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Live Health Monitor */}
        <div className="mb-8">
          <LiveHealthMonitor autoRefresh={true} refreshInterval={10000} />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          {/* Left Column: Camera Preview */}
          <div className="xl:col-span-1">
            <CameraPreview
              onCapture={handleCapture}
              onPermissionDenied={handlePermissionDenied}
              onError={handleCameraError}
            />
          </div>

          {/* Middle Column: Analysis Results & Detection Overlay */}
          <div className="xl:col-span-1 space-y-6">
            {pageState.testStatus === 'analyzing' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">Analyzing image...</p>
              </div>
            )}

            {pageState.currentTest && capturedImageUrl && (
              <>
                <DetectionOverlay
                  imageUrl={capturedImageUrl}
                  detections={{
                    objects: pageState.currentTest.detected_objects,
                    faces: pageState.currentTest.detected_faces,
                  }}
                  showLandmarks={showLandmarks}
                  onToggleLandmarks={() => setShowLandmarks(!showLandmarks)}
                />
                <AnalysisResults
                  result={pageState.currentTest}
                  onDownloadReport={handleDownloadReport}
                />
              </>
            )}

            {pageState.testStatus === 'idle' && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-12 text-center">
                <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">
                  Start camera and capture a frame to begin analysis
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Troubleshooting Suggestions */}
          <div className="xl:col-span-1">
            {pageState.currentTest ? (
              <TroubleshootingSuggestions
                suggestions={pageState.currentTest.troubleshooting}
              />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Troubleshooting Suggestions
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  Troubleshooting suggestions will appear here after analysis
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Scenario Tester */}
        <div className="mb-8">
          <InteractiveScenarioTester
            onRunScenario={handleRunScenario}
            onRunAllScenarios={handleRunAllScenarios}
          />
        </div>

        {/* Test History */}
        <div>
          <TestHistory tests={pageState.testHistory} onCompare={handleCompareTests} />
        </div>
      </div>
    </DashboardLayout>
  );
}