'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { graduationAPI } from '@/services/api';
import {
  GraduationCap,
  Loader2,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface GraduationStatus {
  status: 'pending' | 'lulus' | 'tidak_lulus';
  status_label: string;
  class?: string;
  decided_at?: string;
  decided_by?: string;
  notes?: string;
  can_download_skl: boolean;
  skl_path?: string;
  message?: string;
}

export default function GraduationAnnouncementPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [graduationStatus, setGraduationStatus] = useState<GraduationStatus | null>(null);

  useEffect(() => {
    fetchGraduationStatus();
  }, []);

  const fetchGraduationStatus = async () => {
    try {
      setLoading(true);
      const response = await graduationAPI.getMyGraduation();
      setGraduationStatus(response.data?.data || null);
    } catch (error) {
      console.error('Failed to fetch graduation status:', error);
      toast.error('Gagal memuat status kelulusan');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSKL = async () => {
    try {
      setDownloading(true);
      const blob = await graduationAPI.downloadSKL();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SKL_${user?.name}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('SKL berhasil diunduh');
    } catch (error) {
      console.error('Failed to download SKL:', error);
      toast.error('Gagal mengunduh SKL');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  const getStatusIcon = () => {
    if (!graduationStatus) return null;
    
    if (graduationStatus.status === 'lulus') {
      return <CheckCircle2 className="w-16 h-16 text-green-500" />;
    } else if (graduationStatus.status === 'tidak_lulus') {
      return <XCircle className="w-16 h-16 text-red-500" />;
    }
    return <AlertCircle className="w-16 h-16 text-yellow-500" />;
  };

  const getStatusColor = () => {
    if (!graduationStatus) return 'bg-slate-50';
    
    if (graduationStatus.status === 'lulus') {
      return 'bg-green-50 dark:bg-green-900/20';
    } else if (graduationStatus.status === 'tidak_lulus') {
      return 'bg-red-50 dark:bg-red-900/20';
    }
    return 'bg-yellow-50 dark:bg-yellow-900/20';
  };

  const getStatusBorderColor = () => {
    if (!graduationStatus) return 'border-slate-200';
    
    if (graduationStatus.status === 'lulus') {
      return 'border-green-200 dark:border-green-700';
    } else if (graduationStatus.status === 'tidak_lulus') {
      return 'border-red-200 dark:border-red-700';
    }
    return 'border-yellow-200 dark:border-yellow-700';
  };

  const getStatusTextColor = () => {
    if (!graduationStatus) return 'text-slate-700';
    
    if (graduationStatus.status === 'lulus') {
      return 'text-green-700 dark:text-green-300';
    } else if (graduationStatus.status === 'tidak_lulus') {
      return 'text-red-700 dark:text-red-300';
    }
    return 'text-yellow-700 dark:text-yellow-300';
  };

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
              Status kelulusan Anda untuk tahun akademik ini
            </p>
          </div>

          {/* Status Card */}
          {graduationStatus && (
            <Card className={`${getStatusColor()} border-2 ${getStatusBorderColor()} p-8 mb-8`}>
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
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    Diputuskan pada: {new Date(graduationStatus.decided_at).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                )}

                {graduationStatus.decided_by && (
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                    Oleh: {graduationStatus.decided_by}
                  </p>
                )}

                {graduationStatus.notes && (
                  <div className="mt-4 p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg w-full text-left">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Catatan:
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {graduationStatus.notes}
                    </p>
                  </div>
                )}

                {/* Download SKL Button */}
                {graduationStatus.can_download_skl && graduationStatus.status === 'lulus' && (
                  <div className="mt-6 w-full">
                    <Button
                      onClick={handleDownloadSKL}
                      disabled={downloading}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {downloading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Download className="w-5 h-5" />
                      )}
                      {downloading ? 'Mengunduh SKL...' : 'Unduh Surat Keterangan Lulus (SKL)'}
                    </Button>
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                      Silakan cetak dan minta tanda tangan serta cap di sekolah
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* No Status Card */}
          {(!graduationStatus || graduationStatus.status === 'pending') && (
            <Card className="bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 p-8">
              <div className="flex flex-col items-center text-center">
                <AlertCircle className="w-16 h-16 text-slate-400" />
                <h2 className="mt-4 text-xl font-bold text-slate-700 dark:text-slate-300">
                  Menunggu Pengumuman
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-sm">
                  {graduationStatus?.message || 'Status kelulusan Anda belum diumumkan oleh pihak sekolah. Silakan cek kembali nanti.'}
                </p>
              </div>
            </Card>
          )}

          {/* Information Box */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-4 mt-6">
            <div className="flex gap-3">
              <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-semibold mb-1">Informasi SKL:</p>
                <p className="text-xs">
                  Surat Keterangan Lulus (SKL) ini belum resmi sampai ditandatangani dan dicap oleh 
                  pihak sekolah. Silakan datang ke kantor sekolah untuk penandatanganan dan pemberian cap.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
