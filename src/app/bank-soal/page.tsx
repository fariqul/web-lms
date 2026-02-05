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
  Filter,
  Download,
  Globe,
  RefreshCw,
  FileText,
  Upload,
  Link,
  AlertCircle,
  Eye
} from 'lucide-react';
import { classAPI, bankQuestionAPI, pdfImportAPI, urlImportAPI } from '@/services/api';

// Open Trivia DB Categories
const TRIVIA_CATEGORIES = [
  { id: 9, name: 'Pengetahuan Umum', subject: 'Pengetahuan Umum' },
  { id: 17, name: 'Sains & Alam', subject: 'IPA' },
  { id: 18, name: 'Komputer', subject: 'Informatika' },
  { id: 19, name: 'Matematika', subject: 'Matematika' },
  { id: 22, name: 'Geografi', subject: 'Geografi' },
  { id: 23, name: 'Sejarah', subject: 'Sejarah' },
  { id: 24, name: 'Politik', subject: 'PKN' },
  { id: 25, name: 'Seni', subject: 'Seni Budaya' },
  { id: 27, name: 'Hewan', subject: 'Biologi' },
];

interface TriviaQuestion {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

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

// Subject list for dropdown
const SUBJECTS = [
  'Bahasa Indonesia', 'Matematika', 'Biologi', 'Kimia', 'Fisika',
  'Sejarah', 'Sosiologi', 'Ekonomi', 'Geografi', 'PKN',
  'Bahasa Inggris', 'Informatika', 'Seni Budaya', 'Pengetahuan Umum', 'IPA'
];

export default function BankSoalPage() {
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
  const [importLoading, setImportLoading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState({
    question: '',
    type: 'pilihan_ganda' as 'pilihan_ganda' | 'essay',
    subject: '',
    class_id: '',
    grade_level: '10' as '10' | '11' | '12',
    difficulty: 'sedang' as 'mudah' | 'sedang' | 'sulit',
    options: ['', '', '', ''],
    correct_answer: '',
    explanation: '',
  });
  
  // Import form state
  const [importData, setImportData] = useState({
    category: 18, // Default: Computer Science
    amount: 10,
    difficulty: '', // empty = any
    grade_level: '10' as '10' | '11' | '12',
  });
  
  // PDF Import state
  const [pdfImportData, setPdfImportData] = useState({
    file: null as File | null,
    answerKeyFile: null as File | null,
    format: 'general',
    subject: '',
    grade_level: '10' as '10' | '11' | '12',
    difficulty: 'sedang' as 'mudah' | 'sedang' | 'sulit',
    source: '',
  });
  const [pdfParseResult, setPdfParseResult] = useState<{
    questions: Array<{
      number: number;
      question: string;
      options: string[];
      correct_answer: string | null;
    }>;
    detected_subject: string | null;
    metadata: Record<string, string>;
  } | null>(null);
  const [pdfImportStep, setPdfImportStep] = useState<'upload' | 'preview' | 'importing'>('upload');

  // URL Import state
  const [urlImportData, setUrlImportData] = useState({
    url: '',
    subject: '',
    grade_level: '10' as '10' | '11' | '12',
    difficulty: 'sedang' as 'mudah' | 'sedang' | 'sulit',
  });
  const [urlPreviewResult, setUrlPreviewResult] = useState<{
    topic: string;
    url: string;
    total_questions: number;
    questions: Array<{
      number: number;
      question: string;
      options: Record<string, string>;
      answer: string | null;
      explanation: string | null;
    }>;
  } | null>(null);
  const [urlImportStep, setUrlImportStep] = useState<'input' | 'preview' | 'importing'>('input');
  const [selectedUrlQuestions, setSelectedUrlQuestions] = useState<number[]>([]);

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
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );
      
      const questionsData = questionsRes.data?.data || [];
      setQuestions(questionsData.map((q: Question) => ({
        ...q,
        class_name: q.classRoom?.name || '',
      })));
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
      grade_level: '10',
      difficulty: 'sedang',
      options: ['', '', '', ''],
      correct_answer: '',
      explanation: '',
    });
    setEditingQuestion(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const payload = {
        subject: formData.subject,
        type: formData.type,
        question: formData.question,
        options: formData.type === 'pilihan_ganda' ? formData.options.filter(o => o.trim()) : undefined,
        correct_answer: formData.correct_answer,
        explanation: formData.explanation || undefined,
        difficulty: formData.difficulty,
        grade_level: formData.grade_level,
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
    } catch (error) {
      console.error('Failed to save question:', error);
      alert('Gagal menyimpan soal. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (question: Question) => {
    setFormData({
      question: question.question,
      type: question.type,
      subject: question.subject,
      class_id: question.class_id?.toString() || '',
      grade_level: question.grade_level || '10',
      difficulty: question.difficulty,
      options: question.options || ['', '', '', ''],
      correct_answer: question.correct_answer || '',
      explanation: question.explanation || '',
    });
    setEditingQuestion(question);
    setShowAddModal(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm('Yakin ingin menghapus soal ini?')) {
      try {
        await bankQuestionAPI.delete(id);
        await fetchData();
      } catch (error) {
        console.error('Failed to delete question:', error);
        alert('Gagal menghapus soal.');
      }
    }
  };

  const handleDuplicate = async (question: Question) => {
    try {
      await bankQuestionAPI.duplicate(question.id);
      await fetchData();
    } catch (error) {
      console.error('Failed to duplicate question:', error);
      alert('Gagal menduplikasi soal.');
    }
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

  // Helper function to decode HTML entities from API
  const decodeHtmlEntities = (text: string): string => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  // Map API difficulty to local difficulty
  const mapDifficulty = (apiDifficulty: string): 'mudah' | 'sedang' | 'sulit' => {
    switch (apiDifficulty) {
      case 'easy': return 'mudah';
      case 'medium': return 'sedang';
      case 'hard': return 'sulit';
      default: return 'sedang';
    }
  };

  // Shuffle array helper
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Import questions from Open Trivia Database
  const handleImportFromTrivia = async () => {
    setImportLoading(true);
    
    try {
      let url = `https://opentdb.com/api.php?amount=${importData.amount}&category=${importData.category}&type=multiple`;
      if (importData.difficulty) {
        url += `&difficulty=${importData.difficulty}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.response_code !== 0) {
        let errorMsg = 'Gagal mengambil soal dari Open Trivia Database.';
        if (data.response_code === 1) {
          errorMsg = 'Tidak cukup soal tersedia untuk kategori ini. Coba kurangi jumlah soal.';
        } else if (data.response_code === 2) {
          errorMsg = 'Parameter tidak valid.';
        }
        alert(errorMsg);
        return;
      }
      
      const categoryInfo = TRIVIA_CATEGORIES.find(c => c.id === importData.category);
      
      // Prepare questions for bulk import
      const questionsToImport = data.results.map((item: TriviaQuestion) => {
        const allOptions = shuffleArray([
          decodeHtmlEntities(item.correct_answer),
          ...item.incorrect_answers.map(decodeHtmlEntities)
        ]);
        
        const correctAnswer = decodeHtmlEntities(item.correct_answer);
        
        return {
          question: decodeHtmlEntities(item.question),
          type: 'pilihan_ganda' as const,
          subject: categoryInfo?.subject || 'Umum',
          difficulty: mapDifficulty(item.difficulty),
          grade_level: importData.grade_level,
          options: allOptions,
          correct_answer: correctAnswer,
          explanation: `Jawaban yang benar adalah "${correctAnswer}". (Sumber: Open Trivia Database - ${item.category})`,
        };
      });
      
      // Save to database via API
      await bankQuestionAPI.bulkCreate(questionsToImport);
      
      await fetchData();
      setShowImportModal(false);
      alert(`Berhasil mengimpor ${questionsToImport.length} soal!`);
    } catch (error) {
      console.error('Import error:', error);
      alert('Terjadi kesalahan saat mengimpor soal. Pastikan koneksi internet Anda stabil.');
    } finally {
      setImportLoading(false);
    }
  };

  // PDF Import handlers
  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPdfImportData(prev => ({ ...prev, file }));
    }
  };

  const handleAnswerKeyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPdfImportData(prev => ({ ...prev, answerKeyFile: file }));
    }
  };

  const handleParsePdf = async () => {
    if (!pdfImportData.file) {
      alert('Pilih file PDF terlebih dahulu');
      return;
    }

    setImportLoading(true);
    try {
      const response = await pdfImportAPI.parsePdf(
        pdfImportData.file,
        pdfImportData.format,
        pdfImportData.answerKeyFile || undefined
      );

      if (response.data?.success && response.data?.data) {
        setPdfParseResult(response.data.data);
        setPdfImportStep('preview');
        
        // Auto-set subject if detected
        if (response.data.data.detected_subject) {
          setPdfImportData(prev => ({ 
            ...prev, 
            subject: response.data.data.detected_subject 
          }));
        }
      } else {
        alert(response.data?.message || 'Gagal memproses PDF');
      }
    } catch (error: any) {
      console.error('PDF parse error:', error);
      const errorMessage = error?.response?.data?.message || error?.message || 'Terjadi kesalahan saat memproses PDF';
      alert(errorMessage);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportPdfQuestions = async () => {
    if (!pdfParseResult || pdfParseResult.questions.length === 0) {
      alert('Tidak ada soal untuk diimpor');
      return;
    }

    if (!pdfImportData.subject) {
      alert('Pilih mata pelajaran terlebih dahulu');
      return;
    }

    // Check if all questions have answers
    const questionsWithAnswers = pdfParseResult.questions.filter(q => q.correct_answer);
    if (questionsWithAnswers.length === 0) {
      alert('Tidak ada soal dengan kunci jawaban. Upload file kunci jawaban atau edit manual.');
      return;
    }

    setPdfImportStep('importing');
    setImportLoading(true);

    try {
      const response = await pdfImportAPI.importQuestions({
        questions: questionsWithAnswers.map(q => ({
          number: q.number,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer!,
          difficulty: pdfImportData.difficulty,
        })),
        subject: pdfImportData.subject,
        grade_level: pdfImportData.grade_level,
        difficulty: pdfImportData.difficulty,
        source: pdfImportData.source || 'PDF Import',
      });

      if (response.data?.success) {
        await fetchData();
        setShowPdfImportModal(false);
        resetPdfImport();
        alert(`Berhasil mengimpor ${response.data.data.imported} soal!`);
      } else {
        alert(response.data?.message || 'Gagal mengimpor soal');
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Terjadi kesalahan saat mengimpor soal');
    } finally {
      setImportLoading(false);
    }
  };

  const resetPdfImport = () => {
    setPdfImportData({
      file: null,
      answerKeyFile: null,
      format: 'general',
      subject: '',
      grade_level: '10',
      difficulty: 'sedang',
      source: '',
    });
    setPdfParseResult(null);
    setPdfImportStep('upload');
  };

  const updateParsedQuestionAnswer = (index: number, answer: string) => {
    if (pdfParseResult) {
      const newQuestions = [...pdfParseResult.questions];
      newQuestions[index] = { ...newQuestions[index], correct_answer: answer };
      setPdfParseResult({ ...pdfParseResult, questions: newQuestions });
    }
  };

  // URL Import handlers
  const handleUrlPreview = async () => {
    if (!urlImportData.url) {
      alert('Masukkan URL terlebih dahulu');
      return;
    }

    // Validate URL is from utbk.or.id
    try {
      const parsedUrl = new URL(urlImportData.url);
      if (!parsedUrl.hostname.includes('utbk.or.id')) {
        alert('Hanya URL dari utbk.or.id yang diizinkan');
        return;
      }
    } catch {
      alert('URL tidak valid');
      return;
    }

    setImportLoading(true);
    try {
      const response = await urlImportAPI.preview(urlImportData.url);
      
      if (response.data?.success && response.data?.data) {
        setUrlPreviewResult(response.data.data);
        setUrlImportStep('preview');
        // Select all questions by default
        setSelectedUrlQuestions(response.data.data.questions.map((q: { number: number }) => q.number));
      } else {
        alert(response.data?.message || 'Gagal memproses URL');
      }
    } catch (error: unknown) {
      console.error('URL preview error:', error);
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      const errorMessage = axiosError?.response?.data?.message || axiosError?.message || 'Terjadi kesalahan saat memproses URL';
      alert(errorMessage);
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportUrlQuestions = async () => {
    if (!urlPreviewResult || selectedUrlQuestions.length === 0) {
      alert('Pilih minimal satu soal untuk diimpor');
      return;
    }

    if (!urlImportData.subject) {
      alert('Pilih mata pelajaran terlebih dahulu');
      return;
    }
    
    setUrlImportStep('importing');
    setImportLoading(true);

    try {
      const response = await urlImportAPI.import({
        url: urlImportData.url,
        subject: urlImportData.subject,
        difficulty: urlImportData.difficulty,
        grade_level: urlImportData.grade_level,
        selected_questions: selectedUrlQuestions,
      });

      if (response.data?.success) {
        await fetchData();
        setShowUrlImportModal(false);
        resetUrlImport();
        alert(`Berhasil mengimpor ${response.data.data.imported} soal dari "${response.data.data.topic}"!`);
      } else {
        alert(response.data?.message || 'Gagal mengimpor soal');
      }
    } catch (error) {
      console.error('URL Import error:', error);
      alert('Terjadi kesalahan saat mengimpor soal');
    } finally {
      setImportLoading(false);
    }
  };

  const resetUrlImport = () => {
    setUrlImportData({
      url: '',
      subject: '',
      grade_level: '10',
      difficulty: 'sedang',
    });
    setUrlPreviewResult(null);
    setUrlImportStep('input');
    setSelectedUrlQuestions([]);
  };

  const toggleUrlQuestionSelection = (number: number) => {
    setSelectedUrlQuestions(prev => 
      prev.includes(number) 
        ? prev.filter(n => n !== number)
        : [...prev, number]
    );
  };

  const toggleAllUrlQuestions = () => {
    if (urlPreviewResult) {
      if (selectedUrlQuestions.length === urlPreviewResult.questions.length) {
        setSelectedUrlQuestions([]);
      } else {
        setSelectedUrlQuestions(urlPreviewResult.questions.map(q => q.number));
      }
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
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowPdfImportModal(true)}>
              <FileText className="w-5 h-5 mr-2" />
              Import PDF
            </Button>
            <Button variant="outline" onClick={() => setShowUrlImportModal(true)}>
              <Link className="w-5 h-5 mr-2" />
              Import URL
            </Button>
            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Globe className="w-5 h-5 mr-2" />
              Import Online
            </Button>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
              <Plus className="w-5 h-5 mr-2" />
              Tambah Soal
            </Button>
          </div>
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mata Pelajaran</label>
                    <select
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      required
                    >
                      <option value="">Pilih Mata Pelajaran</option>
                      {SUBJECTS.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kelas</label>
                    <select
                      value={formData.grade_level}
                      onChange={(e) => setFormData({ ...formData, grade_level: e.target.value as '10' | '11' | '12' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      required
                    >
                      <option value="10">Kelas 10</option>
                      <option value="11">Kelas 11</option>
                      <option value="12">Kelas 12</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kelas Spesifik (Opsional)</label>
                  <select
                    value={formData.class_id}
                    onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Semua Kelas</option>
                    {classes.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pembahasan (Opsional)</label>
                  <textarea
                    value={formData.explanation}
                    onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                    placeholder="Tuliskan pembahasan untuk soal ini..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowAddModal(false); resetForm(); }} disabled={saving}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      editingQuestion ? 'Simpan Perubahan' : 'Simpan Soal'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Import Soal</h3>
                  <p className="text-sm text-gray-500">Dari Open Trivia Database</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                  <select
                    value={importData.category}
                    onChange={(e) => setImportData({ ...importData, category: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    {TRIVIA_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name} ({cat.subject})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kesulitan</label>
                  <select
                    value={importData.difficulty}
                    onChange={(e) => setImportData({ ...importData, difficulty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="">Semua Tingkat</option>
                    <option value="easy">Mudah (Easy)</option>
                    <option value="medium">Sedang (Medium)</option>
                    <option value="hard">Sulit (Hard)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Soal</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={importData.amount}
                    onChange={(e) => setImportData({ ...importData, amount: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maksimal 50 soal per import</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kelas</label>
                  <select
                    value={importData.grade_level}
                    onChange={(e) => setImportData({ ...importData, grade_level: e.target.value as '10' | '11' | '12' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="10">Kelas 10</option>
                    <option value="11">Kelas 11</option>
                    <option value="12">Kelas 12</option>
                  </select>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Catatan:</strong> Soal diambil dari Open Trivia Database (opentdb.com) dalam bahasa Inggris. 
                    Semua soal berbentuk pilihan ganda dengan 4 opsi jawaban.
                  </p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => setShowImportModal(false)}
                    disabled={importLoading}
                  >
                    Batal
                  </Button>
                  <Button 
                    type="button" 
                    className="flex-1"
                    onClick={handleImportFromTrivia}
                    disabled={importLoading}
                  >
                    {importLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Mengimpor...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Import Soal
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* PDF Import Modal */}
        {showPdfImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Import Soal dari PDF</h2>
                  <p className="text-sm text-gray-500">
                    Upload file PDF soal UTBK/UN/SNBT untuk diekstrak otomatis
                  </p>
                </div>
                <button onClick={() => { setShowPdfImportModal(false); resetPdfImport(); }}>
                  <X className="w-5 h-5 text-gray-500 hover:text-gray-700" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Step Indicator */}
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className={`flex items-center gap-2 ${pdfImportStep === 'upload' ? 'text-teal-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pdfImportStep === 'upload' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100'}`}>1</div>
                    <span className="text-sm font-medium">Upload</span>
                  </div>
                  <div className="w-8 h-0.5 bg-gray-200" />
                  <div className={`flex items-center gap-2 ${pdfImportStep === 'preview' ? 'text-teal-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pdfImportStep === 'preview' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100'}`}>2</div>
                    <span className="text-sm font-medium">Preview</span>
                  </div>
                  <div className="w-8 h-0.5 bg-gray-200" />
                  <div className={`flex items-center gap-2 ${pdfImportStep === 'importing' ? 'text-teal-600' : 'text-gray-400'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${pdfImportStep === 'importing' ? 'bg-teal-100 text-teal-600' : 'bg-gray-100'}`}>3</div>
                    <span className="text-sm font-medium">Import</span>
                  </div>
                </div>

                {/* Step 1: Upload */}
                {pdfImportStep === 'upload' && (
                  <div className="space-y-4">
                    {/* PDF File Upload */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        File PDF Soal <span className="text-red-500">*</span>
                      </label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-400 transition-colors">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handlePdfFileChange}
                          className="hidden"
                          id="pdf-file-input"
                        />
                        <label htmlFor="pdf-file-input" className="cursor-pointer">
                          {pdfImportData.file ? (
                            <div className="flex items-center justify-center gap-2 text-teal-600">
                              <FileText className="w-8 h-8" />
                              <span className="font-medium">{pdfImportData.file.name}</span>
                            </div>
                          ) : (
                            <>
                              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                              <p className="text-gray-600">Klik untuk upload atau drag & drop</p>
                              <p className="text-sm text-gray-400">PDF maksimal 10MB</p>
                            </>
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Answer Key File (Optional) */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        File Kunci Jawaban (Opsional)
                      </label>
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-gray-300 transition-colors">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleAnswerKeyFileChange}
                          className="hidden"
                          id="answer-key-input"
                        />
                        <label htmlFor="answer-key-input" className="cursor-pointer">
                          {pdfImportData.answerKeyFile ? (
                            <div className="flex items-center justify-center gap-2 text-green-600">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm">{pdfImportData.answerKeyFile.name}</span>
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Upload PDF kunci jawaban jika ada</p>
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Format Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Format Soal</label>
                      <select
                        value={pdfImportData.format}
                        onChange={(e) => setPdfImportData({ ...pdfImportData, format: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="general">Otomatis (Auto-detect)</option>
                        <option value="utbk">UTBK/SBMPTN (5 opsi A-E)</option>
                        <option value="snbt">SNBT (5 opsi A-E)</option>
                        <option value="un">Ujian Nasional (4 opsi A-D)</option>
                      </select>
                    </div>

                    {/* Info Box */}
                    <div className="bg-amber-50 p-3 rounded-lg flex gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-amber-700">
                        <p className="font-medium">Tips untuk hasil terbaik:</p>
                        <ul className="list-disc ml-4 mt-1 space-y-1">
                          <li>Gunakan PDF yang jelas dan tidak ter-scan miring</li>
                          <li>Format soal standar: nomor, pertanyaan, lalu opsi A-D/E</li>
                          <li>Upload kunci jawaban terpisah jika tersedia</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="flex-1" 
                        onClick={() => { setShowPdfImportModal(false); resetPdfImport(); }}
                      >
                        Batal
                      </Button>
                      <Button 
                        type="button" 
                        className="flex-1"
                        onClick={handleParsePdf}
                        disabled={!pdfImportData.file || importLoading}
                      >
                        {importLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" />
                            Ekstrak Soal
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Preview */}
                {pdfImportStep === 'preview' && pdfParseResult && (
                  <div className="space-y-4">
                    {/* Parse Result Info */}
                    <div className="bg-green-50 p-3 rounded-lg flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm text-green-700">
                        Berhasil mengekstrak <strong>{pdfParseResult.questions.length}</strong> soal
                        {pdfParseResult.detected_subject && ` - Terdeteksi: ${pdfParseResult.detected_subject}`}
                      </span>
                    </div>

                    {/* Import Settings */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mata Pelajaran <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={pdfImportData.subject}
                          onChange={(e) => setPdfImportData({ ...pdfImportData, subject: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          <option value="">Pilih Mapel</option>
                          {SUBJECTS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kelas</label>
                        <select
                          value={pdfImportData.grade_level}
                          onChange={(e) => setPdfImportData({ ...pdfImportData, grade_level: e.target.value as '10' | '11' | '12' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          <option value="10">Kelas 10</option>
                          <option value="11">Kelas 11</option>
                          <option value="12">Kelas 12</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kesulitan</label>
                        <select
                          value={pdfImportData.difficulty}
                          onChange={(e) => setPdfImportData({ ...pdfImportData, difficulty: e.target.value as 'mudah' | 'sedang' | 'sulit' })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          <option value="mudah">Mudah</option>
                          <option value="sedang">Sedang</option>
                          <option value="sulit">Sulit</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sumber</label>
                        <input
                          type="text"
                          value={pdfImportData.source}
                          onChange={(e) => setPdfImportData({ ...pdfImportData, source: e.target.value })}
                          placeholder="Contoh: UTBK 2024"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      </div>
                    </div>

                    {/* Questions Preview */}
                    <div>
                      <h3 className="font-medium text-gray-900 mb-2">Preview Soal</h3>
                      <div className="max-h-64 overflow-y-auto space-y-3 border rounded-lg p-3">
                        {pdfParseResult.questions.map((q, idx) => (
                          <div key={idx} className={`p-3 rounded-lg ${q.correct_answer ? 'bg-green-50' : 'bg-amber-50'}`}>
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1">
                                <p className="font-medium text-sm">
                                  {q.number}. {q.question.substring(0, 100)}{q.question.length > 100 ? '...' : ''}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {q.options.map((opt, optIdx) => (
                                    <span key={optIdx} className="text-xs bg-white px-2 py-0.5 rounded">
                                      {String.fromCharCode(65 + optIdx)}. {opt.substring(0, 30)}{opt.length > 30 ? '...' : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="flex-shrink-0">
                                {q.correct_answer ? (
                                  <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                                    Jawaban: {q.correct_answer.substring(0, 15)}
                                  </span>
                                ) : (
                                  <select
                                    value=""
                                    onChange={(e) => updateParsedQuestionAnswer(idx, e.target.value)}
                                    className="text-xs px-2 py-1 border rounded"
                                  >
                                    <option value="">Pilih Jawaban</option>
                                    {q.options.map((opt, optIdx) => (
                                      <option key={optIdx} value={opt}>
                                        {String.fromCharCode(65 + optIdx)}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {pdfParseResult.questions.filter(q => q.correct_answer).length} dari {pdfParseResult.questions.length} soal memiliki kunci jawaban
                      </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => { setPdfImportStep('upload'); setPdfParseResult(null); }}
                      >
                        Kembali
                      </Button>
                      <Button 
                        type="button" 
                        className="flex-1"
                        onClick={handleImportPdfQuestions}
                        disabled={!pdfImportData.subject || importLoading || pdfParseResult.questions.filter(q => q.correct_answer).length === 0}
                      >
                        {importLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Mengimpor...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Import {pdfParseResult.questions.filter(q => q.correct_answer).length} Soal
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 3: Importing */}
                {pdfImportStep === 'importing' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
                    <p className="text-gray-600">Mengimpor soal ke database...</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* URL Import Modal */}
        {showUrlImportModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Import dari URL</h2>
                    <p className="text-sm text-gray-500">Import soal dari utbk.or.id</p>
                  </div>
                  <button 
                    onClick={() => { setShowUrlImportModal(false); resetUrlImport(); }}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Step 1: Input URL */}
                {urlImportStep === 'input' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-700">
                          <p className="font-medium">Cara Penggunaan:</p>
                          <ol className="list-decimal ml-4 mt-1 space-y-1">
                            <li>Buka <a href="https://utbk.or.id" target="_blank" rel="noopener noreferrer" className="underline">utbk.or.id</a></li>
                            <li>Pilih artikel soal yang ingin diimport (contoh: "100+ Soal Tekanan Hidrostatis")</li>
                            <li>Copy URL dari browser dan paste di bawah ini</li>
                          </ol>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        URL Artikel Soal
                      </label>
                      <input
                        type="url"
                        value={urlImportData.url}
                        onChange={(e) => setUrlImportData(prev => ({ ...prev, url: e.target.value }))}
                        placeholder="https://utbk.or.id/soal-..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => { setShowUrlImportModal(false); resetUrlImport(); }}
                      >
                        Batal
                      </Button>
                      <Button 
                        type="button"
                        className="flex-1"
                        onClick={handleUrlPreview}
                        disabled={!urlImportData.url || importLoading}
                      >
                        {importLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Memproses...
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" />
                            Preview Soal
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 2: Preview & Settings */}
                {urlImportStep === 'preview' && urlPreviewResult && (
                  <div className="space-y-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-green-700">
                          Ditemukan {urlPreviewResult.total_questions} soal dari "{urlPreviewResult.topic}"
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Mata Pelajaran <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={urlImportData.subject}
                          onChange={(e) => setUrlImportData(prev => ({ ...prev, subject: e.target.value }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          required
                        >
                          <option value="">Pilih Mata Pelajaran</option>
                          {SUBJECTS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Tingkat Kesulitan
                        </label>
                        <select
                          value={urlImportData.difficulty}
                          onChange={(e) => setUrlImportData(prev => ({ 
                            ...prev, 
                            difficulty: e.target.value as 'mudah' | 'sedang' | 'sulit' 
                          }))}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        >
                          <option value="mudah">Mudah</option>
                          <option value="sedang">Sedang</option>
                          <option value="sulit">Sulit</option>
                        </select>
                      </div>
                    </div>

                    {/* Question Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Pilih Soal untuk Diimport
                        </label>
                        <button 
                          type="button"
                          onClick={toggleAllUrlQuestions}
                          className="text-sm text-teal-600 hover:text-teal-700"
                        >
                          {selectedUrlQuestions.length === urlPreviewResult.questions.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                        </button>
                      </div>
                      <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
                        {urlPreviewResult.questions.map((q) => (
                          <div 
                            key={q.number} 
                            className={`p-3 cursor-pointer hover:bg-gray-50 ${
                              selectedUrlQuestions.includes(q.number) ? 'bg-teal-50' : ''
                            }`}
                            onClick={() => toggleUrlQuestionSelection(q.number)}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedUrlQuestions.includes(q.number)}
                                onChange={() => toggleUrlQuestionSelection(q.number)}
                                className="mt-1 w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900 line-clamp-2">
                                  <span className="font-medium">#{q.number}.</span> {q.question}
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {Object.entries(q.options).map(([key, value]) => (
                                    <span 
                                      key={key} 
                                      className={`text-xs px-2 py-0.5 rounded ${
                                        q.answer === key ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'
                                      }`}
                                    >
                                      {key}. {String(value).substring(0, 25)}{String(value).length > 25 ? '...' : ''}
                                    </span>
                                  ))}
                                </div>
                                {q.answer && (
                                  <p className="text-xs text-green-600 mt-1">
                                    ✓ Jawaban: {q.answer}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {selectedUrlQuestions.length} dari {urlPreviewResult.questions.length} soal dipilih
                        {' • '}
                        {urlPreviewResult.questions.filter(q => q.answer).length} soal memiliki kunci jawaban
                      </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => { setUrlImportStep('input'); setUrlPreviewResult(null); }}
                      >
                        Kembali
                      </Button>
                      <Button 
                        type="button" 
                        className="flex-1"
                        onClick={handleImportUrlQuestions}
                        disabled={!urlImportData.subject || selectedUrlQuestions.length === 0 || importLoading}
                      >
                        {importLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Mengimpor...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Import {selectedUrlQuestions.length} Soal
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 3: Importing */}
                {urlImportStep === 'importing' && (
                  <div className="text-center py-8">
                    <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
                    <p className="text-gray-600">Mengimpor soal ke database...</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
