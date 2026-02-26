'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Modal, ConfirmDialog } from '@/components/ui';
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  GripVertical,
  CheckCircle,
  Loader2,
  FileEdit,
  Eye,
  Send,
  ImagePlus,
  X,
  Shield,
  Download,
  Zap,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ClipboardPaste,
  Library,
  Copy,
  FileSpreadsheet,
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { downloadSEBConfig, type SEBExamSettings, DEFAULT_SEB_SETTINGS } from '@/utils/seb';
import { ImportTextModal } from '@/components/ujian/ImportTextModal';
import { ImportBankSoalModal } from '@/components/ujian/ImportBankSoalModal';
import { DuplicateExamModal } from '@/components/ujian/DuplicateExamModal';
import { ImportExcelModal } from '@/components/ujian/ImportExcelModal';

interface Option {
  id?: number;
  text: string;
  is_correct: boolean;
  image?: string | null;
}

interface Question {
  id?: number;
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  order: number;
  options: Option[];
  image?: string | null;
}

interface ExamData {
  id: number;
  title: string;
  subject: string;
  class_name?: string;
  classes?: { id: number; name: string }[];
  duration: number;
  status: string;
  start_time: string;
  end_time: string;
  seb_required?: boolean;
  seb_allow_quit?: boolean;
  seb_quit_password?: string;
  seb_block_screen_capture?: boolean;
  seb_allow_virtual_machine?: boolean;
  seb_show_taskbar?: boolean;
}

export default function EditSoalPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const examId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [optionImageFiles, setOptionImageFiles] = useState<(File | null)[]>([null, null, null, null]);
  const [optionImagePreviews, setOptionImagePreviews] = useState<(string | null)[]>([null, null, null, null]);
  const optionFileInputRefs = React.useRef<(HTMLInputElement | null)[]>([null, null, null, null]);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showImportText, setShowImportText] = useState(false);
  const [showImportBankSoal, setShowImportBankSoal] = useState(false);
  const [showDuplicateExam, setShowDuplicateExam] = useState(false);
  const [showImportExcel, setShowImportExcel] = useState(false);
  const importMenuRef = React.useRef<HTMLDivElement>(null);
  const [sebSettings, setSebSettings] = useState<SEBExamSettings>({ ...DEFAULT_SEB_SETTINGS });
  const [savingSeb, setSavingSeb] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Question>({
    question_text: '',
    question_type: 'multiple_choice',
    points: 10,
    order: 0,
    options: [
      { text: '', is_correct: true },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
      { text: '', is_correct: false },
    ],
  });

  useEffect(() => {
    fetchExamData();
  }, [examId]);

  const fetchExamData = async () => {
    try {
      const response = await api.get(`/exams/${examId}`);
      const data = response.data?.data;
      
      if (data) {
        setExam({
          id: data.id,
          title: data.title,
          subject: data.subject,
          class_name: data.class?.name,
          classes: data.classes || [],
          duration: data.duration,
          status: data.status,
          start_time: data.start_time,
          end_time: data.end_time,
          seb_required: data.seb_required ?? false,
          seb_allow_quit: data.seb_allow_quit ?? true,
          seb_quit_password: data.seb_quit_password ?? '',
          seb_block_screen_capture: data.seb_block_screen_capture ?? true,
          seb_allow_virtual_machine: data.seb_allow_virtual_machine ?? false,
          seb_show_taskbar: data.seb_show_taskbar ?? true,
        });

        // Initialize SEB settings from API, with localStorage fallback
        const storedSeb = localStorage.getItem(`seb_settings_${data.id}`);
        const localSeb = storedSeb ? JSON.parse(storedSeb) as SEBExamSettings : null;
        
        const hasSebFromApi = data.seb_required === true;
        
        if (hasSebFromApi) {
          setSebSettings({
            sebRequired: true,
            sebAllowQuit: data.seb_allow_quit ?? true,
            sebQuitPassword: data.seb_quit_password ?? '',
            sebBlockScreenCapture: data.seb_block_screen_capture ?? true,
            sebAllowVirtualMachine: data.seb_allow_virtual_machine ?? false,
            sebShowTaskbar: data.seb_show_taskbar ?? true,
          });
        } else if (localSeb) {
          setSebSettings(localSeb);
        } else {
          setSebSettings({ ...DEFAULT_SEB_SETTINGS });
        }

        // Map questions
        if (data.questions) {
          const mappedQuestions = data.questions.map((q: {
            id: number;
            question_text: string;
            question_type: string;
            points: number;
            order: number;
            image?: string | null;
            options?: { id: number; option_text: string; is_correct: boolean; image?: string | null }[];
          }, index: number) => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type || 'multiple_choice',
            points: q.points || 10,
            order: q.order || index + 1,
            image: q.image || null,
            options: q.options?.map((opt) => ({
              id: opt.id,
              text: opt.option_text,
              is_correct: opt.is_correct,
              image: opt.image || null,
            })) || [],
          }));
          setQuestions(mappedQuestions);
        }
      }
    } catch (error) {
      console.error('Failed to fetch exam:', error);
      toast.error('Gagal memuat data ujian');
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.question_text.trim()) {
      toast.warning('Teks soal tidak boleh kosong');
      return;
    }

    if (newQuestion.question_type === 'multiple_choice') {
      const hasCorrectAnswer = newQuestion.options.some(opt => opt.is_correct);
      const hasEmptyOption = newQuestion.options.some(opt => !opt.text.trim());
      
      if (!hasCorrectAnswer) {
        toast.warning('Pilih satu jawaban yang benar');
        return;
      }
      if (hasEmptyOption) {
        toast.warning('Semua opsi harus diisi');
        return;
      }
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('question_text', newQuestion.question_text);
      formData.append('question_type', newQuestion.question_type);
      formData.append('points', String(newQuestion.points));
      formData.append('order', String(questions.length + 1));
      
      if (imageFile) {
        formData.append('image', imageFile);
      }

      if (newQuestion.question_type === 'multiple_choice') {
        newQuestion.options.forEach((opt, idx) => {
          formData.append(`options[${idx}][option_text]`, opt.text);
          formData.append(`options[${idx}][is_correct]`, opt.is_correct ? '1' : '0');
          formData.append(`options[${idx}][order]`, String(idx + 1));
          if (optionImageFiles[idx]) {
            formData.append(`options[${idx}][image]`, optionImageFiles[idx]!);
          }
        });
      }

      const response = await api.post(`/exams/${examId}/questions`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data?.data) {
        await fetchExamData();
        setIsAddModalOpen(false);
        resetNewQuestion();
      }
    } catch (error) {
      console.error('Failed to add question:', error);
      toast.error('Gagal menambah soal');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = (questionId: number) => {
    setDeleteQuestionId(questionId);
  };

  const handleEditQuestion = (question: Question) => {
    setNewQuestion({
      id: question.id,
      question_text: question.question_text,
      question_type: question.question_type,
      points: question.points,
      order: question.order,
      options: question.question_type === 'multiple_choice' && question.options.length > 0
        ? question.options.map(opt => ({ id: opt.id, text: opt.text, is_correct: opt.is_correct, image: opt.image || null }))
        : [
            { text: '', is_correct: true },
            { text: '', is_correct: false },
            { text: '', is_correct: false },
            { text: '', is_correct: false },
          ],
    });
    // Show existing image preview
    if (question.image) {
      const imgUrl = question.image.startsWith('http')
        ? question.image
        : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${question.image}`;
      setImagePreview(imgUrl);
    } else {
      setImagePreview(null);
    }
    setImageFile(null);
    // Load existing option image previews
    const optPreviews = question.options.map(opt => {
      if (opt.image) {
        return opt.image.startsWith('http')
          ? opt.image
          : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${opt.image}`;
      }
      return null;
    });
    setOptionImagePreviews(optPreviews);
    setOptionImageFiles(new Array(question.options.length).fill(null));
    setEditingQuestion(question.id!);
    setIsEditModalOpen(true);
  };

  const handleSaveEditQuestion = async () => {
    if (!newQuestion.question_text.trim()) {
      toast.warning('Teks soal tidak boleh kosong');
      return;
    }

    if (newQuestion.question_type === 'multiple_choice') {
      const hasCorrectAnswer = newQuestion.options.some(opt => opt.is_correct);
      const hasEmptyOption = newQuestion.options.some(opt => !opt.text.trim());
      if (!hasCorrectAnswer) {
        toast.warning('Pilih satu jawaban yang benar');
        return;
      }
      if (hasEmptyOption) {
        toast.warning('Semua opsi harus diisi');
        return;
      }
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('question_text', newQuestion.question_text);
      formData.append('question_type', newQuestion.question_type);
      formData.append('points', String(newQuestion.points));
      formData.append('_method', 'PUT');

      if (imageFile) {
        formData.append('image', imageFile);
      }

      // If image was removed (preview is null and no new file)
      if (!imagePreview && !imageFile) {
        formData.append('remove_image', '1');
      }

      if (newQuestion.question_type === 'multiple_choice') {
        newQuestion.options.forEach((opt, idx) => {
          formData.append(`options[${idx}][option_text]`, opt.text);
          formData.append(`options[${idx}][is_correct]`, opt.is_correct ? '1' : '0');
          formData.append(`options[${idx}][order]`, String(idx + 1));
          if (optionImageFiles[idx]) {
            formData.append(`options[${idx}][image]`, optionImageFiles[idx]!);
          } else if (opt.image) {
            // Keep existing image
            formData.append(`options[${idx}][existing_image]`, opt.image);
          }
          // If image was removed (had image before but now preview is null and no new file)
          if (!optionImagePreviews[idx] && !optionImageFiles[idx] && opt.image) {
            formData.append(`options[${idx}][remove_image]`, '1');
          }
        });
      }

      await api.post(`/questions/${editingQuestion}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Soal berhasil diupdate');
      await fetchExamData();
      setIsEditModalOpen(false);
      setEditingQuestion(null);
      resetNewQuestion();
    } catch (error) {
      console.error('Failed to update question:', error);
      toast.error('Gagal mengupdate soal');
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteQuestion = async () => {
    if (deleteQuestionId === null) return;
    try {
      await api.delete(`/questions/${deleteQuestionId}`);
      // Remove deleted question and renumber remaining ones sequentially
      const remaining = questions
        .filter(q => q.id !== deleteQuestionId)
        .map((q, idx) => ({ ...q, order: idx + 1 }));
      setQuestions(remaining);
    } catch (error) {
      console.error('Failed to delete question:', error);
      toast.error('Gagal menghapus soal');
    } finally {
      setDeleteQuestionId(null);
    }
  };

  const handlePublish = () => {
    if (questions.length === 0) {
      toast.warning('Tambahkan minimal 1 soal sebelum publish');
      return;
    }
    setShowPublishConfirm(true);
  };

  const confirmPublish = async () => {
    try {
      // If exam start_time is a far-future placeholder (immediate mode),
      // update it to NOW before publishing
      if (exam?.start_time) {
        const startTime = new Date(exam.start_time);
        const now = new Date();
        // If start_time is more than 30 days from now, it was set as "immediate" placeholder
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
      toast.success('Ujian berhasil dipublikasi');
      router.push('/ujian');
    } catch (error) {
      console.error('Failed to publish:', error);
      toast.error('Gagal mempublikasi ujian');
    } finally {
      setShowPublishConfirm(false);
    }
  };

  const resetNewQuestion = () => {
    setNewQuestion({
      question_text: '',
      question_type: 'multiple_choice',
      points: 10,
      order: 0,
      options: [
        { text: '', is_correct: true },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ],
    });
    setImageFile(null);
    setImagePreview(null);
    setOptionImageFiles(new Array(4).fill(null));
    setOptionImagePreviews(new Array(4).fill(null));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Close import menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setShowImportMenu(false);
      }
    };
    if (showImportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showImportMenu]);

  // Bulk import handler — creates questions one by one via API
  const handleBulkImport = async (importedQuestions: {
    question_text: string;
    question_type: 'multiple_choice' | 'essay';
    points: number;
    options: { text: string; is_correct: boolean }[];
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

        if (q.question_type === 'multiple_choice') {
          q.options.forEach((opt, idx) => {
            formData.append(`options[${idx}][option_text]`, opt.text);
            formData.append(`options[${idx}][is_correct]`, opt.is_correct ? '1' : '0');
            formData.append(`options[${idx}][order]`, String(idx + 1));
          });
        }

        await api.post(`/exams/${examId}/questions`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    // Refresh questions list
    await fetchExamData();

    if (failCount === 0) {
      toast.success(`${successCount} soal berhasil diimpor`);
    } else {
      toast.warning(`${successCount} soal berhasil, ${failCount} gagal diimpor`);
    }
  };

  const handleSaveSebSettings = async () => {
    if (sebSettings.sebRequired && sebSettings.sebAllowQuit && !sebSettings.sebQuitPassword.trim()) {
      toast.warning('Password quit SEB wajib diisi agar bisa keluar dari SEB');
      return;
    }
    setSavingSeb(true);
    try {
      // Save to backend
      await api.put(`/exams/${examId}`, {
        seb_required: sebSettings.sebRequired,
        seb_allow_quit: sebSettings.sebAllowQuit,
        seb_quit_password: sebSettings.sebQuitPassword || '',
        seb_block_screen_capture: sebSettings.sebBlockScreenCapture,
        seb_allow_virtual_machine: sebSettings.sebAllowVirtualMachine,
        seb_show_taskbar: sebSettings.sebShowTaskbar,
      });
      
      // Also save to localStorage as fallback
      if (sebSettings.sebRequired) {
        localStorage.setItem(`seb_settings_${examId}`, JSON.stringify(sebSettings));
      } else {
        localStorage.removeItem(`seb_settings_${examId}`);
      }
      
      // Update local exam state
      setExam(prev => prev ? {
        ...prev,
        seb_required: sebSettings.sebRequired,
        seb_allow_quit: sebSettings.sebAllowQuit,
        seb_quit_password: sebSettings.sebQuitPassword,
        seb_block_screen_capture: sebSettings.sebBlockScreenCapture,
        seb_allow_virtual_machine: sebSettings.sebAllowVirtualMachine,
        seb_show_taskbar: sebSettings.sebShowTaskbar,
      } : null);
      
      toast.success('Pengaturan SEB berhasil disimpan');
    } catch {
      toast.error('Gagal menyimpan pengaturan SEB');
    } finally {
      setSavingSeb(false);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const updatedOptions = [...newQuestion.options];
    updatedOptions[index].text = value;
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const handleCorrectAnswerChange = (index: number) => {
    const updatedOptions = newQuestion.options.map((opt, i) => ({
      ...opt,
      is_correct: i === index,
    }));
    setNewQuestion({ ...newQuestion, options: updatedOptions });
  };

  const handleAddOption = () => {
    if (newQuestion.options.length >= 8) {
      toast.warning('Maksimal 8 opsi jawaban');
      return;
    }
    setNewQuestion({
      ...newQuestion,
      options: [...newQuestion.options, { text: '', is_correct: false }],
    });
    setOptionImageFiles(prev => [...prev, null]);
    setOptionImagePreviews(prev => [...prev, null]);
  };

  const handleRemoveOption = (index: number) => {
    if (newQuestion.options.length <= 2) {
      toast.warning('Minimal 2 opsi jawaban');
      return;
    }
    const wasCorrect = newQuestion.options[index].is_correct;
    const updatedOptions = newQuestion.options.filter((_, i) => i !== index);
    // If removed option was the correct one, set first option as correct
    if (wasCorrect && updatedOptions.length > 0) {
      updatedOptions[0].is_correct = true;
    }
    setNewQuestion({ ...newQuestion, options: updatedOptions });
    setOptionImageFiles(prev => prev.filter((_, i) => i !== index));
    setOptionImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
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
            <Button variant="outline" onClick={() => router.push('/ujian')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{exam?.title}</h1>
              <p className="text-slate-600 dark:text-slate-400">
                {exam?.subject} • {exam?.classes && exam.classes.length > 0 ? exam.classes.map((c: { id: number; name: string }) => c.name).join(', ') : exam?.class_name} • {exam?.duration} menit
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              exam?.status === 'draft' 
                ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300' 
                : exam?.status === 'scheduled'
                  ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
            }`}>
              {exam?.status === 'draft' ? 'Draft' : exam?.status === 'scheduled' ? 'Terjadwal' : exam?.status === 'active' ? 'Aktif' : 'Selesai'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">{questions.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Soal</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">
              {questions.reduce((sum, q) => sum + q.points, 0)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Poin</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{exam?.duration}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Durasi (menit)</p>
          </Card>
        </div>

        {/* Schedule Info Banner */}
        {exam?.status === 'draft' && (
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            exam?.start_time && new Date(exam.start_time).getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000
              ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
              : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
          }`}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              exam?.start_time && new Date(exam.start_time).getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000
                ? 'bg-teal-100 dark:bg-teal-800/40' : 'bg-amber-100 dark:bg-amber-800/40'
            }`}>
              {exam?.start_time && new Date(exam.start_time).getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000
                ? <Zap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                : <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              }
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">
                {exam?.start_time && new Date(exam.start_time).getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000
                  ? 'Mulai saat publish'
                  : `Dijadwalkan: ${new Date(exam.start_time).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })}`
                }
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {exam?.start_time && new Date(exam.start_time).getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000
                  ? 'Ujian akan langsung aktif saat Anda menekan Publish. Selesaikan soal terlebih dahulu.'
                  : 'Ujian akan aktif sesuai jadwal setelah dipublish.'
                }
              </p>
            </div>
          </div>
        )}

        {/* SEB Settings Panel */}
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-slate-800 dark:text-white text-sm">Safe Exam Browser (SEB)</h3>
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
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-700">
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
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password untuk keluar SEB <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={sebSettings.sebQuitPassword}
                    onChange={(e) => setSebSettings({ ...sebSettings, sebQuitPassword: e.target.value })}
                    placeholder="Wajib diisi — password yang guru bagikan untuk keluar"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => {
                    if (!exam) return;
                    downloadSEBConfig(exam.title, exam.id, sebSettings);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download .seb
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-700">
            <button
              onClick={handleSaveSebSettings}
              disabled={savingSeb}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {savingSeb ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Simpan Pengaturan SEB
            </button>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 flex-wrap">
          {exam?.status === 'draft' && (
            <Button onClick={() => setIsAddModalOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Soal
            </Button>
          )}
          {exam?.status === 'draft' && (
            <div className="relative" ref={importMenuRef}>
              <button
                onClick={() => setShowImportMenu(!showImportMenu)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-xl transition-colors"
              >
                <Download className="w-4 h-4" />
                Import Soal
                <ChevronDown className={`w-4 h-4 transition-transform ${showImportMenu ? 'rotate-180' : ''}`} />
              </button>

              {showImportMenu && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 z-50 overflow-hidden">
                  <div className="p-1.5">
                    <button
                      onClick={() => { setShowImportText(true); setShowImportMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 group-hover:bg-violet-200 dark:group-hover:bg-violet-800/40 transition-colors">
                        <ClipboardPaste className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-800 dark:text-white">Tempel Teks</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Copy-paste soal format teks</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setShowImportBankSoal(true); setShowImportMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
                        <Library className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-800 dark:text-white">Bank Soal</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Pilih dari koleksi bank soal</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setShowDuplicateExam(true); setShowImportMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 group-hover:bg-amber-200 dark:group-hover:bg-amber-800/40 transition-colors">
                        <Copy className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-800 dark:text-white">Duplikat Ujian</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Salin soal dari ujian lain</p>
                      </div>
                    </button>

                    <button
                      onClick={() => { setShowImportExcel(true); setShowImportMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/40 transition-colors">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium text-slate-800 dark:text-white">Excel / CSV</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Upload file spreadsheet</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {exam?.status === 'draft' && (
            <Button 
              variant="outline" 
              onClick={handlePublish}
              leftIcon={<Send className="w-4 h-4" />}
              className="bg-green-50 dark:bg-green-900/20 border-green-300 text-green-700 dark:text-green-400 hover:bg-green-100"
            >
              Publish Ujian
            </Button>
          )}
        </div>

        {/* Questions List */}
        <Card>
          <CardHeader 
            title="Daftar Soal" 
            subtitle={`${questions.length} soal telah ditambahkan`}
          />
          
          {questions.length === 0 ? (
            <div className="text-center py-12 text-slate-600 dark:text-slate-400">
              <FileEdit className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Belum ada soal</p>
              <p className="text-sm mt-1">Tambah soal manual atau gunakan Import Soal untuk menambah lebih cepat</p>
            </div>
          ) : (
            <div className="divide-y">
              {questions.map((question, index) => (
                <div key={question.id || index} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <GripVertical className="w-5 h-5" />
                      <span className="font-bold text-lg text-slate-600 dark:text-slate-400">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-slate-800 dark:text-white mb-2">{question.question_text}</p>
                      
                      {question.image && (
                        <div className="mb-3">
                          <img
                            src={question.image.startsWith('http') ? question.image : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${question.image}`}
                            alt="Gambar Soal"
                            className="max-w-xs max-h-40 rounded-lg border border-slate-200 dark:border-slate-700"
                          />
                        </div>
                      )}
                      
                      {question.question_type === 'multiple_choice' && question.options.length > 0 && (
                        <div className="space-y-1 ml-4">
                          {question.options.map((opt, optIdx) => (
                            <div
                              key={optIdx}
                              className={`flex items-start gap-2 text-sm ${
                                opt.is_correct ? 'text-green-600 dark:text-green-400 font-medium' : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <span className="w-6 h-6 flex items-center justify-center rounded-full border text-xs shrink-0 mt-0.5">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <div className="flex-1">
                                <span>{opt.text}</span>
                                {opt.image && (
                                  <img
                                    src={opt.image.startsWith('http') ? opt.image : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${opt.image}`}
                                    alt={`Gambar opsi ${String.fromCharCode(65 + optIdx)}`}
                                    className="mt-1 max-w-[200px] max-h-24 rounded border border-slate-200 dark:border-slate-700"
                                  />
                                )}
                              </div>
                              {opt.is_correct && <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {question.question_type === 'essay' && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 italic ml-4">Jawaban Essay</p>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700/50 rounded">
                          {question.question_type === 'multiple_choice' ? 'Pilihan Ganda' : 'Essay'}
                        </span>
                        <span>{question.points} poin</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {exam?.status === 'draft' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditQuestion(question)}
                            className="text-teal-600 border-teal-200 dark:border-teal-800/50 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                            aria-label="Edit soal"
                          >
                            <FileEdit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteQuestion(question.id!)}
                            className="text-red-600 border-red-200 dark:border-red-800/50 hover:bg-red-50"
                            aria-label="Hapus soal"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add Question Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          resetNewQuestion();
        }}
        title="Tambah Soal Baru"
        size="lg"
      >
        <div className="space-y-4">
          {/* Question Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipe Soal
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="questionType"
                  checked={newQuestion.question_type === 'multiple_choice'}
                  onChange={() => setNewQuestion({ ...newQuestion, question_type: 'multiple_choice' })}
                  className="text-teal-600"
                />
                <span>Pilihan Ganda</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="questionType"
                  checked={newQuestion.question_type === 'essay'}
                  onChange={() => setNewQuestion({ ...newQuestion, question_type: 'essay' })}
                  className="text-teal-600"
                />
                <span>Essay</span>
              </label>
            </div>
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Teks Soal
            </label>
            <textarea
              value={newQuestion.question_text}
              onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Masukkan teks soal…"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Gambar Soal (Opsional)
            </label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-w-xs max-h-48 rounded-lg border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  aria-label="Hapus gambar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
              >
                <ImagePlus className="w-8 h-8 text-slate-600 dark:text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Klik untuk upload gambar</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">PNG, JPG, max 5MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) {
                    toast.warning('Ukuran gambar maksimal 5MB');
                    return;
                  }
                  setImageFile(file);
                  const reader = new FileReader();
                  reader.onloadend = () => setImagePreview(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>

          {/* Points */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Poin
            </label>
            <input
              type="number"
              value={newQuestion.points}
              onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) || 10 })}
              min={1}
              max={100}
              className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Options for Multiple Choice */}
          {newQuestion.question_type === 'multiple_choice' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Pilihan Jawaban (Pilih yang benar)
              </label>
              <div className="space-y-3">
                {newQuestion.options.map((option, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="correctAnswer"
                        checked={option.is_correct}
                        onChange={() => handleCorrectAnswerChange(index)}
                        className="text-teal-600"
                      />
                      <span className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700/50 rounded-full font-medium text-sm">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder={`Opsi ${String.fromCharCode(65 + index)}`}
                      />
                      <button
                        type="button"
                        onClick={() => optionFileInputRefs.current[index]?.click()}
                        className={`p-2 rounded-lg border transition-colors ${
                          optionImagePreviews[index]
                            ? 'border-teal-300 bg-teal-50 dark:bg-teal-900/20 text-teal-600'
                            : 'border-slate-300 hover:border-teal-400 hover:bg-teal-50 text-slate-400 hover:text-teal-600'
                        }`}
                        title="Upload gambar untuk opsi ini"
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      {newQuestion.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(index)}
                          className="p-2 rounded-lg border border-slate-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title="Hapus opsi ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <input
                        ref={(el) => { optionFileInputRefs.current[index] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.warning('Ukuran gambar maksimal 5MB');
                              return;
                            }
                            const newFiles = [...optionImageFiles];
                            newFiles[index] = file;
                            setOptionImageFiles(newFiles);
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const newPreviews = [...optionImagePreviews];
                              newPreviews[index] = reader.result as string;
                              setOptionImagePreviews(newPreviews);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                    {optionImagePreviews[index] && (
                      <div className="ml-14 relative inline-block">
                        <img
                          src={optionImagePreviews[index]!}
                          alt={`Preview opsi ${String.fromCharCode(65 + index)}`}
                          className="max-w-[200px] max-h-32 rounded-lg border border-slate-200 dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newFiles = [...optionImageFiles];
                            newFiles[index] = null;
                            setOptionImageFiles(newFiles);
                            const newPreviews = [...optionImagePreviews];
                            newPreviews[index] = null;
                            setOptionImagePreviews(newPreviews);
                            if (optionFileInputRefs.current[index]) optionFileInputRefs.current[index]!.value = '';
                          }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                          aria-label="Hapus gambar opsi"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {newQuestion.options.length} opsi • Klik ikon gambar untuk menambahkan gambar pada opsi
                </p>
                {newQuestion.options.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Opsi
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                resetNewQuestion();
              }}
            >
              Batal
            </Button>
            <Button onClick={handleAddQuestion} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Soal
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Question Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingQuestion(null);
          resetNewQuestion();
        }}
        title="Edit Soal"
        size="lg"
      >
        <div className="space-y-4">
          {/* Question Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Tipe Soal
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="editQuestionType"
                  checked={newQuestion.question_type === 'multiple_choice'}
                  onChange={() => setNewQuestion({ ...newQuestion, question_type: 'multiple_choice' })}
                  className="text-teal-600"
                />
                <span>Pilihan Ganda</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="editQuestionType"
                  checked={newQuestion.question_type === 'essay'}
                  onChange={() => setNewQuestion({ ...newQuestion, question_type: 'essay' })}
                  className="text-teal-600"
                />
                <span>Essay</span>
              </label>
            </div>
          </div>

          {/* Question Text */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Teks Soal
            </label>
            <textarea
              value={newQuestion.question_text}
              onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Masukkan teks soal…"
            />
          </div>

          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Gambar Soal (Opsional)
            </label>
            {imagePreview ? (
              <div className="relative inline-block">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-w-xs max-h-48 rounded-lg border border-slate-200 dark:border-slate-700"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  aria-label="Hapus gambar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
              >
                <ImagePlus className="w-8 h-8 text-slate-600 dark:text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Klik untuk upload gambar</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">PNG, JPG, max 5MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 5 * 1024 * 1024) {
                    toast.warning('Ukuran gambar maksimal 5MB');
                    return;
                  }
                  setImageFile(file);
                  const reader = new FileReader();
                  reader.onloadend = () => setImagePreview(reader.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>

          {/* Points */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Poin
            </label>
            <input
              type="number"
              value={newQuestion.points}
              onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) || 10 })}
              min={1}
              max={100}
              className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Options for Multiple Choice */}
          {newQuestion.question_type === 'multiple_choice' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Pilihan Jawaban (Pilih yang benar)
              </label>
              <div className="space-y-3">
                {newQuestion.options.map((option, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="editCorrectAnswer"
                        checked={option.is_correct}
                        onChange={() => handleCorrectAnswerChange(index)}
                        className="text-teal-600"
                      />
                      <span className="w-8 h-8 flex items-center justify-center bg-slate-100 dark:bg-slate-700/50 rounded-full font-medium">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder={`Opsi ${String.fromCharCode(65 + index)}`}
                      />
                      <button
                        type="button"
                        onClick={() => optionFileInputRefs.current[index]?.click()}
                        className={`p-2 rounded-lg border transition-colors ${
                          optionImagePreviews[index]
                            ? 'border-teal-300 bg-teal-50 dark:bg-teal-900/20 text-teal-600'
                            : 'border-slate-300 hover:border-teal-400 hover:bg-teal-50 text-slate-400 hover:text-teal-600'
                        }`}
                        title="Upload gambar untuk opsi ini"
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      {newQuestion.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(index)}
                          className="p-2 rounded-lg border border-slate-300 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                          title="Hapus opsi ini"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <input
                        ref={(el) => { optionFileInputRefs.current[index] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              toast.warning('Ukuran gambar maksimal 5MB');
                              return;
                            }
                            const newFiles = [...optionImageFiles];
                            newFiles[index] = file;
                            setOptionImageFiles(newFiles);
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const newPreviews = [...optionImagePreviews];
                              newPreviews[index] = reader.result as string;
                              setOptionImagePreviews(newPreviews);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </div>
                    {optionImagePreviews[index] && (
                      <div className="ml-14 relative inline-block">
                        <img
                          src={optionImagePreviews[index]!}
                          alt={`Preview opsi ${String.fromCharCode(65 + index)}`}
                          className="max-w-[200px] max-h-32 rounded-lg border border-slate-200 dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newFiles = [...optionImageFiles];
                            newFiles[index] = null;
                            setOptionImageFiles(newFiles);
                            const newPreviews = [...optionImagePreviews];
                            newPreviews[index] = null;
                            setOptionImagePreviews(newPreviews);
                            // Also clear the image from options state
                            const updatedOptions = [...newQuestion.options];
                            updatedOptions[index] = { ...updatedOptions[index], image: null };
                            setNewQuestion({ ...newQuestion, options: updatedOptions });
                            if (optionFileInputRefs.current[index]) optionFileInputRefs.current[index]!.value = '';
                          }}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                          aria-label="Hapus gambar opsi"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {newQuestion.options.length} opsi • Klik ikon gambar untuk menambahkan gambar pada opsi
                </p>
                {newQuestion.options.length < 8 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:text-teal-700 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Opsi
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingQuestion(null);
                resetNewQuestion();
              }}
            >
              Batal
            </Button>
            <Button onClick={handleSaveEditQuestion} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Simpan Perubahan
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteQuestionId !== null}
        onClose={() => setDeleteQuestionId(null)}
        onConfirm={confirmDeleteQuestion}
        title="Hapus Soal"
        message="Yakin ingin menghapus soal ini?"
        confirmText="Hapus"
        variant="danger"
      />

      <ConfirmDialog
        isOpen={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        onConfirm={confirmPublish}
        title="Publikasi Ujian"
        message={
          exam?.start_time && new Date(exam.start_time).getTime() - Date.now() > 30 * 24 * 60 * 60 * 1000
            ? 'Ujian akan langsung dimulai sekarang saat Anda menekan Publikasi. Pastikan semua soal sudah lengkap.'
            : `Yakin ingin mempublikasi ujian ini? Ujian dijadwalkan mulai ${exam?.start_time ? new Date(exam.start_time).toLocaleString('id-ID') : '-'}.`
        }
        confirmText="Publikasi"
        variant="warning"
      />

      {/* Import Modals */}
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

      <DuplicateExamModal
        isOpen={showDuplicateExam}
        onClose={() => setShowDuplicateExam(false)}
        onImport={handleBulkImport}
        currentExamId={examId}
        existingCount={questions.length}
      />

      <ImportExcelModal
        isOpen={showImportExcel}
        onClose={() => setShowImportExcel(false)}
        onImport={handleBulkImport}
        existingCount={questions.length}
      />
    </DashboardLayout>
  );
}
