'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExamMode } from '@/hooks/useExamMode';
import { Button, Card } from '@/components/ui';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Camera,
  Maximize,
  Flag,
  Loader2,
} from 'lucide-react';
import api from '@/services/api';

interface Question {
  id: number;
  number: number;
  type: 'multiple_choice' | 'essay';
  text: string;
  options?: string[];
}

interface ExamData {
  id: number;
  title: string;
  subject: string;
  duration: number;
  totalQuestions: number;
  questions: Question[];
}

export default function ExamTakingPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params.id) || 1;
  
  const {
    isFullscreen,
    isCameraActive,
    violationCount,
    enterFullscreen,
    startCamera,
    videoRef,
  } = useExamMode({
    examId,
    onViolation: (type) => {
      console.log('Violation:', type);
    },
  });

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchExam();
  }, [examId]);

  const fetchExam = async () => {
    try {
      const response = await api.get(`/exams/${examId}`);
      const examData = response.data?.data;
      
      if (examData) {
        setExam({
          id: examData.id,
          title: examData.title,
          subject: examData.subject || 'Ujian',
          duration: examData.duration || 90,
          totalQuestions: examData.questions?.length || 0,
          questions: examData.questions || [],
        });
        setQuestions(examData.questions || []);
        setTimeRemaining((examData.duration || 90) * 60);
      }
    } catch (error) {
      console.error('Failed to fetch exam:', error);
      setExam({
        id: examId,
        title: 'Ujian',
        subject: 'Mata Pelajaran',
        duration: 90,
        totalQuestions: 0,
        questions: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isStarted) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartExam = async () => {
    await enterFullscreen();
    await startCamera();
    setIsStarted(true);
  };

  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleToggleFlag = (questionNumber: number) => {
    setFlaggedQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(questionNumber)) {
        newSet.delete(questionNumber);
      } else {
        newSet.add(questionNumber);
      }
      return newSet;
    });
  };

  const handleSubmit = async () => {
    const confirmed = window.confirm('Apakah Anda yakin ingin mengumpulkan ujian?');
    if (confirmed) {
      setSubmitting(true);
      try {
        await api.post(`/exams/${examId}/submit`, {
          answers,
          time_spent: (exam?.duration || 90) * 60 - timeRemaining,
        });
        router.push('/ujian');
      } catch (error) {
        console.error('Failed to submit exam:', error);
        alert('Gagal mengumpulkan ujian. Coba lagi.');
        setSubmitting(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!exam || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Ujian Tidak Tersedia</h2>
          <p className="text-gray-600 mb-4">Ujian ini tidak ditemukan atau belum memiliki soal.</p>
          <Button onClick={() => router.push('/ujian')}>Kembali ke Daftar Ujian</Button>
        </Card>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const answeredCount = Object.keys(answers).length;

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{exam.title}</h1>
            <p className="text-gray-600 mb-6">{exam.subject}</p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <Clock className="w-6 h-6 text-teal-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Durasi</p>
                <p className="font-medium">{exam.duration} Menit</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Jumlah Soal</p>
                <p className="font-medium">{exam.totalQuestions} Soal</p>
              </div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-medium text-yellow-800 mb-2">⚠️ Perhatian:</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Ujian akan berjalan dalam mode fullscreen</li>
                <li>• Kamera akan aktif selama ujian berlangsung</li>
                <li>• Keluar dari fullscreen dianggap kecurangan</li>
                <li>• Pastikan koneksi internet stabil</li>
              </ul>
            </div>
            <Button onClick={handleStartExam} fullWidth>
              <Maximize className="w-5 h-5 mr-2" />
              Mulai Ujian
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-gray-800">{exam.title}</h1>
            <p className="text-sm text-gray-500">Soal {currentQuestion + 1} dari {questions.length}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              timeRemaining < 300 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
            }`}>
              <Clock className="w-5 h-5" />
              <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
            </div>
            {isCameraActive && (
              <div className="flex items-center gap-2 text-green-600">
                <Camera className="w-5 h-5" />
                <span className="text-sm">Kamera aktif</span>
              </div>
            )}
            {violationCount > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-sm">{violationCount} pelanggaran</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="text-sm text-gray-500">Soal {question?.number || currentQuestion + 1}</span>
                  <h2 className="text-lg font-medium text-gray-800 mt-1">{question?.text || 'Soal tidak tersedia'}</h2>
                </div>
                <button
                  onClick={() => handleToggleFlag(question?.number || currentQuestion + 1)}
                  className={`p-2 rounded-lg ${
                    flaggedQuestions.has(question?.number || currentQuestion + 1)
                      ? 'bg-yellow-100 text-yellow-600'
                      : 'bg-gray-100 text-gray-400 hover:text-yellow-600'
                  }`}
                >
                  <Flag className="w-5 h-5" />
                </button>
              </div>
              {question?.type === 'multiple_choice' && question.options && (
                <div className="space-y-3">
                  {question.options.map((option, index) => (
                    <label
                      key={index}
                      className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                        answers[question.id] === option
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        checked={answers[question.id] === option}
                        onChange={() => handleAnswer(question.id, option)}
                        className="w-4 h-4 text-teal-600"
                      />
                      <span className="ml-3 font-medium text-gray-700">{String.fromCharCode(65 + index)}.</span>
                      <span className="ml-2 text-gray-600">{option}</span>
                    </label>
                  ))}
                </div>
              )}
              {question?.type === 'essay' && (
                <textarea
                  value={answers[question.id] || ''}
                  onChange={(e) => handleAnswer(question.id, e.target.value)}
                  placeholder="Tulis jawaban Anda di sini..."
                  rows={6}
                  className="w-full p-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              )}
            </Card>
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestion === 0}
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Sebelumnya
              </Button>
              <span className="text-sm text-gray-500">{answeredCount} / {questions.length} Dijawab</span>
              {currentQuestion === questions.length - 1 ? (
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                  Kumpulkan
                </Button>
              ) : (
                <Button onClick={() => setCurrentQuestion((prev) => Math.min(questions.length - 1, prev + 1))}>
                  Selanjutnya
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <Card className="p-4 sticky top-20">
              <h3 className="font-semibold text-gray-800 mb-4">Navigasi Soal</h3>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, index) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestion(index)}
                    className={`w-10 h-10 rounded-lg font-medium text-sm ${
                      currentQuestion === index
                        ? 'bg-teal-500 text-white'
                        : answers[q.id]
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    } ${flaggedQuestions.has(q.number) ? 'ring-2 ring-yellow-400' : ''}`}
                  >
                    {q.number || index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-6 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 rounded" />
                  <span className="text-gray-600">Sudah dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-100 rounded" />
                  <span className="text-gray-600">Belum dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border-2 border-yellow-400 rounded" />
                  <span className="text-gray-600">Ditandai</span>
                </div>
              </div>
              <div className="mt-6">
                <p className="text-sm text-gray-500 mb-2">Kamera Pengawas</p>
                <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
