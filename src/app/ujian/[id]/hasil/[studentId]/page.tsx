'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button } from '@/components/ui';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Award,
  FileText,
  Camera,
  Save,
  MessageSquare,
} from 'lucide-react';
import api, { getSecureFileUrl } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { MathText } from '@/components/ui/MathText';
import { useAuth } from '@/context/AuthContext';

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
  passage?: string | null;
  question_text: string;
  type: string;
  correct_answer: string;
  essay_keywords?: string[] | null;
  points: number;
  options: (string | { text: string; image?: string | null })[] | null;
}

interface AnswerData {
  id: number;
  question_id: number;
  answer: string;
  work_photo: string | null;
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
  const { user } = useAuth();
  const examId = Number(params.id);
  const studentId = Number(params.studentId);

  const userRole = user?.role;
  const isAdmin = userRole === 'admin';

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ExamResultData | null>(null);
  const [answers, setAnswers] = useState<AnswerData[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);

  // Essay grading state
  const [gradingId, setGradingId] = useState<number | null>(null);
  const [gradingScore, setGradingScore] = useState('');
  const [gradingFeedback, setGradingFeedback] = useState('');
  const [gradingSubmitting, setGradingSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get(`/exams/${examId}/results/${studentId}`);
      const data = response.data?.data;

      if (data) {
        setResult(data.result);
        setAnswers(data.answers || []);
        setSnapshots(data.snapshots || []);
      }
    } catch (error) {
      console.error('Failed to fetch result:', error);
      toast.error('Gagal memuat data hasil ujian');
    } finally {
      setLoading(false);
    }
  }, [examId, studentId, toast, isAdmin]);

  useEffect(() => {
    if (!userRole) return;
    if (!isAdmin) {
      setLoading(false);
      router.replace('/ujian');
      return;
    }

    fetchData();
  }, [fetchData, isAdmin, userRole, router]);

  const startGrading = (answer: AnswerData) => {
    setGradingId(answer.id);
    setGradingScore(answer.score?.toString() || '');
    setGradingFeedback(answer.feedback || '');
  };

  const cancelGrading = () => {
    setGradingId(null);
    setGradingScore('');
    setGradingFeedback('');
  };

  const submitGrading = async (answerId: number, maxPoints: number) => {
    const score = parseFloat(gradingScore);
    if (isNaN(score) || score < 0 || score > maxPoints) {
      toast.error(`Skor harus antara 0 dan ${maxPoints}`);
      return;
    }
    setGradingSubmitting(true);
    try {
      await api.post(`/exams/${examId}/grade-answer/${answerId}`, {
        score,
        feedback: gradingFeedback || null,
      });
      toast.success('Nilai essay berhasil disimpan');
      setGradingId(null);
      setGradingScore('');
      setGradingFeedback('');
      // Refresh data to get updated scores
      await fetchData();
    } catch {
      toast.error('Gagal menyimpan nilai');
    } finally {
      setGradingSubmitting(false);
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

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  if (userRole && !isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Akses ditolak</h2>
          <p className="text-slate-600 dark:text-slate-400 mt-2">Detail hasil ujian siswa hanya dapat diakses admin.</p>
          <Button className="mt-4" onClick={() => router.replace('/ujian')}>
            Kembali
          </Button>
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
                  <Image
                    src={getSecureFileUrl(snap.image_path)}
                    alt="Monitoring"
                    width={240}
                    height={240}
                    className="w-full aspect-square object-cover rounded-lg border"
                    unoptimized
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
                    ) : answer.is_correct ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Passage / Cerita Soal */}
                    {answer.question.passage && (
                      <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Bacaan</span>
                        <MathText text={answer.question.passage} as="p" className="text-sm text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-line" />
                      </div>
                    )}
                    {/* Question text */}
                    <MathText text={answer.question.question_text} as="p" className="text-slate-800 dark:text-white font-medium mb-2 whitespace-pre-line" />
                    
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        answer.question.type === 'multiple_choice' || answer.question.type === 'multiple_answer'
                          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400'
                          : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                      }`}>
                        {answer.question.type === 'multiple_choice' ? 'Pilihan Ganda' : answer.question.type === 'multiple_answer' ? 'PG Kompleks' : 'Essay'}
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
                                {optText && !/^\[Gambar [A-Z]\]$/.test(optText) && (
                                  <MathText text={optText} />
                                )}
                                {optImage && (
                                  <Image
                                    src={getSecureFileUrl(optImage)}
                                    alt={`Gambar opsi ${String.fromCharCode(65 + optIdx)}`}
                                    width={200}
                                    height={128}
                                    className="mt-1 w-auto max-w-[200px] max-h-32 rounded border border-slate-200 dark:border-slate-700"
                                    unoptimized
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

                    {/* Multiple answer: show options with student answers marked */}
                    {answer.question.type === 'multiple_answer' && answer.question.options && (() => {
                      let studentAnswers: string[] = [];
                      try { studentAnswers = JSON.parse(answer.answer || '[]'); } catch { studentAnswers = []; }
                      let correctAnswers: string[] = [];
                      try { correctAnswers = JSON.parse(answer.question.correct_answer || '[]'); } catch { correctAnswers = []; }
                      return (
                        <div className="space-y-1.5 mb-3">
                          {(Array.isArray(answer.question.options) ? answer.question.options : []).map((rawOpt: string | { text: string; image?: string | null }, optIdx: number) => {
                            const optText = typeof rawOpt === 'string' ? rawOpt : (rawOpt.text || '');
                            const optImage = typeof rawOpt === 'string' ? null : (rawOpt.image || null);
                            const isStudentAnswer = studentAnswers.includes(optText);
                            const isCorrectAnswer = correctAnswers.includes(optText);
                            return (
                              <div
                                key={optIdx}
                                className={`flex items-start gap-2 text-sm px-3 py-1.5 rounded-lg ${
                                  isCorrectAnswer && isStudentAnswer
                                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700/50'
                                    : isStudentAnswer && !isCorrectAnswer
                                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700/50'
                                    : isCorrectAnswer && !isStudentAnswer
                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-700/50'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                }`}
                              >
                                <span className="w-6 h-6 flex items-center justify-center rounded-full border text-xs font-medium shrink-0 mt-0.5">
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <div className="flex-1">
                                  {optText && !/^\[Gambar [A-Z]\]$/.test(optText) && (
                                    <MathText text={optText} />
                                  )}
                                  {optImage && (
                                    <Image
                                      src={getSecureFileUrl(optImage)}
                                      alt={`Gambar opsi ${String.fromCharCode(65 + optIdx)}`}
                                      width={200}
                                      height={128}
                                      className="mt-1 w-auto max-w-[200px] max-h-32 rounded border border-slate-200 dark:border-slate-700"
                                      unoptimized
                                    />
                                  )}
                                </div>
                                {isStudentAnswer && isCorrectAnswer && (
                                  <span className="text-xs font-medium text-green-600 shrink-0">✓ Benar</span>
                                )}
                                {isStudentAnswer && !isCorrectAnswer && (
                                  <span className="text-xs font-medium text-red-600 shrink-0">✗ Salah</span>
                                )}
                                {isCorrectAnswer && !isStudentAnswer && (
                                  <span className="text-xs font-medium text-yellow-600 shrink-0">⚠ Tidak dipilih</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Essay: show student answer */}
                    {answer.question.type === 'essay' && (
                      <div className="mb-3">
                        <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Jawaban Siswa:</p>
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap border">
                          {answer.answer || <span className="text-slate-600 dark:text-slate-400 italic">Tidak dijawab</span>}
                        </div>

                        {/* Auto-graded result for essay with keywords */}
                        {answer.question.essay_keywords && answer.question.essay_keywords.length > 0 && (
                          <div className={`mt-2 rounded-lg p-3 border ${
                            answer.is_correct
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/40'
                              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/40'
                          }`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={`text-xs font-semibold ${
                                answer.is_correct
                                  ? 'text-green-700 dark:text-green-300'
                                  : 'text-red-700 dark:text-red-300'
                              }`}>
                                {answer.is_correct
                                  ? `✅ Benar — Kata kunci ditemukan (${answer.score}/${answer.question.points} poin)`
                                  : `❌ Salah — Tidak ada kata kunci ditemukan (${answer.score ?? 1}/${answer.question.points} poin)`
                                }
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {answer.question.essay_keywords.map((kw, kwIdx) => {
                                const matched = answer.answer ? answer.answer.toLowerCase().includes(kw.toLowerCase()) : false;
                                return (
                                  <span
                                    key={kwIdx}
                                    className={`text-xs px-2 py-0.5 rounded-full border ${
                                      matched
                                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700'
                                        : 'bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border-red-200 dark:border-red-700'
                                    }`}
                                  >
                                    {matched ? '✓' : '✗'} {kw}
                                  </span>
                                );
                              })}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                              🤖 Dinilai otomatis — Minimal 1 kata kunci harus ada untuk nilai penuh, jika tidak ada sama sekali hanya mendapat 1 poin.
                            </p>
                          </div>
                        )}

                        {/* Teacher manual grading section */}
                        {isAdmin && (
                          <div className="mt-3">
                            {gradingId === answer.id ? (
                              <div className="rounded-lg border border-indigo-200 dark:border-indigo-700/50 bg-indigo-50 dark:bg-indigo-900/20 p-3 space-y-3">
                                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  Penilaian Manual Essay
                                </div>
                                <div className="flex items-center gap-3">
                                  <label className="text-xs text-slate-600 dark:text-slate-400 shrink-0">Skor:</label>
                                  <input
                                    type="number"
                                    min={0}
                                    max={answer.question.points}
                                    step="any"
                                    value={gradingScore}
                                    onChange={(e) => setGradingScore(e.target.value)}
                                    className="w-24 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                    placeholder="0"
                                  />
                                  <span className="text-xs text-slate-500">/ {answer.question.points}</span>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-600 dark:text-slate-400 mb-1 block">Feedback (opsional):</label>
                                  <textarea
                                    value={gradingFeedback}
                                    onChange={(e) => setGradingFeedback(e.target.value)}
                                    rows={2}
                                    maxLength={1000}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                    placeholder="Tulis catatan untuk siswa..."
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => submitGrading(answer.id, answer.question.points)}
                                    disabled={gradingSubmitting || gradingScore === ''}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
                                  >
                                    {gradingSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {gradingSubmitting ? 'Menyimpan...' : 'Simpan Nilai'}
                                  </button>
                                  <button
                                    onClick={cancelGrading}
                                    className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                  >
                                    Batal
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 flex-wrap">
                                <button
                                  onClick={() => startGrading(answer)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 rounded-lg transition-colors"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  {answer.graded_by ? 'Edit Nilai Manual' : 'Nilai Manual'}
                                </button>
                                {answer.graded_by && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    ✏️ Dinilai manual{answer.graded_at ? ` — ${new Date(answer.graded_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                                  </span>
                                )}
                                {answer.feedback && (
                                  <div className="w-full mt-1 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-800 dark:text-amber-300">
                                    <span className="font-semibold">Feedback:</span> {answer.feedback}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Show feedback to students (read-only) */}
                        {!isAdmin && answer.feedback && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 text-xs text-amber-800 dark:text-amber-300">
                            <span className="font-semibold">Catatan Guru:</span> {answer.feedback}
                          </div>
                        )}

                        {/* Work photo (foto cara kerja) */}
                        {answer.work_photo && (
                          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1.5">
                              📸 Foto Cara Kerja
                            </p>
                            <Image
                              src={getSecureFileUrl(answer.work_photo)}
                              alt="Foto cara kerja siswa"
                              width={1200}
                              height={800}
                              className="max-w-full h-auto max-h-96 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(getSecureFileUrl(answer.work_photo), '_blank')}
                              unoptimized
                            />
                          </div>
                        )}
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
