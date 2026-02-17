'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import { Smartphone, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, Loader2, ArrowLeft, Bell } from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useDeviceSwitchSocket } from '@/hooks/useSocket';
import Link from 'next/link';

interface DeviceSwitchRequest {
  id: number;
  session_id: number;
  student_id: number;
  previous_student_id: number;
  device_id: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  handled_at: string | null;
  student: {
    id: number;
    name: string;
    nisn: string;
  };
  previous_student: {
    id: number;
    name: string;
    nisn: string;
  };
  session: {
    id: number;
    subject: string;
    class: {
      id: number;
      name: string;
    };
  };
}

export default function DeviceApprovalPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DeviceSwitchRequest[]>([]);
  const [processing, setProcessing] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [sessionIds, setSessionIds] = useState<number[]>([]);
  const [newRequestAlert, setNewRequestAlert] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Socket hook for real-time device switch notifications
  const { onDeviceSwitchRequested, isConnected } = useDeviceSwitchSocket(sessionIds);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      // Get all active sessions for current teacher
      const sessionsResponse = await api.get('/attendance-sessions/my-sessions');
      const sessions = sessionsResponse.data?.data || [];
      
      // Track session IDs for socket subscriptions
      const ids = sessions.map((s: { id: number }) => s.id);
      setSessionIds(ids);
      
      // Fetch device switch requests for all sessions
      const allRequests: DeviceSwitchRequest[] = [];
      for (const session of sessions) {
        try {
          const response = await api.get(`/attendance-sessions/${session.id}/device-switch-requests`);
          if (response.data?.data) {
            allRequests.push(...response.data.data.map((r: DeviceSwitchRequest) => ({
              ...r,
              session: {
                id: session.id,
                subject: session.subject,
                class: session.class
              }
            })));
          }
        } catch {
          // Session might not have any requests
        }
      }
      
      setRequests(allRequests);
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Listen for real-time device switch requests via socket
  useEffect(() => {
    if (sessionIds.length === 0) return;

    const cleanup = onDeviceSwitchRequested((data: unknown) => {
      const switchData = data as {
        request_id: number;
        session_id: number;
        student_name: string;
        student_nisn: string;
        previous_student_name: string;
        previous_student_nisn: string;
        device_id: string;
        created_at: string;
      };

      // Show toast notification
      toast.warning(`Permintaan baru: ${switchData.student_name} menggunakan perangkat ${switchData.previous_student_name}`);
      
      // Flash alert
      setNewRequestAlert(true);
      setTimeout(() => setNewRequestAlert(false), 5000);

      // Play notification sound
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczE0Z+p87PrHQ+HjB0nMzVwYdHGCVlk8PQtYNSJjFxm8rPr4RUK0CBAAAA');
        }
        audioRef.current.play().catch(() => {});
      } catch {
        // Audio may be blocked by browser
      }

      // Re-fetch to get complete data
      fetchRequests();
    });

    return cleanup;
  }, [sessionIds, onDeviceSwitchRequested, fetchRequests, toast]);

  const handleRequest = async (requestId: number, action: 'approve' | 'reject') => {
    setProcessing(requestId);
    try {
      await api.post(`/device-switch-requests/${requestId}/handle`, { action });
      
      // Update local state
      setRequests(prev => prev.map(r => 
        r.id === requestId 
          ? { ...r, status: action === 'approve' ? 'approved' : 'rejected', handled_at: new Date().toISOString() }
          : r
      ));
    } catch (error) {
      console.error('Failed to handle request:', error);
      toast.error('Gagal memproses permintaan. Silakan coba lagi.');
    } finally {
      setProcessing(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Menunggu
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Disetujui
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Ditolak
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/absensi">
                <button className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <ArrowLeft className="w-5 h-5 text-white/80" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white">Persetujuan Perangkat</h1>
                <p className="text-blue-100/80">Kelola permintaan pindah perangkat dari siswa</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Real-time connection indicator */}
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                isConnected 
                  ? 'bg-green-500/20 text-green-100 border border-green-400/30' 
                  : 'bg-white/10 text-white/70 border border-white/20'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-white/50'}`} />
                {isConnected ? 'Real-time aktif' : 'Offline'}
              </div>
              <Button
                onClick={fetchRequests}
                variant="outline"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white"
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* New request flash alert */}
        {newRequestAlert && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700/50 rounded-lg p-4 flex items-center gap-3 animate-pulse">
            <Bell className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <p className="font-medium text-orange-800 dark:text-orange-300">Permintaan pindah perangkat baru masuk!</p>
          </div>
        )}

        {/* Alert for pending requests */}
        {pendingCount > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800 dark:text-yellow-300">
                {pendingCount} permintaan menunggu persetujuan
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                Siswa tidak dapat melanjutkan absensi sampai permintaan diproses
              </p>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          {[
            { key: 'pending', label: 'Menunggu', count: requests.filter(r => r.status === 'pending').length },
            { key: 'approved', label: 'Disetujui', count: requests.filter(r => r.status === 'approved').length },
            { key: 'rejected', label: 'Ditolak', count: requests.filter(r => r.status === 'rejected').length },
            { key: 'all', label: 'Semua', count: requests.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                filter === tab.key
                  ? 'border-blue-500 text-sky-500'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  filter === tab.key ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Request List */}
        {filteredRequests.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <Smartphone className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                {filter === 'pending' ? 'Tidak ada permintaan pending' : 'Tidak ada data'}
              </h3>
              <p className="text-slate-600 dark:text-slate-400">
                {filter === 'pending' 
                  ? 'Semua permintaan pindah perangkat telah diproses'
                  : 'Belum ada permintaan pindah perangkat untuk filter ini'}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredRequests.map(request => (
              <Card key={request.id}>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  {/* Request Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Smartphone className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Siswa:</span>
                        <span className="font-medium text-slate-900 dark:text-white">{request.student.name}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">({request.student.nisn})</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Sebelumnya digunakan oleh:</span>
                        <span className="font-medium text-orange-600">{request.previous_student.name}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-400">({request.previous_student.nisn})</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Sesi:</span>
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {request.session.class?.name} - {request.session.subject}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Waktu permintaan:</span>
                        <span className="text-sm text-slate-700 dark:text-slate-300">{formatDate(request.created_at)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-600 dark:text-slate-400">Device ID:</span>
                        <code className="text-xs bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded font-mono">
                          {request.device_id.substring(0, 20)}…
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {request.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleRequest(request.id, 'reject')}
                        variant="outline"
                        size="sm"
                        leftIcon={processing === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        disabled={processing === request.id}
                      >
                        Tolak
                      </Button>
                      <Button
                        onClick={() => handleRequest(request.id, 'approve')}
                        size="sm"
                        leftIcon={processing === request.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        disabled={processing === request.id}
                      >
                        Setujui
                      </Button>
                    </div>
                  )}
                  
                  {request.status !== 'pending' && request.handled_at && (
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Diproses: {formatDate(request.handled_at)}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Info Card */}
        <Card>
          <CardHeader
            title="Tentang Persetujuan Perangkat"
            subtitle="Sistem anti-titip absensi"
          />
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <strong>Mengapa perlu persetujuan?</strong><br />
              Ketika seorang siswa mencoba absen menggunakan perangkat yang sebelumnya 
              sudah digunakan siswa lain di sesi yang sama, sistem akan meminta persetujuan 
              dari guru untuk mencegah titip absen.
            </p>
            <p>
              <strong>Kapan menyetujui?</strong><br />
              Setujui permintaan jika situasinya wajar, misalnya:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Siswa meminjam perangkat karena HP-nya bermasalah</li>
              <li>Perangkat lab/sekolah yang digunakan bergantian</li>
              <li>Siswa salah login akun dan sudah diperbaiki</li>
            </ul>
            <p>
              <strong>Kapan menolak?</strong><br />
              Tolak permintaan jika terindikasi titip absen, misalnya siswa tidak hadir 
              secara fisik di kelas.
            </p>
          </div>
        </Card>

        {/* Back to Session Button */}
        <div className="flex justify-center">
          <Link href="/absensi">
            <Button variant="outline" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Kembali ke Sesi Absensi
            </Button>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
