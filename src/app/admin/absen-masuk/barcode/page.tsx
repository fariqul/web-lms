'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { QRCodeSVG } from 'qrcode.react';
import { staffAttendanceAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import {
  ArrowLeft,
  QrCode,
  RefreshCw,
  Maximize,
  Printer,
  AlertCircle,
  Loader2,
  ShieldAlert,
} from 'lucide-react';

export default function AdminBarcodePage() {
  const toast = useToast();

  const [token, setToken]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [regenerating, setRegen]    = useState(false);
  const [confirmRegen, setConfirm]  = useState(false);

  const fetchToken = useCallback(async () => {
    try {
      const res = await staffAttendanceAPI.getBarcodeToken();
      setToken(res.data.data.barcode_token);
    } catch {
      toast.error('Gagal memuat barcode');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchToken(); }, [fetchToken]);

  const handleRegenerate = async () => {
    setRegen(true);
    setConfirm(false);
    try {
      const res = await staffAttendanceAPI.regenerateBarcode();
      setToken(res.data.data.barcode_token);
      toast.success('Barcode baru berhasil dibuat. Barcode lama tidak berlaku lagi.');
    } catch {
      toast.error('Gagal membuat barcode baru');
    } finally {
      setRegen(false);
    }
  };

  const handleFullscreen = () => {
    const el = document.getElementById('barcode-display');
    if (el?.requestFullscreen) el.requestFullscreen();
  };

  const handlePrint = () => window.print();

  return (
    <DashboardLayout>
      {/* Print styles */}
      <style>{`
        @media print {
          body > *:not(#print-area) { display: none !important; }
          #print-area {
            display: flex !important;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3 no-print">
          <Link
            href="/admin/absen-masuk"
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-teal-500" />
              Barcode Absen Masuk
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Barcode tidak punya batas waktu — berlaku sampai admin ganti</p>
          </div>
        </div>

        {/* Barcode display card */}
        <div
          id="barcode-display"
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center gap-4"
        >
          {/* Print header — only shows when printing */}
          <div id="print-area" className="hidden print:flex flex-col items-center gap-1 mb-2">
            <p className="text-xl font-bold text-slate-800">SMA Negeri 15 Makassar</p>
            <p className="text-base text-slate-600">Absen Masuk Guru &amp; Staff</p>
          </div>

          {loading ? (
            <Loader2 className="w-12 h-12 animate-spin text-teal-500" />
          ) : token ? (
            <>
              <div className="p-4 bg-white rounded-xl border-2 border-slate-200 shadow-sm">
                <QRCodeSVG
                  value={token}
                  size={240}
                  level="M"
                  includeMargin={false}
                />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-slate-800 dark:text-white text-lg">Scan untuk Absen Masuk</p>
                <p className="text-xs text-slate-400 font-mono break-all max-w-xs">{token}</p>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-slate-500">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <p>Barcode belum dibuat</p>
            </div>
          )}

          {/* Print footer */}
          <div className="hidden print:block mt-4 text-center text-xs text-slate-500">
            <p>Arahkan kamera ke barcode ini melalui halaman Absen Masuk di aplikasi LMS</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-3 no-print">
          <button
            onClick={handleFullscreen}
            className="flex flex-col items-center gap-2 py-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
          >
            <Maximize className="w-5 h-5" />
            <span className="text-xs font-medium">Fullscreen</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={!token}
            className="flex flex-col items-center gap-2 py-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors text-slate-600 dark:text-slate-300"
          >
            <Printer className="w-5 h-5" />
            <span className="text-xs font-medium">Print</span>
          </button>
          <button
            onClick={() => setConfirm(true)}
            disabled={regenerating}
            className="flex flex-col items-center gap-2 py-4 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50 transition-colors text-amber-600 dark:text-amber-400"
          >
            {regenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            <span className="text-xs font-medium">Ganti Baru</span>
          </button>
        </div>

        {/* Regenerate confirmation */}
        {confirmRegen && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-3 no-print">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">Ganti Barcode?</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Barcode saat ini akan <strong>langsung tidak berlaku</strong>. Semua guru/staff harus scan barcode baru. Pastikan barcode baru sudah dipasang/dibagikan sebelum mengganti.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => void handleRegenerate()}
                className="px-4 py-2 rounded-lg text-sm bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
              >
                Ya, Ganti Sekarang
              </button>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-400 space-y-1 no-print">
          <p className="font-semibold">Cara penggunaan:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-600 dark:text-blue-500">
            <li>Print atau tampilkan barcode ini di meja piket / papan absen sekolah</li>
            <li>Guru/staff buka menu <strong>Absen Masuk</strong> di aplikasi LMS</li>
            <li>Klik <strong>Mulai Scan Barcode</strong> lalu arahkan kamera ke barcode ini</li>
            <li>Absen tercatat otomatis — tidak perlu GPS atau WiFi sekolah</li>
          </ol>
        </div>
      </div>
    </DashboardLayout>
  );
}
