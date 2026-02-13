'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import { Camera, QrCode, CheckCircle, AlertCircle, Loader2, CameraOff, SwitchCamera } from 'lucide-react';
import api from '@/services/api';

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

export default function ScanQRPage() {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [pendingApproval, setPendingApproval] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const isProcessingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Track mounted state
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

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Handle QR scan result
  const handleScanQR = useCallback(async (qrData: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
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
        stopCamera();
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
  }, [getDeviceId, stopCamera]);

  // Ref to latest handleScanQR to avoid stale closures in the scan loop
  const handleScanQRRef = useRef(handleScanQR);
  useEffect(() => {
    handleScanQRRef.current = handleScanQR;
  }, [handleScanQR]);

  // QR scanning loop using jsQR + canvas
  const startScanLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let jsQRModule: typeof import('jsqr').default | null = null;

    // Pre-load jsQR module once
    import('jsqr').then((mod) => {
      jsQRModule = mod.default;
    });

    const scan = () => {
      if (!isMountedRef.current || !streamRef.current) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA && jsQRModule) {
        // Size canvas to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw current video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data for QR detection
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const code = jsQRModule(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data && !isProcessingRef.current) {
          // Found a QR code — submit it
          handleScanQRRef.current(code.data);
        }
      }

      // Continue scanning
      animationRef.current = requestAnimationFrame(scan);
    };

    // Start the loop
    animationRef.current = requestAnimationFrame(scan);
  }, []);

  // Start camera and scanning
  const startCamera = useCallback(async () => {
    setStatus('idle');
    setMessage('');
    isProcessingRef.current = false;

    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Wait for video to be ready, then start scanning
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            if (isMountedRef.current) {
              setIsCameraActive(true);
              setStatus('scanning');
              startScanLoop();
            }
          }).catch((err) => {
            console.error('Video play failed:', err);
          });
        };
      }
    } catch (error) {
      console.error('Camera access failed:', error);
      if (isMountedRef.current) {
        setStatus('error');
        setMessage('Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.');
      }
    }
  }, [facingMode, startScanLoop]);

  // Switch camera facing
  const switchCamera = useCallback(() => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  }, [stopCamera]);

  // Restart camera when facing mode changes
  const facingModeChangedRef = useRef(false);
  useEffect(() => {
    if (facingModeChangedRef.current) {
      facingModeChangedRef.current = false;
      startCamera();
    }
  }, [facingMode, startCamera]);

  // Update switchCamera to flag the restart
  const handleSwitchCamera = useCallback(() => {
    facingModeChangedRef.current = true;
    switchCamera();
  }, [switchCamera]);

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
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const resetStatus = useCallback(() => {
    setStatus('idle');
    setMessage('');
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
          <div className="relative aspect-square bg-slate-900 rounded-xl overflow-hidden mb-4">
            {isCameraActive || status === 'scanning' ? (
              <>
                {/* Native video element — full control, no library DOM manipulation */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                {/* Hidden canvas for QR frame extraction */}
                <canvas ref={canvasRef} className="hidden" />

                {/* Scan overlay - viewfinder */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Corner markers */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
                  </div>
                </div>

                {/* Camera switch button */}
                <button
                  onClick={handleSwitchCamera}
                  className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors z-10"
                  title="Ganti kamera"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>

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
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg mb-4 dark:bg-green-900/20 dark:border-green-800">
              <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800 dark:text-green-400">Absensi Berhasil! ✓</p>
                <p className="text-sm text-green-600 dark:text-green-500">{message}</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${
              pendingApproval
                ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                : 'bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800'
            }`}>
              <AlertCircle className={`w-6 h-6 flex-shrink-0 ${
                pendingApproval ? 'text-yellow-600' : 'text-red-600'
              }`} />
              <div>
                <p className={`font-medium ${pendingApproval ? 'text-yellow-800 dark:text-yellow-400' : 'text-red-800 dark:text-red-400'}`}>
                  {pendingApproval ? 'Menunggu Persetujuan' : 'Gagal'}
                </p>
                <p className={`text-sm ${pendingApproval ? 'text-yellow-600 dark:text-yellow-500' : 'text-red-600 dark:text-red-500'}`}>
                  {message}
                </p>
                {pendingApproval && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-2">
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
                  Mulai Scan QR Code
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
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-white"
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
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 dark:bg-sky-900/30">
                1
              </span>
              <span>Pastikan Anda berada di dalam ruangan kelas</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 dark:bg-sky-900/30">
                2
              </span>
              <span>Klik <strong>&quot;Mulai Scan QR Code&quot;</strong> untuk mengaktifkan kamera</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 dark:bg-sky-900/30">
                3
              </span>
              <span>Arahkan kamera ke QR Code yang ditampilkan guru</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-sky-100 text-sky-500 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 dark:bg-sky-900/30">
                4
              </span>
              <span>QR Code akan otomatis ter-scan dan absensi langsung tercatat</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5 dark:bg-red-900/30">
                !
              </span>
              <span className="text-red-600 dark:text-red-400">Jangan bagikan QR Code ke teman (anti titip absen)</span>
            </li>
          </ul>
        </Card>
      </div>
    </DashboardLayout>
  );
}
