'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input } from '@/components/ui';
import { 
  HelpCircle, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  Copy,
  X,
  Loader2,
  CheckCircle,
  Filter
} from 'lucide-react';
import { classAPI } from '@/services/api';

interface Question {
  id: number;
  question: string;
  type: 'pilihan_ganda' | 'essay';
  subject: string;
  class_name: string;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  options?: string[];
  correct_answer?: string;
  created_at: string;
}

export default function BankSoalPage() {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState({
    question: '',
    type: 'pilihan_ganda' as 'pilihan_ganda' | 'essay',
    subject: '',
    class_id: '',
    difficulty: 'sedang' as 'mudah' | 'sedang' | 'sulit',
    options: ['', '', '', ''],
    correct_answer: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const classesRes = await classAPI.getAll();
      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );
      // Questions would come from API
      setQuestions([]);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const subjects = [...new Set(questions.map(q => q.subject))];

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.question.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSubject = !filterSubject || q.subject === filterSubject;
    const matchesDifficulty = !filterDifficulty || q.difficulty === filterDifficulty;
    return matchesSearch && matchesSubject && matchesDifficulty;
  });

  const resetForm = () => {
    setFormData({
      question: '',
      type: 'pilihan_ganda',
      subject: '',
      class_id: '',
      difficulty: 'sedang',
      options: ['', '', '', ''],
      correct_answer: '',
    });
    setEditingQuestion(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClass = classes.find(c => c.value === formData.class_id);
    
    if (editingQuestion) {
      setQuestions(questions.map(q => 
        q.id === editingQuestion.id
          ? {
              ...q,
              question: formData.question,
              type: formData.type,
              subject: formData.subject,
              class_name: selectedClass?.label || '',
              difficulty: formData.difficulty,
              options: formData.type === 'pilihan_ganda' ? formData.options : undefined,
              correct_answer: formData.correct_answer,
            }
          : q
      ));
    } else {
      const newQuestion: Question = {
        id: Date.now(),
        question: formData.question,
        type: formData.type,
        subject: formData.subject,
        class_name: selectedClass?.label || '',
        difficulty: formData.difficulty,
        options: formData.type === 'pilihan_ganda' ? formData.options : undefined,
        correct_answer: formData.correct_answer,
        created_at: new Date().toISOString().split('T')[0],
      };
      setQuestions([newQuestion, ...questions]);
    }
    
    setShowAddModal(false);
    resetForm();
  };

  const handleEdit = (question: Question) => {
    setFormData({
      question: question.question,
      type: question.type,
      subject: question.subject,
      class_id: classes.find(c => c.label === question.class_name)?.value || '',
      difficulty: question.difficulty,
      options: question.options || ['', '', '', ''],
      correct_answer: question.correct_answer || '',
    });
    setEditingQuestion(question);
    setShowAddModal(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Yakin ingin menghapus soal ini?')) {
      setQuestions(questions.filter(q => q.id !== id));
    }
  };

  const handleDuplicate = (question: Question) => {
    const duplicate: Question = {
      ...question,
      id: Date.now(),
      question: `${question.question} (Copy)`,
      created_at: new Date().toISOString().split('T')[0],
    };
    setQuestions([duplicate, ...questions]);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'mudah': return 'bg-green-100 text-green-700';
      case 'sedang': return 'bg-yellow-100 text-yellow-700';
      case 'sulit': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'mudah': return 'Mudah';
      case 'sedang': return 'Sedang';
      case 'sulit': return 'Sulit';
      default: return difficulty;
    }
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
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bank Soal</h1>
            <p className="text-gray-600">Kelola koleksi soal ujian</p>
          </div>
          <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
            <Plus className="w-5 h-5 mr-2" />
            Tambah Soal
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <HelpCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Soal</p>
                <p className="text-xl font-bold text-gray-900">{questions.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pilihan Ganda</p>
                <p className="text-xl font-bold text-gray-900">
                  {questions.filter(q => q.type === 'pilihan_ganda').length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <Edit className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Essay</p>
                <p className="text-xl font-bold text-gray-900">
                  {questions.filter(q => q.type === 'essay').length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                <Filter className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Mata Pelajaran</p>
                <p className="text-xl font-bold text-gray-900">{subjects.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari soal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">Semua Mata Pelajaran</option>
            {subjects.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          >
            <option value="">Semua Tingkat</option>
            <option value="mudah">Mudah</option>
            <option value="sedang">Sedang</option>
            <option value="sulit">Sulit</option>
          </select>
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {filteredQuestions.length === 0 ? (
            <Card className="p-8 text-center">
              <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Belum ada soal</p>
              <p className="text-sm text-gray-400 mt-1">Klik tombol "Tambah Soal" untuk membuat soal baru</p>
            </Card>
          ) : (
            filteredQuestions.map((question, index) => (
              <Card key={question.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 font-semibold text-gray-600">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-gray-900 font-medium">{question.question}</p>
                        {question.type === 'pilihan_ganda' && question.options && (
                          <div className="mt-2 space-y-1">
                            {question.options.map((opt, i) => (
                              <p key={i} className={`text-sm ${opt === question.correct_answer ? 'text-green-600 font-medium' : 'text-gray-500'}`}>
                                {String.fromCharCode(65 + i)}. {opt} {opt === question.correct_answer && '✓'}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-full">
                            {question.subject}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            {question.class_name}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${getDifficultyColor(question.difficulty)}`}>
                            {getDifficultyLabel(question.difficulty)}
                          </span>
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">
                            {question.type === 'pilihan_ganda' ? 'Pilihan Ganda' : 'Essay'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleDuplicate(question)}
                          className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                          title="Duplikat"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(question)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(question.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-lg font-semibold">
                  {editingQuestion ? 'Edit Soal' : 'Tambah Soal Baru'}
                </h2>
                <button onClick={() => { setShowAddModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pertanyaan</label>
                  <textarea
                    value={formData.question}
                    onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                    placeholder="Tuliskan pertanyaan..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Soal</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'pilihan_ganda' | 'essay' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="pilihan_ganda">Pilihan Ganda</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kesulitan</label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'mudah' | 'sedang' | 'sulit' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    >
                      <option value="mudah">Mudah</option>
                      <option value="sedang">Sedang</option>
                      <option value="sulit">Sulit</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Mata Pelajaran"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="Contoh: Informatika"
                    required
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kelas</label>
                    <select
                      value={formData.class_id}
                      onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      required
                    >
                      <option value="">Pilih Kelas</option>
                      {classes.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {formData.type === 'pilihan_ganda' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Pilihan Jawaban</label>
                      <div className="space-y-2">
                        {formData.options.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                              {String.fromCharCode(65 + i)}
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const newOptions = [...formData.options];
                                newOptions[i] = e.target.value;
                                setFormData({ ...formData, options: newOptions });
                              }}
                              placeholder={`Pilihan ${String.fromCharCode(65 + i)}`}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Jawaban Benar</label>
                      <select
                        value={formData.correct_answer}
                        onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        required
                      >
                        <option value="">Pilih jawaban benar</option>
                        {formData.options.map((opt, i) => opt && (
                          <option key={i} value={opt}>
                            {String.fromCharCode(65 + i)}. {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {formData.type === 'essay' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Kunci Jawaban (opsional)</label>
                    <textarea
                      value={formData.correct_answer}
                      onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                      placeholder="Tuliskan kunci jawaban atau pedoman penilaian..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowAddModal(false); resetForm(); }}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1">
                    {editingQuestion ? 'Simpan Perubahan' : 'Simpan Soal'}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
