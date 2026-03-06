'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input, Modal, ConfirmDialog } from '@/components/ui';
import {
  Plus, Trash2, Save, ArrowLeft, Loader2, FileEdit, ImagePlus, X,
  ChevronDown, ClipboardPaste, FileSpreadsheet, FileType, BookUp, Library,
  CheckCircle, Eye,
} from 'lucide-react';
import api from '@/services/api';
import { quizAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { ImportTextModal } from '@/components/ujian/ImportTextModal';
import { ImportBankSoalModal } from '@/components/ujian/ImportBankSoalModal';
import { ImportExcelModal } from '@/components/ujian/ImportExcelModal';
import { ImportWordModal } from '@/components/ujian/ImportWordModal';
import { MathText } from '@/components/ui/MathText';

interface Option {
  text: string;
  is_correct: boolean;
  image?: string | null;
}

interface Question {
  id?: number;
  passage?: string | null;
  question_text: string;
  question_type: 'multiple_choice' | 'multiple_answer' | 'essay';
  points: number;
  order: number;
  options: Option[];
  image?: string | null;
  essay_keywords?: string[];
}

interface QuizData {
  id: number;
  title: string;
  subject: string;
  classes?: { id: number; name: string }[];
  duration: number;
  status: string;
  total_questions: number;
  show_result?: boolean;
  passing_score?: number;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
}

const BACKEND = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';

export default function EditQuizPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const quizId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [optionImageFiles, setOptionImageFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [optionImagePreviews, setOptionImagePreviews] = useState<(string | null)[]>([null, null, null, null]);
  const optionFileInputRefs = React.useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  // Import modals
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showImportText, setShowImportText] = useState(false);
  const [showImportBankSoal, setShowImportBankSoal] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [showImportWord, setShowImportWord] = useState(false);
  const importMenuRef = React.useRef<HTMLDivElement>(null);

  const [newQuestion, setNewQuestion] = useState<Question>({
    question_text: '',
    passage: '',
    question_type: 'multiple_choice',
    points: 10,
    order: 0,
    essay_keywords: [],
    options: [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  });

  useEffect(() => { fetchData(); }, [quizId]);

  // Close import menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchData = async () => {
    try {
      const res = await quizAPI.getById(quizId);
      const data = res.data?.data;
      if (data) {
        setQuiz({
          id: data.id,
          title: data.title,
          subject: data.subject,
          classes: data.classes || [],
          duration: data.duration,
          status: data.status,
          total_questions: data.total_questions,
          show_result: data.show_result,
          passing_score: data.passing_score,
          shuffle_questions: data.shuffle_questions,
          shuffle_options: data.shuffle_options,
        });

        const qs = (data.questions || []).map((q: Record<string, unknown>) => ({
          id: q.id as number,
          question_text: q.question_text as string,
          question_type: (q.type || q.question_type || 'multiple_choice') as Question['question_type'],
          points: (q.points as number) || 10,
          order: (q.order as number) || 0,
          passage: q.passage as string | null,
          image: q.image as string | null,
          options: ((q.options || []) as { text: string; is_correct?: boolean; image?: string | null }[]).map((o, i) => ({
            text: o.text || '',
            is_correct: q.type === 'multiple_choice'
              ? o.text === q.correct_answer
              : q.type === 'multiple_answer'
              ? (() => { try { const ca = JSON.parse(q.correct_answer as string); return Array.isArray(ca) && ca.map((s: string) => s.toLowerCase()).includes(o.text.toLowerCase()); } catch { return false; } })()
              : i === 0,
            image: o.image || null,
          })),
          essay_keywords: (q.essay_keywords as string[]) || [],
        }));
        setQuestions(qs);
      }
    } catch {
      toast.error('Gagal memuat quiz');
    } finally {
      setLoading(false);
    }
  };

  const resetQuestionForm = () => {
    setNewQuestion({
      question_text: '',
      passage: '',
      question_type: 'multiple_choice',
      points: 10,
      order: 0,
      essay_keywords: [],
      options: [
        { text: '', is_correct: true },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ],
    });
    setImageFile(null);
    setImagePreview(null);
    setOptionImageFiles([null, null, null, null]);
    setOptionImagePreviews([null, null, null, null]);
  };

  const handleSaveQuestion = async (isEdit = false) => {
    if (!newQuestion.question_text.trim()) {
      toast.warning('Teks soal wajib diisi');
      return;
    }

    const needsOptions = ['multiple_choice', 'multiple_answer'].includes(newQuestion.question_type);
    if (needsOptions) {
      const hasCorrect = newQuestion.options.some(o => o.is_correct);
      if (!hasCorrect) { toast.warning('Pilih minimal 1 jawaban benar'); return; }
      const filledOpts = newQuestion.options.filter(o => o.text.trim());
      if (filledOpts.length < 2) { toast.warning('Minimal 2 opsi jawaban'); return; }
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('question_text', newQuestion.question_text);
      formData.append('question_type', newQuestion.question_type);
      formData.append('points', String(newQuestion.points));
      if (newQuestion.passage) formData.append('passage', newQuestion.passage);

      if (imageFile) {
        formData.append('image', imageFile);
      }

      if (needsOptions) {
        newQuestion.options.forEach((opt, idx) => {
          formData.append(`options[${idx}][option_text]`, opt.text);
          formData.append(`options[${idx}][is_correct]`, opt.is_correct ? '1' : '0');
          if (optionImageFiles[idx]) {
            formData.append(`options[${idx}][image]`, optionImageFiles[idx]!);
          }
        });
      }

      if (newQuestion.question_type === 'essay' && newQuestion.essay_keywords?.length) {
        newQuestion.essay_keywords.forEach((kw, i) => {
          formData.append(`essay_keywords[${i}]`, kw);
        });
      }

      if (isEdit && editingQuestion !== null) {
        await quizAPI.updateQuestion(editingQuestion, formData);
        toast.success('Soal berhasil diperbarui');
        setIsEditModalOpen(false);
      } else {
        await quizAPI.addQuestion(quizId, formData);
        toast.success('Soal berhasil ditambahkan');
        setIsAddModalOpen(false);
      }

      resetQuestionForm();
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menyimpan soal');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (deleteQuestionId === null) return;
    try {
      await quizAPI.deleteQuestion(deleteQuestionId);
      toast.success('Soal berhasil dihapus');
      fetchData();
    } catch {
      toast.error('Gagal menghapus soal');
    } finally {
      setDeleteQuestionId(null);
    }
  };

  const openEditQuestion = (q: Question) => {
    setEditingQuestion(q.id || null);
    setNewQuestion({ ...q });
    const existingImage = q.image ? `/storage/${q.image}` : null;
    setImagePreview(existingImage);
    setImageFile(null);
    const optPreviews = (q.options || []).map(o => o.image ? `/storage/${o.image}` : null);
    setOptionImagePreviews([...optPreviews, ...Array(4 - optPreviews.length).fill(null)]);
    setOptionImageFiles([null, null, null, null]);
    setIsEditModalOpen(true);
  };

  const handleBulkImport = async (importedQuestions: {
    question_text: string;
    question_type: 'multiple_choice' | 'multiple_answer' | 'essay';
    points: number;
    passage?: string | null;
    image?: string | null;
    essay_keywords?: string[] | null;
    options: { text: string; is_correct: boolean; image?: string | null }[];
  }[]) => {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < importedQuestions.length; i++) {
      const q = importedQuestions[i];
      try {
        const formData = new FormData();
        formData.append('question_text', q.question_text);
        formData.append('question_type', q.question_type);
        formData.append('points', String(q.points));
        formData.append('order', String(questions.length + successCount + 1));

        if (q.passage) {
          formData.append('passage', q.passage);
        }
        if (q.image) {
          formData.append('image_path', q.image);
        }
        if (q.question_type === 'essay' && q.essay_keywords && q.essay_keywords.length > 0) {
          q.essay_keywords.forEach((kw, idx) => {
            formData.append(`essay_keywords[${idx}]`, kw);
          });
        }

        if (q.question_type === 'multiple_choice' || q.question_type === 'multiple_answer') {
          q.options.forEach((opt, idx) => {
            formData.append(`options[${idx}][option_text]`, opt.text);
            formData.append(`options[${idx}][is_correct]`, opt.is_correct ? '1' : '0');
            formData.append(`options[${idx}][order]`, String(idx + 1));
            if (opt.image) {
              formData.append(`options[${idx}][image_path]`, opt.image);
            }
          });
        }

        await api.post(`/quizzes/${quizId}/questions`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    await fetchData();
    if (failCount === 0) {
      toast.success(`${successCount} soal berhasil diimpor`);
    } else {
      toast.warning(`${successCount} soal berhasil, ${failCount} gagal diimpor`);
    }
  };

  const handlePublish = async () => {
    if (!quiz) return;
    try {
      await quizAPI.publish(quiz.id);
      toast.success(quiz.status === 'draft' ? 'Quiz berhasil dipublish' : 'Quiz dikembalikan ke draft');
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal mengubah status');
    }
  };

  // Question form component
  const QuestionForm = ({ isEdit = false }: { isEdit?: boolean }) => (
    <div className="space-y-4">
      {/* Question type */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tipe Soal</label>
        <select
          value={newQuestion.question_type}
          onChange={(e) => {
            const t = e.target.value as Question['question_type'];
            setNewQuestion(q => ({
              ...q,
              question_type: t,
              options: t === 'essay' ? [] : (q.options.length ? q.options : [
                { text: '', is_correct: true },
                { text: '', is_correct: false },
                { text: '', is_correct: false },
                { text: '', is_correct: false },
              ]),
              essay_keywords: t === 'essay' ? (q.essay_keywords || []) : [],
            }));
          }}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="multiple_choice">Pilihan Ganda</option>
          <option value="multiple_answer">PG Kompleks (Banyak Jawaban)</option>
          <option value="essay">Essay</option>
        </select>
      </div>

      {/* Passage */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Teks Bacaan (opsional)</label>
        <textarea
          rows={2}
          value={newQuestion.passage || ''}
          onChange={(e) => setNewQuestion(q => ({ ...q, passage: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
          placeholder="Teks bacaan yang sama bisa dipakai untuk beberapa soal..."
        />
      </div>

      {/* Question text */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Soal *</label>
        <textarea
          rows={3}
          value={newQuestion.question_text}
          onChange={(e) => setNewQuestion(q => ({ ...q, question_text: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
          placeholder="Tulis soal... (mendukung LaTeX: $x^2$)"
          required
        />
      </div>

      {/* Image upload */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Gambar (opsional)</label>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="w-4 h-4 mr-1" /> Pilih Gambar
          </Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }
          }} />
          {imagePreview && (
            <div className="relative">
              <img src={imagePreview} alt="" className="h-16 rounded border" />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Points */}
      <Input
        label="Poin"
        type="number"
        min="1"
        value={String(newQuestion.points)}
        onChange={(e) => setNewQuestion(q => ({ ...q, points: parseInt(e.target.value) || 10 }))}
      />

      {/* Options for MC / Multiple Answer */}
      {['multiple_choice', 'multiple_answer'].includes(newQuestion.question_type) && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Opsi Jawaban {newQuestion.question_type === 'multiple_answer' && '(centang semua yang benar)'}
          </label>
          <div className="space-y-2">
            {newQuestion.options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {newQuestion.question_type === 'multiple_choice' ? (
                  <input
                    type="radio"
                    name="correct"
                    checked={opt.is_correct}
                    onChange={() => setNewQuestion(q => ({
                      ...q,
                      options: q.options.map((o, i) => ({ ...o, is_correct: i === idx })),
                    }))}
                    className="text-indigo-600"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={opt.is_correct}
                    onChange={() => setNewQuestion(q => ({
                      ...q,
                      options: q.options.map((o, i) => i === idx ? { ...o, is_correct: !o.is_correct } : o),
                    }))}
                    className="rounded text-indigo-600"
                  />
                )}
                <span className="text-sm font-medium text-slate-500 w-6">{String.fromCharCode(65 + idx)}.</span>
                <input
                  type="text"
                  value={opt.text}
                  onChange={(e) => setNewQuestion(q => ({
                    ...q,
                    options: q.options.map((o, i) => i === idx ? { ...o, text: e.target.value } : o),
                  }))}
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder={`Opsi ${String.fromCharCode(65 + idx)}`}
                />
                <button
                  type="button"
                  onClick={() => optionFileInputRefs.current[idx]?.click()}
                  className="p-1.5 text-slate-400 hover:text-slate-600"
                  title="Tambah gambar opsi"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>
                <input
                  ref={el => { optionFileInputRefs.current[idx] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const files = [...optionImageFiles];
                      const previews = [...optionImagePreviews];
                      files[idx] = f;
                      previews[idx] = URL.createObjectURL(f);
                      setOptionImageFiles(files);
                      setOptionImagePreviews(previews);
                    }
                  }}
                />
                {optionImagePreviews[idx] && (
                  <div className="relative">
                    <img src={optionImagePreviews[idx]!} alt="" className="h-8 rounded border" />
                    <button onClick={() => {
                      const files = [...optionImageFiles]; files[idx] = null; setOptionImageFiles(files);
                      const previews = [...optionImagePreviews]; previews[idx] = null; setOptionImagePreviews(previews);
                    }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )}
                {newQuestion.options.length > 2 && (
                  <button onClick={() => setNewQuestion(q => ({
                    ...q,
                    options: q.options.filter((_, i) => i !== idx),
                  }))} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {newQuestion.options.length < 6 && (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setNewQuestion(q => ({
              ...q,
              options: [...q.options, { text: '', is_correct: false }],
            }))}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Opsi
            </Button>
          )}
        </div>
      )}

      {/* Essay keywords */}
      {newQuestion.question_type === 'essay' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kata Kunci Essay (opsional, untuk auto-grading)</label>
          <div className="space-y-1.5">
            {(newQuestion.essay_keywords || []).map((kw, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={kw}
                  onChange={(e) => {
                    const kws = [...(newQuestion.essay_keywords || [])];
                    kws[idx] = e.target.value;
                    setNewQuestion(q => ({ ...q, essay_keywords: kws }));
                  }}
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  placeholder="Kata kunci..."
                />
                <button onClick={() => setNewQuestion(q => ({
                  ...q,
                  essay_keywords: (q.essay_keywords || []).filter((_, i) => i !== idx),
                }))} className="text-red-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setNewQuestion(q => ({
            ...q,
            essay_keywords: [...(q.essay_keywords || []), ''],
          }))}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Kata Kunci
          </Button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (!quiz) {
    return (
      <DashboardLayout>
        <Card className="p-12 text-center">
          <p className="text-slate-500">Quiz tidak ditemukan</p>
          <Button className="mt-4" onClick={() => router.push('/quiz')}>Kembali</Button>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => router.push('/quiz')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{quiz.title}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {quiz.subject} — {quiz.classes?.map(c => c.name).join(', ')} — {quiz.duration} menit
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {quiz.status === 'draft' && questions.length > 0 && (
              <Button onClick={handlePublish} className="gap-1.5 bg-green-600 hover:bg-green-700">
                <CheckCircle className="w-4 h-4" /> Publish Quiz
              </Button>
            )}
            {(quiz.status === 'active' || quiz.status === 'scheduled') && (
              <Button variant="outline" onClick={handlePublish} className="gap-1.5 text-amber-600">
                Unpublish
              </Button>
            )}
          </div>
        </div>

        {/* Actions bar */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => { resetQuestionForm(); setIsAddModalOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> Tambah Soal
            </Button>

            {/* Import dropdown */}
            <div className="relative" ref={importMenuRef}>
              <Button variant="outline" onClick={() => setShowImportMenu(!showImportMenu)} className="gap-1.5">
                <ChevronDown className="w-4 h-4" /> Import Soal
              </Button>
              {showImportMenu && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 z-20 py-1">
                  <button onClick={() => { setShowImportWord(true); setShowImportMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                    <FileType className="w-4 h-4 text-blue-500" /> Import dari Word
                  </button>
                  <button onClick={() => { setShowImportExcel(true); setShowImportMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-green-500" /> Import dari Excel
                  </button>
                  <button onClick={() => { setShowImportText(true); setShowImportMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                    <ClipboardPaste className="w-4 h-4 text-amber-500" /> Import dari Teks
                  </button>
                  <button onClick={() => { setShowImportBankSoal(true); setShowImportMenu(false); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
                    <Library className="w-4 h-4 text-purple-500" /> Import dari Bank Soal
                  </button>
                </div>
              )}
            </div>

            <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">
              {questions.length} soal
            </span>
          </div>
        </Card>

        {/* Questions list */}
        {questions.length === 0 ? (
          <Card className="p-12 text-center">
            <FileEdit className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Belum ada soal. Tambah soal pertama!</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id || idx} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex gap-3">
                  <div className="flex items-start pt-0.5">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            q.question_type === 'essay'
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                              : q.question_type === 'multiple_answer'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          }`}>
                            {q.question_type === 'essay' ? 'Essay' : q.question_type === 'multiple_answer' ? 'PG Kompleks' : 'PG'}
                          </span>
                          <span className="text-[10px] text-slate-400">{q.points} poin</span>
                        </div>
                        <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                          <MathText text={q.question_text} />
                        </div>
                        {q.image && (
                          <img src={`/storage/${q.image}`} alt="" className="mt-1.5 h-16 rounded border" />
                        )}
                        {q.question_type !== 'essay' && q.options.length > 0 && (
                          <div className="mt-2 space-y-0.5">
                            {q.options.map((o, oi) => (
                              <div key={oi} className={`text-xs flex items-center gap-1.5 ${
                                o.is_correct
                                  ? 'text-green-600 dark:text-green-400 font-medium'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}>
                                {o.is_correct ? <CheckCircle className="w-3 h-3" /> : <span className="w-3 h-3 inline-block" />}
                                {String.fromCharCode(65 + oi)}. <MathText text={o.text} />
                              </div>
                            ))}
                          </div>
                        )}
                        {q.question_type === 'essay' && q.essay_keywords && q.essay_keywords.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {q.essay_keywords.map((kw, ki) => (
                              <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditQuestion(q)} className="p-1.5 text-slate-400 hover:text-indigo-500 transition-colors" title="Edit">
                          <FileEdit className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteQuestionId(q.id || null)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Hapus">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Question Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Tambah Soal" size="lg">
        <QuestionForm />
        <div className="flex justify-end gap-3 mt-4 pt-3 border-t dark:border-slate-700">
          <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Batal</Button>
          <Button onClick={() => handleSaveQuestion(false)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan
          </Button>
        </div>
      </Modal>

      {/* Edit Question Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Soal" size="lg">
        <QuestionForm isEdit />
        <div className="flex justify-end gap-3 mt-4 pt-3 border-t dark:border-slate-700">
          <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Batal</Button>
          <Button onClick={() => handleSaveQuestion(true)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan
          </Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteQuestionId !== null}
        onClose={() => setDeleteQuestionId(null)}
        onConfirm={handleDeleteQuestion}
        title="Hapus Soal"
        message="Yakin ingin menghapus soal ini?"
        confirmText="Hapus"
        variant="danger"
      />

      {/* Import Modals - reuse from exam components */}
      <ImportTextModal
        isOpen={showImportText}
        onClose={() => setShowImportText(false)}
        onImport={handleBulkImport}
        existingCount={questions.length}
      />
      <ImportBankSoalModal
        isOpen={showImportBankSoal}
        onClose={() => setShowImportBankSoal(false)}
        onImport={handleBulkImport}
        existingCount={questions.length}
      />
      <ImportExcelModal
        isOpen={showImportExcel}
        onClose={() => setShowImportExcel(false)}
        onImport={handleBulkImport}
        existingCount={questions.length}
      />
      <ImportWordModal
        isOpen={showImportWord}
        onClose={() => setShowImportWord(false)}
        onImport={handleBulkImport}
        existingCount={questions.length}
      />
    </DashboardLayout>
  );
}
