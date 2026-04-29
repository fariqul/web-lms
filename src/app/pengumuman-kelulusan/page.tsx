'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { graduationAPI } from '@/services/api';
import {
  GraduationCap,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  MapPin,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';

interface GraduationStatus {
  status: 'pending' | 'lulus' | 'tidak_lulus';
  status_label: string;
  class?: string;
  decided_at?: string;
  decided_by?: string;
  notes?: string;
  pickup_message?: string | null;
  message?: string;
}

export default function GraduationAnnouncementPage() {
  const toast = useToast();

  // Verification state
  const [nisn, setNisn] = useState('');
  const [nis, setNis] = useState('');
  const [requiresNis, setRequiresNis] = useState(false);
  const [checkingRequirements, setCheckingRequirements] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Graduation state
  const [graduationStatus, setGraduationStatus] = useState<GraduationStatus | null>(null);

  useEffect(() => {
    checkRequirements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkRequirements = async () => {
    try {
      setCheckingRequirements(true);
      const response = await graduationAPI.checkRequirements();
      setRequiresNis(response.data?.requires_nis ?? false);
    } catch {
      // Default: hanya NISN
      setRequiresNis(false);
    } finally {
      setCheckingRequirements(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyError('');

    if (!nisn.trim()) {
      setVerifyError('NISN wajib diisi');
      return;
    }
    if (requiresNis && !nis.trim()) {
      setVerifyError('NIS wajib diisi');
      return;
    }

    try {
      setIsVerifying(true);
      const response = await graduationAPI.getMyGraduation({
        nisn: nisn.trim(),
        nis: nis.trim() || undefined,
      });

      if (response.data?.success) {
        setGraduationStatus(response.data.data);
        setIsVerified(true);
      } else {
        setVerifyError(response.data?.message || 'Verifikasi gagal');
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      const msg = axiosError?.response?.data?.message || 'Verifikasi gagal. Periksa kembali NISN dan NIS Anda.';
      setVerifyError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const getStatusIcon = () => {
    if (graduationStatus?.status === 'lulus') return <CheckCircle2 className="w-16 h-16 text-green-500" />;
    if (graduationStatus?.status === 'tidak_lulus') return <XCircle className="w-16 h-16 text-red-500" />;
    return <AlertCircle className="w-16 h-16 text-yellow-500" />;
  };

  const getStatusColor = () => {
    if (graduationStatus?.status === 'lulus') return 'bg-green-50 dark:bg-green-900/20';
    if (graduationStatus?.status === 'tidak_lulus') return 'bg-red-50 dark:bg-red-900/20';
    return 'bg-yellow-50 dark:bg-yellow-900/20';
  };

  const getStatusBorderColor = () => {
    if (graduationStatus?.status === 'lulus') return 'border-green-200 dark:border-green-700';
    if (graduationStatus?.status === 'tidak_lulus') return 'border-red-200 dark:border-red-700';
    return 'border-yellow-200 dark:border-yellow-700';
  };

  const getStatusTextColor = () => {
    if (graduationStatus?.status === 'lulus') return 'text-green-700 dark:text-green-300';
    if (graduationStatus?.status === 'tidak_lulus') return 'text-red-700 dark:text-red-300';
    return 'text-yellow-700 dark:text-yellow-300';
  };

  if (checkingRequirements) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8">
        <div className="container mx-auto px-4 max-w-2xl">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <GraduationCap className="w-8 h-8 text-teal-600" />
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                Pengumuman Kelulusan
              </h1>
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              {isVerified
                ? 'Hasil kelulusan Anda'
                : 'Masukkan NISN dan NIS Anda untuk melihat status kelulusan'}
            </p>
          </div>

          {/* ====== VERIFICATION FORM ====== */}
          {!isVerified && (
            <Card className="p-6 border-2 border-teal-200 dark:border-teal-800">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-800 dark:text-white">
                    Verifikasi Identitas
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Masukkan data berikut untuk melihat pengumuman kelulusan
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    NISN <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={nisn}
                    onChange={(e) => { setNisn(e.target.value); setVerifyError(''); }}
                    placeholder="Masukkan NISN Anda"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    NIS {requiresNis ? <span className="text-red-500">*</span> : <span className="text-slate-400 text-xs">(opsional)</span>}
                  </label>
                  <Input
                    type="text"
                    value={nis}
                    onChange={(e) => { setNis(e.target.value); setVerifyError(''); }}
                    placeholder={requiresNis ? 'Masukkan NIS Anda' : 'Kosongkan jika belum memiliki NIS'}
                  />
                  {!requiresNis && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      NIS Anda belum terdaftar di sistem, Anda dapat mengosongkan kolom ini.
                    </p>
                  )}
                </div>

                {verifyError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {verifyError}
                    </p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isVerifying}
                  isLoading={isVerifying}
                  loadingText="Memverifikasi..."
                  className="w-full flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Lihat Pengumuman
                </Button>
              </form>
            </Card>
          )}

          {/* ====== GRADUATION STATUS (after verified) ====== */}
          {isVerified && (
            <>
              {/* Status Card */}
              {graduationStatus && graduationStatus.status !== 'pending' && (
                <Card className={`${getStatusColor()} border-2 ${getStatusBorderColor()} p-8 mb-6`}>
                  <div className="flex flex-col items-center text-center">
                    {getStatusIcon()}

                    <h2 className={`mt-4 text-3xl font-bold ${getStatusTextColor()}`}>
                      {graduationStatus.status_label}
                    </h2>

                    {graduationStatus.class && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
                        Kelas: <span className="font-semibold">{graduationStatus.class}</span>
                      </p>
                    )}

                    {graduationStatus.decided_at && (
                      <p className="text-xs text-slate-500 mt-1">
                        Diputuskan pada:{' '}
                        {new Date(graduationStatus.decided_at).toLocaleDateString('id-ID', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    )}

                    {graduationStatus.decided_by && (
                      <p className="text-xs text-slate-500 mt-1">Oleh: {graduationStatus.decided_by}</p>
                    )}

                    {graduationStatus.notes && (
                      <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg w-full text-left">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Catatan:</p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{graduationStatus.notes}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Pickup Message */}
              {graduationStatus?.status === 'lulus' && graduationStatus.pickup_message && (
                <Card className="bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-200 dark:border-teal-700 p-6 mb-6">
                  <div className="flex gap-3">
                    <MapPin className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-teal-800 dark:text-teal-200 mb-2">
                        📋 Informasi Pengambilan SKL
                      </p>
                      <p className="text-sm text-teal-700 dark:text-teal-300 whitespace-pre-line leading-relaxed">
                        {graduationStatus.pickup_message}
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {/* Pending */}
              {(!graduationStatus || graduationStatus.status === 'pending') && (
                <Card className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 p-8">
                  <div className="flex flex-col items-center text-center">
                    <AlertCircle className="w-16 h-16 text-slate-400" />
                    <h2 className="mt-4 text-xl font-bold text-slate-700 dark:text-slate-300">
                      Menunggu Pengumuman
                    </h2>
                    <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-sm">
                      {graduationStatus?.message ||
                        'Status kelulusan Anda belum diumumkan oleh pihak sekolah. Silakan cek kembali nanti.'}
                    </p>
                  </div>
                </Card>
              )}

              {/* Back button */}
              <div className="mt-4 text-center">
                <Button
                  variant="outline"
                  onClick={() => { setIsVerified(false); setNisn(''); setNis(''); setGraduationStatus(null); }}
                >
                  Kembali ke Verifikasi
                </Button>
              </div>
            </>
          )}

          {/* Info Box */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-4 mt-6">
            <div className="flex gap-3">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-semibold mb-1">Informasi Penting:</p>
                <p className="text-xs">
                  Pengumuman kelulusan ini bersifat resmi dari sekolah. Untuk pengambilan Surat Keterangan Lulus (SKL),
                  ikuti informasi yang tertera di atas. SKL hanya sah setelah ditandatangani dan dicap oleh pihak sekolah.
                </p>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
