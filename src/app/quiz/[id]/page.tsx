'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, ConfirmDialog } from '@/components/ui';
import {
  Clock, ChevronLeft, ChevronRight, Send, Flag, Loader2, ArrowLeft,
  CheckCircle2, ClipboardList,
} from 'lucide-react';
import { quizAPI, getSecureFileUrl } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { MathText } from '@/components/ui/MathText';

interface QuestionOption {
  text: string;
  image?: string | null;
}

interface Question {
  id: number;
  number: number;
  type: 'multiple_choice' | 'multiple_answer' | 'essay';
  text: string;
  passage?: string | null;
  options?: QuestionOption[];
  image?: string | null;
}

interface QuizData {
  id: number;
  title: string;
  subject: string;
  duration: number;
  totalQuestions: number;
  questions: Question[];
  show_result?: boolean;
}

export default function QuizTakingPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const quizId = Number(params.id) || 1;

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [quizNotFound, setQuizNotFound] = useState(false);
  const [startingQuiz, setStartingQuiz] = useState(false);
  const autoSubmittedRef = React.useRef(false);
  const resumeAttemptedRef = React.useRef(false);

  // Clear quiz session
  const clearQuizSession = () => {
    sessionStorage.removeItem(`quiz_active_${quizId}`);
    sessionStorage.removeItem(`quiz_question_${quizId}`);
  };

  // Format time
  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Start quiz
  const handleStart = async () => {
    setStartingQuiz(true);
    try {
      const response = await quizAPI.start(quizId);
      const data = response.data?.data;

      if (data) {
        // Backend returns 'quiz' object (not 'exam') and 'text' field (not 'question_text')
        const quizData = data.quiz || data.exam;
        const qs: Question[] = (data.questions || []).map((q: Record<string, unknown>, idx: number) => ({
          id: q.id as number,
          number: (q.number as number) || idx + 1,
          type: (q.question_type || q.type) as Question['type'],
          text: (q.text || q.question_text) as string,
          passage: q.passage as string | null,
          options: ((q.options || []) as (string | { text: string; image?: string | null })[]).map(
            (opt) => typeof opt === 'string' ? { text: opt, image: null } : { text: opt.text || '', image: opt.image || null }
          ),
          image: q.image as string | null,
        }));

        setQuiz({
          id: quizData?.id || quizId,
          title: quizData?.title || '',
          subject: quizData?.subject || '',
          duration: quizData?.duration || 60,
          totalQuestions: quizData?.totalQuestions || qs.length,
          questions: qs,
          show_result: quizData?.show_result,
        });
        setQuestions(qs);
        // Backend returns 'remainingTime' (not 'remaining_time')
        setTimeRemaining(data.remainingTime || data.remaining_time || (quizData?.duration || 60) * 60);
        setIsStarted(true);
        sessionStorage.setItem(`quiz_active_${quizId}`, '1');

        // Restore saved answers - backend returns 'answers' (not 'saved_answers')
        const savedAnswers = data.answers || data.saved_answers;
        if (savedAnswers && typeof savedAnswers === 'object') {
          const restored: Record<number, string> = {};
          Object.entries(savedAnswers as Record<string, string>).forEach(([qId, ans]) => {
            restored[Number(qId)] = ans;
          });
          setAnswers(restored);
        }
      }
    } catch (err) {
      const e = err as { response?: { status?: number; data?: { message?: string } } };
      if (e.response?.status === 404) {
        setQuizNotFound(true);
      } else if (e.response?.status === 403) {
        toast.error(e.response?.data?.message || 'Quiz tidak tersedia');
        router.push('/quiz-siswa');
      } else {
        toast.error(e.response?.data?.message || 'Gagal memulai quiz');
      }
    } finally {
      setStartingQuiz(false);
    }
  };

  // Try to resume on mount
  useEffect(() => {
    const tryResume = async () => {
      if (resumeAttemptedRef.current) return;
      resumeAttemptedRef.current = true;

      const wasActive = sessionStorage.getItem(`quiz_active_${quizId}`);
      if (wasActive) {
        await handleStart();
      }
      setLoading(false);
    };
    tryResume();
  }, [quizId]);

  // Timer
  useEffect(() => {
    if (!isStarted || timeRemaining <= 0) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timer);
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            handleSubmit(true);
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  // Save current question to session
  useEffect(() => {
    if (isStarted) {
      sessionStorage.setItem(`quiz_question_${quizId}`, String(currentQuestion));
    }
  }, [currentQuestion, isStarted, quizId]);

  // Restore current question
  useEffect(() => {
    if (isStarted) {
      const saved = sessionStorage.getItem(`quiz_question_${quizId}`);
      if (saved) setCurrentQuestion(Number(saved));
    }
  }, [isStarted, quizId]);

  // Submit answer to backend
  const submitAnswer = useCallback(async (questionId: number, answer: string) => {
    try {
      await quizAPI.submitAnswer(quizId, { question_id: questionId, answer });
    } catch {
      // Silent fail — answer is saved locally
    }
  }, [quizId]);

  // Handle answer selection
  const handleAnswer = (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    submitAnswer(questionId, answer);
  };

  // Handle multiple answer toggle
  const handleMultiAnswer = (questionId: number, optionText: string) => {
    setAnswers((prev) => {
      let current: string[] = [];
      try { current = JSON.parse(prev[questionId] || '[]'); } catch { current = []; }
      const idx = current.indexOf(optionText);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(optionText);
      }
      const newAnswer = JSON.stringify(current);
      submitAnswer(questionId, newAnswer);
      return { ...prev, [questionId]: newAnswer };
    });
  };

  // Toggle flag
  const toggleFlag = (questionNumber: number) => {
    setFlaggedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(questionNumber)) {
        next.delete(questionNumber);
      } else {
        next.add(questionNumber);
      }
      return next;
    });
  };

  // Submit quiz
  const handleSubmit = async (auto = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await quizAPI.finish(quizId, {
        answers,
        time_spent: (quiz?.duration || 60) * 60 - timeRemaining,
      });
      clearQuizSession();
      if (auto) {
        toast.warning('Waktu habis! Quiz otomatis dikumpulkan.');
      } else {
        toast.success('Quiz berhasil dikumpulkan!');
      }
      router.push('/quiz-siswa');
    } catch (error) {
      console.error('Failed to submit quiz:', error);
      clearQuizSession();
      router.push('/quiz-siswa');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  // Not found
  if (quizNotFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <Card className="p-8 text-center max-w-md mx-auto">
          <ClipboardList className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Quiz Tidak Ditemukan</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Quiz yang Anda cari tidak tersedia atau sudah berakhir.</p>
          <Button onClick={() => router.push('/quiz-siswa')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali ke Daftar Quiz
          </Button>
        </Card>
      </div>
    );
  }

  // Pre-quiz screen — simple start button
  if (!isStarted) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-8 text-center">
          <div className="w-16 h-16 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <ClipboardList className="w-8 h-8 text-violet-600 dark:text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Quiz Siap Dimulai</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Pastikan Anda siap sebelum memulai quiz. Timer akan langsung berjalan setelah Anda menekan tombol mulai.
          </p>
          <Button
            onClick={handleStart}
            disabled={startingQuiz}
            className="w-full py-3"
          >
            {startingQuiz ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Memulai...</>
            ) : (
              <><ClipboardList className="w-5 h-5 mr-2" /> Mulai Quiz</>
            )}
          </Button>
          <button
            onClick={() => router.push('/quiz-siswa')}
            className="mt-4 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Kembali ke daftar quiz
          </button>
        </Card>
      </div>
    );
  }

  // Quiz in progress
  const q = questions[currentQuestion];
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const unansweredCount = questions.length - answeredCount;
  const isTimeWarning = timeRemaining <= 300;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900">
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <div>
              <h1 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base truncate max-w-[200px] sm:max-w-none">
                {quiz?.title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{quiz?.subject}</p>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-lg font-bold ${
            isTimeWarning
              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
          }`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeRemaining)}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 flex gap-4">
        {/* Main Question Area */}
        <div className="flex-1 min-w-0">
          {q ? (
            <Card className="p-6">
              {/* Question header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center font-bold text-violet-700 dark:text-violet-300">
                    {q.number}
                  </span>
                  <div>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      q.type === 'essay' ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                        : q.type === 'multiple_answer' ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                        : 'bg-teal-100 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                    }`}>
                      {q.type === 'multiple_choice' ? 'Pilihan Ganda' : q.type === 'multiple_answer' ? 'PG Kompleks' : 'Essay'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => toggleFlag(q.number)}
                  className={`p-2 rounded-lg transition-colors ${
                    flaggedQuestions.has(q.number)
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600'
                      : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title="Tandai soal"
                >
                  <Flag className="w-5 h-5" />
                </button>
              </div>

              {/* Passage */}
              {q.passage && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Bacaan</span>
                  <MathText text={q.passage} as="div" className="text-sm text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-line" />
                </div>
              )}

              {/* Question text */}
              <MathText text={q.text} as="div" className="text-slate-800 dark:text-white text-lg mb-4 whitespace-pre-line" />

              {/* Question image */}
              {q.image && (
                <div className="mb-4">
                  <img
                    src={getSecureFileUrl(q.image)}
                    alt="Soal"
                    className="max-w-full max-h-80 rounded-lg border"
                  />
                </div>
              )}

              {/* Multiple choice options */}
              {q.type === 'multiple_choice' && q.options && (
                <div className="space-y-3">
                  {q.options.map((opt, idx) => (
                    <label
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        answers[q.id] === opt.text
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                      onClick={() => handleAnswer(q.id, opt.text)}
                    >
                      <span className={`w-7 h-7 flex items-center justify-center rounded-full border-2 text-sm font-medium shrink-0 mt-0.5 ${
                        answers[q.id] === opt.text
                          ? 'border-violet-500 bg-violet-500 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <div className="flex-1">
                        {opt.text && !/^\[Gambar [A-Z]\]$/.test(opt.text) && (
                          <MathText text={opt.text} />
                        )}
                        {opt.image && (
                          <img
                            src={getSecureFileUrl(opt.image)}
                            alt={`Opsi ${String.fromCharCode(65 + idx)}`}
                            className="mt-2 max-w-[300px] max-h-48 rounded border"
                          />
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {/* Multiple answer options */}
              {q.type === 'multiple_answer' && q.options && (() => {
                let selected: string[] = [];
                try { selected = JSON.parse(answers[q.id] || '[]'); } catch { selected = []; }
                return (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pilih satu atau lebih jawaban yang benar</p>
                    {q.options.map((opt, idx) => {
                      const isSelected = selected.includes(opt.text);
                      return (
                        <label
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            isSelected
                              ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                          onClick={() => handleMultiAnswer(q.id, opt.text)}
                        >
                          <span className={`w-7 h-7 flex items-center justify-center rounded shrink-0 mt-0.5 border-2 text-sm font-medium ${
                            isSelected
                              ? 'border-violet-500 bg-violet-500 text-white'
                              : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400'
                          }`}>
                            {isSelected ? <CheckCircle2 className="w-4 h-4" /> : String.fromCharCode(65 + idx)}
                          </span>
                          <div className="flex-1">
                            {opt.text && !/^\[Gambar [A-Z]\]$/.test(opt.text) && (
                              <MathText text={opt.text} />
                            )}
                            {opt.image && (
                              <img
                                src={getSecureFileUrl(opt.image)}
                                alt={`Opsi ${String.fromCharCode(65 + idx)}`}
                                className="mt-2 max-w-[300px] max-h-48 rounded border"
                              />
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Essay */}
              {q.type === 'essay' && (
                <textarea
                  value={answers[q.id] || ''}
                  onChange={(e) => handleAnswer(q.id, e.target.value)}
                  rows={6}
                  maxLength={5000}
                  placeholder="Tulis jawaban Anda di sini..."
                  className="w-full px-4 py-3 border-2 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500 resize-y"
                />
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
                  disabled={currentQuestion === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Sebelumnya
                </Button>
                {currentQuestion === questions.length - 1 ? (
                  <Button onClick={() => setShowSubmitConfirm(true)}>
                    <Send className="w-4 h-4 mr-1" />
                    Kumpulkan
                  </Button>
                ) : (
                  <Button
                    onClick={() => setCurrentQuestion(Math.min(questions.length - 1, currentQuestion + 1))}
                  >
                    Selanjutnya
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-slate-600 dark:text-slate-400">Tidak ada soal</p>
            </Card>
          )}
        </div>

        {/* Sidebar — Question Navigator */}
        <div className="hidden md:block w-64 shrink-0">
          <Card className="p-4 sticky top-20">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3 text-sm">Navigasi Soal</h3>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentQuestion;
                const isFlagged = flaggedQuestions.has(q.number);
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestion(idx)}
                    className={`w-full aspect-square rounded-lg text-sm font-medium transition-all relative ${
                      isCurrent
                        ? 'bg-violet-600 text-white shadow-md'
                        : isAnswered
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}
                    title={`Soal ${q.number}${isAnswered ? ' (dijawab)' : ''}${isFlagged ? ' (ditandai)' : ''}`}
                  >
                    {q.number}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700" />
                Dijawab ({answeredCount})
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                Belum dijawab ({unansweredCount})
              </div>
              {flaggedQuestions.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-amber-100 border border-amber-300 relative">
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
                  </span>
                  Ditandai ({flaggedQuestions.size})
                </div>
              )}
            </div>

            <Button
              onClick={() => setShowSubmitConfirm(true)}
              className="w-full"
              variant="outline"
            >
              <Send className="w-4 h-4 mr-2" />
              Kumpulkan Quiz
            </Button>
          </Card>
        </div>
      </div>

      {/* Mobile bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-3 z-40">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {answeredCount}/{questions.length} dijawab
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
              disabled={currentQuestion === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1 text-sm font-medium text-slate-700 dark:text-slate-300">
              {currentQuestion + 1}/{questions.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentQuestion(Math.min(questions.length - 1, currentQuestion + 1))}
              disabled={currentQuestion === questions.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" onClick={() => setShowSubmitConfirm(true)}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Submit Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => handleSubmit(false)}
        title="Kumpulkan Quiz?"
        message={
          unansweredCount > 0
            ? `Anda masih memiliki ${unansweredCount} soal yang belum dijawab. Yakin ingin mengumpulkan quiz?`
            : 'Yakin ingin mengumpulkan quiz? Jawaban tidak bisa diubah setelah dikumpulkan.'
        }
        confirmText={submitting ? 'Mengumpulkan...' : 'Ya, Kumpulkan'}
        cancelText="Batal"
        variant="warning"
      />
    </div>
  );
}
