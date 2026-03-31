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
  RotateCcw,
} from 'lucide-react';
import api, { getSecureFileUrl } from '@/services/api';
import { useExamSocket } from '@/hooks/useSocket';
import { useAuth } from '@/context/AuthContext';

interface Student {
  id: number;
  name: string;
  nisn: string;
  class_id: number;
  class_room?: {
    id: number;
    name: string;
  };
}

interface MonitoringClassOption {
  id: number;
  name: string;
}

interface Participant {
  student: Student;
  result_id: number | null;
  status: 'not_started' | 'in_progress' | 'completed';
  started_at: string | null;
  finished_at: string | null;
  violation_count: number;
  answered_count: number;
  total_questions: number;
  score: number | null;
  latest_snapshot: { image_path: string; captured_at: string } | null;
  ios_ignored_count: number;
  ios_ignored_last_at: string | null;
  violation_details: Array<{
    id: number;
    type: string;
    description?: string | null;
    recorded_at: string;
  }>;
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
  total_ios_ignored: number;
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
  const [monitoringClasses, setMonitoringClasses] = useState<MonitoringClassOption[]>([]);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed' | 'not_started' | 'ios_ignored'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [realtimeEvents, setRealtimeEvents] = useState<Array<{ type: string; message: string; time: Date }>>([]);
  const [snapshotModal, setSnapshotModal] = useState<{ student: Student; snapshot: { image_path: string; captured_at: string } } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  
  // Reactivate exam result states
  const [reactivateModal, setReactivateModal] = useState<{ participantId: number; studentName: string; resultId: number } | null>(null);
  const [reactivateReason, setReactivateReason] = useState('');
  const [isReactivating, setIsReactivating] = useState(false);
  const [violationModal, setViolationModal] = useState<{ studentName: string; violations: Participant['violation_details'] } | null>(null);
  const [violationFilter, setViolationFilter] = useState<'all' | 'ios_risky'>('all');

  // WebSocket for real-time updates
  const examSocket = useExamSocket(examId);

  const fetchData = useCallback(async () => {
    try {
      // Fetch exam detail for subject and class info
      const examRes = await api.get(`/exams/${examId}`);
      const examData = examRes.data?.data;
      setExamDetail(examData);

      // Fetch monitoring data
      const monitorRes = await api.get(`/exams/${examId}/monitoring`, {
        params: classFilter !== 'all' ? { class_id: Number(classFilter) } : undefined,
      });
      const monitorData = monitorRes.data?.data;
      
      if (monitorData) {
        setExam(monitorData.exam);
        const classes = Array.isArray(monitorData.classes) ? monitorData.classes : [];
        setMonitoringClasses(classes);
        setParticipants(monitorData.participants || []);
        setSummary(monitorData.summary);

        // Debug: log snapshot paths from API response
        const activeParticipants = (monitorData.participants || []).filter((p: Participant) => p.latest_snapshot);
        if (activeParticipants.length > 0) {
          console.log('[Monitor] Refresh snapshots:', activeParticipants.map((p: Participant) => ({
            name: p.student.name,
            image_path: p.latest_snapshot?.image_path,
            captured_at: p.latest_snapshot?.captured_at,
          })));
        }
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [examId, classFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh every 10 seconds for live monitoring
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchData();
    }, 10000);

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
      // Re-fetch to keep summary/participants accurate when class filter is active.
      fetchData();
    });

    // Student submitted exam
    examSocket.onStudentSubmitted((data: unknown) => {
      const d = data as { student_name?: string; student_id?: number; score?: number };
      addEvent('submit', `${d.student_name || 'Siswa'} selesai (nilai: ${d.score ?? '-'})`);
      fetchData();
    });

    // Violation reported
    examSocket.onViolationReported((data: unknown) => {
      const d = data as { student_name?: string; student_id?: number; type?: string; violation_count?: number };
      addEvent('violation', `⚠️ ${d.student_name || 'Siswa'}: ${d.type || 'pelanggaran'} (${d.violation_count}x)`);
      fetchData();
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

    // Exam settings updated (duration, max_violations, etc.)
    examSocket.onExamUpdated((data: unknown) => {
      const d = data as { exam_id: number; duration?: number; max_violations?: number; title?: string; status?: string };
      setExam(prev => prev ? { ...prev, ...d } : prev);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setExamDetail((prev: any) => prev ? { ...prev, ...d } : prev);
      addEvent('settings', `Pengaturan ujian diperbarui`);
    });

    // AI Proctoring alert
    examSocket.on(`exam.${examId}.proctor-alert`, (data: unknown) => {
      const d = data as {
        student_id?: number;
        risk_score?: number;
        severity?: string;
        message?: string;
        detections?: string[];
      };

      // Build human-readable label
      const labels: string[] = [];
      (d.detections ?? []).forEach((det: string) => {
        if (det === 'no_face') labels.push('Wajah tidak terdeteksi');
        else if (det.startsWith('head_turn:')) labels.push(`Menoleh ${det.split(':')[1]}`);
        else if (det === 'eye_gaze_deviated') labels.push('Mata menyimpang');
        else if (det.startsWith('multi_person:')) labels.push(`${det.split(':')[1]} orang`);
        else if (det.startsWith('prohibited_object:')) labels.push(`Objek: ${det.split(':')[1]}`);
      });
      const label = labels.length > 0 ? labels.join(', ') : (d.message || 'AI alert');
      const emoji = d.severity === 'critical' ? '🚨' : d.severity === 'warning' ? '⚠️' : '🔍';

      addEvent('ai-alert', `${emoji} AI: ${label} (risk: ${d.risk_score ?? 0})`);

      // Find student name for the event
      setParticipants(prev => {
        const student = prev.find(p => p.student.id === d.student_id);
        if (student) {
          addEvent('ai-alert', `${emoji} ${student.student.name}: ${label}`);
        }
        return prev;
      });
    });

    return () => {
      examSocket.off(`exam.${examId}.student-joined`);
      examSocket.off(`exam.${examId}.student-submitted`);
      examSocket.off(`exam.${examId}.violation`);
      examSocket.off(`exam.${examId}.answer-progress`);
      examSocket.off(`exam.${examId}.snapshot`);
      examSocket.off(`exam.${examId}.updated`);
      examSocket.off(`exam.${examId}.proctor-alert`);
    };
  }, [examSocket.isConnected, examId, fetchData]);

  const filteredParticipants = participants.filter((p) => {
    if (filter === 'all') return true;
    if (filter === 'ios_ignored') return (p.ios_ignored_count || 0) > 0;
    return p.status === filter;
  });

  const displayedParticipants = React.useMemo(() => {
    const list = [...filteredParticipants];
    if (filter !== 'ios_ignored') return list;

    // Fokuskan kasus paling berat di urutan atas saat filter iOS aktif.
    list.sort((a, b) => {
      const byIgnored = (b.ios_ignored_count || 0) - (a.ios_ignored_count || 0);
      if (byIgnored !== 0) return byIgnored;

      const byViolation = (b.violation_count || 0) - (a.violation_count || 0);
      if (byViolation !== 0) return byViolation;

      const timeA = a.ios_ignored_last_at ? new Date(a.ios_ignored_last_at).getTime() : 0;
      const timeB = b.ios_ignored_last_at ? new Date(b.ios_ignored_last_at).getTime() : 0;
      return timeB - timeA;
    });

    return list;
  }, [filteredParticipants, filter]);

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

  const getViolationTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      tab_switch: 'Pindah tab/aplikasi',
      window_blur: 'Window blur',
      copy_paste: 'Copy/Paste',
      right_click: 'Klik kanan',
      shortcut_key: 'Shortcut terlarang',
      screen_capture: 'Screen capture',
      multiple_face: 'Wajah ganda',
      no_face: 'Wajah tidak terdeteksi',
      split_screen: 'Split screen',
      floating_app: 'Aplikasi mengambang',
      pip_mode: 'Mode PiP',
      suspicious_resize: 'Resize mencurigakan',
      screenshot_attempt: 'Percobaan screenshot',
      virtual_camera: 'Kamera virtual',
      camera_off: 'Kamera mati/tidak akses',
      fullscreen_exit: 'Keluar fullscreen',
    };
    return map[type] || type;
  };

  const isIosRiskyViolation = (type: string) => {
    return [
      'tab_switch',
      'fullscreen_exit',
      'camera_off',
      'split_screen',
      'floating_app',
      'pip_mode',
      'suspicious_resize',
    ].includes(type);
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
    const baseUrl = getSecureFileUrl(imagePath);
    // Add cache-busting timestamp to prevent browser from caching old snapshots
    const cacheBust = `?t=${Date.now()}`;
    return `${baseUrl}${cacheBust}`;
  };

  // Relative time display (e.g. "5 detik lalu", "2 menit lalu")
  const getRelativeTime = (dateString: string) => {
    const now = new Date();
    const then = new Date(dateString);
    const diffMs = now.getTime() - then.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'baru saja';
    if (diffSec < 60) return `${diffSec} detik lalu`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} menit lalu`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} jam lalu`;
  };

  // Check if a snapshot is "fresh" (within last 10 seconds)
  const isSnapshotFresh = (dateString: string) => {
    const diffMs = new Date().getTime() - new Date(dateString).getTime();
    return diffMs < 10000;
  };

  const handleReactivate = async () => {
    if (!reactivateModal) return;

    setIsReactivating(true);
    try {
      const response = await api.post(`/exam-results/${reactivateModal.resultId}/reactivate`, {
        reason: reactivateReason || undefined,
      });

      if (response.data?.success) {
        await fetchData();
        setReactivateModal(null);
        setReactivateReason('');
        setRealtimeEvents(prev => [{
          type: 'reactivate',
          message: `${reactivateModal.studentName} berhasil direaktivasikan`,
          time: new Date(),
        }, ...prev].slice(0, 20));
      } else {
        throw new Error(response.data?.message || 'Reactivation failed');
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Gagal mengaktifkan kembali siswa';
      console.error('Reactivate error:', errMsg);
      setRealtimeEvents(prev => [{
        type: 'error',
        message: `Gagal reaktivasikan: ${errMsg}`,
        time: new Date(),
      }, ...prev].slice(0, 20));
    } finally {
      setIsReactivating(false);
    }
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
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{summary?.total_ios_ignored || 0}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">iOS Diabaikan</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap items-center">
          {monitoringClasses.length > 1 && (
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <option value="all">Semua Kelas</option>
              {monitoringClasses.map((cls) => (
                <option key={cls.id} value={String(cls.id)}>{cls.name}</option>
              ))}
            </select>
          )}

          {[
            { value: 'all', label: 'Semua' },
            { value: 'in_progress', label: 'Mengerjakan' },
            { value: 'completed', label: 'Selesai' },
            { value: 'not_started', label: 'Belum Mulai' },
            { value: 'ios_ignored', label: `iOS Diabaikan (${summary?.total_ios_ignored || 0})` },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as typeof filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === tab.value
                  ? tab.value === 'ios_ignored'
                    ? 'bg-amber-600 text-white'
                    : 'bg-teal-600 text-white'
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
              const snapshotParticipants = displayedParticipants.filter(p => p.status === 'in_progress');
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
                      } ${participant.latest_snapshot && isSnapshotFresh(participant.latest_snapshot.captured_at) ? 'ring-2 ring-green-400 animate-pulse' : ''} transition-all`}
                    >
                      {/* Snapshot Image or Placeholder */}
                      <div className="aspect-video bg-slate-200 dark:bg-slate-700 relative">
                        {participant.latest_snapshot ? (
                          <>
                            <img
                              key={participant.latest_snapshot.image_path}
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
                            {/* Time overlay — relative time */}
                            <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded" title={new Date(participant.latest_snapshot.captured_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}>
                              {getRelativeTime(participant.latest_snapshot.captured_at)}
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
                {displayedParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-600 dark:text-slate-400">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-400 dark:text-slate-600" />
                      <p>Tidak ada peserta dengan filter ini</p>
                    </td>
                  </tr>
                ) : (
                  displayedParticipants.map((participant) => (
                    <tr key={participant.student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{participant.student.name}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            NISN: {participant.student.nisn}
                            {participant.student.class_room?.name ? ` · ${participant.student.class_room.name}` : ''}
                          </p>
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
                        <div className="flex flex-col items-center justify-center">
                          {participant.violation_count > 0 ? (
                            <div className="flex items-center justify-center gap-1 text-red-600">
                              <AlertTriangle className="w-4 h-4" />
                              <span className="font-medium tabular-nums">{participant.violation_count}</span>
                              {user?.role === 'admin' && participant.violation_details?.length > 0 && (
                                <button
                                  onClick={() => setViolationModal({
                                    studentName: participant.student.name,
                                    violations: participant.violation_details,
                                  })}
                                  className="ml-1 p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded"
                                  title="Lihat detail pelanggaran"
                                  aria-label="Lihat detail pelanggaran"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-400">-</span>
                          )}

                          {participant.ios_ignored_count > 0 && (
                            <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              iOS ignored: {participant.ios_ignored_count}
                            </span>
                          )}
                        </div>
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
                          {user?.role === 'admin' && participant.status === 'completed' && participant.violation_count > 0 && participant.result_id && (
                            <button
                              onClick={() => setReactivateModal({
                                participantId: participant.student.id,
                                studentName: participant.student.name,
                                resultId: participant.result_id!,
                              })}
                              className="p-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"
                              title="Aktifkan kembali siswa"
                              aria-label="Aktifkan kembali siswa"
                            >
                              <RotateCcw className="w-4 h-4" />
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
                Foto diambil otomatis setiap 5 detik dari kamera siswa
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Violation Details Modal */}
      {violationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setViolationModal(null)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Detail Pelanggaran</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Siswa: {violationModal.studentName}</p>
              </div>
              <button
                onClick={() => {
                  setViolationModal(null);
                  setViolationFilter('all');
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Tutup detail pelanggaran"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-auto">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViolationFilter('all')}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      violationFilter === 'all'
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => setViolationFilter('ios_risky')}
                    className={`px-3 py-1.5 text-xs rounded-lg border ${
                      violationFilter === 'ios_risky'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    iOS-risky
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {violationFilter === 'all'
                    ? `${violationModal.violations.length} pelanggaran`
                    : `${violationModal.violations.filter(v => isIosRiskyViolation(v.type)).length} pelanggaran iOS-risky`}
                </p>
              </div>

              {(() => {
                const displayViolations = violationFilter === 'all'
                  ? violationModal.violations
                  : violationModal.violations.filter(v => isIosRiskyViolation(v.type));

                if (displayViolations.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Tidak ada pelanggaran pada filter ini.
                    </p>
                  );
                }

                return (
                  <div className="space-y-2">
                    {displayViolations.map((v, idx) => (
                      <div key={v.id} className={`rounded-lg border p-3 ${isIosRiskyViolation(v.type) ? 'border-amber-200 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                            {idx + 1}. {getViolationTypeLabel(v.type)}
                            {isIosRiskyViolation(v.type) && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                iOS-risky
                              </span>
                            )}
                          </p>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateTime(v.recorded_at)}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {v.description?.trim() || 'Tidak ada deskripsi tambahan dari sistem.'}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Reactivate Result Modal */}
      {reactivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !isReactivating && setReactivateModal(null)}>
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Aktifkan Kembali Siswa</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Siswa <span className="font-medium">{reactivateModal.studentName}</span> akan diizinkan ikut ujian kembali.
              </p>
            </div>

            <div className="p-5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Alasan reaktivasi (opsional)
              </label>
              <textarea
                value={reactivateReason}
                onChange={(e) => setReactivateReason(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Contoh: salah terdeteksi pelanggaran, kendala teknis kamera, dll"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{reactivateReason.length}/500</p>

              <div className="flex items-center justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setReactivateModal(null)}
                  disabled={isReactivating}
                >
                  Batal
                </Button>
                <Button
                  onClick={handleReactivate}
                  disabled={isReactivating}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isReactivating ? 'Memproses...' : 'Aktifkan Kembali'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
