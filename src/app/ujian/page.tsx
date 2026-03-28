'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { FileEdit, Clock, Calendar, CheckCircle, PlayCircle, AlertCircle, Plus, Loader2, Users, Trash2, Shield, Download } from 'lucide-react';
import api from '@/services/api';
import { classAPI } from '@/services/api';
import { SUBJECT_OPTIONS } from '@/constants/subjects';
import { useToast } from '@/components/ui/Toast';
import { downloadSEBConfig, type SEBExamSettings, DEFAULT_SEB_SETTINGS } from '@/utils/seb';
import { useExamsListSocket } from '@/hooks/useSocket';

interface Exam {
  id: number;
  title: string;
  subject: string;
  class_id: number;
  class_name?: string;
  classes?: { id: number; name: string }[];
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
  grade_level?: string;
}

const subjects = SUBJECT_OPTIONS;

const SEBSettingsFields = dynamic(
  () => import('@/components/ujian/SEBSettingsFields').then((m) => m.SEBSettingsFields),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
        <div className="h-10 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
        <div className="h-10 rounded bg-slate-100 dark:bg-slate-700/60 animate-pulse" />
      </div>
    ),
  }
);

export default function UjianPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteExam, setDeleteExam] = useState<{id: number, title: string} | null>(null);
  const [visibleUpcomingCount, setVisibleUpcomingCount] = useState(8);
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(6);
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    class_ids: [] as string[],
    duration_minutes: '90',
  });
  const [sebSettings, setSebSettings] = useState<SEBExamSettings>({ ...DEFAULT_SEB_SETTINGS });

  // Real-time updates via WebSocket
  const examIds = useMemo(() => exams.map(e => e.id), [exams]);
  const listSocket = useExamsListSocket(examIds);

  useEffect(() => {
    if (!listSocket.isConnected || examIds.length === 0) return;

    const handleUpdated = (data: unknown) => {
      const d = data as { exam_id: number; title?: string; status?: string; duration?: number; start_time?: string; end_time?: string };
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

    const cleanups = [
      listSocket.onAnyExamUpdated(handleUpdated),
      listSocket.onAnyExamPublished(handlePublished),
      listSocket.onAnyExamDeleted(handleDeleted),
      listSocket.onAnyExamEnded(handleEnded),
    ];
    return () => { cleanups.forEach(c => c && c()); };
  }, [listSocket, examIds]);

  const fetchData = useCallback(async () => {
    try {
      const [classesResult, examsResult] = await Promise.allSettled([
        classAPI.getAll(),
        api.get('/exams'),
      ]);

      if (classesResult.status === 'fulfilled') {
        const classesData = classesResult.value.data?.data || [];
        setClasses(
          classesData.map((c: { id: number; name: string; grade_level?: string }) => ({
            value: c.id.toString(),
            label: c.name,
            grade_level: c.grade_level,
          }))
        );
      } else {
        setClasses([]);
      }

      if (examsResult.status === 'fulfilled') {
        const examsRaw = examsResult.value.data?.data;
        const examsList = Array.isArray(examsRaw) ? examsRaw : (examsRaw?.data || []);
        setExams(examsList);
      } else {
        // Exams API might not exist yet
        setExams([]);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.subject || formData.class_ids.length === 0) {
      toast.warning('Mohon lengkapi semua field yang diperlukan');
      return;
    }

    if (sebSettings.sebRequired && sebSettings.sebAllowQuit && !sebSettings.sebQuitPassword.trim()) {
      toast.warning('Password quit SEB wajib diisi agar bisa keluar dari SEB');
      return;
    }
    
    setSubmitting(true);
    try {
      // Use far-future placeholder — admin will set actual schedule on publish
      const startTime = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const durationMinutes = parseInt(formData.duration_minutes) || 90;
      const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
      
      const response = await api.post('/exams', {
        title: formData.title,
        subject: formData.subject,
        class_id: parseInt(formData.class_ids[0]),
        class_ids: formData.class_ids.map(id => parseInt(id)),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: durationMinutes,
        seb_required: sebSettings.sebRequired,
        seb_allow_quit: sebSettings.sebAllowQuit,
        seb_quit_password: sebSettings.sebQuitPassword || '',
        seb_block_screen_capture: sebSettings.sebBlockScreenCapture,
        seb_allow_virtual_machine: sebSettings.sebAllowVirtualMachine,
        seb_show_taskbar: sebSettings.sebShowTaskbar,
      });
      
      // Redirect to edit page to add questions
      const newExamId = response.data?.data?.id;
      if (newExamId) {
        // Save SEB settings to localStorage as fallback (backend may not persist yet)
        if (sebSettings.sebRequired) {
          localStorage.setItem(`seb_settings_${newExamId}`, JSON.stringify(sebSettings));
        }
        router.push(`/ujian/${newExamId}/edit`);
      } else {
        setIsModalOpen(false);
        fetchData();
      }
      
      setFormData({
        title: '',
        subject: '',
        class_ids: [],
        duration_minutes: '90',
      });
      setSebSettings({ ...DEFAULT_SEB_SETTINGS });
      fetchData();
    } catch (error: unknown) {
      console.error('Failed to create exam:', error);
      const axiosError = error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      if (axiosError.response?.data?.errors) {
        const errors = Object.values(axiosError.response.data.errors).flat().join('\n');
        toast.error('Gagal membuat ujian: ' + errors);
      } else {
        toast.error('Gagal membuat ujian: ' + (axiosError.response?.data?.message || 'Terjadi kesalahan'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const { upcomingExams, completedExams } = useMemo(() => {
    const now = Date.now();
    const upcoming: Exam[] = [];
    const completed: Exam[] = [];

    for (const exam of exams) {
      const endTimeMs = exam.end_time ? new Date(exam.end_time).getTime() : null;
      const isCompleted =
        exam.status === 'completed' ||
        (endTimeMs !== null && endTimeMs < now && exam.status !== 'draft');

      if (isCompleted) {
        completed.push(exam);
      } else {
        upcoming.push(exam);
      }
    }

    return { upcomingExams: upcoming, completedExams: completed };
  }, [exams]);

  const visibleUpcomingExams = useMemo(
    () => upcomingExams.slice(0, visibleUpcomingCount),
    [upcomingExams, visibleUpcomingCount]
  );

  const visibleCompletedExams = useMemo(
    () => completedExams.slice(0, visibleCompletedCount),
    [completedExams, visibleCompletedCount]
  );

  useEffect(() => {
    if (upcomingExams.length === 0) return;

    const targets = upcomingExams.slice(0, 6);
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const runPrefetch = () => {
      if (cancelled) return;
      for (const exam of targets) {
        router.prefetch(`/ujian/${exam.id}/edit`);
        router.prefetch(`/ujian/${exam.id}/results`);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout?: number }) => number }).requestIdleCallback(
        runPrefetch,
        { timeout: 1500 }
      );
    } else {
      timeoutId = globalThis.setTimeout(runPrefetch, 600);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [router, upcomingExams]);

  const handleDeleteExam = useCallback((examId: number, examTitle: string) => {
    setDeleteExam({ id: examId, title: examTitle });
  }, []);

  const confirmDeleteExam = useCallback(async () => {
    if (!deleteExam) return;

    try {
      await api.delete(`/exams/${deleteExam.id}`);
      fetchData();
    } catch (error: unknown) {
      console.error('Failed to delete exam:', error);
      const axiosError = error as { response?: { data?: { message?: string } } };
      toast.error(axiosError.response?.data?.message || 'Gagal menghapus ujian');
    } finally {
      setDeleteExam(null);
    }
  }, [deleteExam, fetchData, toast]);

  const getStatusBadge = useCallback((exam: Exam) => {
    const now = new Date();
    const endTime = exam.end_time ? new Date(exam.end_time) : null;
    const startTime = exam.start_time ? new Date(exam.start_time) : null;

    // If end_time has passed and not draft, show as "Selesai"
    if (exam.status === 'completed' || (endTime && endTime < now && exam.status !== 'draft')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 rounded-full text-xs">
          <CheckCircle className="w-3 h-3" />
          Selesai
        </span>
      );
    }

    // Currently active (between start and end time)
    if (startTime && endTime && now >= startTime && now <= endTime) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs">
          <PlayCircle className="w-3 h-3" />
          Sedang Berlangsung
        </span>
      );
    }

    if (exam.status === 'draft') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 rounded-full text-xs">
          <FileEdit className="w-3 h-3" />
          Draft
        </span>
      );
    }

    if (exam.status === 'scheduled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded-full text-xs">
          <Clock className="w-3 h-3" />
          Terjadwal
        </span>
      );
    }

    if (exam.status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs">
          <PlayCircle className="w-3 h-3" />
          Sedang Berlangsung
        </span>
      );
    }

    return null;
  }, []);

  const upcomingExamCards = useMemo(() => {
    return visibleUpcomingExams.map((exam) => (
      <div
        key={exam.id}
        className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-sky-300 transition-colors"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/30 rounded-xl flex items-center justify-center">
              <FileEdit className="w-6 h-6 text-sky-500" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">{exam.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{exam.subject}</p>
            </div>
          </div>
          {getStatusBadge(exam)}
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Calendar className="w-4 h-4" />
            <span>{exam.start_time ? new Date(exam.start_time).toLocaleDateString('id-ID') : '-'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Clock className="w-4 h-4" />
            <span>{exam.duration} menit</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Users className="w-4 h-4" />
            <span>{exam.classes && exam.classes.length > 0 ? exam.classes.map(c => c.name).join(', ') : (exam.class_name || 'Semua Kelas')}</span>
          </div>
        </div>

        {exam.seb_required && (
          <div className="flex items-center justify-between mb-4 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
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
              <Download className="w-3.5 h-3.5" />
              Download .seb
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <Link href={`/ujian/${exam.id}/edit`} className="flex-1">
            <Button variant="outline" fullWidth>
              <FileEdit className="w-4 h-4 mr-2" />
              Edit Soal
            </Button>
          </Link>
          {exam.status === 'draft' && (
            <Link href={`/ujian/${exam.id}/results`} className="flex-1">
              <Button variant="outline" fullWidth>
                <AlertCircle className="w-4 h-4 mr-2" />
                Menunggu Publish Admin
              </Button>
            </Link>
          )}
          {(exam.status === 'scheduled' || exam.status === 'active') && (
            <Link href={`/ujian/${exam.id}/results`} className="flex-1">
              <Button fullWidth>
                <Users className="w-4 h-4 mr-2" />
                Lihat Hasil
              </Button>
            </Link>
          )}
          {exam.status === 'draft' && (
            <Button
              variant="outline"
              onClick={() => handleDeleteExam(exam.id, exam.title)}
              className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
              aria-label="Hapus ujian"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    ));
  }, [visibleUpcomingExams, getStatusBadge, handleDeleteExam]);

  const completedExamCards = useMemo(() => {
    return visibleCompletedExams.map((exam) => (
      <div
        key={exam.id}
        className="border border-slate-200 dark:border-slate-700 rounded-xl p-4"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/50 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-white">{exam.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{exam.subject}</p>
            </div>
          </div>
          {getStatusBadge(exam)}
        </div>
        <Link href={`/ujian/${exam.id}/results`}>
          <Button variant="outline" fullWidth>
            Lihat Hasil
          </Button>
        </Link>
      </div>
    ));
  }, [visibleCompletedExams, getStatusBadge]);

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
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Ujian / CBT</h1>
              <p className="text-blue-100/80">Kelola ujian Computer Based Test</p>
            </div>
            <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus className="w-5 h-5" />} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white">
              Buat Ujian Baru
            </Button>
          </div>
        </div>

        {/* Upcoming Exams */}
        <Card>
          <CardHeader
            title="Ujian Mendatang"
            subtitle={`${upcomingExams.length} ujian dalam jadwal`}
          />
          <div className="space-y-4">
            {upcomingExams.length > 0 ? (
              upcomingExamCards
            ) : (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Belum ada ujian</p>
                <p className="text-sm mt-1">Klik tombol "Buat Ujian Baru" untuk membuat ujian</p>
              </div>
            )}
            {upcomingExams.length > visibleUpcomingCount && (
              <div className="pt-2 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => setVisibleUpcomingCount((prev) => Math.min(prev + 8, upcomingExams.length))}
                >
                  Tampilkan lebih banyak ({upcomingExams.length - visibleUpcomingCount} tersisa)
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Completed Exams */}
        {completedExams.length > 0 && (
          <Card>
            <CardHeader
              title="Riwayat Ujian"
              subtitle="Ujian yang sudah selesai"
            />
            <div className="space-y-4">
              {completedExamCards}
              {completedExams.length > visibleCompletedCount && (
                <div className="pt-2 flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setVisibleCompletedCount((prev) => Math.min(prev + 6, completedExams.length))}
                  >
                    Tampilkan lebih banyak ({completedExams.length - visibleCompletedCount} tersisa)
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Create Exam Modal */}
      {isModalOpen && (
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Buat Ujian Baru"
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Judul Ujian"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Contoh: UTS Matematika Kelas XII"
            required
          />
          <Select
            label="Mata Pelajaran"
            options={[{ value: '', label: 'Pilih mata pelajaran…' }, ...subjects]}
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          />
          {/* Multi-class selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Kelas <span className="text-red-500">*</span></label>
            {classes.length === 0 ? (
              <p className="text-sm text-slate-500">Memuat kelas...</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (formData.class_ids.length === classes.length) {
                        setFormData({ ...formData, class_ids: [] });
                      } else {
                        setFormData({ ...formData, class_ids: classes.map(c => c.value) });
                      }
                    }}
                    className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium"
                  >
                    {formData.class_ids.length === classes.length ? 'Hapus Semua' : 'Pilih Semua'}
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  {['X', 'XI', 'XII'].map((grade) => {
                    const gradeClasses = classes.filter(c => c.grade_level === grade);
                    const allGradeSelected = gradeClasses.length > 0 && gradeClasses.every(c => formData.class_ids.includes(c.value));
                    if (gradeClasses.length === 0) return null;
                    return (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => {
                          if (allGradeSelected) {
                            // Deselect all classes of this grade
                            setFormData({
                              ...formData,
                              class_ids: formData.class_ids.filter(id => !gradeClasses.some(c => c.value === id))
                            });
                          } else {
                            // Select all classes of this grade (add to existing selection)
                            const newIds = new Set([...formData.class_ids, ...gradeClasses.map(c => c.value)]);
                            setFormData({ ...formData, class_ids: Array.from(newIds) });
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition-colors ${
                          allGradeSelected
                            ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {allGradeSelected ? '✓ ' : ''}Kelas {grade}
                      </button>
                    );
                  })}
                  {formData.class_ids.length > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                      ({formData.class_ids.length} kelas dipilih)
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  {classes.map((cls) => (
                    <label
                      key={cls.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-sm ${
                        formData.class_ids.includes(cls.value)
                          ? 'bg-sky-50 dark:bg-sky-900/30 border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300'
                          : 'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={formData.class_ids.includes(cls.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, class_ids: [...formData.class_ids, cls.value] });
                          } else {
                            setFormData({ ...formData, class_ids: formData.class_ids.filter(id => id !== cls.value) });
                          }
                        }}
                        className="w-4 h-4 text-sky-600 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 rounded focus:ring-sky-500"
                      />
                      <span className="font-medium">{cls.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Duration input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Durasi Ujian (menit) <span className="text-red-500">*</span></label>
            <input
              type="number"
              min={1}
              max={600}
              value={formData.duration_minutes}
              onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              placeholder="90"
              required
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Durasi pengerjaan ujian dalam menit (1-600)</p>
          </div>

          {/* Info: Admin akan mengatur jadwal */}
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0" />
              Jadwal ujian akan diatur oleh Admin saat mempublish ujian. Durasi bisa diubah di halaman edit ujian.
            </p>
          </div>

          {/* SEB Settings Section */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <h4 className="font-medium text-slate-800 dark:text-white text-sm">Safe Exam Browser (SEB)</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Wajibkan siswa menggunakan SEB untuk keamanan ujian</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={sebSettings.sebRequired}
                  onChange={(e) => setSebSettings({ ...sebSettings, sebRequired: e.target.checked })}
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-500 peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {sebSettings.sebRequired && (
              <SEBSettingsFields sebSettings={sebSettings} onChange={setSebSettings} />
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan…
                </>
              ) : (
                'Buat Ujian'
              )}
            </Button>
          </div>
        </form>
      </Modal>
      )}

      {deleteExam && (
        <ConfirmDialog
          isOpen={!!deleteExam}
          onClose={() => setDeleteExam(null)}
          onConfirm={confirmDeleteExam}
          title="Hapus Ujian"
          message={`Yakin ingin menghapus ujian "${deleteExam?.title}"? Tindakan ini tidak dapat dibatalkan.`}
          confirmText="Hapus"
          variant="danger"
        />
      )}
    </DashboardLayout>
  );
}
