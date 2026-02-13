'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { FileEdit, Clock, Calendar, CheckCircle, PlayCircle, AlertCircle, Plus, Loader2, Users, Trash2, Shield, Download, Zap, AlertTriangle, Info } from 'lucide-react';
import api from '@/services/api';
import { classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { downloadSEBConfig, type SEBExamSettings, DEFAULT_SEB_SETTINGS } from '@/utils/seb';

interface Exam {
  id: number;
  title: string;
  subject: string;
  class_id: number;
  class_name?: string;
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

const subjects = [
  { value: 'Bahasa Indonesia', label: 'Bahasa Indonesia' },
  { value: 'Bahasa Inggris', label: 'Bahasa Inggris' },
  { value: 'Matematika', label: 'Matematika' },
  { value: 'Fisika', label: 'Fisika' },
  { value: 'Kimia', label: 'Kimia' },
  { value: 'Biologi', label: 'Biologi' },
  { value: 'Sejarah', label: 'Sejarah' },
  { value: 'Sosiologi', label: 'Sosiologi' },
  { value: 'Ekonomi', label: 'Ekonomi' },
  { value: 'Geografi', label: 'Geografi' },
  { value: 'PKN', label: 'PKN' },
  { value: 'Informatika', label: 'Informatika' },
  { value: 'Seni Budaya', label: 'Seni Budaya' },
  { value: 'Pendidikan Agama', label: 'Pendidikan Agama' },
  { value: 'PJOK', label: 'PJOK' },
  { value: 'IPA', label: 'IPA' },
  { value: 'Pengetahuan Umum', label: 'Pengetahuan Umum' },
];

export default function UjianPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteExam, setDeleteExam] = useState<{id: number, title: string} | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'immediate' | 'scheduled'>('immediate');
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    class_id: '',
    start_time: '',
    duration: 60,
  });
  const [sebSettings, setSebSettings] = useState<SEBExamSettings>({ ...DEFAULT_SEB_SETTINGS });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch classes
      const classesRes = await classAPI.getAll();
      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );

      // Try to fetch exams
      try {
        const examsRes = await api.get('/exams');
        const examsRaw = examsRes.data?.data;
        const examsList = Array.isArray(examsRaw) ? examsRaw : (examsRaw?.data || []);
        setExams(examsList);
      } catch {
        // Exams API might not exist yet
        setExams([]);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.subject || !formData.class_id) {
      toast.warning('Mohon lengkapi semua field yang diperlukan');
      return;
    }

    if (scheduleMode === 'scheduled' && !formData.start_time) {
      toast.warning('Pilih waktu mulai ujian');
      return;
    }

    if (sebSettings.sebRequired && sebSettings.sebAllowQuit && !sebSettings.sebQuitPassword.trim()) {
      toast.warning('Password quit SEB wajib diisi agar bisa keluar dari SEB');
      return;
    }
    
    setSubmitting(true);
    try {
      // Calculate start/end times
      // For immediate mode, use a far-future placeholder — real time gets set on publish
      const startTime = scheduleMode === 'scheduled'
        ? new Date(formData.start_time)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // placeholder
      const endTime = new Date(startTime.getTime() + formData.duration * 60 * 1000);
      
      const response = await api.post('/exams', {
        title: formData.title,
        subject: formData.subject,
        class_id: parseInt(formData.class_id),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: formData.duration,
        schedule_mode: scheduleMode,
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
        class_id: '',
        start_time: '',
        duration: 60,
      });
      setScheduleMode('immediate');
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

  const now = new Date();
  const upcomingExams = exams.filter((e) => {
    // If backend says 'completed', it's not upcoming
    if (e.status === 'completed') return false;
    // If end_time has passed, treat as completed even if backend status is still 'scheduled'
    if (e.end_time && new Date(e.end_time) < now && e.status !== 'draft') return false;
    return true;
  });
  const completedExams = exams.filter((e) => {
    if (e.status === 'completed') return true;
    // Treat scheduled/active exams with passed end_time as completed
    if (e.end_time && new Date(e.end_time) < now && e.status !== 'draft') return true;
    return false;
  });

  const handleDeleteExam = (examId: number, examTitle: string) => {
    setDeleteExam({ id: examId, title: examTitle });
  };

  const confirmDeleteExam = async () => {
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
  };

  const getStatusBadge = (exam: Exam) => {
    const now = new Date();
    const endTime = exam.end_time ? new Date(exam.end_time) : null;
    const startTime = exam.start_time ? new Date(exam.start_time) : null;

    // If end_time has passed and not draft, show as "Selesai"
    if (exam.status === 'completed' || (endTime && endTime < now && exam.status !== 'draft')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 dark:text-slate-300 rounded-full text-xs">
          <CheckCircle className="w-3 h-3" />
          Selesai
        </span>
      );
    }

    // Currently active (between start and end time)
    if (startTime && endTime && now >= startTime && now <= endTime) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
          <PlayCircle className="w-3 h-3" />
          Sedang Berlangsung
        </span>
      );
    }

    if (exam.status === 'draft') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-700 dark:text-slate-300 rounded-full text-xs">
          <FileEdit className="w-3 h-3" />
          Draft
        </span>
      );
    }

    if (exam.status === 'scheduled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 text-sky-700 rounded-full text-xs">
          <Clock className="w-3 h-3" />
          Terjadwal
        </span>
      );
    }

    if (exam.status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
          <PlayCircle className="w-3 h-3" />
          Sedang Berlangsung
        </span>
      );
    }

    return null;
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
              upcomingExams.map((exam) => (
                <div
                  key={exam.id}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 hover:border-sky-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center">
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
                      <span>{exam.class_name || 'Semua Kelas'}</span>
                    </div>
                  </div>

                  {/* SEB Badge + Download */}
                  {exam.seb_required && (
                    <div className="flex items-center justify-between mb-4 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-600" />
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
                    <Link href={`/ujian/${exam.id}/monitor`} className="flex-1">
                      <Button fullWidth>
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Monitor
                      </Button>
                    </Link>
                    {(exam.status === 'draft' || exam.status === 'scheduled') && (
                      <Button
                        variant="outline"
                        onClick={() => handleDeleteExam(exam.id, exam.title)}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        aria-label="Hapus ujian"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Belum ada ujian</p>
                <p className="text-sm mt-1">Klik tombol "Buat Ujian Baru" untuk membuat ujian</p>
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
              {completedExams.map((exam) => (
                <div
                  key={exam.id}
                  className="border border-slate-200 dark:border-slate-700 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
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
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Create Exam Modal */}
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
          <Select
            label="Kelas"
            options={[{ value: '', label: 'Pilih kelas…' }, ...classes]}
            value={formData.class_id}
            onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
          />
          {/* Schedule Mode */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Waktu Mulai Ujian</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScheduleMode('immediate')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  scheduleMode === 'immediate'
                    ? 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300 ring-2 ring-teal-500/20'
                    : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Zap className="w-4 h-4" />
                Mulai Saat Publish
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('scheduled')}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  scheduleMode === 'scheduled'
                    ? 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300 ring-2 ring-teal-500/20'
                    : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Jadwalkan Waktu
              </button>
            </div>
            {scheduleMode === 'immediate' && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ujian akan dimulai otomatis saat Anda menekan tombol Publish. Buat soal terlebih dahulu tanpa khawatir waktu.
              </p>
            )}
            {scheduleMode === 'scheduled' && (
              <Input
                label="Tanggal & Jam Mulai"
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            )}
          </div>
          <Input
            label="Durasi (menit)"
            type="number"
            value={formData.duration.toString()}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 60 })}
            min={10}
            max={240}
          />

          {/* SEB Settings Section */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-blue-600" />
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
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-slate-700 dark:text-slate-300">Izinkan keluar SEB</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Siswa bisa keluar SEB dengan password</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={sebSettings.sebAllowQuit}
                      onChange={(e) => setSebSettings({ ...sebSettings, sebAllowQuit: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {sebSettings.sebAllowQuit && (
                  <div>
                    <Input
                      label="Password untuk keluar SEB *"
                      type="text"
                      value={sebSettings.sebQuitPassword}
                      onChange={(e) => setSebSettings({ ...sebSettings, sebQuitPassword: e.target.value })}
                      placeholder="Wajib diisi — password yang guru bagikan untuk keluar"
                    />
                    {!sebSettings.sebQuitPassword && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" /> Password wajib diisi agar guru/siswa bisa keluar SEB</p>
                    )}
                  </div>
                )}

                {!sebSettings.sebAllowQuit && (
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                    <p className="text-xs text-red-700 dark:text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" /><strong>Peringatan:</strong> Jika quit dinonaktifkan, tidak ada cara keluar SEB selain restart komputer! Sangat disarankan untuk mengaktifkan quit dengan password.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-700 dark:text-slate-300">Blokir screen capture</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={sebSettings.sebBlockScreenCapture}
                      onChange={(e) => setSebSettings({ ...sebSettings, sebBlockScreenCapture: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-700 dark:text-slate-300">Izinkan Virtual Machine</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={sebSettings.sebAllowVirtualMachine}
                      onChange={(e) => setSebSettings({ ...sebSettings, sebAllowVirtualMachine: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-700 dark:text-slate-300">Tampilkan taskbar SEB</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={sebSettings.sebShowTaskbar}
                      onChange={(e) => setSebSettings({ ...sebSettings, sebShowTaskbar: e.target.checked })}
                    />
                    <div className="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <Info className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />File konfigurasi SEB (.seb) dapat didownload setelah ujian dibuat. Bagikan file tersebut ke siswa untuk membuka ujian menggunakan Safe Exam Browser.
                  </p>
                </div>
              </div>
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

      <ConfirmDialog
        isOpen={!!deleteExam}
        onClose={() => setDeleteExam(null)}
        onConfirm={confirmDeleteExam}
        title="Hapus Ujian"
        message={`Yakin ingin menghapus ujian "${deleteExam?.title}"? Tindakan ini tidak dapat dibatalkan.`}
        confirmText="Hapus"
        variant="danger"
      />
    </DashboardLayout>
  );
}
