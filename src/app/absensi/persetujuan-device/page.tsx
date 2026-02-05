'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import { Smartphone, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import api from '@/services/api';

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
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DeviceSwitchRequest[]>([]);
  const [processing, setProcessing] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      // Get all active sessions for current teacher
      const sessionsResponse = await api.get('/attendance-sessions/my-sessions');
      const sessions = sessionsResponse.data?.data || [];
      
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
      alert('Gagal memproses permintaan. Silakan coba lagi.');
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
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Clock className="w-3 h-3" />
            Menunggu
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" />
            Disetujui
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
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
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Persetujuan Perangkat</h1>
            <p className="text-gray-600">Kelola permintaan pindah perangkat dari siswa</p>
          </div>
          <Button
            onClick={fetchRequests}
            variant="outline"
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>

        {/* Alert for pending requests */}
        {pendingCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">
                {pendingCount} permintaan menunggu persetujuan
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                Siswa tidak dapat melanjutkan absensi sampai permintaan diproses
              </p>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
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
                  ? 'border-teal-500 text-teal-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  filter === tab.key ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'
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
              <Smartphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {filter === 'pending' ? 'Tidak ada permintaan pending' : 'Tidak ada data'}
              </h3>
              <p className="text-gray-500">
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
                      <Smartphone className="w-5 h-5 text-gray-400" />
                      {getStatusBadge(request.status)}
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Siswa:</span>
                        <span className="font-medium text-gray-900">{request.student.name}</span>
                        <span className="text-sm text-gray-500">({request.student.nisn})</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Sebelumnya digunakan oleh:</span>
                        <span className="font-medium text-orange-600">{request.previous_student.name}</span>
                        <span className="text-sm text-gray-500">({request.previous_student.nisn})</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Sesi:</span>
                        <span className="text-sm text-gray-700">
                          {request.session.class?.name} - {request.session.subject}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Waktu permintaan:</span>
                        <span className="text-sm text-gray-700">{formatDate(request.created_at)}</span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Device ID:</span>
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono">
                          {request.device_id.substring(0, 20)}...
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
                    <div className="text-sm text-gray-500">
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
          <div className="space-y-3 text-sm text-gray-600">
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
      </div>
    </DashboardLayout>
  );
}
