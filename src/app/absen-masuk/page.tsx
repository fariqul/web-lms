'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { staffAttendanceAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import {
  ClipboardCheck,
  MapPin,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  CalendarDays,
  Navigation,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TodayStatus {
  has_checked_in: boolean;
  checked_in_at: string | null;
  location_method: 'gps' | 'manual' | null;
  is_location_valid: boolean;
  distance_meters: number | null;
}

interface HistoryItem {
  date: string;
  checked_in_at: string | null;
  location_method: 'gps' | 'manual' | null;
  is_location_valid: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Request GPS with 8-second timeout. Returns null if unavailable/denied. */
const getLocation = (): Promise<{ lat: number; lng: number } | null> =>
  new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    const timer = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

/** Get/create device fingerprint stored in localStorage. */
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

const locationLabel = (method: string | null): string => {
  if (method === 'gps') return 'GPS';
  return 'Manual';
};

const locationIcon = (method: string | null) => {
  if (method === 'gps') return <Navigation className="w-3.5 h-3.5" />;
  return <MapPin className="w-3.5 h-3.5" />;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AbsenMasukPage() {
  const toast = useToast();

  const [status, setStatus]   = useState<TodayStatus | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // ── Load today's status + history on mount ────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        staffAttendanceAPI.todayStatus(),
        staffAttendanceAPI.myHistory(),
      ]);
      setStatus(statusRes.data.data);
      setHistory((historyRes.data.data as HistoryItem[]).slice(0, 7));
    } catch {
      toast.error('Gagal memuat data absensi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Handle check-in button ────────────────────────────────────────────────
  const handleCheckIn = async () => {
    setChecking(true);
    setErrorMsg(null);

    try {
      // Request GPS (max 8 s)
      const coords   = await getLocation();
      const deviceId = getDeviceId();

      const res = await staffAttendanceAPI.checkIn({
        latitude:  coords?.lat,
        longitude: coords?.lng,
        device_id: deviceId,
      });

      if (res.data.success && res.data.data) {
        setStatus({
          has_checked_in:    true,
          checked_in_at:     res.data.data.checked_in_at,
          location_method:   res.data.data.location_method,
          is_location_valid: res.data.data.is_location_valid,
          distance_meters:   res.data.data.distance_meters,
        });
        toast.success('Absen masuk berhasil dicatat!');
        void loadData(); // refresh history
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; error_code?: string } } };
      const code = e.response?.data?.error_code;
      const msg  = e.response?.data?.message || 'Gagal absen masuk. Silakan coba lagi.';

      // Give a more specific hint for GPS errors
      if (code === 'GPS_REQUIRED') {
        setErrorMsg('GPS diperlukan. Pastikan izin lokasi diaktifkan di browser/perangkat Anda.');
      } else {
        setErrorMsg(msg);
      }
      toast.error(msg);
    } finally {
      setChecking(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-5 px-1">

        {/* Page title */}
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

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          </div>
        )}

        {/* Already checked in */}
        {!loading && status?.has_checked_in && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Sudah Absen Masuk</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Kehadiran hari ini sudah tercatat.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Jam masuk */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                  <Clock className="w-3.5 h-3.5" /> Jam Masuk
                </p>
                <p className="text-xl font-bold text-slate-800 dark:text-white tabular-nums">
                  {formatTime(status.checked_in_at)}
                </p>
              </div>
              {/* Metode validasi */}
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                  {locationIcon(status.location_method)} Metode Lokasi
                </p>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                  {locationLabel(status.location_method)}
                </p>
                {status.distance_meters !== null && (
                  <p className="text-xs text-slate-400 mt-0.5">{status.distance_meters} m dari sekolah</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Not yet checked in */}
        {!loading && !status?.has_checked_in && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 space-y-4">
            <div className="text-center space-y-2 py-2">
              <div className="w-16 h-16 bg-teal-50 dark:bg-teal-900/30 rounded-full flex items-center justify-center mx-auto">
                <ClipboardCheck className="w-8 h-8 text-teal-600 dark:text-teal-400" />
              </div>
              <p className="font-semibold text-slate-700 dark:text-slate-200">Belum absen hari ini</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Tap tombol di bawah untuk mencatat kehadiran. Lokasi divalidasi otomatis via GPS atau WiFi sekolah.
              </p>
            </div>

            {/* Error message */}
            {errorMsg && (
              <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-3 text-sm text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Check-in button */}
            <button
              onClick={() => void handleCheckIn()}
              disabled={checking}
              className="w-full py-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-60 text-white font-semibold text-base flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              {checking ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Memproses…
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-5 h-5" />
                  Absen Masuk Sekarang
                </>
              )}
            </button>

            <p className="text-center text-xs text-slate-400">
              Validasi lokasi: GPS (radius dari sekolah)
            </p>
          </div>
        )}

        {/* History — last 7 days */}
        {!loading && history.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Riwayat 7 Hari Terakhir</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {history.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {formatDate(item.date)}
                    </p>
                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      {locationIcon(item.location_method)}
                      {locationLabel(item.location_method)}
                    </p>
                  </div>
                  <div className="text-right">
                    {item.checked_in_at ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                        <Clock className="w-3 h-3" />
                        {formatTime(item.checked_in_at)}
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
