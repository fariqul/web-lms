'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { staffAttendanceAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import {
  ClipboardCheck,
  Camera,
  CameraOff,
  SwitchCamera,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  CalendarDays,
  QrCode,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodayStatus {
  has_checked_in: boolean;
  checked_in_at: string | null;
  location_method: 'gps' | 'manual' | 'barcode' | null;
}

interface HistoryItem {
  date: string;
  checked_in_at: string | null;
  location_method: 'gps' | 'manual' | 'barcode' | null;
}

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Request GPS with 8-second timeout. Returns null if unavailable. */
const getLocation = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

const getDeviceId = (): string => {
  let id = localStorage.getItem('device_id');
  if (!id) {
    const parts = [navigator.userAgent, navigator.language, `${screen.width}x${screen.height}`, String(new Date().getTimezoneOffset())];
    id = btoa(parts.join('|')).slice(0, 32);
    localStorage.setItem('device_id', id);
  }
  return id;
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const methodLabel = (method: string | null): string => {
  if (method === 'barcode') return 'Barcode';
  if (method === 'gps')     return 'GPS';
  return 'Manual';
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AbsenMasukPage() {
  const toast = useToast();

  const [todayStatus, setTodayStatus] = useState<TodayStatus | null>(null);
  const [history, setHistory]         = useState<HistoryItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [scanStatus, setScanStatus]   = useState<ScanStatus>('idle');
  const [errorMsg, setErrorMsg]       = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode]   = useState<'environment' | 'user'>('environment');

  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const animationRef  = useRef<number>(0);
  const isProcessing  = useRef(false);
  const isMounted     = useRef(true);

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Load today status + history ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [statusRes, histRes] = await Promise.all([
        staffAttendanceAPI.todayStatus(),
        staffAttendanceAPI.myHistory(),
      ]);
      setTodayStatus(statusRes.data.data);
      setHistory((histRes.data.data as HistoryItem[]).slice(0, 7));
    } catch {
      toast.error('Gagal memuat data absensi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    isMounted.current = true;
    void loadData();
    return () => { isMounted.current = false; stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Camera ────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraActive(false);
    setScanStatus('idle');
  }, []);

  const handleScanResult = useCallback(async (qrData: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setScanStatus('processing');
    stopCamera();

    try {
      // Request GPS dulu sebelum submit barcode
      const coords = await getLocation();
      if (!coords) {
        setScanStatus('error');
        setErrorMsg('GPS diperlukan. Aktifkan izin lokasi di browser/perangkat Anda lalu scan ulang.');
        isProcessing.current = false;
        return;
      }

      const res = await staffAttendanceAPI.barcodeCheckIn({
        barcode_token: qrData,
        latitude:  coords.lat,
        longitude: coords.lng,
        device_id: getDeviceId(),
      });

      if (!isMounted.current) return;

      if (res.data.success) {
        setScanStatus('success');
        setTodayStatus({
          has_checked_in: true,
          checked_in_at:  res.data.data?.checked_in_at ?? null,
          location_method: 'barcode',
        });
        toast.success('Absen masuk berhasil dicatat!');
        void loadData();
      }
    } catch (err: unknown) {
      if (!isMounted.current) return;
      const e = err as { response?: { data?: { message?: string; error_code?: string } } };
      const code = e.response?.data?.error_code;
      const msg  = e.response?.data?.message ?? 'Gagal memproses absensi';

      setScanStatus('error');
      if (code === 'ALREADY_CHECKED_IN') {
        setErrorMsg(msg);
      } else if (code === 'BARCODE_INVALID') {
        setErrorMsg('Barcode tidak valid atau sudah diganti admin. Pastikan scan barcode terbaru.');
      } else if (code === 'BARCODE_NOT_CONFIGURED') {
        setErrorMsg('Barcode absen belum dibuat. Hubungi admin.');
      } else if (code === 'GPS_REQUIRED') {
        setErrorMsg('GPS diperlukan. Aktifkan izin lokasi di browser/perangkat Anda lalu scan ulang.');
      } else if (code === 'LOCATION_INVALID') {
        setErrorMsg(msg);
      } else {
        setErrorMsg(msg);
      }
      toast.error(msg);
      isProcessing.current = false;
    }
  }, [stopCamera, loadData, toast]);

  const startScanLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let jsQRModule: typeof import('jsqr').default | null = null;
    import('jsqr').then(m => { jsQRModule = m.default; });

    const scan = () => {
      if (!isMounted.current || !streamRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && jsQRModule) {
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQRModule(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code) {
          void handleScanResult(code.data);
          return;
        }
      }
      animationRef.current = requestAnimationFrame(scan);
    };

    animationRef.current = requestAnimationFrame(scan);
  }, [handleScanResult]);

  const startCamera = useCallback(async () => {
    try {
      setScanStatus('scanning');
      setErrorMsg(null);
      isProcessing.current = false;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      if (!isMounted.current) { stream.getTracks().forEach(t => t.stop()); return; }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsCameraActive(true);
          startScanLoop();
        };
      }
    } catch {
      setScanStatus('error');
      setErrorMsg('Tidak dapat mengakses kamera. Pastikan izin kamera sudah diberikan.');
    }
  }, [facingMode, startScanLoop]);

  const switchCamera = () => {
    stopCamera();
    setFacingMode(m => m === 'environment' ? 'user' : 'environment');
  };

  // Restart camera when facingMode changes
  useEffect(() => {
    if (isCameraActive) void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-5 px-1">

        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-teal-500" />
            Absen Masuk
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" />
            {today}
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          </div>
        )}

        {/* Already checked in */}
        {!loading && todayStatus?.has_checked_in && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Sudah Absen Masuk</p>
                <p className="text-sm text-slate-500">Kehadiran hari ini sudah tercatat.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5" /> Jam Masuk</p>
                <p className="text-xl font-bold text-slate-800 dark:text-white tabular-nums">{formatTime(todayStatus.checked_in_at)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 flex items-center gap-1 mb-1"><QrCode className="w-3.5 h-3.5" /> Metode</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">{methodLabel(todayStatus.location_method)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Not yet — scan UI */}
        {!loading && !todayStatus?.has_checked_in && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

            {/* Camera viewport */}
            <div className="relative bg-black aspect-square max-h-72 w-full flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Scan frame overlay */}
              {isCameraActive && scanStatus === 'scanning' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-teal-400 rounded-xl opacity-80" />
                </div>
              )}

              {/* Camera off state */}
              {!isCameraActive && scanStatus !== 'processing' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 bg-slate-900/80">
                  <QrCode className="w-12 h-12 opacity-50" />
                  <p className="text-sm opacity-70">Kamera belum aktif</p>
                </div>
              )}

              {/* Processing overlay */}
              {scanStatus === 'processing' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white gap-2">
                  <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
                  <p className="text-sm">Memproses…</p>
                </div>
              )}

              {/* Switch camera button */}
              {isCameraActive && (
                <button
                  onClick={switchCamera}
                  className="absolute top-2 right-2 p-2 bg-black/40 rounded-full text-white hover:bg-black/60 transition-colors"
                  title="Ganti kamera"
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-5 space-y-3">
              {/* Error */}
              {errorMsg && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Scan / Stop button */}
              {!isCameraActive ? (
                <button
                  onClick={() => void startCamera()}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Camera className="w-5 h-5" />
                  Mulai Scan Barcode
                </button>
              ) : (
                <button
                  onClick={stopCamera}
                  className="w-full py-3 rounded-xl bg-slate-600 hover:bg-slate-700 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <CameraOff className="w-5 h-5" />
                  Hentikan Kamera
                </button>
              )}

              <p className="text-center text-xs text-slate-400">
                Arahkan kamera ke barcode yang dipasang di sekolah
              </p>
            </div>
          </div>
        )}

        {/* History */}
        {!loading && history.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Riwayat 7 Hari Terakhir</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {history.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{formatDate(item.date)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{methodLabel(item.location_method)}</p>
                  </div>
                  <div>
                    {item.checked_in_at ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                        <Clock className="w-3 h-3" /> {formatTime(item.checked_in_at)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs rounded-full">
                        Tidak hadir
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
