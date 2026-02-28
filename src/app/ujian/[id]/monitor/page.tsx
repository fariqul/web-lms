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
  Wifi,
  WifiOff,
  X,
  LayoutGrid,
  List,
} from 'lucide-react';
import api from '@/services/api';
import { useExamSocket } from '@/hooks/useSocket';
import { useAuth } from '@/context/AuthContext';

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
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [examDetail, setExamDetail] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'not_started'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [realtimeEvents, setRealtimeEvents] = useState<Array<{ type: string; message: string; time: Date }>>([]);
  const [snapshotModal, setSnapshotModal] = useState<{ student: Student; snapshot: { image_path: string; captured_at: string } } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // WebSocket for real-time updates
  const examSocket = useExamSocket(examId);

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

  // Auto refresh every 30 seconds (reduced since WebSocket handles real-time)
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // WebSocket event listeners
  useEffect(() => {
    if (!examSocket.isConnected) return;

    const addEvent = (type: string, message: string) => {
      setRealtimeEvents(prev => [{ type, message, time: new Date() }, ...prev].slice(0, 20));
    };

    // Student joined exam
    examSocket.onStudentJoined((data: unknown) => {
      const d = data as { student_name?: string; student_id?: number };
      addEvent('join', `${d.student_name || 'Siswa'} mulai mengerjakan`);
      // Update summary
      setSummary(prev => prev ? {
        ...prev,
        in_progress: prev.in_progress + 1,
        not_started: Math.max(0, prev.not_started - 1),
      } : prev);
      // Update participant status
      setParticipants(prev => prev.map(p =>
        p.student.id === d.student_id ? { ...p, status: 'in_progress' as const, started_at: new Date().toISOString() } : p
      ));
      setLastRefresh(new Date());
    });

    // Student submitted exam
    examSocket.onStudentSubmitted((data: unknown) => {
      const d = data as { student_name?: string; student_id?: number; score?: number };
      addEvent('submit', `${d.student_name || 'Siswa'} selesai (nilai: ${d.score ?? '-'})`);
      setSummary(prev => prev ? {
        ...prev,
        completed: prev.completed + 1,
        in_progress: Math.max(0, prev.in_progress - 1),
      } : prev);
      setParticipants(prev => prev.map(p =>
        p.student.id === d.student_id ? {
          ...p,
          status: 'completed' as const,
          finished_at: new Date().toISOString(),
          score: d.score ?? p.score,
        } : p
      ));
      setLastRefresh(new Date());
    });

    // Violation reported
    examSocket.onViolationReported((data: unknown) => {
      const d = data as { student_name?: string; student_id?: number; type?: string; violation_count?: number };
      addEvent('violation', `⚠️ ${d.student_name || 'Siswa'}: ${d.type || 'pelanggaran'} (${d.violation_count}x)`);
      setSummary(prev => prev ? { ...prev, total_violations: prev.total_violations + 1 } : prev);
      setParticipants(prev => prev.map(p =>
        p.student.id === d.student_id ? { ...p, violation_count: d.violation_count ?? p.violation_count + 1 } : p
      ));
      setLastRefresh(new Date());
    });

    // Answer progress
    examSocket.on(`exam.${examId}.answer-progress`, (data: unknown) => {
      const d = data as { student_id?: number; answered_count?: number; total_questions?: number };
      setParticipants(prev => prev.map(p =>
        p.student.id === d.student_id ? {
          ...p,
          answered_count: d.answered_count ?? p.answered_count,
          total_questions: d.total_questions ?? p.total_questions,
        } : p
      ));
    });

    // Snapshot uploaded
    examSocket.on(`exam.${examId}.snapshot`, (data: unknown) => {
      const d = data as { student_id?: number; image_path?: string; captured_at?: string };
      setParticipants(prev => prev.map(p =>
        p.student.id === d.student_id ? {
          ...p,
          latest_snapshot: { image_path: d.image_path || '', captured_at: d.captured_at || new Date().toISOString() },
        } : p
      ));
    });

    return () => {
      examSocket.off(`exam.${examId}.student-joined`);
      examSocket.off(`exam.${examId}.student-submitted`);
      examSocket.off(`exam.${examId}.violation`);
      examSocket.off(`exam.${examId}.answer-progress`);
      examSocket.off(`exam.${examId}.snapshot`);
    };
  }, [examSocket.isConnected, examId]);

  const filteredParticipants = participants.filter((p) => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'not_started':
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 dark:text-slate-400 text-xs rounded-full">Belum Mulai</span>;
      case 'in_progress':
        return <span className="px-2 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 text-xs rounded-full">Mengerjakan</span>;
      case 'completed':
        return <span className="px-2 py-1 bg-green-100 text-green-600 text-xs rounded-full">Selesai</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-600 dark:text-slate-400 text-xs rounded-full">{status}</span>;
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

  const resolveSnapshotUrl = (imagePath: string) => {
    if (imagePath.startsWith('http')) return imagePath;
    return `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${imagePath}`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (!exam) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Ujian tidak ditemukan</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-2">Ujian yang Anda cari tidak ada atau sudah dihapus.</p>
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
            <Link href={user?.role === 'admin' ? '/admin/ujian' : '/ujian'}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Monitor Ujian</h1>
              <p className="text-slate-600 dark:text-slate-400">{exam.title} - {examDetail?.classes && examDetail.classes.length > 0 ? examDetail.classes.map((c: { id: number; name: string }) => c.name).join(', ') : (examDetail?.class?.name || examDetail?.subject || '-')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              {examSocket.isConnected ? (
                <span className="flex items-center gap-1 text-green-600">
                  <Wifi className="w-4 h-4" />
                  <span className="hidden sm:inline">Live</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                  <WifiOff className="w-4 h-4" />
                  <span className="hidden sm:inline">Offline</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
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
                <p className="text-xs text-slate-600 dark:text-slate-400">Mata Pelajaran</p>
                <p className="font-medium text-slate-900 dark:text-white">{examDetail?.subject || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Durasi</p>
                <p className="font-medium text-slate-900 dark:text-white">{exam.duration} menit</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Mulai</p>
                <p className="font-medium text-slate-900 dark:text-white">{formatDateTime(exam.start_time)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Selesai</p>
                <p className="font-medium text-slate-900 dark:text-white">{formatDateTime(exam.end_time)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Jumlah Soal</p>
                <p className="font-medium text-slate-900 dark:text-white">{exam.total_questions} soal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Sisa Waktu</p>
                <p className="font-bold text-orange-600 text-lg">{getTimeRemaining()}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary?.total_students || 0}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Total Peserta</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{summary?.not_started || 0}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Belum Mulai</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-lg flex items-center justify-center">
                <Monitor className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-teal-600">{summary?.in_progress || 0}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Mengerjakan</p>
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
                <p className="text-xs text-slate-600 dark:text-slate-400">Selesai</p>
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
                <p className="text-xs text-slate-600 dark:text-slate-400">Total Pelanggaran</p>
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
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Real-time Event Feed */}
        {realtimeEvents.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Aktivitas Real-time
              </h3>
              <button
                onClick={() => setRealtimeEvents([])}
                className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-600"
              >
                Bersihkan
              </button>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {realtimeEvents.map((evt, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    evt.type === 'violation' ? 'bg-red-500' :
                    evt.type === 'submit' ? 'bg-green-500' :
                    evt.type === 'join' ? 'bg-teal-500' : 'bg-slate-400'
                  }`} />
                  <span className="text-slate-600 dark:text-slate-400 flex-1">{evt.message}</span>
                  <span className="text-slate-600 dark:text-slate-400 flex-shrink-0">
                    {evt.time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* View Mode Toggle */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Daftar Peserta</h3>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
              Tabel
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Kamera
            </button>
          </div>
        </div>

        {/* Camera Grid View */}
        {viewMode === 'grid' && (
          <Card className="p-4">
            {(() => {
              const snapshotParticipants = filteredParticipants.filter(p => p.status === 'in_progress');
              if (snapshotParticipants.length === 0) {
                return (
                  <div className="py-16 text-center text-slate-500 dark:text-slate-400">
                    <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Tidak ada peserta yang sedang mengerjakan</p>
                    <p className="text-sm mt-1">Kamera akan muncul saat siswa mulai mengerjakan ujian</p>
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {snapshotParticipants.map((participant) => (
                    <div
                      key={participant.student.id}
                      onClick={() => {
                        if (participant.latest_snapshot) {
                          setSnapshotModal({ student: participant.student, snapshot: participant.latest_snapshot });
                        }
                      }}
                      className={`relative bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden group ${
                        participant.latest_snapshot ? 'cursor-pointer hover:ring-2 hover:ring-teal-500' : ''
                      } transition-all`}
                    >
                      {/* Snapshot Image or Placeholder */}
                      <div className="aspect-video bg-slate-200 dark:bg-slate-700 relative">
                        {participant.latest_snapshot ? (
                          <>
                            <img
                              src={resolveSnapshotUrl(participant.latest_snapshot.image_path)}
                              alt={participant.student.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                            {/* Live indicator */}
                            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                              LIVE
                            </div>
                            {/* Time overlay */}
                            <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                              {new Date(participant.latest_snapshot.captured_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </div>
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center">
                              <Camera className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-500 mb-1" />
                              <p className="text-[10px] text-slate-400 dark:text-slate-500">Menunggu...</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Student info bar */}
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{participant.student.name}</p>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            {participant.answered_count}/{participant.total_questions} soal
                          </span>
                          {participant.violation_count > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                              <AlertTriangle className="w-3 h-3" />
                              {participant.violation_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        )}

        {/* Participants Table */}
        {viewMode === 'table' && <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800 border-b">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Siswa</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Status</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Progress</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Pelanggaran</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Waktu Mulai</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Nilai</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-slate-600 dark:text-slate-400">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-600 dark:text-slate-400">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
                      <p>Tidak ada peserta dengan filter ini</p>
                    </td>
                  </tr>
                ) : (
                  filteredParticipants.map((participant) => (
                    <tr key={participant.student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{participant.student.name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">NISN: {participant.student.nisn}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {getStatusBadge(participant.status)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-600 rounded-full"
                              style={{
                                width: `${participant.total_questions > 0 
                                  ? (participant.answered_count / participant.total_questions) * 100 
                                  : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                            {participant.answered_count}/{participant.total_questions}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {participant.violation_count > 0 ? (
                          <span className="flex items-center justify-center gap-1 text-red-600">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="font-medium tabular-nums">{participant.violation_count}</span>
                          </span>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-slate-600 dark:text-slate-400">
                        {participant.started_at ? formatTime(participant.started_at) : '-'}
                      </td>
                      <td className="py-3 px-4 text-center text-sm">
                        {participant.score != null && !isNaN(Number(participant.score)) ? (
                          <span className={`font-medium tabular-nums ${Number(participant.score) >= 70 ? 'text-green-600' : 'text-red-600'}`}>
                            {Number(participant.score).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-600 dark:text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {participant.status !== 'not_started' && (
                            <Link href={`/ujian/${examId}/hasil/${participant.student.id}`}>
                              <button
                                className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg"
                                title="Lihat Detail"
                                aria-label="Lihat detail siswa"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </Link>
                          )}
                          {participant.status === 'in_progress' && participant.latest_snapshot && (
                            <button
                              onClick={() => setSnapshotModal({ student: participant.student, snapshot: participant.latest_snapshot! })}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                              title="Lihat Kamera"
                              aria-label="Lihat kamera siswa"
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

        }

        {/* Legend */}
        <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-400" />
            <span>Belum Mulai</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-teal-500" />
            <span>Mengerjakan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Selesai</span>
          </div>
        </div>
      </div>

      {/* Snapshot Modal */}
      {snapshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSnapshotModal(null)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-teal-50 dark:bg-teal-900/30 rounded-full flex items-center justify-center">
                  <Camera className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{snapshotModal.student.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Foto terakhir: {new Date(snapshotModal.snapshot.captured_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSnapshotModal(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Tutup"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Snapshot Image */}
            <div className="p-4">
              <div className="relative bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden">
                <img
                  src={resolveSnapshotUrl(snapshotModal.snapshot.image_path)}
                  alt={`Snapshot ${snapshotModal.student.name}`}
                  className="w-full aspect-video object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = '<div class="flex items-center justify-center aspect-video text-slate-400"><p class="text-sm">Gagal memuat gambar</p></div>';
                  }}
                />
                {/* Live indicator */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Monitoring Aktif
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">
                Foto diambil otomatis setiap 60 detik dari kamera siswa
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
