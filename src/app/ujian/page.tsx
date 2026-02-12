'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Modal, Input, Select, ConfirmDialog } from '@/components/ui';
import { FileEdit, Clock, Calendar, CheckCircle, PlayCircle, AlertCircle, Plus, Loader2, Users, Trash2 } from 'lucide-react';
import api from '@/services/api';
import { classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

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
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    class_id: '',
    start_time: '',
    duration: 60,
  });

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
    
    if (!formData.title || !formData.subject || !formData.class_id || !formData.start_time) {
      toast.warning('Mohon lengkapi semua field yang diperlukan');
      return;
    }
    
    setSubmitting(true);
    try {
      // Calculate end_time based on start_time + duration
      const startTime = new Date(formData.start_time);
      const endTime = new Date(startTime.getTime() + formData.duration * 60 * 1000);
      
      const response = await api.post('/exams', {
        title: formData.title,
        subject: formData.subject,
        class_id: parseInt(formData.class_id),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_minutes: formData.duration,
      });
      
      // Redirect to edit page to add questions
      const newExamId = response.data?.data?.id;
      if (newExamId) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Ujian / CBT</h1>
            <p className="text-slate-600 dark:text-slate-400">Kelola ujian Computer Based Test</p>
          </div>
          <Button onClick={() => setIsModalOpen(true)} leftIcon={<Plus className="w-5 h-5" />}>
            Buat Ujian Baru
          </Button>
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
          <Input
            label="Waktu Mulai"
            type="datetime-local"
            value={formData.start_time}
            onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
          />
          <Input
            label="Durasi (menit)"
            type="number"
            value={formData.duration.toString()}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 60 })}
            min={10}
            max={240}
          />
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
