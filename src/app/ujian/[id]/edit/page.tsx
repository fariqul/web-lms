'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Modal } from '@/components/ui';
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
} from 'lucide-react';
import api from '@/services/api';

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
  const examId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<number | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
            options?: { id: number; option_text: string; is_correct: boolean }[];
          }, index: number) => ({
            id: q.id,
            question_text: q.question_text,
            question_type: q.question_type || 'multiple_choice',
            points: q.points || 10,
            order: q.order || index + 1,
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
      alert('Gagal memuat data ujian');
    } finally {
      setLoading(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.question_text.trim()) {
      alert('Teks soal tidak boleh kosong');
      return;
    }

    if (newQuestion.question_type === 'multiple_choice') {
      const hasCorrectAnswer = newQuestion.options.some(opt => opt.is_correct);
      const hasEmptyOption = newQuestion.options.some(opt => !opt.text.trim());
      
      if (!hasCorrectAnswer) {
        alert('Pilih satu jawaban yang benar');
        return;
      }
      if (hasEmptyOption) {
        alert('Semua opsi harus diisi');
        return;
      }
    }

    setSaving(true);
    try {
      const response = await api.post(`/exams/${examId}/questions`, {
        question_text: newQuestion.question_text,
        question_type: newQuestion.question_type,
        points: newQuestion.points,
        order: questions.length + 1,
        options: newQuestion.question_type === 'multiple_choice' 
          ? newQuestion.options.map((opt, idx) => ({
              option_text: opt.text,
              is_correct: opt.is_correct,
              order: idx + 1,
            }))
          : [],
      });

      if (response.data?.data) {
        await fetchExamData();
        setIsAddModalOpen(false);
        resetNewQuestion();
      }
    } catch (error) {
      console.error('Failed to add question:', error);
      alert('Gagal menambah soal');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: number) => {
    if (!confirm('Yakin ingin menghapus soal ini?')) return;

    try {
      await api.delete(`/questions/${questionId}`);
      setQuestions(questions.filter(q => q.id !== questionId));
    } catch (error) {
      console.error('Failed to delete question:', error);
      alert('Gagal menghapus soal');
    }
  };

  const handlePublish = async () => {
    if (questions.length === 0) {
      alert('Tambahkan minimal 1 soal sebelum publish');
      return;
    }

    if (!confirm('Yakin ingin mempublikasi ujian ini? Siswa akan dapat melihat ujian sesuai jadwal.')) return;

    try {
      await api.post(`/exams/${examId}/publish`);
      alert('Ujian berhasil dipublikasi');
      router.push('/ujian');
    } catch (error) {
      console.error('Failed to publish:', error);
      alert('Gagal mempublikasi ujian');
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
              <h1 className="text-2xl font-bold text-gray-900">{exam?.title}</h1>
              <p className="text-gray-600">
                {exam?.subject} • {exam?.class_name} • {exam?.duration} menit
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              exam?.status === 'draft' 
                ? 'bg-gray-100 text-gray-700' 
                : 'bg-green-100 text-green-700'
            }`}>
              {exam?.status === 'draft' ? 'Draft' : exam?.status === 'scheduled' ? 'Terjadwal' : 'Aktif'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-teal-600">{questions.length}</p>
            <p className="text-sm text-gray-600">Total Soal</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">
              {questions.reduce((sum, q) => sum + q.points, 0)}
            </p>
            <p className="text-sm text-gray-600">Total Poin</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">{exam?.duration}</p>
            <p className="text-sm text-gray-600">Durasi (menit)</p>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={() => setIsAddModalOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Soal
          </Button>
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
            <div className="text-center py-12 text-gray-500">
              <FileEdit className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium">Belum ada soal</p>
              <p className="text-sm mt-1">Klik "Tambah Soal" untuk menambah soal baru</p>
            </div>
          ) : (
            <div className="divide-y">
              {questions.map((question, index) => (
                <div key={question.id || index} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-2 text-gray-400">
                      <GripVertical className="w-5 h-5" />
                      <span className="font-bold text-lg text-gray-600">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-800 mb-2">{question.question_text}</p>
                      
                      {question.question_type === 'multiple_choice' && question.options.length > 0 && (
                        <div className="space-y-1 ml-4">
                          {question.options.map((opt, optIdx) => (
                            <div
                              key={optIdx}
                              className={`flex items-center gap-2 text-sm ${
                                opt.is_correct ? 'text-green-600 font-medium' : 'text-gray-600'
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
                        <p className="text-sm text-gray-400 italic ml-4">Jawaban Essay</p>
                      )}
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="px-2 py-0.5 bg-gray-100 rounded">
                          {question.question_type === 'multiple_choice' ? 'Pilihan Ganda' : 'Essay'}
                        </span>
                        <span>{question.points} poin</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteQuestion(question.id!)}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Teks Soal
            </label>
            <textarea
              value={newQuestion.question_text}
              onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Masukkan teks soal..."
            />
          </div>

          {/* Points */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Poin
            </label>
            <input
              type="number"
              value={newQuestion.points}
              onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) || 10 })}
              min={1}
              max={100}
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Options for Multiple Choice */}
          {newQuestion.question_type === 'multiple_choice' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
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
                    <span className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full font-medium">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <input
                      type="text"
                      value={option.text}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                  Menyimpan...
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
    </DashboardLayout>
  );
}
