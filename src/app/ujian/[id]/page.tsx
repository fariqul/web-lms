'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExamMode } from '@/hooks/useExamMode';
import { Button, Card, ConfirmDialog } from '@/components/ui';
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
  ArrowLeft,
  Timer,
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

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
  const toast = useToast();
  const examId = Number(params.id) || 1;
  
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [examNotFound, setExamNotFound] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [startingExam, setStartingExam] = useState(false);

  // Force submit handler
  const handleForceSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/exams/${examId}/finish`, {
        answers,
        time_spent: (exam?.duration || 90) * 60 - timeRemaining,
      });
      router.push('/ujian-siswa?reason=force_submit');
    } catch (error) {
      console.error('Failed to submit exam:', error);
      router.push('/ujian-siswa');
    }
  };

  const {
    isFullscreen,
    isCameraActive,
    violationCount,
    maxViolations,
    enterFullscreen,
    startCamera,
    videoRef,
  } = useExamMode({
    examId,
    onViolation: () => {},

    onForceSubmit: handleForceSubmit,
  });

  useEffect(() => {
    fetchExam();
  }, [examId]);

  const fetchExam = async () => {
    try {
      const response = await api.get(`/exams/${examId}`);
      const examData = response.data?.data;
      
      if (examData) {
        const questionsList = examData.questions || [];
        setExam({
          id: examData.id,
          title: examData.title,
          subject: examData.subject || 'Ujian',
          duration: examData.duration_minutes || examData.duration || 90,
          totalQuestions: examData.total_questions || examData.questions_count || questionsList.length || 0,
          questions: questionsList,
        });
        // Only set questions if they're actually returned (guru/admin)
        // For students, questions come from the /start endpoint
        if (questionsList.length > 0) {
          setQuestions(questionsList);
        }
        setTimeRemaining((examData.duration_minutes || examData.duration || 90) * 60);
        setExamNotFound(false);
      } else {
        setExamNotFound(true);
      }
    } catch (error) {
      console.error('Failed to fetch exam:', error);
      setExamNotFound(true);
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
    setStartingExam(true);
    
    // Start 5-second countdown
    setCountdown(5);
  };

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown <= 0) {
      // Countdown finished, actually start the exam
      actuallyStartExam();
      setCountdown(null);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  const actuallyStartExam = async () => {
    try {
      // Call API to start exam — this returns questions for students
      const response = await api.post(`/exams/${examId}/start`);
      const startData = response.data?.data;

      if (startData?.questions && startData.questions.length > 0) {
        // Map questions from start endpoint
        const mappedQuestions = startData.questions.map((q: { id: number; order?: number; question_type: string; question_text: string; options?: string[] }, idx: number) => ({
          id: q.id,
          number: q.order || idx + 1,
          type: q.question_type === 'multiple_choice' ? 'multiple_choice' : 'essay',
          text: q.question_text,
          options: q.options || [],
        }));
        setQuestions(mappedQuestions);

        // Restore existing answers if any
        if (startData.existing_answers) {
          const restored: Record<number, string> = {};
          Object.entries(startData.existing_answers).forEach(([qId, ans]) => {
            const answer = ans as { answer?: string };
            if (answer?.answer) {
              restored[Number(qId)] = answer.answer;
            }
          });
          setAnswers(restored);
        }

        // Set remaining time from server
        if (startData.remaining_time) {
          setTimeRemaining(Math.max(0, Math.floor(startData.remaining_time)));
        }
      }

      await enterFullscreen();
      await startCamera();
      setIsStarted(true);
    } catch (error) {
      console.error('Failed to start exam:', error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal memulai ujian. Silakan coba lagi.');
      setCountdown(null);
      setStartingExam(false);
    }
  };

  const handleAnswer = async (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    
    // Save answer to server
    try {
      await api.post(`/exams/${examId}/answer`, {
        question_id: questionId,
        answer,
      });
    } catch (error) {
      console.error('Failed to save answer:', error);
    }
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

  const handleSubmit = () => {
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/exams/${examId}/finish`);
      router.push('/ujian-siswa?submitted=true');
    } catch (error) {
      console.error('Failed to submit exam:', error);
      toast.error('Gagal mengumpulkan ujian. Coba lagi.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!exam || examNotFound) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Ujian Tidak Tersedia</h2>
          <p className="text-gray-600 mb-4">Ujian ini tidak ditemukan atau Anda tidak memiliki akses.</p>
          <Button onClick={() => router.push('/ujian-siswa')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali ke Daftar Ujian
          </Button>
        </Card>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const answeredCount = Object.keys(answers).length;

  if (!isStarted) {
    // Countdown overlay
    if (countdown !== null) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="mb-8">
              <Timer className="w-16 h-16 text-teal-400 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold text-white mb-2">Ujian dimulai dalam</h2>
            </div>
            <div className="relative w-40 h-40 mx-auto mb-8">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
                <circle 
                  cx="60" cy="60" r="54" fill="none" stroke="#14b8a6" strokeWidth="8" 
                  strokeDasharray={339.292} 
                  strokeDashoffset={339.292 * (1 - countdown / 5)}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-7xl font-bold text-white">{countdown}</span>
              </div>
            </div>
            <div className="space-y-2 text-gray-400">
              <p className="text-sm">Siapkan diri Anda...</p>
              <p className="text-xs">Kamera dan fullscreen akan aktif otomatis</p>
            </div>
          </div>
        </div>
      );
    }

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
            <div className="space-y-3">
              <Button onClick={handleStartExam} fullWidth disabled={startingExam}>
                {startingExam ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Maximize className="w-5 h-5 mr-2" />
                )}
                {startingExam ? 'Mempersiapkan...' : 'Mulai Ujian'}
              </Button>
              <Button
                variant="outline"
                fullWidth
                onClick={() => router.push('/ujian-siswa')}
                disabled={startingExam}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali ke Daftar Ujian
              </Button>
            </div>
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
                <span className="text-sm">
                  {violationCount}{maxViolations ? `/${maxViolations}` : ''} pelanggaran
                </span>
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

      <ConfirmDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={confirmSubmit}
        title="Kumpulkan Ujian"
        message="Apakah Anda yakin ingin mengumpulkan ujian?"
        confirmText="Kumpulkan"
        variant="warning"
        isLoading={submitting}
      />
    </div>
  );
}
