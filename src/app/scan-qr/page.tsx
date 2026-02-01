'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import { Camera, QrCode, CheckCircle, AlertCircle, Loader2, CameraOff } from 'lucide-react';
import api from '@/services/api';

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

export default function ScanQRPage() {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [message, setMessage] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [shouldStartScanner, setShouldStartScanner] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [lastScannedToken, setLastScannedToken] = useState('');
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<unknown>(null);
  const isProcessingRef = useRef(false);
  const handleScanQRRef = useRef<(qrData: string) => void>(() => {});

  const handleScanQR = async (qrData: string) => {
    // Prevent duplicate scans using ref to avoid stale closure
    if (isProcessingRef.current) {
      return;
    }
    
    isProcessingRef.current = true;
    setLastScannedToken(qrData);
    
    try {
      setStatus('processing');
      
      // Submit attendance to API
      const response = await api.post('/attendance/submit', {
        qr_token: qrData,
      });

      if (response.data?.success) {
        setStatus('success');
        setMessage(response.data?.message || 'Absensi berhasil dicatat!');
        // Stop scanner on success
        stopCamera();
      } else {
        setStatus('error');
        setMessage(response.data?.message || 'QR Code tidak valid');
        isProcessingRef.current = false;
      }
    } catch (error: unknown) {
      console.error('Scan failed:', error);
      setStatus('error');
      const err = error as { response?: { data?: { message?: string } } };
      setMessage(err.response?.data?.message || 'Gagal memproses absensi');
      isProcessingRef.current = false;
    }
  };

  // Keep ref updated with latest handleScanQR
  useEffect(() => {
    handleScanQRRef.current = handleScanQR;
  });

  const stopCamera = async () => {
    try {
      if (html5QrCodeRef.current) {
        const scanner = html5QrCodeRef.current as { stop: () => Promise<void>; clear: () => void };
        await scanner.stop();
        scanner.clear();
        html5QrCodeRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping camera:', error);
    }
    setIsCameraActive(false);
    setShouldStartScanner(false);
  };

  const initializeScanner = async () => {
    try {
      // Dynamically import html5-qrcode (client-side only)
      const { Html5Qrcode } = await import('html5-qrcode');
      
      const scannerId = 'qr-scanner';
      
      // Make sure the scanner element exists
      const scannerElement = document.getElementById(scannerId);
      if (!scannerElement) {
        console.error('Scanner element not found');
        setStatus('error');
        setMessage('Gagal menginisialisasi scanner');
        return;
      }

      const html5QrCode = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = html5QrCode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
      };

      // Success callback
      const onScanSuccess = (decodedText: string) => {
        // QR Code scanned successfully - use ref to avoid stale closure
        console.log('QR Scanned:', decodedText);
        handleScanQRRef.current(decodedText);
      };

      // Error callback (ignore scan errors)
      const onScanError = () => {
        // Scan in progress, no QR detected yet (ignore errors)
      };

      // Try back camera first, then fall back to front camera
      try {
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          onScanSuccess,
          onScanError
        );
        console.log('Started with environment (back) camera');
      } catch (backCameraError) {
        console.warn('Back camera not available, trying front camera:', backCameraError);
        try {
          await html5QrCode.start(
            { facingMode: 'user' },
            config,
            onScanSuccess,
            onScanError
          );
          console.log('Started with user (front) camera');
        } catch (frontCameraError) {
          console.error('Both cameras failed:', frontCameraError);
          throw frontCameraError;
        }
      }

      setStatus('scanning');
    } catch (error) {
      console.error('Camera access failed:', error);
      setStatus('error');
      setMessage('Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan.');
      setIsCameraActive(false);
      setShouldStartScanner(false);
    }
  };

  // Effect to initialize scanner after element is rendered
  useEffect(() => {
    if (shouldStartScanner && isCameraActive) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        initializeScanner();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldStartScanner, isCameraActive]);

  const startCamera = () => {
    // First show the scanner element, then initialize
    setIsCameraActive(true);
    setShouldStartScanner(true);
  };

  // Manual token submit
  const handleManualSubmit = () => {
    if (!manualToken.trim()) {
      setStatus('error');
      setMessage('Masukkan QR token untuk submit absensi.');
      return;
    }
    handleScanQR(manualToken.trim());
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        const scanner = html5QrCodeRef.current as { stop: () => Promise<void>; clear: () => void };
        scanner.stop().catch(console.error);
      }
    };
  }, []);

  const resetStatus = () => {
    setStatus('idle');
    setMessage('');
    setLastScannedToken('');
    isProcessingRef.current = false;
  };

  return (
    <DashboardLayout>
      <div className="max-w-md mx-auto space-y-6">
        <Card>
          <CardHeader
            title="Scan QR Absensi"
            subtitle="Arahkan kamera ke QR Code yang ditampilkan guru"
          />

          {/* Camera/Scanner View */}
          <div className="relative aspect-square bg-gray-900 rounded-xl overflow-hidden mb-4">
            {isCameraActive ? (
              <>
                {/* QR Scanner will render here */}
                <div 
                  id="qr-scanner" 
                  ref={scannerRef}
                  className="w-full h-full"
                />
                <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm bg-black/50 py-2">
                  📷 Arahkan kamera ke QR Code
                </p>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <QrCode className="w-16 h-16 mb-4" />
                <p className="text-sm">Kamera tidak aktif</p>
                <p className="text-xs mt-2">Klik tombol di bawah untuk mulai scan</p>
              </div>
            )}

            {status === 'processing' && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                <div className="text-center text-white">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-2" />
                  <p className="font-medium">Memproses absensi...</p>
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
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">Gagal</p>
                <p className="text-sm text-red-600">{message}</p>
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
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">atau</span>
                  </div>
                </div>
                
                {/* Manual Token Input */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Input Token Manual
                  </label>
                  <input
                    type="text"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Masukkan token dari QR..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    disabled={status === 'processing'}
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
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                1
              </span>
              <span>Pastikan Anda berada di dalam ruangan kelas</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                2
              </span>
              <span>Klik <strong>&quot;Mulai Scan QR Code&quot;</strong> untuk mengaktifkan kamera</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                3
              </span>
              <span>Arahkan kamera ke QR Code yang ditampilkan guru</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-5 h-5 bg-teal-100 text-teal-600 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
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
