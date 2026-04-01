'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, Button, ConfirmDialog } from '@/components/ui';
import {
  GraduationCap, FileEdit, Clock, Calendar, CheckCircle, PlayCircle,
  AlertCircle, Loader2, Users, Shield, Download, Send,
  Search, Monitor, BarChart3, StopCircle, Lock, Unlock, RotateCcw,
} from 'lucide-react';
import api from '@/services/api';
import { classAPI, examAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { downloadSEBConfig, type SEBExamSettings } from '@/utils/seb';
import { useExamsListSocket } from '@/hooks/useSocket';

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
  is_locked?: boolean;
  locked_by?: number;
  locked_at?: string;
  locked_by_user?: { id: number; name: string };
  seb_required?: boolean;
  seb_allow_quit?: boolean;
  seb_quit_password?: string;
  seb_block_screen_capture?: boolean;
  seb_allow_virtual_machine?: boolean;
  seb_show_taskbar?: boolean;
  class_schedules?: Array<{
    id: number;
    class_id: number;
    start_time: string;
    end_time: string;
    is_published?: boolean;
  }>;
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
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState<{ id: number; title: string } | null>(null);
  const [unpublishingId, setUnpublishingId] = useState<number | null>(null);
  
  // Multi-select and bulk unpublish
  const [selectedExams, setSelectedExams] = useState<Set<number>>(new Set());
  const [showUnpublishDialog, setShowUnpublishDialog] = useState<{ ids: number[]; isBulk: boolean } | null>(null);
  const [unpublishReason, setUnpublishReason] = useState('');
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState<{ id: number; title: string; activeCount?: number } | null>(null);
  const [endingExamId, setEndingExamId] = useState<number | null>(null);
  const [checkingActive, setCheckingActive] = useState(false);
  const [lockingExamId, setLockingExamId] = useState<number | null>(null);
  const [showRepublishModal, setShowRepublishModal] = useState<Exam | null>(null);
  const [republishingId, setRepublishingId] = useState<number | null>(null);
  const [allClassesForRepublish, setAllClassesForRepublish] = useState<Array<{ id: number; name: string }>>([]);
  const [republishData, setRepublishData] = useState({
    start_time: '',
    duration: 60,
    class_ids: [] as number[],
    reason: '',
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');

  // Schedule edit
  const [editingSchedule, setEditingSchedule] = useState<Exam | null>(null);
  const [scheduleData, setScheduleData] = useState({ start_time: '', duration: 60, class_id: '' });
  const [savingSchedule, setSavingSchedule] = useState(false);

  const toDateTimeLocalInputValue = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getImmediatePlaceholderTimes = (durationMinutes: number) => {
    const base = new Date();
    base.setFullYear(base.getFullYear() + 2);
    const end = new Date(base.getTime() + durationMinutes * 60 * 1000);

    return {
      start_time: base.toISOString(),
      end_time: end.toISOString(),
    };
  };

  // Real-time updates via WebSocket
  const examIds = useMemo(() => exams.map(e => e.id), [exams]);
  const listSocket = useExamsListSocket(examIds);

  useEffect(() => {
    if (!listSocket.isConnected || examIds.length === 0) return;

    const handleUpdated = (data: unknown) => {
      const d = data as { exam_id: number; title?: string; status?: string; duration?: number; start_time?: string; end_time?: string; passing_score?: number; max_violations?: number };
      setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, title: d.title ?? e.title, duration: d.duration ?? e.duration, start_time: d.start_time ?? e.start_time, end_time: d.end_time ?? e.end_time, status: (d.status as Exam['status']) ?? e.status } : e));
    };
    const handlePublished = (data: unknown) => {
      const d = data as { exam_id: number; status: string; start_time?: string; end_time?: string; duration?: number };
      setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, status: d.status as Exam['status'], start_time: d.start_time || e.start_time, end_time: d.end_time || e.end_time, duration: d.duration || e.duration } : e));
    };
    const handleDeleted = (data: unknown) => {
      const d = data as { exam_id: number };
      setExams(prev => prev.filter(e => e.id !== d.exam_id));
    };
    const handleEnded = (data: unknown) => {
      const d = data as { exam_id?: number };
      if (d.exam_id) setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, status: 'completed' } : e));
    };
    const handleLocked = (data: unknown) => {
      const d = data as { exam_id: number; locked_by: number; locked_by_name: string; locked_at: string };
      setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, is_locked: true, locked_by: d.locked_by, locked_at: d.locked_at, locked_by_user: { id: d.locked_by, name: d.locked_by_name } } : e));
    };
    const handleUnlocked = (data: unknown) => {
      const d = data as { exam_id: number };
      setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, is_locked: false, locked_by: undefined, locked_at: undefined, locked_by_user: undefined } : e));
    };

    const cleanups = [
      listSocket.onAnyExamUpdated(handleUpdated),
      listSocket.onAnyExamPublished(handlePublished),
      listSocket.onAnyExamDeleted(handleDeleted),
      listSocket.onAnyExamEnded(handleEnded),
      listSocket.onAnyExamLocked(handleLocked),
      listSocket.onAnyExamUnlocked(handleUnlocked),
    ];
    return () => { cleanups.forEach(c => c && c()); };
  }, [listSocket, examIds]);

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

  const handleUnpublish = async (examIds: number | number[], reason: string = '') => {
    setIsUnpublishing(true);
    try {
      const ids = Array.isArray(examIds) ? examIds : [examIds];
      
      if (ids.length === 1) {
        // Single unpublish
        await api.post(`/exams/${ids[0]}/unpublish`, { reason });
        toast.success('Publish ujian dibatalkan. Ujian kembali ke draft.');
      } else {
        // Bulk unpublish
        const response = await api.post('/exams/unpublish-multiple', {
          exam_ids: ids,
          reason,
        });
        const data = response.data as { success: boolean; message?: string; success_count?: number };
        toast.success(`${data.success_count || ids.length} ujian berhasil dibatalkan publish-nya.`);
      }
      
      setShowUnpublishDialog(null);
      setUnpublishReason('');
      setSelectedExams(new Set());
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal membatalkan publish ujian');
    } finally {
      setIsUnpublishing(false);
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
    if (!scheduleData.class_id) {
      toast.warning('Pilih kelas terlebih dahulu');
      return;
    }

    setSavingSchedule(true);
    try {
      const startTime = new Date(scheduleData.start_time);
      const endTime = new Date(startTime.getTime() + scheduleData.duration * 60 * 1000);

      const payload: {
        start_time: string;
        end_time: string;
        duration_minutes: number;
        class_id?: number;
        class_ids?: number[];
      } = {
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: scheduleData.duration,
      };

      const selectedClassId = Number(scheduleData.class_id);
      payload.class_id = selectedClassId;
      payload.class_ids = [selectedClassId];

      await api.put(`/exams/${editingSchedule.id}`, {
        ...payload,
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

  const handleClearSchedule = async () => {
    if (!editingSchedule) return;
    if (!scheduleData.class_id) {
      toast.warning('Pilih kelas terlebih dahulu');
      return;
    }

    setSavingSchedule(true);
    try {
      const duration = scheduleData.duration || editingSchedule.duration || 60;
      const immediateWindow = getImmediatePlaceholderTimes(duration);

      const payload: {
        start_time: string;
        end_time: string;
        duration_minutes: number;
        class_id?: number;
        class_ids?: number[];
      } = {
        start_time: immediateWindow.start_time,
        end_time: immediateWindow.end_time,
        duration_minutes: duration,
      };

      const selectedClassId = Number(scheduleData.class_id);
      payload.class_id = selectedClassId;
      payload.class_ids = [selectedClassId];

      await api.put(`/exams/${editingSchedule.id}`, {
        ...payload,
      });

      toast.success('Jadwal dibatalkan. Ujian akan mulai saat dipublish.');
      setEditingSchedule(null);
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal membatalkan jadwal');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleLock = async (exam: Exam) => {
    setLockingExamId(exam.id);
    try {
      if (exam.is_locked) {
        await api.post(`/exams/${exam.id}/unlock`);
        toast.success('Soal ujian berhasil dibuka kuncinya');
      } else {
        await api.post(`/exams/${exam.id}/lock`);
        toast.success('Soal ujian berhasil dikunci');
      }
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal mengubah status kunci');
    } finally {
      setLockingExamId(null);
    }
  };

  const handleRepublishExam = async () => {
    if (!showRepublishModal || !republishData.start_time) return;
    if (republishData.class_ids.length === 0) {
      toast.warning('Pilih minimal 1 kelas untuk sesi re-publish');
      return;
    }

    setRepublishingId(showRepublishModal.id);
    try {
      const startTime = new Date(republishData.start_time);
      const response = await examAPI.republish(showRepublishModal.id, {
        start_time: startTime.toISOString(),
        duration_minutes: republishData.duration,
        class_ids: republishData.class_ids,
        reason: republishData.reason || undefined,
      });

      const reset = response.data?.data?.reset_summary;
      const resetText = reset
        ? ` Data sumber tetap aman: ${reset.result_count || 0} hasil, ${reset.answer_count || 0} jawaban, ${reset.violation_count || 0} pelanggaran.`
        : '';

      toast.success((response.data?.message || 'Ujian clone sesi ulang berhasil dibuat') + resetText);
      setShowRepublishModal(null);
      fetchData();
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal melakukan re-publish ujian');
    } finally {
      setRepublishingId(null);
    }
  };

  const now = new Date();

  const getExamScheduleWindows = (exam: Exam) => {
    const overrideWindows = (exam.class_schedules || [])
      .filter((schedule) => schedule.is_published)
      .map((schedule) => ({
        start: new Date(schedule.start_time),
        end: new Date(schedule.end_time),
      }))
      .filter((window) => !Number.isNaN(window.start.getTime()) && !Number.isNaN(window.end.getTime()));

    if (overrideWindows.length > 0) {
      return overrideWindows;
    }

    const fallbackStart = new Date(exam.start_time);
    const fallbackEnd = new Date(exam.end_time);
    if (Number.isNaN(fallbackStart.getTime()) || Number.isNaN(fallbackEnd.getTime())) {
      return [] as Array<{ start: Date; end: Date }>;
    }

    return [{ start: fallbackStart, end: fallbackEnd }];
  };

  const getExamDisplayWindow = (exam: Exam) => {
    const windows = (exam.class_schedules || []).length > 0
      ? (exam.class_schedules || [])
          .map((schedule) => ({
            start: new Date(schedule.start_time),
            end: new Date(schedule.end_time),
          }))
          .filter((window) => !Number.isNaN(window.start.getTime()) && !Number.isNaN(window.end.getTime()))
      : getExamScheduleWindows(exam);

    if (windows.length === 0) {
      return {
        start: exam.start_time,
        end: exam.end_time,
      };
    }

    const start = new Date(Math.min(...windows.map((window) => window.start.getTime())));
    const end = new Date(Math.max(...windows.map((window) => window.end.getTime())));

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  };

  const getEffectiveStatus = (exam: Exam) => {
    if (exam.status === 'completed') return 'completed';

    const windows = getExamScheduleWindows(exam);
    if (windows.length > 0 && exam.status !== 'draft') {
      const anyActive = windows.some((window) => now >= window.start && now <= window.end);
      if (anyActive) return 'active';

      const allEnded = windows.every((window) => now > window.end);
      if (allEnded) return 'completed';

      const hasUpcoming = windows.some((window) => now < window.start);
      if (hasUpcoming) return 'scheduled';
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
    // Check for far-future placeholder (exam not yet scheduled)
    if (d.getFullYear() >= new Date().getFullYear() + 1) return 'Mulai saat publish';
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
    const isScheduled = status === 'scheduled';
    const isSelected = selectedExams.has(exam.id);
    
    return (
      <div className={`border rounded-xl p-4 transition-colors relative ${
        isScheduled && isSelected
          ? 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/20'
          : 'border-slate-200 dark:border-slate-700 hover:border-sky-300 dark:hover:border-sky-700'
      }`}>
        {isScheduled && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              const newSelected = new Set(selectedExams);
              if (e.target.checked) {
                newSelected.add(exam.id);
              } else {
                newSelected.delete(exam.id);
              }
              setSelectedExams(newSelected);
            }}
            className="absolute top-4 left-4 w-4 h-4 rounded cursor-pointer"
          />
        )}
        <div className={`flex items-start justify-between mb-3 ${isScheduled ? 'ml-6' : ''}`}>
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
            <span>{formatDateTime(getExamDisplayWindow(exam).start)}</span>
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

        {/* Lock Badge */}
        {exam.is_locked && (
          <div className="flex items-center justify-between mb-3 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Soal Dikunci {exam.locked_by_user ? `oleh ${exam.locked_by_user.name}` : ''}
              </span>
            </div>
            <span className="text-xs text-amber-500 dark:text-amber-400">Guru tidak bisa edit</span>
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
                    start_time: isFarFuture ? '' : toDateTimeLocalInputValue(exam.start_time),
                    duration: exam.duration || 60,
                    class_id: String(exam.class_id || exam.classes?.[0]?.id || ''),
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
                onClick={() => setShowUnpublishDialog({ ids: [exam.id], isBulk: false })}
                className="text-amber-700 border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              >
                <AlertCircle className="w-3.5 h-3.5 mr-1.5" />
                Batalkan Publish
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSchedule(exam);
                  setScheduleData({
                    start_time: toDateTimeLocalInputValue(exam.start_time),
                    duration: exam.duration || 60,
                    class_id: String(exam.class_id || exam.classes?.[0]?.id || ''),
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
            <>
              <Button
                size="sm"
                onClick={async () => {
                  const defaultClassIds = (exam.classes && exam.classes.length > 0)
                    ? exam.classes.map((c) => c.id)
                    : (exam.class_id ? [exam.class_id] : []);

                  setShowRepublishModal(exam);
                  setRepublishData({
                    start_time: toDateTimeLocalInputValue(new Date(Date.now() + 60 * 60 * 1000).toISOString()),
                    duration: exam.duration || 60,
                    class_ids: defaultClassIds,
                    reason: '',
                  });
                  
                  // Fetch all available classes for republish
                  try {
                    const response = await classAPI.getAll();
                    const allClasses = response.data?.data || [];
                    setAllClassesForRepublish(
                      allClasses.map((c: { id: number; name: string }) => ({
                        id: c.id,
                        name: c.name,
                      }))
                    );
                  } catch (error) {
                    console.error('Failed to fetch all classes:', error);
                  }
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Re-Publish
              </Button>
              <Link href={`/ujian/${exam.id}/results`}>
                <Button size="sm" variant="outline">
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                  Lihat Hasil
                </Button>
              </Link>
            </>
          )}

          {/* View/Edit questions for all statuses */}
          <Link href={`/ujian/${exam.id}/edit`}>
            <Button size="sm" variant="outline">
              <FileEdit className="w-3.5 h-3.5 mr-1.5" />
              Edit Soal
            </Button>
          </Link>

          {/* Lock/Unlock toggle */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleToggleLock(exam)}
            disabled={lockingExamId === exam.id}
            className={exam.is_locked
              ? 'text-amber-600 border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20'
              : 'text-slate-600 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }
          >
            {lockingExamId === exam.id ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : exam.is_locked ? (
              <Unlock className="w-3.5 h-3.5 mr-1.5" />
            ) : (
              <Lock className="w-3.5 h-3.5 mr-1.5" />
            )}
            {exam.is_locked ? 'Buka Kunci' : 'Kunci Soal'}
          </Button>
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

        {/* Bulk Actions */}
        {selectedExams.size > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border-2 border-amber-600 bg-amber-100" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-200">
                {selectedExams.size} ujian terjadwal dipilih
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedExams(new Set())}
                className="text-amber-700 dark:text-amber-300"
              >
                Batal Pilih
              </Button>
              <Button
                size="sm"
                onClick={() => setShowUnpublishDialog({ ids: Array.from(selectedExams), isBulk: true })}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Batalkan Publish Massal ({selectedExams.size})
              </Button>
            </div>
          </div>
        )}

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

      <ConfirmDialog
        isOpen={!!showPublishConfirm}
        onClose={() => setShowPublishConfirm(null)}
        onConfirm={() => showPublishConfirm && handlePublish(showPublishConfirm.id)}
        title="Publish Ujian"
        message={`Publish ujian "${showPublishConfirm?.title}"? Setelah dipublish, ujian akan dijadwalkan dan siswa dapat mengaksesnya pada waktu yang ditentukan.`}
        confirmText={publishingId ? 'Memproses...' : 'Publish'}
        variant="info"
      />

      {/* Unpublish Dialog with Reason */}
      {showUnpublishDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Batalkan Publish {showUnpublishDialog.isBulk ? 'Massal' : ''} Ujian
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                {showUnpublishDialog.isBulk 
                  ? `${showUnpublishDialog.ids.length} ujian akan dikembalikan ke status draft.`
                  : 'Ujian akan dikembalikan ke status draft tanpa menghapus soal.'
                }
              </p>

              {/* Exam list (for bulk) */}
              {showUnpublishDialog.isBulk && showUnpublishDialog.ids.length > 0 && (
                <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg max-h-40 overflow-y-auto">
                  <ul className="space-y-1 text-xs">
                    {showUnpublishDialog.ids.map(id => {
                      const exam = exams.find(e => e.id === id);
                      return (
                        <li key={id} className="text-slate-700 dark:text-slate-300">
                          • {exam?.title || `Ujian #${id}`}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Reason textarea */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Alasan pembatalan (opsional)
                </label>
                <textarea
                  value={unpublishReason}
                  onChange={(e) => setUnpublishReason(e.target.value)}
                  placeholder="Cth: Jadwal berubah, ada perbaikan soal, dll..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {unpublishReason.length}/500 karakter
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUnpublishDialog(null);
                    setUnpublishReason('');
                  }}
                  disabled={isUnpublishing}
                >
                  Batal
                </Button>
                <Button
                  onClick={() => handleUnpublish(showUnpublishDialog.ids, unpublishReason)}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  disabled={isUnpublishing}
                >
                  {isUnpublishing ? 'Memproses...' : 'Ya, Batalkan Publish'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

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
                  Kelas
                </label>
                <select
                  value={scheduleData.class_id}
                  onChange={(e) => setScheduleData({ ...scheduleData, class_id: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">Pilih Kelas</option>
                  {classes.map((cls) => (
                    <option key={cls.value} value={cls.value}>{cls.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Admin bisa ganti kelas langsung dari menu Atur Jadwal.
                </p>
              </div>

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
                variant="outline"
                onClick={handleClearSchedule}
                disabled={savingSchedule}
                className="flex-1"
              >
                Batalkan Jadwal
              </Button>
              <Button
                onClick={handleSaveSchedule}
                disabled={!scheduleData.start_time || savingSchedule || !scheduleData.class_id}
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

      {/* Re-Publish Modal */}
      {showRepublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowRepublishModal(null)} />
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-1">Re-Publish Ujian</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{showRepublishModal.title}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Waktu Mulai Baru</label>
                <input
                  type="datetime-local"
                  value={republishData.start_time}
                  onChange={(e) => setRepublishData(prev => ({ ...prev, start_time: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Durasi (menit)</label>
                <input
                  type="number"
                  min={10}
                  max={240}
                  value={republishData.duration}
                  onChange={(e) => setRepublishData(prev => ({ ...prev, duration: parseInt(e.target.value) || 60 }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Pilih Kelas Sesi Re-Publish</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRepublishData(prev => ({
                        ...prev,
                        class_ids: allClassesForRepublish.map(c => c.id),
                      }))}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Pilih semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setRepublishData(prev => ({ ...prev, class_ids: [] }))}
                      className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 max-h-40 overflow-auto space-y-2">
                  {(allClassesForRepublish.length > 0 ? allClassesForRepublish : []).map((cls) => {
                    const selected = republishData.class_ids.includes(cls.id);
                    const hasParticipated = showRepublishModal?.classes?.some(c => c.id === cls.id);
                    return (
                      <label key={cls.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            setRepublishData(prev => {
                              const next = new Set(prev.class_ids);
                              if (e.target.checked) next.add(cls.id);
                              else next.delete(cls.id);
                              return { ...prev, class_ids: Array.from(next) };
                            });
                          }}
                        />
                        <span>{cls.name}</span>
                        {hasParticipated && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">Sudah mengikuti</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Kelas terpilih: {republishData.class_ids.length}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Alasan (opsional)</label>
                <textarea
                  value={republishData.reason}
                  onChange={(e) => setRepublishData(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  maxLength={500}
                  placeholder="Contoh: Ujian remidi / ujian ulang periodik"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                Re-publish akan membuat clone ujian baru (terpisah). Hasil sesi lama tetap tersimpan dan tidak dihapus.
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <Button variant="outline" onClick={() => setShowRepublishModal(null)} disabled={republishingId === showRepublishModal.id}>
                Batal
              </Button>
              <Button
                onClick={handleRepublishExam}
                disabled={!republishData.start_time || republishData.class_ids.length === 0 || republishingId === showRepublishModal.id}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {republishingId === showRepublishModal.id ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Memproses...</>
                ) : (
                  <><RotateCcw className="w-4 h-4 mr-2" /> Re-Publish</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
