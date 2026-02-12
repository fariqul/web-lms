'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { 
  HelpCircle, Plus, Search, Trash2, Edit, Copy,
  Loader2, CheckCircle, Filter, Globe, FileText, Link
} from 'lucide-react';
import { classAPI, bankQuestionAPI } from '@/services/api';
import { QuestionFormModal, QuestionFormData } from '@/components/bank-soal/QuestionFormModal';
import { TriviaImportModal } from '@/components/bank-soal/TriviaImportModal';
import { PdfImportModal } from '@/components/bank-soal/PdfImportModal';
import { UrlImportModal } from '@/components/bank-soal/UrlImportModal';

interface Question {
  id: number;
  question: string;
  type: 'pilihan_ganda' | 'essay';
  subject: string;
  class_id?: number;
  class_name?: string;
  classRoom?: { id: number; name: string };
  difficulty: 'mudah' | 'sedang' | 'sulit';
  grade_level: '10' | '11' | '12';
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  created_at: string;
}

export default function BankSoalPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPdfImportModal, setShowPdfImportModal] = useState(false);
  const [showUrlImportModal, setShowUrlImportModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState<QuestionFormData>({
    question: '',
    type: 'pilihan_ganda',
    subject: '',
    class_id: '',
    grade_level: '10',
    difficulty: 'sedang',
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [classesRes, questionsRes] = await Promise.all([
        classAPI.getAll(),
        bankQuestionAPI.getAll()
      ]);
      
      const classesData = classesRes.data?.data || [];
      setClasses(classesData.map((c: { id: number; name: string }) => ({ value: c.id.toString(), label: c.name })));
      
      const questionsData = questionsRes.data?.data || [];
      setQuestions(questionsData.map((q: Question) => ({ ...q, class_name: q.classRoom?.name || '' })));
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
      question: '', type: 'pilihan_ganda', subject: '', class_id: '',
      grade_level: '10', difficulty: 'sedang', options: ['', '', '', ''],
      correct_answer: '', explanation: '',
    });
    setEditingQuestion(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        subject: formData.subject, type: formData.type, question: formData.question,
        options: formData.type === 'pilihan_ganda' ? formData.options.filter(o => o.trim()) : undefined,
        correct_answer: formData.correct_answer,
        explanation: formData.explanation || undefined,
        difficulty: formData.difficulty, grade_level: formData.grade_level,
        class_id: formData.class_id ? parseInt(formData.class_id) : undefined,
      };
      if (editingQuestion) {
        await bankQuestionAPI.update(editingQuestion.id, payload);
      } else {
        await bankQuestionAPI.create(payload);
      }
      await fetchData();
      setShowAddModal(false);
      resetForm();
    } catch {
      toast.error('Gagal menyimpan soal. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (question: Question) => {
    setFormData({
      question: question.question, type: question.type, subject: question.subject,
      class_id: question.class_id?.toString() || '', grade_level: question.grade_level || '10',
      difficulty: question.difficulty, options: question.options || ['', '', '', ''],
      correct_answer: question.correct_answer || '', explanation: question.explanation || '',
    });
    setEditingQuestion(question);
    setShowAddModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await bankQuestionAPI.delete(deleteId);
      await fetchData();
      toast.success('Soal berhasil dihapus.');
    } catch {
      toast.error('Gagal menghapus soal.');
    } finally {
      setDeleteId(null);
    }
  };

  const handleDuplicate = async (question: Question) => {
    try {
      await bankQuestionAPI.duplicate(question.id);
      await fetchData();
    } catch {
      toast.error('Gagal menduplikasi soal.');
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'mudah': return 'bg-green-100 text-green-700';
      case 'sedang': return 'bg-yellow-100 text-yellow-700';
      case 'sulit': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700 dark:text-slate-300';
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
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bank Soal</h1>
            <p className="text-slate-600 dark:text-slate-400">Kelola koleksi soal ujian</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowPdfImportModal(true)}>
              <FileText className="w-5 h-5 mr-2" />Import PDF
            </Button>
            <Button variant="outline" onClick={() => setShowUrlImportModal(true)}>
              <Link className="w-5 h-5 mr-2" />Import URL
            </Button>
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Globe className="w-5 h-5 mr-2" />Import Online
            </Button>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
              <Plus className="w-5 h-5 mr-2" />Tambah Soal
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center"><HelpCircle className="w-5 h-5 text-sky-500" /></div>
              <div><p className="text-sm text-slate-600 dark:text-slate-400">Total Soal</p><p className="text-xl font-bold text-slate-900">{questions.length}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-green-600" /></div>
              <div><p className="text-sm text-slate-600 dark:text-slate-400">Pilihan Ganda</p><p className="text-xl font-bold text-slate-900">{questions.filter(q => q.type === 'pilihan_ganda').length}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center"><Edit className="w-5 h-5 text-purple-600" /></div>
              <div><p className="text-sm text-slate-600 dark:text-slate-400">Essay</p><p className="text-xl font-bold text-slate-900">{questions.filter(q => q.type === 'essay').length}</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center"><Filter className="w-5 h-5 text-sky-500" /></div>
              <div><p className="text-sm text-slate-600 dark:text-slate-400">Mata Pelajaran</p><p className="text-xl font-bold text-slate-900">{subjects.length}</p></div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 dark:text-slate-500" />
            <input type="text" placeholder="Cari soal…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" aria-label="Cari soal" name="searchSoal" />
          </div>
          <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" aria-label="Filter mata pelajaran" name="filterSubject">
            <option value="">Semua Mata Pelajaran</option>
            {subjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" aria-label="Filter tingkat kesulitan" name="filterDifficulty">
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
              <HelpCircle className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada soal</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Klik tombol &quot;Tambah Soal&quot; untuk membuat soal baru</p>
            </Card>
          ) : (
            filteredQuestions.map((question, index) => (
              <Card key={question.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 font-semibold text-slate-600 dark:text-slate-400">{index + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-slate-900 dark:text-white font-medium">{question.question}</p>
                        {question.type === 'pilihan_ganda' && question.options && (
                          <div className="mt-2 space-y-1">
                            {question.options.map((opt, i) => (
                              <p key={i} className={`text-sm ${opt === question.correct_answer ? 'text-green-600 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
                                {String.fromCharCode(65 + i)}. {opt} {opt === question.correct_answer && '✓'}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-3">
                          <span className="px-2 py-1 bg-sky-100 text-sky-700 text-xs rounded-full">{question.subject}</span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 dark:text-slate-400 text-xs rounded-full">{question.class_name}</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${getDifficultyColor(question.difficulty)}`}>{getDifficultyLabel(question.difficulty)}</span>
                          <span className="px-2 py-1 bg-sky-50 text-sky-500 text-xs rounded-full">{question.type === 'pilihan_ganda' ? 'Pilihan Ganda' : 'Essay'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => handleDuplicate(question)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg" title="Duplikat" aria-label="Duplikat soal"><Copy className="w-4 h-4" /></button>
                        <button onClick={() => handleEdit(question)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg" title="Edit" aria-label="Edit soal"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => setDeleteId(question.id)} className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Hapus" aria-label="Hapus soal"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Modals */}
        <QuestionFormModal
          isOpen={showAddModal}
          isEditing={!!editingQuestion}
          formData={formData}
          saving={saving}
          classes={classes}
          onFormChange={setFormData}
          onSubmit={handleSubmit}
          onClose={() => { setShowAddModal(false); resetForm(); }}
        />

        <TriviaImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportSuccess={fetchData}
        />

        <PdfImportModal
          isOpen={showPdfImportModal}
          onClose={() => setShowPdfImportModal(false)}
          onImportSuccess={fetchData}
        />

        <UrlImportModal
          isOpen={showUrlImportModal}
          onClose={() => setShowUrlImportModal(false)}
          onImportSuccess={fetchData}
        />
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Hapus Soal"
        message="Yakin ingin menghapus soal ini?"
        confirmText="Hapus"
        cancelText="Batal"
        variant="danger"
      />
    </DashboardLayout>
  );
}
