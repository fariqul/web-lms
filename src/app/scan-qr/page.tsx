'use client';
/* eslint-disable react-compiler/react-compiler */
// ^ Opt out of React Compiler — html5-qrcode does imperative DOM manipulation
// that conflicts with the compiler's auto-memoization.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import { Camera, QrCode, CheckCircle, AlertCircle, Loader2, CameraOff } from 'lucide-react';
import api from '@/services/api';

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

// Type the html5-qrcode scanner instance
interface Html5QrCodeInstance {
  start: (
    cameraIdOrConfig: { facingMode: string } | string,
    config: { fps: number; qrbox: { width: number; height: number }; aspectRatio?: number },
    onSuccess: (decodedText: string) => void,
    onError: () => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
  getState: () => number;
}

export default function ScanQRPage() {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [lastScannedToken, setLastScannedToken] = useState('');
  const scannerContainerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<Html5QrCodeInstance | null>(null);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isInitializingRef = useRef(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Generate device fingerprint
  const getDeviceId = useCallback(() => {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
      ];
      deviceId = btoa(components.join('|')).slice(0, 32);
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }, []);

  // Safely stop and clean up scanner
  const destroyScanner = useCallback(async () => {
    const scanner = html5QrCodeRef.current;
    if (!scanner) return;

    try {
      // html5-qrcode states: NOT_STARTED=1, SCANNING=2, PAUSED=3
      const state = scanner.getState();
      if (state === 2 || state === 3) {
        await scanner.stop();
      }
      scanner.clear();
    } catch (err) {
      // Scanner might already be stopped, ignore
      console.warn('Scanner cleanup:', err);
    } finally {
      html5QrCodeRef.current = null;
    }
  }, []);

  const handleScanQR = useCallback(async (qrData: string) => {
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    setLastScannedToken(qrData);
    setPendingApproval(false);

    try {
      setStatus('processing');

      const response = await api.post('/attendance/submit', {
        qr_token: qrData,
        device_id: getDeviceId(),
      });

      if (!isMountedRef.current) return;

      if (response.data?.success) {
        setStatus('success');
        setMessage(response.data?.message || 'Absensi berhasil dicatat!');
        // Stop scanner on success
        await destroyScanner();
        setIsCameraActive(false);
      } else {
        setStatus('error');
        setMessage(response.data?.message || 'QR Code tidak valid');
        isProcessingRef.current = false;
      }
    } catch (error: unknown) {
      if (!isMountedRef.current) return;
      console.error('Scan failed:', error);
      setStatus('error');
      const err = error as { response?: { data?: { message?: string; error_code?: string } } };
      const errorCode = err.response?.data?.error_code;

      if (errorCode === 'NETWORK_NOT_ALLOWED') {
        setMessage('⚠️ ' + (err.response?.data?.message || 'Harus menggunakan WiFi sekolah'));
      } else if (errorCode === 'DEVICE_SWITCH_PENDING') {
        setPendingApproval(true);
        setMessage('⏳ ' + (err.response?.data?.message || 'Menunggu persetujuan guru'));
      } else if (errorCode === 'DEVICE_SWITCH_REJECTED') {
        setMessage('❌ ' + (err.response?.data?.message || 'Permintaan ditolak'));
      } else {
        setMessage(err.response?.data?.message || 'Gagal memproses absensi');
      }
      isProcessingRef.current = false;
    }
  }, [getDeviceId, destroyScanner]);

  // Keep ref for the scanner callback (avoids stale closure in html5-qrcode)
  const handleScanQRRef = useRef(handleScanQR);
  useEffect(() => {
    handleScanQRRef.current = handleScanQR;
  }, [handleScanQR]);

  const initializeScanner = useCallback(async () => {
    // Prevent concurrent initialization
    if (isInitializingRef.current) return;
    isInitializingRef.current = true;

    try {
      // Always clean up any previous instance first
      await destroyScanner();

      // Dynamically import html5-qrcode (client-side only)
      const { Html5Qrcode } = await import('html5-qrcode');

      if (!isMountedRef.current) return;

      const scannerId = 'qr-scanner';
      const scannerElement = document.getElementById(scannerId);
      if (!scannerElement) {
        console.error('Scanner element not found');
        setStatus('error');
        setMessage('Gagal menginisialisasi scanner');
        setIsCameraActive(false);
        return;
      }

      // Clear any leftover DOM from previous scanner
      scannerElement.innerHTML = '';

      const html5QrCode = new Html5Qrcode(scannerId) as unknown as Html5QrCodeInstance;
      html5QrCodeRef.current = html5QrCode;

      // Calculate responsive qrbox based on container width
      const containerWidth = scannerElement.clientWidth || 300;
      const qrboxSize = Math.min(Math.floor(containerWidth * 0.7), 250);

      const config = {
        fps: 5, // Lower FPS for better mobile compatibility
        qrbox: { width: qrboxSize, height: qrboxSize },
      };

      const onScanSuccess = (decodedText: string) => {
        handleScanQRRef.current(decodedText);
      };

      const onScanError = () => {
        // No QR detected yet — expected, ignore
      };

      // Try back camera first (most common for QR scanning)
      let started = false;
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          onScanError,
        );
        started = true;
      } catch (backErr) {
        console.warn('Back camera unavailable, trying front:', backErr);
      }

      if (!started) {
        try {
          await html5QrCode.start(
            { facingMode: 'user' },
            config,
            onScanSuccess,
            onScanError,
          );
          started = true;
        } catch (frontErr) {
          console.error('Both cameras failed:', frontErr);
          throw frontErr;
        }
      }

      if (!isMountedRef.current) {
        // Component unmounted during async init — clean up
        await destroyScanner();
        return;
      }

      setStatus('scanning');
    } catch (error) {
      console.error('Camera access failed:', error);
      if (isMountedRef.current) {
        setStatus('error');
        setMessage('Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.');
        setIsCameraActive(false);
      }
    } finally {
      isInitializingRef.current = false;
    }
  }, [destroyScanner]);

  // Start scanner after the DOM element is rendered
  useEffect(() => {
    if (!isCameraActive) return;

    // Wait for next frame to ensure the #qr-scanner element is in the DOM
    let cancelled = false;
    const frameId = requestAnimationFrame(() => {
      if (!cancelled) {
        // Extra delay for slow devices
        const timer = setTimeout(() => {
          if (!cancelled) initializeScanner();
        }, 200);
        // Store timer for cleanup
        (frameId as unknown as { _timer?: NodeJS.Timeout })._timer = timer;
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [isCameraActive, initializeScanner]);

  const startCamera = useCallback(() => {
    setStatus('idle');
    setMessage('');
    isProcessingRef.current = false;
    setIsCameraActive(true);
  }, []);

  const stopCamera = useCallback(async () => {
    await destroyScanner();
    setIsCameraActive(false);
  }, [destroyScanner]);

  // Manual token submit
  const handleManualSubmit = useCallback(() => {
    if (!manualToken.trim()) {
      setStatus('error');
      setMessage('Masukkan QR token untuk submit absensi.');
      return;
    }
    handleScanQR(manualToken.trim());
  }, [manualToken, handleScanQR]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const scanner = html5QrCodeRef.current;
      if (scanner) {
        try {
          const state = scanner.getState();
          if (state === 2 || state === 3) {
            scanner.stop().catch(() => {});
          }
          scanner.clear();
        } catch {
          // ignore
        }
        html5QrCodeRef.current = null;
      }
    };
  }, []);

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setMessage('');
    setLastScannedToken('');
    isProcessingRef.current = false;
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-md mx-auto space-y-6">
        <Card>
          <CardHeader
            title="Scan QR Absensi"
            subtitle="Arahkan kamera ke QR Code yang ditampilkan guru"
          />

          {/* Camera/Scanner View */}
          <div className="relative aspect-square bg-slate-900 rounded-xl mb-4">
            {isCameraActive ? (
              <>
                {/* QR Scanner will render here — html5-qrcode manages its own DOM */}
                <div 
                  id="qr-scanner" 
                  ref={scannerContainerRef}
                  className="w-full h-full rounded-xl overflow-hidden"
                  style={{ minHeight: '280px' }}
                />
                <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm bg-black/50 py-2">
                  📷 Arahkan kamera ke QR Code
                </p>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 dark:text-slate-400">
                <QrCode className="w-16 h-16 mb-4" />
                <p className="text-sm">Kamera tidak aktif</p>
                <p className="text-xs mt-2">Klik tombol di bawah untuk mulai scan</p>
              </div>
            )}

            {status === 'processing' && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                <div className="text-center text-white">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
                  <p className="font-medium">Memproses absensi…</p>
                </div>
              </div>
            )}
          </div>

          {/* Status Messages */}
          {status === 'success' && (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
              <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Absensi Berhasil! ✓</p>
                <p className="text-sm text-green-600">{message}</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${
              pendingApproval 
                ? 'bg-yellow-50 border border-yellow-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <AlertCircle className={`w-6 h-6 flex-shrink-0 ${
                pendingApproval ? 'text-yellow-600' : 'text-red-600'
              }`} />
              <div>
                <p className={`font-medium ${pendingApproval ? 'text-yellow-800' : 'text-red-800'}`}>
                  {pendingApproval ? 'Menunggu Persetujuan' : 'Gagal'}
                </p>
                <p className={`text-sm ${pendingApproval ? 'text-yellow-600' : 'text-red-600'}`}>
                  {message}
                </p>
                {pendingApproval && (
                  <p className="text-xs text-yellow-600 mt-2">
                    Silakan hubungi guru untuk mendapatkan persetujuan. Coba scan ulang setelah disetujui.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {!isCameraActive ? (
              <>
                <Button
                  onClick={startCamera}
                  fullWidth
                  leftIcon={<Camera className="w-5 h-5" />}
                  disabled={status === 'processing'}
                >
                  🔍 Mulai Scan QR Code
                </Button>

                {/* Divider */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400">atau</span>
                  </div>
                </div>
                
                {/* Manual Token Input */}
                <div className="space-y-2">
                  <label htmlFor="manualToken" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Input Token Manual
                  </label>
                  <input
                    id="manualToken"
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Masukkan token dari QR…"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={status === 'processing'}
                    name="manualToken"
                    autoComplete="off"
                  />
                  <Button
                    onClick={handleManualSubmit}
                    fullWidth
                    variant="outline"
                    leftIcon={<QrCode className="w-5 h-5" />}
                    disabled={status === 'processing' || !manualToken.trim()}
                  >
                    Submit Token
                  </Button>
                </div>
              </>
            ) : (
              <Button 
                onClick={stopCamera} 
                fullWidth 
                variant="outline"
                leftIcon={<CameraOff className="w-5 h-5" />}
              >
                Matikan Kamera
              </Button>
            )}

            {(status === 'success' || status === 'error') && (
              <Button
                onClick={() => {
                  resetStatus();
                  if (status === 'error') {
                    startCamera();
                  }
                }}
                fullWidth
                variant={status === 'success' ? 'outline' : 'primary'}
              >
                {status === 'success' ? 'Scan Lagi' : 'Coba Lagi'}
              </Button>
            )}
          </div>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader title="Petunjuk" />
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                1
              </span>
              <span>Pastikan Anda berada di dalam ruangan kelas</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                2
              </span>
              <span>Klik <strong>&quot;Mulai Scan QR Code&quot;</strong> untuk mengaktifkan kamera</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                3
              </span>
              <span>Arahkan kamera ke QR Code yang ditampilkan guru</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                4
              </span>
              <span>QR Code akan otomatis ter-scan dan absensi langsung tercatat</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                !
              </span>
              <span className="text-red-600">Jangan bagikan QR Code ke teman (anti titip absen)</span>
            </li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
}
