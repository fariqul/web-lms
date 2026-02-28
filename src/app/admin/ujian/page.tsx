'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, Button, ConfirmDialog } from '@/components/ui';
import {
  GraduationCap, FileEdit, Clock, Calendar, CheckCircle, PlayCircle,
  AlertCircle, Loader2, Users, Shield, Download, Eye, Send,
  Search, Monitor, BarChart3, StopCircle,
} from 'lucide-react';
import api from '@/services/api';
import { classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { downloadSEBConfig, type SEBExamSettings } from '@/utils/seb';

interface ExamClass {
  id: number;
  name: string;
}

interface Exam {
  id: number;
  title: string;
  subject: string;
  class_id: number;
  class_name?: string;
  classes?: ExamClass[];
  teacher?: { id: number; name: string };
  start_time: string;
  end_time: string;
  duration: number;
  status: 'draft' | 'scheduled' | 'active' | 'completed';
  total_questions: number;
  seb_required?: boolean;
  seb_allow_quit?: boolean;
  seb_quit_password?: string;
  seb_block_screen_capture?: boolean;
  seb_allow_virtual_machine?: boolean;
  seb_show_taskbar?: boolean;
}

interface ClassOption {
  value: string;
  label: string;
}

export default function AdminUjianPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState<{ id: number; title: string } | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState<{ id: number; title: string; activeCount?: number } | null>(null);
  const [endingExamId, setEndingExamId] = useState<number | null>(null);
  const [checkingActive, setCheckingActive] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // Schedule edit
  const [editingSchedule, setEditingSchedule] = useState<Exam | null>(null);
  const [scheduleData, setScheduleData] = useState({ start_time: '', duration: 60 });
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [classesRes, examsRes] = await Promise.all([
        classAPI.getAll(),
        api.get('/exams', { params: { per_page: 100 } }),
      ]);

      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );

      const examsRaw = examsRes.data?.data;
      const examsList = Array.isArray(examsRaw) ? examsRaw : (examsRaw?.data || []);
      setExams(examsList);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (examId: number) => {
    setPublishingId(examId);
    try {
      const exam = exams.find(e => e.id === examId);
      if (exam?.start_time) {
        const startTime = new Date(exam.start_time);
        const now = new Date();
        // If start_time is a far-future placeholder (immediate mode), set to now
        if (startTime.getTime() - now.getTime() > 30 * 24 * 60 * 60 * 1000) {
          const newStart = now.toISOString();
          const duration = exam.duration || 90;
          const newEnd = new Date(now.getTime() + duration * 60 * 1000).toISOString();
          await api.put(`/exams/${examId}`, {
            start_time: newStart,
            end_time: newEnd,
          });
        }
      }
      await api.post(`/exams/${examId}/publish`);
      toast.success('Ujian berhasil dipublish');
      setShowPublishConfirm(null);
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal mempublish ujian');
    } finally {
      setPublishingId(null);
    }
  };

  const handleEndExam = async (examId: number) => {
    setEndingExamId(examId);
    try {
      const response = await api.post(`/exams/${examId}/end`);
      const data = response.data?.data;
      const forceCount = data?.force_finished_count || 0;
      if (forceCount > 0) {
        toast.success(`Ujian berhasil diselesaikan. ${forceCount} siswa di-submit otomatis.`);
      } else {
        toast.success(response.data?.message || 'Ujian berhasil diselesaikan');
      }
      setShowEndConfirm(null);
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal menyelesaikan ujian');
    } finally {
      setEndingExamId(null);
    }
  };

  // Check active students before showing end confirm dialog
  const handleEndExamClick = async (exam: { id: number; title: string }) => {
    setCheckingActive(true);
    try {
      const res = await api.get(`/exams/${exam.id}/monitoring`);
      const participants = res.data?.data?.participants || [];
      const activeCount = participants.filter((p: { status: string }) => p.status === 'in_progress').length;
      setShowEndConfirm({ id: exam.id, title: exam.title, activeCount });
    } catch {
      // If monitoring fails, still allow ending without count
      setShowEndConfirm({ id: exam.id, title: exam.title });
    } finally {
      setCheckingActive(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!editingSchedule || !scheduleData.start_time) return;
    setSavingSchedule(true);
    try {
      const startTime = new Date(scheduleData.start_time);
      const endTime = new Date(startTime.getTime() + scheduleData.duration * 60 * 1000);
      await api.put(`/exams/${editingSchedule.id}`, {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: scheduleData.duration,
      });
      toast.success('Jadwal ujian berhasil diperbarui');
      setEditingSchedule(null);
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal mengubah jadwal');
    } finally {
      setSavingSchedule(false);
    }
  };

  const now = new Date();

  const getEffectiveStatus = (exam: Exam) => {
    if (exam.status === 'completed') return 'completed';
    if (exam.end_time && new Date(exam.end_time) < now && exam.status !== 'draft') return 'completed';
    if (exam.start_time && exam.end_time) {
      const start = new Date(exam.start_time);
      const end = new Date(exam.end_time);
      if (now >= start && now <= end && exam.status !== 'draft') return 'active';
    }
    if (exam.status === 'scheduled') return 'scheduled';
    return exam.status;
  };

  // Apply filters
  const filteredExams = exams.filter((exam) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!exam.title.toLowerCase().includes(q) && !exam.subject.toLowerCase().includes(q) && !(exam.teacher?.name || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    if (statusFilter !== 'all') {
      if (getEffectiveStatus(exam) !== statusFilter) return false;
    }
    if (classFilter !== 'all') {
      const classId = parseInt(classFilter);
      const inClasses = exam.classes?.some(c => c.id === classId);
      if (!inClasses && exam.class_id !== classId) return false;
    }
    return true;
  });

  // Separate by status
  const draftExams = filteredExams.filter(e => getEffectiveStatus(e) === 'draft');
  const scheduledExams = filteredExams.filter(e => getEffectiveStatus(e) === 'scheduled');
  const activeExams = filteredExams.filter(e => getEffectiveStatus(e) === 'active');
  const completedExams = filteredExams.filter(e => getEffectiveStatus(e) === 'completed');

  const getStatusBadge = (exam: Exam) => {
    const status = getEffectiveStatus(exam);
    switch (status) {
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 rounded-full text-xs font-medium">
            <FileEdit className="w-3 h-3" />
            Draft
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Terjadwal
          </span>
        );
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
            <PlayCircle className="w-3 h-3" />
            Berlangsung
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Selesai
          </span>
        );
      default:
        return null;
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    // Check for far-future placeholder
    if (d.getFullYear() > new Date().getFullYear() + 1) return 'Mulai saat publish';
    return d.toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const ExamCard = ({ exam }: { exam: Exam }) => {
    const status = getEffectiveStatus(exam);
    return (
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-sky-300 dark:hover:border-sky-700 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              status === 'active' ? 'bg-green-100 dark:bg-green-900/30' :
              status === 'scheduled' ? 'bg-sky-100 dark:bg-sky-900/30' :
              status === 'completed' ? 'bg-slate-100 dark:bg-slate-700/50' :
              'bg-amber-100 dark:bg-amber-900/30'
            }`}>
              <GraduationCap className={`w-5 h-5 ${
                status === 'active' ? 'text-green-600 dark:text-green-400' :
                status === 'scheduled' ? 'text-sky-600 dark:text-sky-400' :
                status === 'completed' ? 'text-slate-500 dark:text-slate-400' :
                'text-amber-600 dark:text-amber-400'
              }`} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-800 dark:text-white truncate">{exam.title}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{exam.subject}</p>
            </div>
          </div>
          {getStatusBadge(exam)}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{exam.teacher?.name || 'Tanpa guru'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{exam.classes && exam.classes.length > 0 ? exam.classes.map(c => c.name).join(', ') : (exam.class_name || '-')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDateTime(exam.start_time)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{exam.duration} menit · {exam.total_questions} soal</span>
          </div>
        </div>

        {/* SEB Badge */}
        {exam.seb_required && (
          <div className="flex items-center justify-between mb-3 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-medium text-blue-700 dark:text-blue-300">SEB Required</span>
            </div>
            <button
              onClick={() => downloadSEBConfig(exam.title, exam.id, {
                sebRequired: true,
                sebAllowQuit: exam.seb_allow_quit ?? true,
                sebQuitPassword: exam.seb_quit_password ?? '',
                sebBlockScreenCapture: exam.seb_block_screen_capture ?? true,
                sebAllowVirtualMachine: exam.seb_allow_virtual_machine ?? false,
                sebShowTaskbar: exam.seb_show_taskbar ?? true,
              })}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
            >
              <Download className="w-3 h-3" />
              .seb
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          {status === 'draft' && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  // Check if schedule needs to be set
                  const startTime = new Date(exam.start_time);
                  const isFarFuture = startTime.getTime() - now.getTime() > 30 * 24 * 60 * 60 * 1000;
                  if (isFarFuture) {
                    // Immediate mode — publish directly
                    setShowPublishConfirm({ id: exam.id, title: exam.title });
                  } else {
                    setShowPublishConfirm({ id: exam.id, title: exam.title });
                  }
                }}
                disabled={exam.total_questions === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" />
                Publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSchedule(exam);
                  const startTime = new Date(exam.start_time);
                  const isFarFuture = startTime.getTime() - now.getTime() > 30 * 24 * 60 * 60 * 1000;
                  setScheduleData({
                    start_time: isFarFuture ? '' : exam.start_time?.slice(0, 16) || '',
                    duration: exam.duration || 60,
                  });
                }}
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Atur Jadwal
              </Button>
              {exam.total_questions === 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 ml-1">
                  <AlertCircle className="w-3 h-3" /> Belum ada soal
                </span>
              )}
            </>
          )}

          {status === 'scheduled' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSchedule(exam);
                  setScheduleData({
                    start_time: exam.start_time?.slice(0, 16) || '',
                    duration: exam.duration || 60,
                  });
                }}
              >
                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                Ubah Jadwal
              </Button>
              <Link href={`/ujian/${exam.id}/monitor`}>
                <Button size="sm">
                  <Monitor className="w-3.5 h-3.5 mr-1.5" />
                  Monitor
                </Button>
              </Link>
            </>
          )}

          {status === 'active' && (
            <>
              <Link href={`/ujian/${exam.id}/monitor`}>
                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white">
                  <Monitor className="w-3.5 h-3.5 mr-1.5" />
                  Monitor Ujian
                </Button>
              </Link>
              <Button
                size="sm"
                onClick={() => handleEndExamClick({ id: exam.id, title: exam.title })}
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={checkingActive}
              >
                <StopCircle className="w-3.5 h-3.5 mr-1.5" />
                {checkingActive ? 'Memeriksa...' : 'Selesaikan Ujian'}
              </Button>
            </>
          )}

          {status === 'completed' && (
            <Link href={`/ujian/${exam.id}/results`}>
              <Button size="sm" variant="outline">
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                Lihat Hasil
              </Button>
            </Link>
          )}

          {/* View detail for all statuses */}
          <Link href={`/ujian/${exam.id}/edit`}>
            <Button size="sm" variant="outline">
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              Lihat Soal
            </Button>
          </Link>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-800 via-indigo-700 to-purple-600 dark:from-indigo-900 dark:via-indigo-800 dark:to-purple-700 p-5 sm:p-6 shadow-lg shadow-indigo-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Kelola Ujian</h1>
            <p className="text-indigo-100/80">Publish, jadwalkan, dan monitoring ujian CBT</p>
            {/* Quick stats */}
            <div className="flex gap-4 mt-4">
              <div className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-xs text-white/70">Draft</p>
                <p className="text-lg font-bold text-white">{draftExams.length}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-xs text-white/70">Terjadwal</p>
                <p className="text-lg font-bold text-white">{scheduledExams.length}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-xs text-white/70">Berlangsung</p>
                <p className="text-lg font-bold text-white">{activeExams.length}</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-lg px-3 py-2">
                <p className="text-xs text-white/70">Selesai</p>
                <p className="text-lg font-bold text-white">{completedExams.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari ujian, mata pelajaran, atau guru..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Semua Status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Terjadwal</option>
              <option value="active">Berlangsung</option>
              <option value="completed">Selesai</option>
            </select>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Semua Kelas</option>
              {classes.map(cls => (
                <option key={cls.value} value={cls.value}>{cls.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Exams (highest priority) */}
        {activeExams.length > 0 && (
          <Card>
            <CardHeader
              title="Sedang Berlangsung"
              subtitle={`${activeExams.length} ujian aktif`}
            />
            <div className="space-y-3">
              {activeExams.map(exam => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </Card>
        )}

        {/* Draft Exams - waiting to be published */}
        {draftExams.length > 0 && (
          <Card>
            <CardHeader
              title="Menunggu Dipublish"
              subtitle={`${draftExams.length} ujian draft dari guru`}
            />
            <div className="space-y-3">
              {draftExams.map(exam => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </Card>
        )}

        {/* Scheduled Exams */}
        {scheduledExams.length > 0 && (
          <Card>
            <CardHeader
              title="Terjadwal"
              subtitle={`${scheduledExams.length} ujian terjadwal`}
            />
            <div className="space-y-3">
              {scheduledExams.map(exam => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </Card>
        )}

        {/* Completed Exams */}
        {completedExams.length > 0 && (
          <Card>
            <CardHeader
              title="Riwayat Ujian"
              subtitle={`${completedExams.length} ujian selesai`}
            />
            <div className="space-y-3">
              {completedExams.map(exam => (
                <ExamCard key={exam.id} exam={exam} />
              ))}
            </div>
          </Card>
        )}

        {/* Empty state */}
        {filteredExams.length === 0 && (
          <Card>
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <GraduationCap className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Belum ada ujian</p>
              <p className="text-sm mt-1">Guru belum membuat ujian, atau tidak ada yang cocok dengan filter Anda</p>
            </div>
          </Card>
        )}
      </div>

      {/* Publish Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!showPublishConfirm}
        onClose={() => setShowPublishConfirm(null)}
        onConfirm={() => showPublishConfirm && handlePublish(showPublishConfirm.id)}
        title="Publish Ujian"
        message={`Publish ujian "${showPublishConfirm?.title}"? Setelah dipublish, ujian akan dijadwalkan dan siswa dapat mengaksesnya pada waktu yang ditentukan.`}
        confirmText={publishingId ? 'Memproses...' : 'Publish'}
        variant="info"
      />

      {/* End Exam Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!showEndConfirm}
        onClose={() => setShowEndConfirm(null)}
        onConfirm={() => showEndConfirm && handleEndExam(showEndConfirm.id)}
        title="Selesaikan Ujian"
        message={showEndConfirm?.activeCount && showEndConfirm.activeCount > 0
          ? `⚠️ Masih ada ${showEndConfirm.activeCount} siswa yang sedang mengerjakan ujian "${showEndConfirm?.title}". Jika dilanjutkan, jawaban mereka akan otomatis dikumpulkan. Lanjutkan?`
          : `Apakah Anda yakin ingin menyelesaikan ujian "${showEndConfirm?.title}"?`
        }
        confirmText={endingExamId ? 'Memproses...' : 'Selesaikan'}
        variant="danger"
      />

      {/* Schedule Edit Modal */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditingSchedule(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
              Atur Jadwal Ujian
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{editingSchedule.title}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Waktu Mulai
                </label>
                <input
                  type="datetime-local"
                  value={scheduleData.start_time}
                  onChange={(e) => setScheduleData({ ...scheduleData, start_time: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Durasi (menit)
                </label>
                <input
                  type="number"
                  value={scheduleData.duration}
                  onChange={(e) => setScheduleData({ ...scheduleData, duration: parseInt(e.target.value) || 60 })}
                  min={10}
                  max={240}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setEditingSchedule(null)} className="flex-1">
                Batal
              </Button>
              <Button
                onClick={handleSaveSchedule}
                disabled={!scheduleData.start_time || savingSchedule}
                className="flex-1"
              >
                {savingSchedule ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Menyimpan...</>
                ) : (
                  'Simpan Jadwal'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
