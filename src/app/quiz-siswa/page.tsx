'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { quizAPI } from '@/services/api';
import { Exam } from '@/types';
import { ClipboardList, Clock, PlayCircle, CheckCircle, AlertCircle } from 'lucide-react';

export default function QuizSiswaPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const response = await quizAPI.getAll();
      setQuizzes(response.data.data.data || response.data.data);
    } catch (error) {
      console.error('Failed to fetch quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const getQuizStatus = (quiz: Exam) => {
    const resultStatus = quiz.my_result?.status;

    if (resultStatus === 'completed' || resultStatus === 'graded') {
      return { label: 'Selesai', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: CheckCircle };
    }
    if (resultStatus === 'submitted') {
      return { label: 'Menunggu Penilaian', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Clock };
    }
    if (resultStatus === 'in_progress') {
      return { label: 'Sedang Dikerjakan', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', icon: PlayCircle };
    }
    if (quiz.status !== 'active') {
      return { label: 'Tidak Tersedia', color: 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300', icon: AlertCircle };
    }
    return { label: 'Tersedia', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: PlayCircle };
  };

  const canStartQuiz = (quiz: Exam) => {
    const resultStatus = quiz.my_result?.status;
    if (resultStatus === 'in_progress') {
      return true;
    }
    if (resultStatus === 'completed' || resultStatus === 'graded' || resultStatus === 'submitted') {
      return false;
    }
    return quiz.status === 'active';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-800 via-violet-700 to-purple-600 dark:from-violet-900 dark:via-violet-800 dark:to-purple-700 p-5 sm:p-6 shadow-lg shadow-violet-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Quiz Saya</h1>
            <p className="text-violet-100/80">Daftar quiz dan ujian harian yang tersedia</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-600"></div>
          </div>
        ) : quizzes.length === 0 ? (
          <Card className="p-12 text-center">
            <ClipboardList className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Belum Ada Quiz</h3>
            <p className="text-slate-600 dark:text-slate-400">Saat ini belum ada quiz yang tersedia untuk Anda</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => {
              const status = getQuizStatus(quiz);
              const StatusIcon = status.icon;

              return (
                <Card key={quiz.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center justify-center">
                      <ClipboardList className="w-6 h-6 text-violet-500" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>

                  <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{quiz.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{quiz.subject}</p>

                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{quiz.duration || quiz.duration_minutes} menit</span>
                    </div>
                  </div>

                  {['completed', 'graded'].includes(quiz.my_result?.status || '') ? (
                    <div className="space-y-2">
                      {quiz.show_result && quiz.my_result?.percentage != null && (
                        <div className={`rounded-lg p-3 text-center ${
                          Number(quiz.my_result.percentage) >= (quiz.passing_score || 70)
                            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50'
                            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50'
                        }`}>
                          <p className={`text-2xl font-bold ${
                            Number(quiz.my_result.percentage) >= (quiz.passing_score || 70) ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {Number(quiz.my_result.percentage).toFixed(0)}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Nilai</p>
                        </div>
                      )}
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg p-3 flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-green-700 dark:text-green-400">Selesai Dikerjakan</p>
                        </div>
                      </div>
                    </div>
                  ) : quiz.my_result?.status === 'submitted' ? (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 flex items-center gap-3">
                      <Clock className="w-5 h-5 text-blue-600 dark:text-blue-300 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Menunggu Penilaian</p>
                        <p className="text-xs text-blue-600/80 dark:text-blue-300/80">Jawaban sudah dikumpulkan, nilai final belum tersedia.</p>
                      </div>
                    </div>
                  ) : canStartQuiz(quiz) ? (
                    <Button
                      className="w-full"
                      onClick={() => router.push(`/quiz/${quiz.id}`)}
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {quiz.my_result?.status === 'in_progress' ? 'Lanjutkan Quiz' : 'Mulai Quiz'}
                    </Button>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      Tidak Tersedia
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
