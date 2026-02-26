'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Save,
  MessageSquare,
  Award,
  FileText,
  Camera,
  HelpCircle,
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface StudentInfo {
  id: number;
  name: string;
  nisn: string;
}

interface ExamResultData {
  id: number;
  status: string;
  total_score: number;
  max_score: number;
  percentage: number;
  score: number | null;
  violation_count: number;
  total_correct: number;
  total_wrong: number;
  total_answered: number;
  started_at: string;
  finished_at: string | null;
  submitted_at: string | null;
  student: StudentInfo;
}

interface QuestionData {
  id: number;
  question_text: string;
  type: string;
  correct_answer: string;
  points: number;
  options: (string | { text: string; image?: string | null })[] | null;
}

interface AnswerData {
  id: number;
  question_id: number;
  answer: string;
  is_correct: boolean | null;
  score: number | null;
  feedback: string | null;
  graded_by: number | null;
  graded_at: string | null;
  submitted_at: string;
  question: QuestionData;
}

interface SnapshotData {
  id: number;
  image_path: string;
  captured_at: string;
}

export default function HasilSiswaPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const examId = Number(params.id);
  const studentId = Number(params.studentId);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ExamResultData | null>(null);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [gradingScores, setGradingScores] = useState<Record<number, number>>({});
  const [gradingFeedback, setGradingFeedback] = useState<Record<number, string>>({});
  const [savingAnswerId, setSavingAnswerId] = useState<number | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const response = await api.get(`/exams/${examId}/results/${studentId}`);
      const data = response.data?.data;

      if (data) {
        setResult(data.result);
        setAnswers(data.answers || []);
        setSnapshots(data.snapshots || []);

        // Initialize grading scores from existing data
        const scores: Record<number, number> = {};
        const feedback: Record<number, string> = {};
        (data.answers || []).forEach((a: AnswerData) => {
          if (a.score !== null) scores[a.id] = a.score;
          if (a.feedback) feedback[a.id] = a.feedback;
        });
        setGradingScores(scores);
        setGradingFeedback(feedback);
      }
    } catch (error) {
      console.error('Failed to fetch result:', error);
      toast.error('Gagal memuat data hasil ujian');
    } finally {
      setLoading(false);
    }
  }, [examId, studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGradeAnswer = async (answerId: number) => {
    const score = gradingScores[answerId];
    if (score === undefined || score === null) {
      toast.warning('Masukkan nilai terlebih dahulu');
      return;
    }

    setSavingAnswerId(answerId);
    try {
      await api.post(`/exams/${examId}/grade-answer/${answerId}`, {
        score,
        feedback: gradingFeedback[answerId] || null,
      });
      toast.success('Nilai berhasil disimpan');
      await fetchData();
    } catch (error) {
      console.error('Failed to grade answer:', error);
      toast.error('Gagal menyimpan nilai');
    } finally {
      setSavingAnswerId(null);
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDuration = () => {
    if (!result?.started_at || !result?.finished_at) return '-';
    const start = new Date(result.started_at).getTime();
    const end = new Date(result.finished_at).getTime();
    const diff = Math.floor((end - start) / 1000 / 60);
    return `${diff} menit`;
  };

  const getUngradedEssayCount = () => {
    return answers.filter(
      (a) => a.question.type === 'essay' && a.graded_at === null
    ).length;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (!result) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Hasil tidak ditemukan</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-2">Siswa belum mengerjakan ujian ini.</p>
          <Button className="mt-4" onClick={() => router.back()}>
            Kembali
          </Button>
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
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Kembali
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hasil Ujian</h1>
              <p className="text-slate-600 dark:text-slate-400">{result.student.name} - NISN: {result.student.nisn}</p>
            </div>
          </div>
          {getUngradedEssayCount() > 0 && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/50 rounded-lg px-4 py-2">
              <p className="text-sm text-orange-700 dark:text-orange-400 font-medium">
                <HelpCircle className="w-4 h-4 inline mr-1" />
                {getUngradedEssayCount()} soal essay belum dinilai
              </p>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="text-center">
              <Award className="w-6 h-6 mx-auto mb-1 text-teal-500" />
              <p className={`text-2xl font-bold ${
                result.percentage >= 70 ? 'text-green-600' : 'text-red-600'
              }`}>
                {result.percentage != null ? Number(result.percentage).toFixed(1) : '-'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Nilai</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-1 text-green-500" />
              <p className="text-2xl font-bold text-green-600">{result.total_correct}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Benar</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <XCircle className="w-6 h-6 mx-auto mb-1 text-red-500" />
              <p className="text-2xl font-bold text-red-600">{result.total_wrong}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Salah</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <Clock className="w-6 h-6 mx-auto mb-1 text-slate-600 dark:text-slate-400" />
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300">{getDuration()}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Durasi</p>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-center">
              <AlertTriangle className="w-6 h-6 mx-auto mb-1 text-orange-500" />
              <p className="text-2xl font-bold text-orange-600">{result.violation_count}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Pelanggaran</p>
            </div>
          </Card>
        </div>

        {/* Score Detail */}
        <Card className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
              <span>Skor: <strong>{result.total_score}/{result.max_score}</strong></span>
              <span>Dijawab: <strong>{result.total_answered}</strong></span>
              <span>Status: <strong className={
                result.status === 'graded' ? 'text-green-600' :
                result.status === 'completed' ? 'text-teal-600' : 'text-yellow-600'
              }>
                {result.status === 'graded' ? 'Sudah Dinilai' :
                 result.status === 'completed' ? 'Selesai' : 'Mengerjakan'}
              </strong></span>
              {result.started_at && <span>Mulai: <strong>{formatDateTime(result.started_at)}</strong></span>}
              {result.finished_at && <span>Selesai: <strong>{formatDateTime(result.finished_at)}</strong></span>}
            </div>
            {snapshots.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSnapshots(!showSnapshots)}
              >
                <Camera className="w-4 h-4 mr-2" />
                {showSnapshots ? 'Sembunyikan' : 'Lihat'} Foto ({snapshots.length})
              </Button>
            )}
          </div>
        </Card>

        {/* Snapshots */}
        {showSnapshots && snapshots.length > 0 && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Foto Monitoring</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {snapshots.map((snap) => (
                <div key={snap.id} className="text-center">
                  <img
                    src={snap.image_path.startsWith('http')
                      ? snap.image_path
                      : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${snap.image_path}`
                    }
                    alt="Monitoring"
                    className="w-full aspect-square object-cover rounded-lg border"
                  />
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {new Date(snap.captured_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Answers */}
        <Card>
          <CardHeader
            title="Jawaban Siswa"
            subtitle={`${answers.length} soal dijawab`}
          />
          <div className="divide-y">
            {answers.map((answer, index) => (
              <div key={answer.id} className="p-4">
                <div className="flex items-start gap-4">
                  {/* Question number & status indicator */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <span className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full font-bold text-slate-700 dark:text-slate-300">
                      {index + 1}
                    </span>
                    {answer.question.type === 'multiple_choice' ? (
                      answer.is_correct ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )
                    ) : answer.graded_at ? (
                      <CheckCircle className="w-5 h-5 text-teal-500" />
                    ) : (
                      <HelpCircle className="w-5 h-5 text-orange-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Question text */}
                    <p className="text-slate-800 dark:text-white font-medium mb-2">{answer.question.question_text}</p>
                    
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        answer.question.type === 'multiple_choice'
                          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                          : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                      }`}>
                        {answer.question.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Essay'}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">{answer.question.points} poin</span>
                      {answer.score !== null && (
                        <span className={`text-xs font-medium ${
                          answer.score >= answer.question.points * 0.7 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          Skor: {answer.score}/{answer.question.points}
                        </span>
                      )}
                    </div>

                    {/* Multiple choice: show options with student answer marked */}
                    {answer.question.type === 'multiple_choice' && answer.question.options && (
                      <div className="space-y-1.5 mb-3">
                        {(Array.isArray(answer.question.options) ? answer.question.options : []).map((rawOpt: string | { text: string; image?: string | null }, optIdx: number) => {
                          const optText = typeof rawOpt === 'string' ? rawOpt : (rawOpt.text || '');
                          const optImage = typeof rawOpt === 'string' ? null : (rawOpt.image || null);
                          const isStudentAnswer = answer.answer === optText;
                          const isCorrectAnswer = optText === answer.question.correct_answer;
                          return (
                            <div
                              key={optIdx}
                              className={`flex items-start gap-2 text-sm px-3 py-1.5 rounded-lg ${
                                isCorrectAnswer
                                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700/50'
                                  : isStudentAnswer && !isCorrectAnswer
                                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700/50'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <span className="w-6 h-6 flex items-center justify-center rounded-full border text-xs font-medium shrink-0 mt-0.5">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <div className="flex-1">
                                <span>{optText}</span>
                                {optImage && (
                                  <img
                                    src={optImage.startsWith('http') ? optImage : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${optImage}`}
                                    alt={`Gambar opsi ${String.fromCharCode(65 + optIdx)}`}
                                    className="mt-1 max-w-[200px] max-h-32 rounded border border-slate-200 dark:border-slate-700"
                                  />
                                )}
                              </div>
                              {isStudentAnswer && (
                                <span className="text-xs font-medium shrink-0">
                                  {isCorrectAnswer ? '✓ Jawaban Siswa (Benar)' : '✗ Jawaban Siswa'}
                                </span>
                              )}
                              {isCorrectAnswer && !isStudentAnswer && (
                                <span className="text-xs font-medium text-green-600 shrink-0">✓ Kunci Jawaban</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Essay: show student answer */}
                    {answer.question.type === 'essay' && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Jawaban Siswa:</p>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap border">
                          {answer.answer || <span className="text-slate-600 dark:text-slate-400 italic">Tidak dijawab</span>}
                        </div>

                        {/* Grading form for essay */}
                        <div className="mt-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-100 dark:border-teal-700/40">
                          <h4 className="text-sm font-semibold text-teal-800 dark:text-teal-300 mb-3 flex items-center gap-2">
                            <Award className="w-4 h-4" />
                            Penilaian Essay
                            {answer.graded_at && (
                              <span className="text-xs font-normal text-teal-500 dark:text-teal-400 ml-2">
                                (dinilai {formatDateTime(answer.graded_at)})
                              </span>
                            )}
                          </h4>
                          
                          <div className="flex items-end gap-4 flex-wrap">
                            <div>
                              <label className="block text-xs text-teal-700 dark:text-teal-400 mb-1">
                                Nilai (maks {answer.question.points})
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={answer.question.points}
                                value={gradingScores[answer.id] ?? ''}
                                onChange={(e) => setGradingScores({
                                  ...gradingScores,
                                  [answer.id]: Math.min(Number(e.target.value), answer.question.points),
                                })}
                                className="w-24 px-3 py-2 border border-teal-200 dark:border-teal-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 text-center font-bold bg-white dark:bg-slate-800 text-foreground"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                              <label className="block text-xs text-teal-700 dark:text-teal-400 mb-1">
                                Feedback (opsional)
                              </label>
                              <input
                                type="text"
                                value={gradingFeedback[answer.id] ?? ''}
                                onChange={(e) => setGradingFeedback({
                                  ...gradingFeedback,
                                  [answer.id]: e.target.value,
                                })}
                                className="w-full px-3 py-2 border border-teal-200 dark:border-teal-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 bg-white dark:bg-slate-800 text-foreground"
                                placeholder="Berikan komentar…"
                              />
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleGradeAnswer(answer.id)}
                              disabled={savingAnswerId === answer.id}
                            >
                              {savingAnswerId === answer.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Save className="w-4 h-4 mr-1" />
                                  Simpan
                                </>
                              )}
                            </Button>
                          </div>

                          {/* Show existing feedback */}
                          {answer.feedback && (
                            <div className="mt-3 flex items-start gap-2 text-sm text-teal-700 dark:text-teal-400">
                              <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <span>{answer.feedback}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
