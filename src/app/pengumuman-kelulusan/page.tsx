'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { graduationAPI } from '@/services/api';
import s from './page.module.css';

/* ─── Types ─── */
interface GraduationResult {
  student_name: string;
  nisn?: string;
  status: 'pending' | 'lulus' | 'tidak_lulus';
  status_label?: string;
  class?: string;
  decided_at?: string;
  notes?: string;
  pickup_message?: string | null;
  message?: string;
}

interface CountdownTime {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/* ─── SVG Icons ─── */
function GraduationCapIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M32 8L4 22l28 14 28-14L32 8z" fill="currentColor" opacity="0.9" />
      <path d="M12 28v14c0 4 8.954 10 20 10s20-6 20-10V28L32 38 12 28z" fill="currentColor" opacity="0.7" />
      <path d="M52 24v20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="52" cy="46" r="3" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

function SadFaceIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="2.5" fill="currentColor" opacity="0.08" />
      <circle cx="22" cy="26" r="3" fill="currentColor" opacity="0.6" />
      <circle cx="42" cy="26" r="3" fill="currentColor" opacity="0.6" />
      <path d="M22 44c2.5-4 5.5-6 10-6s7.5 2 10 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function HourglassIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 8h28v12L34 32l12 12v12H18V44l12-12L18 20V8z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="currentColor" opacity="0.08" />
      <path d="M22 12h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M22 52h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/* ─── Countdown Calculator ─── */
function getCountdown(targetUtc: string): CountdownTime | null {
  const diff = new Date(targetUtc).getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

/* ═══════════════════ COMPONENT ═══════════════════ */
export default function GraduationAnnouncementPage() {
  // Settings
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [targetDatetime, setTargetDatetime] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<CountdownTime | null>(null);
  const [countdownDone, setCountdownDone] = useState(false);

  // Form
  const [nisn, setNisn] = useState('');
  const [nis, setNis] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  // Result
  const [result, setResult] = useState<GraduationResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Load settings
  useEffect(() => {
    (async () => {
      try {
        const res = await graduationAPI.publicGetSettings();
        const data = res.data?.data;
        setActive(data?.active ?? false);
        setTargetDatetime(data?.datetime ?? null);

        // If no countdown or it's already passed
        if (!data?.datetime || new Date(data.datetime).getTime() <= Date.now()) {
          setCountdownDone(true);
        }
      } catch {
        // If settings fail, assume not active
        setActive(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!targetDatetime || countdownDone) return;

    const tick = () => {
      const cd = getCountdown(targetDatetime);
      if (!cd) {
        setCountdownDone(true);
        setCountdown(null);
      } else {
        setCountdown(cd);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetDatetime, countdownDone]);

  // Verify
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nisn.trim()) { setError('NISN wajib diisi'); return; }

    try {
      setVerifying(true);
      const res = await graduationAPI.publicCheck({
        nisn: nisn.trim(),
        nis: nis.trim() || undefined,
      });

      if (res.data?.success) {
        setResult(res.data.data);
        setTimeout(() => setShowResult(true), 100);
      } else {
        setError(res.data?.message || 'Verifikasi gagal');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; requires_nis?: boolean } } };
      setError(axiosErr?.response?.data?.message || 'Verifikasi gagal. Periksa kembali data Anda.');
    } finally {
      setVerifying(false);
    }
  };

  // Back
  const handleBack = () => {
    setShowResult(false);
    setTimeout(() => { setResult(null); setNisn(''); setNis(''); }, 200);
  };

  // Download PDF
  const handleDownload = useCallback(async () => {
    if (!pdfRef.current || !result) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const canvas = await html2canvas(pdfRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH);
      pdf.save(`Bukti_Kelulusan_${result.student_name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setDownloading(false);
    }
  }, [result]);

  // Loading
  if (loading) {
    return (
      <div className={s.wrapper}>
        <div className={s.content} style={{ textAlign: 'center' }}>
          <div className={s.spinner} style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  // Not active
  if (!active) {
    return (
      <div className={s.wrapper}>
        <div className={s.content}>
          <div className={s.header}>
            <Image src="/landing/logo.png" alt="Logo SMAN 15" width={64} height={64} className={s.logo} />
            <h1 className={s.pageTitle}>Pengumuman Kelulusan</h1>
            <p className={s.pageSubtitle}>Pengumuman kelulusan belum dibuka oleh pihak sekolah.</p>
          </div>
          <div className={s.footerLink}>
            <Link href="/">← Kembali ke Beranda</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrapper}>
      <div className={s.content}>
        {/* Header */}
        <div className={s.header}>
          <Image src="/landing/logo.png" alt="Logo SMAN 15" width={64} height={64} className={s.logo} />
          <div className={s.schoolName}>SMA Negeri 15 Makassar</div>
          <h1 className={s.pageTitle}>Pengumuman Kelulusan</h1>
          <p className={s.pageSubtitle}>
            {result ? 'Berikut adalah hasil kelulusan Anda' : 'Masukkan NISN dan NIS untuk melihat status kelulusan'}
          </p>
        </div>

        {/* ═══ COUNTDOWN ═══ */}
        {!countdownDone && countdown && !result && (
          <div className={`${s.card} ${s.fadeIn}`}>
            <div className={s.cardAccent} />
            <div className={s.cardBody}>
              <h2 className={s.countdownTitle}>Pengumuman Akan Dibuka Dalam</h2>
              <div className={s.countdownGrid}>
                <div className={s.countdownItem}>
                  <span className={s.countdownNumber}>{String(countdown.days).padStart(2, '0')}</span>
                  <span className={s.countdownLabel}>Hari</span>
                </div>
                <div className={s.countdownItem}>
                  <span className={s.countdownNumber}>{String(countdown.hours).padStart(2, '0')}</span>
                  <span className={s.countdownLabel}>Jam</span>
                </div>
                <div className={s.countdownItem}>
                  <span className={s.countdownNumber}>{String(countdown.minutes).padStart(2, '0')}</span>
                  <span className={s.countdownLabel}>Menit</span>
                </div>
                <div className={s.countdownItem}>
                  <span className={s.countdownNumber}>{String(countdown.seconds).padStart(2, '0')}</span>
                  <span className={s.countdownLabel}>Detik</span>
                </div>
              </div>
              <p className={s.countdownNote}>
                Silakan kembali pada waktu yang telah ditentukan untuk melihat status kelulusan Anda.
              </p>
            </div>
          </div>
        )}

        {/* ═══ FORM ═══ */}
        {countdownDone && !result && (
          <div className={`${s.card} ${s.fadeIn}`}>
            <div className={s.cardAccent} />
            <div className={s.cardBody}>
              <div className={s.formTitle}>
                <div className={s.formIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <div>Verifikasi Identitas</div>
                  <div style={{ fontSize: '12px', fontWeight: 400, color: '#6B6789', marginTop: '2px' }}>
                    Masukkan data sesuai yang terdaftar
                  </div>
                </div>
              </div>

              <form onSubmit={handleVerify}>
                <div className={s.formGroup}>
                  <label className={s.label}>
                    NISN <span className={s.required}>*</span>
                  </label>
                  <input
                    type="text"
                    className={s.input}
                    value={nisn}
                    onChange={(e) => { setNisn(e.target.value); setError(''); }}
                    placeholder="Masukkan 10 digit NISN"
                    autoFocus
                  />
                </div>

                <div className={s.formGroup}>
                  <label className={s.label}>
                    NIS <span className={s.optional}>(opsional)</span>
                  </label>
                  <input
                    type="text"
                    className={s.input}
                    value={nis}
                    onChange={(e) => { setNis(e.target.value); setError(''); }}
                    placeholder="Masukkan NIS Anda"
                  />
                </div>

                {error && (
                  <div className={s.errorBox}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
                    </svg>
                    <span className={s.errorText}>{error}</span>
                  </div>
                )}

                <button type="submit" className={s.submitBtn} disabled={verifying}>
                  {verifying ? <><div className={s.spinner} /> Memverifikasi...</> : 'Lihat Pengumuman'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ═══ RESULT ═══ */}
        {result && (
          <div className={`${s.resultReveal} ${showResult ? s.resultRevealVisible : ''}`}>
            {/* ─── LULUS ─── */}
            {result.status === 'lulus' && (
              <div className={s.resultCard}>
                <div className={s.resultAccentLulus} />
                <div className={s.resultBody}>
                  <div className={`${s.resultIconWrapper} ${s.resultIconLulus}`}>
                    <GraduationCapIcon className="" style={{ color: '#059669' }} />
                  </div>
                  <p className={`${s.resultLabel} ${s.resultLabelLulus}`}>Selamat</p>
                  <h2 className={s.studentName}>{result.student_name}</h2>
                  <p className={`${s.resultStatus} ${s.resultStatusLulus}`}>Anda Dinyatakan Lulus</p>
                  {result.class && (
                    <p className={s.resultClass}>Kelas <strong>{result.class}</strong></p>
                  )}
                  {result.decided_at && (
                    <p className={s.resultDate}>
                      {new Date(result.decided_at).toLocaleDateString('id-ID', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      })}
                    </p>
                  )}
                  {result.notes && (
                    <div className={`${s.resultNotes} ${s.resultNotesLulus}`}>
                      <p className={s.notesLabel} style={{ color: '#059669' }}>Catatan</p>
                      <p className={s.notesText}>{result.notes}</p>
                    </div>
                  )}

                  {/* Download button */}
                  <button className={s.downloadBtn} onClick={handleDownload} disabled={downloading}>
                    {downloading ? (
                      <><div className={s.spinner} /> Mengunduh...</>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                        Unduh Bukti Kelulusan
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Pickup info */}
            {result.status === 'lulus' && result.pickup_message && (
              <div className={s.pickupCard}>
                <p className={s.pickupTitle}>📍 Informasi Pengambilan SKL</p>
                <p className={s.pickupText}>{result.pickup_message}</p>
              </div>
            )}

            {/* ─── TIDAK LULUS ─── */}
            {result.status === 'tidak_lulus' && (
              <div className={s.resultCard}>
                <div className={s.resultAccentTidak} />
                <div className={s.resultBody}>
                  <div className={`${s.resultIconWrapper} ${s.resultIconTidak}`}>
                    <SadFaceIcon className="" style={{ color: '#DC2626' }} />
                  </div>
                  <p className={`${s.resultLabel} ${s.resultLabelTidak}`}>Pengumuman</p>
                  <h2 className={s.studentName}>{result.student_name}</h2>
                  <p className={`${s.resultStatus} ${s.resultStatusTidak}`}>Tidak Lulus</p>
                  {result.class && (
                    <p className={s.resultClass}>Kelas <strong>{result.class}</strong></p>
                  )}
                  {result.notes && (
                    <div className={`${s.resultNotes} ${s.resultNotesTidak}`}>
                      <p className={s.notesLabel} style={{ color: '#DC2626' }}>Catatan</p>
                      <p className={s.notesText}>{result.notes}</p>
                    </div>
                  )}
                  <p style={{ fontSize: '13px', color: '#6B6789', marginTop: '16px', lineHeight: '1.5' }}>
                    Silakan hubungi pihak sekolah untuk informasi lebih lanjut.
                  </p>
                </div>
              </div>
            )}

            {/* ─── PENDING ─── */}
            {result.status === 'pending' && (
              <div className={s.resultCard}>
                <div className={s.resultAccentPending} />
                <div className={s.resultBody}>
                  <div className={`${s.resultIconWrapper} ${s.resultIconPending}`}>
                    <HourglassIcon className="" style={{ color: '#D97706' }} />
                  </div>
                  <p className={`${s.resultLabel} ${s.resultLabelPending}`}>Menunggu</p>
                  <h2 className={s.studentName}>{result.student_name}</h2>
                  <p className={`${s.resultStatus} ${s.resultStatusPending}`}>Belum Diumumkan</p>
                  <p style={{ fontSize: '14px', color: '#6B6789', marginTop: '12px', lineHeight: '1.6' }}>
                    {result.message || 'Status kelulusan Anda belum diumumkan. Silakan periksa kembali nanti.'}
                  </p>
                </div>
              </div>
            )}

            {/* Back button */}
            <div style={{ textAlign: 'center' }}>
              <button className={s.backBtn} onClick={handleBack}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Kembali ke verifikasi
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={s.footerLink}>
          <Link href="/">← Kembali ke Beranda</Link>
        </div>
      </div>

      {/* ═══ HIDDEN PDF TEMPLATE ═══ */}
      {result && result.status === 'lulus' && (
        <div ref={pdfRef} className={s.pdfTemplate}>
          <div className={s.pdfHeader}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logo.png" alt="Logo" className={s.pdfLogo} />
            <div className={s.pdfSchoolName}>SMA NEGERI 15 MAKASSAR</div>
            <div className={s.pdfDocTitle}>BUKTI PENGUMUMAN KELULUSAN</div>
          </div>
          <div className={s.pdfBody}>
            <div className={s.pdfRow}>
              <div className={s.pdfLabel}>Nama Lengkap</div>
              <div className={s.pdfValue}>: {result.student_name}</div>
            </div>
            {result.nisn && (
              <div className={s.pdfRow}>
                <div className={s.pdfLabel}>NISN</div>
                <div className={s.pdfValue}>: {result.nisn}</div>
              </div>
            )}
            {result.class && (
              <div className={s.pdfRow}>
                <div className={s.pdfLabel}>Kelas</div>
                <div className={s.pdfValue}>: {result.class}</div>
              </div>
            )}
            <div className={s.pdfRow}>
              <div className={s.pdfLabel}>Status Kelulusan</div>
              <div className={s.pdfValue}>: <strong>LULUS</strong></div>
            </div>
            {result.decided_at && (
              <div className={s.pdfRow}>
                <div className={s.pdfLabel}>Tanggal Keputusan</div>
                <div className={s.pdfValue}>: {new Date(result.decided_at).toLocaleDateString('id-ID', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}</div>
              </div>
            )}
            {result.notes && (
              <div className={s.pdfRow}>
                <div className={s.pdfLabel}>Catatan</div>
                <div className={s.pdfValue}>: {result.notes}</div>
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '24px' }}>
              <div className={`${s.pdfStatusBadge} ${s.pdfStatusLulus}`}>✓ DINYATAKAN LULUS</div>
            </div>
            {result.pickup_message && (
              <div style={{ marginTop: '20px', padding: '12px', background: '#f0f9ff', borderRadius: '8px', fontSize: '13px', lineHeight: '1.6' }}>
                <strong>Informasi Pengambilan SKL:</strong><br />{result.pickup_message}
              </div>
            )}
          </div>
          <div className={s.pdfFooter}>
            Dokumen ini diunduh dari sistem pengumuman kelulusan SMA Negeri 15 Makassar — {new Date().toLocaleDateString('id-ID', {
              year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            <br />Surat Keterangan Lulus (SKL) resmi hanya sah setelah ditandatangani dan dicap oleh pihak sekolah.
          </div>
        </div>
      )}
    </div>
  );
}
