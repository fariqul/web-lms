'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { 
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckCircle,
  XCircle,
  BookOpen,
  Flag,
  RotateCcw,
  Home,
  Award,
  AlertCircle,
  Bookmark,
  BookMarked,
  Lightbulb,
  ChevronLeft,
  Loader2
} from 'lucide-react';
import { bankQuestionAPI } from '@/services/api';

interface Question {
  id: number;
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty: string;
}

interface Answer {
  questionId: number;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  isBookmarked: boolean;
}

export default function PracticePage({ params }: { params: Promise<{ subject: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { subject } = use(params);
  const mode = searchParams.get('mode') || 'belajar';
  const grade = searchParams.get('grade') || '10';
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(mode === 'tryout' ? 600 : 0); // 10 minutes for tryout
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startTime] = useState(() => Date.now());
  const [resultSaved, setResultSaved] = useState(false);

  // Get subject name from URL (decode it since it's URL encoded)
  const decodedSubject = decodeURIComponent(subject);
  const subjectName = decodedSubject;

  // Fetch questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await bankQuestionAPI.getPracticeQuestions({
          subject: decodedSubject,
          grade_level: grade,
          limit: mode === 'tryout' ? 20 : 10
        });
        
        const data = response.data?.data || [];
        
        if (data.length === 0) {
          setError('Belum ada soal untuk mata pelajaran ini.');
          setQuestions([]);
          setAnswers([]);
        } else {
          // Map API response to Question format
          const mappedQuestions: Question[] = data.map((q: {
            id: number;
            question: string;
            options: string[] | string;
            correct_answer: string;
            explanation: string;
            difficulty: string;
          }) => ({
            id: q.id,
            question: q.question,
            options: Array.isArray(q.options) ? q.options : JSON.parse(q.options),
            correct_answer: q.correct_answer,
            explanation: q.explanation || 'Tidak ada penjelasan.',
            difficulty: q.difficulty || 'sedang'
          }));
          
          setQuestions(mappedQuestions);
          setAnswers(mappedQuestions.map(q => ({
            questionId: q.id,
            selectedAnswer: null,
            isCorrect: null,
            isBookmarked: false
          })));
        }
      } catch (err) {
        console.error('Failed to fetch questions:', err);
        setError('Gagal memuat soal. Silakan coba lagi.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
  }, [decodedSubject, grade, mode]);

  // Timer for tryout mode
  useEffect(() => {
    if (mode !== 'tryout' || isFinished || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [mode, isFinished, timeLeft]);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers[currentIndex];

  const handleSelectAnswer = (answer: string) => {
    if (mode === 'tryout' && !isFinished) {
      // In tryout mode, just save answer without showing correct/incorrect
      setAnswers(prev => prev.map((a, i) => 
        i === currentIndex 
          ? { ...a, selectedAnswer: answer, isCorrect: answer === currentQuestion.correct_answer }
          : a
      ));
    } else if (mode === 'belajar' && currentAnswer?.selectedAnswer === null) {
      // In belajar mode, show result immediately
      const isCorrect = answer === currentQuestion.correct_answer;
      setAnswers(prev => prev.map((a, i) => 
        i === currentIndex 
          ? { ...a, selectedAnswer: answer, isCorrect }
          : a
      ));
      setShowExplanation(true);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setShowExplanation(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setShowExplanation(false);
    }
  };

  const handleFinish = () => {
    setIsFinished(true);
  };

  // Save practice result when finished
  useEffect(() => {
    if (!isFinished || resultSaved || questions.length === 0) return;
    
    const savePracticeResult = async () => {
      const correct = answers.filter(a => a.isCorrect === true).length;
      const score = Math.round((correct / questions.length) * 100);
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      
      try {
        await bankQuestionAPI.savePracticeResult({
          subject: decodedSubject,
          grade_level: grade,
          mode: mode as 'tryout' | 'belajar',
          total_questions: questions.length,
          correct_answers: correct,
          score,
          time_spent: timeSpent,
        });
        setResultSaved(true);
      } catch (err) {
        console.error('Failed to save practice result:', err);
      }
    };
    
    savePracticeResult();
  }, [isFinished]);

  const handleBookmark = () => {
    setAnswers(prev => prev.map((a, i) => 
      i === currentIndex 
        ? { ...a, isBookmarked: !a.isBookmarked }
        : a
    ));
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setAnswers(questions.map(q => ({
      questionId: q.id,
      selectedAnswer: null,
      isCorrect: null,
      isBookmarked: false
    })));
    setShowExplanation(false);
    setIsFinished(false);
    setResultSaved(false);
    setTimeLeft(mode === 'tryout' ? 600 : 0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getScore = () => {
    const correct = answers.filter(a => a.isCorrect === true).length;
    return Math.round((correct / questions.length) * 100);
  };

  const getOptionStyle = (option: string) => {
    if (!currentAnswer?.selectedAnswer) {
      return 'border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20';
    }

    if (mode === 'tryout' && !isFinished) {
      // During tryout, just highlight selected
      return currentAnswer.selectedAnswer === option
        ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
        : 'border-slate-200 dark:border-slate-700';
    }

    // In belajar mode or after tryout finished
    if (option === currentQuestion?.correct_answer) {
      return 'border-green-500 bg-green-50 dark:bg-green-900/20';
    }
    if (currentAnswer.selectedAnswer === option && !currentAnswer.isCorrect) {
      return 'border-red-500 bg-red-50 dark:bg-red-900/20';
    }
    return 'border-slate-200 dark:border-slate-700 opacity-50';
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <Loader2 className="w-12 h-12 text-teal-500 animate-spin" />
          <p className="mt-4 text-slate-600 dark:text-slate-400">Memuat soal…</p>
        </div>
      </DashboardLayout>
    );
  }

  // Error or no questions
  if (error || questions.length === 0) {
    return (
      <DashboardLayout>
        <div className="max-w-md mx-auto mt-12">
          <Card className="p-8 text-center">
            <BookOpen className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              {error || 'Belum Ada Soal'}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Mata pelajaran: {subjectName} - Kelas {grade}
            </p>
            <Button
              onClick={() => router.push('/dashboard/siswa/bank-soal')}
              className="bg-teal-500 hover:bg-teal-600 text-white"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Kembali ke Daftar Mapel
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Results Screen
  if (isFinished) {
    const score = getScore();
    const correct = answers.filter(a => a.isCorrect === true).length;
    const incorrect = answers.filter(a => a.isCorrect === false).length;
    const unanswered = answers.filter(a => a.selectedAnswer === null).length;

    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Card className="p-8 text-center">
            <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
              score >= 80 ? 'bg-green-100 dark:bg-green-900/30' : score >= 60 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              <Award className={`w-12 h-12 ${
                score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500'
              }`} />
            </div>
            
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {mode === 'tryout' ? 'Hasil Tryout' : 'Latihan Selesai'}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{subjectName} - Kelas {grade}</p>

            <div className="text-5xl font-bold text-slate-900 dark:text-white mb-2">{score}</div>
            <p className="text-slate-600 dark:text-slate-400 mb-8">Skor Anda</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">{correct}</div>
                <div className="text-sm text-green-600 dark:text-green-400">Benar</div>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                <XCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">{incorrect}</div>
                <div className="text-sm text-red-600 dark:text-red-400">Salah</div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <AlertCircle className="w-6 h-6 text-slate-600 dark:text-slate-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-slate-600 dark:text-slate-400">{unanswered}</div>
                <div className="text-sm text-slate-600 dark:text-slate-400">Kosong</div>
              </div>
            </div>

            {/* Review answers */}
            <div className="text-left mb-6">
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Review Jawaban</h3>
              <div className="flex flex-wrap gap-2">
                {answers.map((answer, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentIndex(idx);
                      setIsFinished(false);
                      setShowExplanation(true);
                    }}
                    className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                      answer.isCorrect === true
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40'
                        : answer.isCorrect === false
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => router.push('/dashboard/siswa/bank-soal')}
              >
                <Home className="w-4 h-4 mr-2" />
                Kembali
              </Button>
              <Button 
                className="flex-1"
                onClick={handleRestart}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Ulangi
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/dashboard/siswa/bank-soal')}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Kembali</span>
          </button>

          <div className="flex items-center gap-4">
            {mode === 'tryout' && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-mono font-bold ${
                timeLeft <= 60 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
              }`}>
                <Clock className="w-5 h-5" />
                {formatTime(timeLeft)}
              </div>
            )}
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              mode === 'tryout' 
                ? 'bg-orange-100 text-orange-600' 
                : 'bg-teal-100 text-teal-600'
            }`}>
              {mode === 'tryout' ? 'Mode Tryout' : 'Mode Belajar'}
            </div>
          </div>
        </div>

        {/* Progress */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {subjectName} - Kelas {grade}
            </span>
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div 
              className="bg-teal-500 h-2 rounded-full transition-[width] duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
          
          {/* Question Navigator */}
          <div className="flex flex-wrap gap-2 mt-4">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  setShowExplanation(mode === 'belajar' && answers[idx].selectedAnswer !== null);
                }}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  idx === currentIndex
                    ? 'bg-teal-500 text-white'
                    : answers[idx].selectedAnswer !== null
                    ? mode === 'belajar'
                      ? answers[idx].isCorrect
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      : 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                } ${answers[idx].isBookmarked ? 'ring-2 ring-yellow-400' : ''}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </Card>

        {/* Question */}
        {currentQuestion && (
          <Card className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  currentQuestion.difficulty === 'mudah' 
                    ? 'bg-green-100 text-green-600'
                    : currentQuestion.difficulty === 'sedang'
                    ? 'bg-yellow-100 text-yellow-600'
                    : 'bg-red-100 text-red-600'
                }`}>
                  {currentQuestion.difficulty.charAt(0).toUpperCase() + currentQuestion.difficulty.slice(1)}
                </span>
              </div>
              <button
                onClick={handleBookmark}
                className={`p-2 rounded-lg transition-colors ${
                  currentAnswer?.isBookmarked 
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:text-yellow-500'
                }`}
              >
                {currentAnswer?.isBookmarked ? (
                  <BookMarked className="w-5 h-5" />
                ) : (
                  <Bookmark className="w-5 h-5" />
                )}
              </button>
            </div>

            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-6">
              {currentQuestion.question}
            </h3>

            <div className="space-y-3">
              {currentQuestion.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectAnswer(option)}
                  disabled={mode === 'belajar' && currentAnswer?.selectedAnswer !== null}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${getOptionStyle(option)}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-medium flex-shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {(mode === 'belajar' || isFinished) && currentAnswer?.selectedAnswer && (
                      option === currentQuestion.correct_answer ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : currentAnswer.selectedAnswer === option ? (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      ) : null
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Explanation for Belajar mode */}
            {mode === 'belajar' && showExplanation && currentAnswer?.selectedAnswer && (
              <div className={`mt-6 p-4 rounded-xl ${
                currentAnswer.isCorrect ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/50' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50'
              }`}>
                <div className="flex items-start gap-3">
                  <Lightbulb className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    currentAnswer.isCorrect ? 'text-green-500' : 'text-amber-500'
                  }`} />
                  <div>
                    <h4 className={`font-semibold mb-1 ${
                      currentAnswer.isCorrect ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'
                    }`}>
                      {currentAnswer.isCorrect ? 'Benar! 🎉' : 'Pembahasan'}
                    </h4>
                    <p className={currentAnswer.isCorrect ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                      {currentQuestion.explanation}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Sebelumnya
          </Button>

          <div className="flex gap-2">
            {currentIndex === questions.length - 1 ? (
              <Button onClick={handleFinish}>
                <Flag className="w-4 h-4 mr-2" />
                Selesai
              </Button>
            ) : (
              <Button onClick={handleNext}>
                Selanjutnya
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
