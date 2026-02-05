'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button } from '@/components/ui';
import {
  ArrowLeft,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  RefreshCw,
  Loader2,
  Camera,
  Monitor,
  AlertCircle,
} from 'lucide-react';
import api from '@/services/api';

interface Student {
  id: number;
  name: string;
  nisn: string;
}

interface Participant {
  student: Student;
  status: 'not_started' | 'in_progress' | 'completed';
  started_at: string | null;
  finished_at: string | null;
  violation_count: number;
  answered_count: number;
  total_questions: number;
  score: number | null;
  latest_snapshot: { image_path: string; captured_at: string } | null;
}

interface ExamInfo {
  id: number;
  title: string;
  duration: number;
  total_questions: number;
  start_time: string;
  end_time: string;
}

interface Summary {
  total_students: number;
  not_started: number;
  in_progress: number;
  completed: number;
  total_violations: number;
}

export default function MonitorUjianPage() {
  const params = useParams();
  const examId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [examDetail, setExamDetail] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'not_started'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      // Fetch exam detail for subject and class info
      const examRes = await api.get(`/exams/${examId}`);
      const examData = examRes.data?.data;
      setExamDetail(examData);

      // Fetch monitoring data
      const monitorRes = await api.get(`/exams/${examId}/monitoring`);
      const monitorData = monitorRes.data?.data;
      
      if (monitorData) {
        setExam(monitorData.exam);
        setParticipants(monitorData.participants || []);
        setSummary(monitorData.summary);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const filteredParticipants = participants.filter((p) => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'not_started':
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">Belum Mulai</span>;
      case 'in_progress':
        return <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs rounded-full">Mengerjakan</span>;
      case 'completed':
        return <span className="px-2 py-1 bg-green-100 text-green-600 text-xs rounded-full">Selesai</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{status}</span>;
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeRemaining = () => {
    if (!exam) return '-';
    const endTime = new Date(exam.end_time);
    const now = new Date();
    const diff = endTime.getTime() - now.getTime();

    if (diff <= 0) return 'Selesai';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}j ${minutes}m`;
    }
    return `${minutes}m ${seconds}d`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (!exam) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Ujian tidak ditemukan</h2>
          <p className="text-gray-500 mt-2">Ujian yang Anda cari tidak ada atau sudah dihapus.</p>
          <Link href="/ujian">
            <Button className="mt-4">Kembali ke Daftar Ujian</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/ujian">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Monitor Ujian</h1>
              <p className="text-gray-600">{exam.title} - {examDetail?.class?.name || examDetail?.subject || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              <span>Update: {formatTime(lastRefresh.toISOString())}</span>
            </div>
            <Button
              variant={autoRefresh ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchData()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Exam Info */}
        <Card className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-500">Mata Pelajaran</p>
                <p className="font-medium text-gray-900">{examDetail?.subject || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Durasi</p>
                <p className="font-medium text-gray-900">{exam.duration} menit</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Mulai</p>
                <p className="font-medium text-gray-900">{formatDateTime(exam.start_time)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Selesai</p>
                <p className="font-medium text-gray-900">{formatDateTime(exam.end_time)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Jumlah Soal</p>
                <p className="font-medium text-gray-900">{exam.total_questions} soal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-xs text-gray-500">Sisa Waktu</p>
                <p className="font-bold text-orange-600 text-lg">{getTimeRemaining()}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{summary?.total_students || 0}</p>
                <p className="text-xs text-gray-500">Total Peserta</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{summary?.not_started || 0}</p>
                <p className="text-xs text-gray-500">Belum Mulai</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Monitor className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{summary?.in_progress || 0}</p>
                <p className="text-xs text-gray-500">Mengerjakan</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{summary?.completed || 0}</p>
                <p className="text-xs text-gray-500">Selesai</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{summary?.total_violations || 0}</p>
                <p className="text-xs text-gray-500">Total Pelanggaran</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Semua' },
            { value: 'in_progress', label: 'Mengerjakan' },
            { value: 'completed', label: 'Selesai' },
            { value: 'not_started', label: 'Belum Mulai' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as typeof filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Participants Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Siswa</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Progress</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Pelanggaran</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Waktu Mulai</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Nilai</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>Tidak ada peserta dengan filter ini</p>
                    </td>
                  </tr>
                ) : (
                  filteredParticipants.map((participant) => (
                    <tr key={participant.student.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-gray-900">{participant.student.name}</p>
                          <p className="text-xs text-gray-500">NISN: {participant.student.nisn}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(participant.status)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{
                                width: `${participant.total_questions > 0 
                                  ? (participant.answered_count / participant.total_questions) * 100 
                                  : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">
                            {participant.answered_count}/{participant.total_questions}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {participant.violation_count > 0 ? (
                          <span className="flex items-center justify-center gap-1 text-red-600">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="font-medium">{participant.violation_count}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-gray-500">
                        {participant.started_at ? formatTime(participant.started_at) : '-'}
                      </td>
                      <td className="py-3 px-4 text-center text-sm">
                        {participant.score !== null ? (
                          <span className={`font-medium ${participant.score >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                            {participant.score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {participant.status !== 'not_started' && (
                            <Link href={`/ujian/${examId}/hasil/${participant.student.id}`}>
                              <button
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                title="Lihat Detail"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>
                          )}
                          {participant.status === 'in_progress' && participant.latest_snapshot && (
                            <button
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                              title="Lihat Kamera"
                            >
                              <Camera className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Legend */}
        <div className="flex items-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span>Belum Mulai</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Mengerjakan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Selesai</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
