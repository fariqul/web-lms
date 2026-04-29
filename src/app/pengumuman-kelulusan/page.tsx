'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { graduationAPI } from '@/services/api';
import {
  Loader2,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
  Clock,
  MapPin,
  Award,
  Info,
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

/* ─── Decorative SVG icons (no emoji) ─── */
function GraduationCapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 8L4 22l28 14 28-14L32 8z" fill="currentColor" opacity="0.9" />
      <path d="M12 28v14c0 4 8.954 10 20 10s20-6 20-10V28L32 38 12 28z" fill="currentColor" opacity="0.7" />
      <path d="M52 24v20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="52" cy="46" r="3" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

function SadFaceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2.5" fill="currentColor" opacity="0.08" />
      <circle cx="22" cy="26" r="3" fill="currentColor" opacity="0.6" />
      <circle cx="42" cy="26" r="3" fill="currentColor" opacity="0.6" />
      <path d="M22 44c2.5-4 5.5-6 10-6s7.5 2 10 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function HourglassIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8h28v12L34 32l12 12v12H18V44l12-12L18 20V8z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="currentColor" opacity="0.08" />
      <path d="M22 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M22 52h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <circle cx="32" cy="38" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="32" cy="43" r="1.5" fill="currentColor" opacity="0.3" />
      <circle cx="30" cy="47" r="1" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

export default function GraduationAnnouncementPage() {
  const toast = useToast();
  const resultRef = useRef<HTMLDivElement>(null);

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

  // Animation
  const [showResult, setShowResult] = useState(false);

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
        // Stagger reveal
        setTimeout(() => setShowResult(true), 100);
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

  const handleBack = () => {
    setShowResult(false);
    setTimeout(() => {
      setIsVerified(false);
      setNisn('');
      setNis('');
      setGraduationStatus(null);
    }, 200);
  };

  if (checkingRequirements) {
    return (
      <DashboardLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Memuat...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="min-h-[80vh] py-6 sm:py-10">
        <div className="mx-auto px-4 max-w-xl">

          {/* ─── Page Title ─── */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <Award className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Pengumuman Kelulusan
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
              {isVerified
                ? 'Berikut adalah hasil kelulusan Anda'
                : 'Silakan verifikasi identitas untuk melihat status kelulusan'}
            </p>
          </div>

          {/* ═══════════════════ VERIFICATION FORM ═══════════════════ */}
          {!isVerified && (
            <div className="animate-fadeIn">
              <Card className="overflow-hidden">
                {/* Header strip */}
                <div className="h-1.5 w-full bg-gradient-to-r from-primary via-brand-secondary to-primary" />

                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10">
                      <ShieldCheck className="w-[18px] h-[18px] text-primary" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground text-[15px]">
                        Verifikasi Identitas
                      </h2>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Masukkan data berikut sesuai yang terdaftar
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleVerify} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        NISN <span className="text-destructive">*</span>
                      </label>
                      <Input
                        type="text"
                        value={nisn}
                        onChange={(e) => { setNisn(e.target.value); setVerifyError(''); }}
                        placeholder="Masukkan 10 digit NISN"
                        autoFocus
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        NIS{' '}
                        {requiresNis
                          ? <span className="text-destructive">*</span>
                          : <span className="text-muted-foreground text-xs font-normal">(opsional)</span>
                        }
                      </label>
                      <Input
                        type="text"
                        value={nis}
                        onChange={(e) => { setNis(e.target.value); setVerifyError(''); }}
                        placeholder={requiresNis ? 'Masukkan NIS Anda' : 'Kosongkan jika belum memiliki NIS'}
                      />
                      {!requiresNis && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                          Data NIS Anda belum terdaftar di sistem, kolom ini dapat dikosongkan.
                        </p>
                      )}
                    </div>

                    {verifyError && (
                      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-destructive/8 border border-destructive/20">
                        <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                        <p className="text-[13px] text-destructive leading-snug">{verifyError}</p>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isVerifying}
                      isLoading={isVerifying}
                      loadingText="Memverifikasi..."
                      className="w-full"
                    >
                      Lihat Pengumuman
                    </Button>
                  </form>
                </div>
              </Card>
            </div>
          )}

          {/* ═══════════════════ GRADUATION RESULT ═══════════════════ */}
          {isVerified && (
            <div
              ref={resultRef}
              className={`space-y-5 transition-all duration-500 ease-out ${showResult ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            >
              {/* ─── STATUS: LULUS ─── */}
              {graduationStatus?.status === 'lulus' && (
                <>
                  <Card className="relative overflow-hidden">
                    {/* Gradient accent top */}
                    <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-500" />

                    {/* Subtle radial glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/[0.04] dark:bg-emerald-400/[0.06] rounded-full blur-3xl pointer-events-none" />

                    <div className="relative px-6 pt-10 pb-8 flex flex-col items-center text-center">
                      <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-5 ring-4 ring-emerald-100 dark:ring-emerald-500/20">
                        <GraduationCapIcon className="w-11 h-11 text-emerald-600 dark:text-emerald-400" />
                      </div>

                      <p className="text-xs font-semibold tracking-widest uppercase text-emerald-600 dark:text-emerald-400 mb-1.5">
                        Selamat
                      </p>
                      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-emerald-700 dark:text-emerald-300">
                        Anda Dinyatakan Lulus
                      </h2>

                      {graduationStatus.class && (
                        <p className="text-sm text-muted-foreground mt-3">
                          Kelas <span className="font-semibold text-foreground">{graduationStatus.class}</span>
                        </p>
                      )}

                      {graduationStatus.decided_at && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {new Date(graduationStatus.decided_at).toLocaleDateString('id-ID', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      )}

                      {graduationStatus.notes && (
                        <div className="mt-5 w-full p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-500/[0.06] border border-emerald-200/60 dark:border-emerald-500/15 text-left">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600/70 dark:text-emerald-400/70 mb-1">Catatan</p>
                          <p className="text-sm text-foreground leading-relaxed">{graduationStatus.notes}</p>
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Pickup message from admin */}
                  {graduationStatus.pickup_message && (
                    <Card className="relative overflow-hidden">
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-primary to-sky-400" />
                      <div className="p-5 flex gap-3.5">
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center">
                            <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-foreground mb-1.5">
                            Informasi Pengambilan SKL
                          </p>
                          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                            {graduationStatus.pickup_message}
                          </p>
                        </div>
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* ─── STATUS: TIDAK LULUS ─── */}
              {graduationStatus?.status === 'tidak_lulus' && (
                <Card className="relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-red-400 via-rose-500 to-red-400" />

                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-red-500/[0.03] dark:bg-red-400/[0.05] rounded-full blur-3xl pointer-events-none" />

                  <div className="relative px-6 pt-10 pb-8 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-5 ring-4 ring-red-100 dark:ring-red-500/20">
                      <SadFaceIcon className="w-11 h-11 text-red-500 dark:text-red-400" />
                    </div>

                    <p className="text-xs font-semibold tracking-widest uppercase text-red-500 dark:text-red-400 mb-1.5">
                      Pengumuman
                    </p>
                    <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-red-600 dark:text-red-400">
                      Tidak Lulus
                    </h2>

                    {graduationStatus.class && (
                      <p className="text-sm text-muted-foreground mt-3">
                        Kelas <span className="font-semibold text-foreground">{graduationStatus.class}</span>
                      </p>
                    )}

                    {graduationStatus.decided_at && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {new Date(graduationStatus.decided_at).toLocaleDateString('id-ID', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    )}

                    {graduationStatus.notes && (
                      <div className="mt-5 w-full p-3.5 rounded-xl bg-red-50/60 dark:bg-red-500/[0.06] border border-red-200/60 dark:border-red-500/15 text-left">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500/70 dark:text-red-400/70 mb-1">Catatan</p>
                        <p className="text-sm text-foreground leading-relaxed">{graduationStatus.notes}</p>
                      </div>
                    )}

                    <p className="text-[13px] text-muted-foreground mt-5 max-w-xs leading-relaxed">
                      Silakan hubungi pihak sekolah untuk informasi lebih lanjut mengenai langkah selanjutnya.
                    </p>
                  </div>
                </Card>
              )}

              {/* ─── STATUS: PENDING ─── */}
              {(!graduationStatus || graduationStatus.status === 'pending') && (
                <Card className="relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300" />

                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-400/[0.04] dark:bg-amber-400/[0.06] rounded-full blur-3xl pointer-events-none" />

                  <div className="relative px-6 pt-10 pb-8 flex flex-col items-center text-center">
                    <div className="w-20 h-20 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-5 ring-4 ring-amber-100 dark:ring-amber-500/20">
                      <HourglassIcon className="w-11 h-11 text-amber-500 dark:text-amber-400" />
                    </div>

                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 mb-3">
                      <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Menunggu</span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-amber-700 dark:text-amber-300">
                      Belum Diumumkan
                    </h2>

                    <p className="text-sm text-muted-foreground mt-3 max-w-sm leading-relaxed">
                      {graduationStatus?.message ||
                        'Status kelulusan Anda belum diumumkan oleh pihak sekolah. Silakan periksa kembali di lain waktu.'}
                    </p>
                  </div>
                </Card>
              )}

              {/* Back button */}
              <div className="flex justify-center pt-1">
                <button
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 group"
                >
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
                  Kembali ke verifikasi
                </button>
              </div>
            </div>
          )}

          {/* ─── Footer Info ─── */}
          <div className="mt-8 flex gap-3 p-4 rounded-xl bg-muted/50 border border-border/60">
            <Info className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Pengumuman kelulusan ini bersifat resmi dari SMA Negeri 15 Makassar. Surat Keterangan Lulus (SKL)
              hanya sah setelah ditandatangani dan dicap oleh pihak sekolah.
            </p>
          </div>

        </div>
      </div>
    </DashboardLayout>
  );
}
