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
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface Option {
  id?: number;
  text: string;
  is_correct: boolean;
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
  duration: number;
  status: string;
  start_time: string;
  end_time: string;
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
          duration: data.duration,
          status: data.status,
          start_time: data.start_time,
          end_time: data.end_time,
        });

        // Map questions
        if (data.questions) {
          const mappedQuestions = data.questions.map((q: {
            id: number;
            question_text: string;
            question_type: string;
            points: number;
            order: number;
            image?: string | null;
            options?: { id: number; option_text: string; is_correct: boolean }[];
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
        ? question.options.map(opt => ({ id: opt.id, text: opt.text, is_correct: opt.is_correct }))
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
      setQuestions(questions.filter(q => q.id !== deleteQuestionId));
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
                {exam?.subject} • {exam?.class_name} • {exam?.duration} menit
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              exam?.status === 'draft' 
                ? 'bg-slate-100 text-slate-700 dark:text-slate-300' 
                : exam?.status === 'scheduled'
                  ? 'bg-teal-50 text-teal-700'
                  : 'bg-green-100 text-green-700'
            }`}>
              {exam?.status === 'draft' ? 'Draft' : exam?.status === 'scheduled' ? 'Terjadwal' : exam?.status === 'active' ? 'Aktif' : 'Selesai'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600">{questions.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Soal</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600">
              {questions.reduce((sum, q) => sum + q.points, 0)}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Poin</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">{exam?.duration}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Durasi (menit)</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {exam?.status === 'draft' && (
            <Button onClick={() => setIsAddModalOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Tambah Soal
            </Button>
          )}
          {exam?.status === 'draft' && (
            <Button 
              variant="outline" 
              onClick={handlePublish}
              leftIcon={<Send className="w-4 h-4" />}
              className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
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
              <p className="text-sm mt-1">Klik "Tambah Soal" untuk menambah soal baru</p>
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
                              className={`flex items-center gap-2 text-sm ${
                                opt.is_correct ? 'text-green-600 font-medium' : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <span className="w-6 h-6 flex items-center justify-center rounded-full border text-xs">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              {opt.text}
                              {opt.is_correct && <CheckCircle className="w-4 h-4 text-green-500" />}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {question.question_type === 'essay' && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 italic ml-4">Jawaban Essay</p>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-0.5 bg-slate-100 rounded">
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
                            className="text-teal-600 border-teal-200 hover:bg-teal-50"
                            aria-label="Edit soal"
                          >
                            <FileEdit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteQuestion(question.id!)}
                            className="text-red-600 border-red-200 hover:bg-red-50"
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
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={option.is_correct}
                      onChange={() => handleCorrectAnswerChange(index)}
                      className="text-teal-600"
                    />
                    <span className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full font-medium">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder={`Opsi ${String.fromCharCode(65 + index)}`}
                    />
                  </div>
                ))}
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
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="editCorrectAnswer"
                      checked={option.is_correct}
                      onChange={() => handleCorrectAnswerChange(index)}
                      className="text-teal-600"
                    />
                    <span className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full font-medium">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder={`Opsi ${String.fromCharCode(65 + index)}`}
                    />
                  </div>
                ))}
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
        message="Yakin ingin mempublikasi ujian ini? Siswa akan dapat melihat ujian sesuai jadwal."
        confirmText="Publikasi"
        variant="warning"
      />
    </DashboardLayout>
  );
}
