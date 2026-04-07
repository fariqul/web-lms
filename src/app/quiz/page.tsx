'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Modal, Input, Select } from '@/components/ui';
import { Plus, Loader2, Trash2, FileEdit, PlayCircle, CheckCircle, Clock, Users, BarChart3, StopCircle, AlertCircle } from 'lucide-react';
import { quizAPI, classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { Exam } from '@/types';
import { SUBJECT_OPTIONS } from '@/constants/subjects';

const subjects = SUBJECT_OPTIONS;

export default function QuizPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string; grade_level?: string }[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteQuiz, setDeleteQuiz] = useState<{ id: number; title: string; status: Exam['status'] } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'all' | 'draft' | 'active' | 'completed'>('all');

  const [form, setForm] = useState({
    title: '',
    subject: '',
    class_ids: [] as string[],
    duration_minutes: '30',
    show_result: true,
    passing_score: '0',
    shuffle_questions: false,
    shuffle_options: false,
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [classRes, quizRes] = await Promise.all([
        classAPI.getAll(),
        quizAPI.getAll(),
      ]);
      setClasses(
        (classRes.data?.data || []).map((c: { id: number; name: string; grade_level?: string }) => ({
          value: c.id.toString(),
          label: c.name,
          grade_level: c.grade_level,
        }))
      );
      const raw = quizRes.data?.data;
      setQuizzes(Array.isArray(raw) ? raw : (raw?.data || []));
    } catch {
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.subject || form.class_ids.length === 0) {
      toast.warning('Lengkapi semua field');
      return;
    }
    setSubmitting(true);
    try {
      const res = await quizAPI.create({
        title: form.title,
        subject: form.subject,
        class_ids: form.class_ids.map(Number),
        duration_minutes: parseInt(form.duration_minutes) || 30,
        show_result: form.show_result,
        passing_score: parseInt(form.passing_score) || 0,
        shuffle_questions: form.shuffle_questions,
        shuffle_options: form.shuffle_options,
      });
      const id = res.data?.data?.id;
      if (id) {
        toast.success('Quiz berhasil dibuat');
        router.push(`/quiz/${id}/edit`);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal membuat quiz');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteQuiz || deleting) return;

    if (deleteQuiz.status === 'completed' && deleteConfirmText.trim().toUpperCase() !== 'HAPUS') {
      toast.warning('Ketik HAPUS untuk konfirmasi penghapusan permanen');
      return;
    }

    setDeleting(true);
    try {
      await quizAPI.delete(deleteQuiz.id);
      toast.success('Quiz berhasil dihapus');
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menghapus quiz');
    } finally {
      setDeleting(false);
      setDeleteConfirmText('');
      setDeleteQuiz(null);
    }
  };

  const openDeleteQuizModal = (quiz: Exam) => {
    setDeleteConfirmText('');
    setDeleteQuiz({ id: quiz.id, title: quiz.title, status: quiz.status });
  };

  const handlePublish = async (quiz: Exam) => {
    try {
      await quizAPI.publish(quiz.id);
      toast.success(quiz.status === 'draft' ? 'Quiz berhasil dipublish' : 'Quiz dikembalikan ke draft');
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal mengubah status');
    }
  };

  const handleEnd = async (quiz: Exam) => {
    try {
      await quizAPI.end(quiz.id);
      toast.success('Quiz telah diakhiri');
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal mengakhiri quiz');
    }
  };

  const filtered = quizzes.filter(q => {
    if (tab === 'draft') return q.status === 'draft';
    if (tab === 'active') return q.status === 'active' || q.status === 'scheduled';
    if (tab === 'completed') return q.status === 'completed';
    return true;
  });

  const requiresPermanentConfirm = deleteQuiz?.status === 'completed';
  const permanentConfirmMatched = deleteConfirmText.trim().toUpperCase() === 'HAPUS';

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-slate-100 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', label: 'Draft' },
      scheduled: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Terjadwal' },
      active: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'Aktif' },
      completed: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Selesai' },
    };
    const s = map[status] || map.draft;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Quiz / Ujian Harian</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Buat dan kelola quiz sederhana untuk ujian harian</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Buat Quiz
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
          {([['all', 'Semua'], ['draft', 'Draft'], ['active', 'Aktif'], ['completed', 'Selesai']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === key
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs opacity-60">
                {key === 'all' ? quizzes.length : quizzes.filter(q =>
                  key === 'active' ? (q.status === 'active' || q.status === 'scheduled') : q.status === key
                ).length}
              </span>
            </button>
          ))}
        </div>

        {/* Quiz List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Belum ada quiz</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filtered.map(quiz => (
              <Card key={quiz.id} className="p-5 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="font-semibold text-slate-900 dark:text-white truncate">{quiz.title}</h3>
                      {statusBadge(quiz.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileEdit className="w-3.5 h-3.5" /> {quiz.subject}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> {quiz.duration} menit
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {quiz.classes?.map(c => c.name).join(', ') || '-'}
                      </span>
                      <span>{quiz.total_questions} soal</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {quiz.status === 'draft' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/quiz/${quiz.id}/edit`)}
                          className="gap-1.5"
                        >
                          <FileEdit className="w-3.5 h-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handlePublish(quiz)}
                          className="gap-1.5 bg-green-600 hover:bg-green-700"
                          disabled={quiz.total_questions === 0}
                        >
                          <PlayCircle className="w-3.5 h-3.5" /> Publish
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteQuizModal(quiz)}
                          className="gap-1.5 text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {(quiz.status === 'active' || quiz.status === 'scheduled') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/quiz/${quiz.id}/edit`)}
                          className="gap-1.5"
                        >
                          <FileEdit className="w-3.5 h-3.5" /> Soal
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => router.push(`/quiz/${quiz.id}/hasil`)}
                          className="gap-1.5"
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> Hasil
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePublish(quiz)}
                          className="gap-1.5 text-amber-600 border-amber-200 dark:border-amber-800"
                        >
                          Unpublish
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEnd(quiz)}
                          className="gap-1.5 text-red-500 border-red-200 dark:border-red-800"
                        >
                          <StopCircle className="w-3.5 h-3.5" /> Akhiri
                        </Button>
                      </>
                    )}
                    {quiz.status === 'completed' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => router.push(`/quiz/${quiz.id}/hasil`)}
                          className="gap-1.5"
                        >
                          <BarChart3 className="w-3.5 h-3.5" /> Lihat Hasil
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeleteQuizModal(quiz)}
                          className="gap-1.5 text-red-500 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Hapus
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Buat Quiz Baru" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Judul Quiz"
            placeholder="Contoh: Quiz Bab 1 - Kinematika"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            required
          />
          <Select
            label="Mata Pelajaran"
            options={subjects}
            value={form.subject}
            onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))}
            required
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kelas</label>
            {/* Grade Level Selection Buttons */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(['X', 'XI', 'XII'] as const).map((grade) => {
                const gradeClasses = classes.filter(c => c.grade_level === grade);
                const allSelected = gradeClasses.length > 0 && gradeClasses.every(c => form.class_ids.includes(c.value));
                return (
                  <button
                    key={grade}
                    type="button"
                    onClick={() => {
                      const gradeClassIds = gradeClasses.map(c => c.value);
                      if (allSelected) {
                        setForm(f => ({
                          ...f,
                          class_ids: f.class_ids.filter(id => !gradeClassIds.includes(id)),
                        }));
                      } else {
                        setForm(f => ({
                          ...f,
                          class_ids: [...new Set([...f.class_ids, ...gradeClassIds])],
                        }));
                      }
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                      allSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                    disabled={gradeClasses.length === 0}
                  >
                    {allSelected && <CheckCircle className="w-3.5 h-3.5" />}
                    Kelas {grade}
                    <span className="text-xs opacity-70">({gradeClasses.length})</span>
                  </button>
                );
              })}
              {form.class_ids.length > 0 && (
                <span className="px-3 py-1.5 text-sm text-slate-500 dark:text-slate-400">
                  {form.class_ids.length} kelas dipilih
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
              {classes.map(c => (
                <label key={c.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.class_ids.includes(c.value)}
                    onChange={() => {
                      setForm(f => ({
                        ...f,
                        class_ids: f.class_ids.includes(c.value)
                          ? f.class_ids.filter(id => id !== c.value)
                          : [...f.class_ids, c.value],
                      }));
                    }}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-slate-700 dark:text-slate-300">{c.label}</span>
                </label>
              ))}
            </div>
          </div>
          <Input
            label="Durasi (menit)"
            type="number"
            min="1"
            max="180"
            value={form.duration_minutes}
            onChange={(e) => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="KKM / Passing Score (%)"
              type="number"
              min="0"
              max="100"
              value={form.passing_score}
              onChange={(e) => setForm(f => ({ ...f, passing_score: e.target.value }))}
            />
            <div className="flex flex-col gap-3 pt-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.show_result}
                  onChange={(e) => setForm(f => ({ ...f, show_result: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-700 dark:text-slate-300">Tampilkan hasil ke siswa</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shuffle_questions}
                  onChange={(e) => setForm(f => ({ ...f, shuffle_questions: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-700 dark:text-slate-300">Acak soal</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.shuffle_options}
                  onChange={(e) => setForm(f => ({ ...f, shuffle_options: e.target.checked }))}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span className="text-slate-700 dark:text-slate-300">Acak opsi jawaban</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Buat & Tambah Soal
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <Modal
        isOpen={!!deleteQuiz}
        onClose={() => {
          if (!deleting) {
            setDeleteConfirmText('');
            setDeleteQuiz(null);
          }
        }}
        title={deleteQuiz?.status === 'completed' ? 'Hapus Permanen Quiz Selesai' : 'Hapus Quiz'}
        size="md"
      >
        <div className="space-y-4">
          <div className={`rounded-lg border p-4 ${
            deleteQuiz?.status === 'completed'
              ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50'
          }`}>
            <div className="flex items-start gap-3">
              <AlertCircle className={`w-5 h-5 mt-0.5 shrink-0 ${
                deleteQuiz?.status === 'completed'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`} />
              <div className="space-y-1.5">
                <p className="text-sm text-slate-800 dark:text-slate-200">
                  Yakin ingin menghapus quiz <span className="font-semibold">&quot;{deleteQuiz?.title}&quot;</span>?
                </p>
                {deleteQuiz?.status === 'completed' ? (
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    Data nilai, hasil, dan jawaban siswa akan hilang permanen.
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Tindakan ini tidak bisa dibatalkan.
                  </p>
                )}
              </div>
            </div>
          </div>

          {requiresPermanentConfirm && (
            <div className="space-y-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Untuk melanjutkan, ketik <span className="font-semibold tracking-wide">HAPUS</span> di bawah ini:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Ketik HAPUS"
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                disabled={deleting}
              />
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteConfirmText('');
                setDeleteQuiz(null);
              }}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={deleting || (requiresPermanentConfirm && !permanentConfirmMatched)}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {deleteQuiz?.status === 'completed' ? 'Hapus Permanen' : 'Hapus'}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
