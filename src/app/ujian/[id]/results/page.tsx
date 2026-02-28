'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import {
  ArrowLeft,
  Users,
  Award,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  Loader2,
  Search,
  Eye,
  BarChart3,
  FileText,
  Download,
  Printer,
  MessageSquare,
  AlertCircle,
} from 'lucide-react';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

interface StudentResult {
  id: number;
  student_id: number;
  status: string;
  total_score: number;
  max_score: number;
  percentage: number;
  score: number | null;
  total_correct: number;
  total_wrong: number;
  total_answered: number;
  started_at: string;
  finished_at: string | null;
  submitted_at: string | null;
  total_essays: number;
  graded_essays: number;
  ungraded_essays: number;
  student: {
    id: number;
    name: string;
    nisn: string;
  };
}

interface ResultSummary {
  total_students: number;
  completed: number;
  in_progress: number;
  not_started: number;
  missed: number;
  average_score: number | null;
  highest_score: number | null;
  lowest_score: number | null;
  passed: number;
  total_essay_questions: number;
  total_ungraded_essays: number;
  students_with_ungraded: number;
}

interface ExamInfo {
  id: number;
  title: string;
  subject: string;
  passing_score: number;
  end_time: string | null;
}

export default function ExamResultsPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Number(params.id);
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [summary, setSummary] = useState<ResultSummary | null>(null);
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'rank' | 'name'>('rank');
  const [filterStatus, setFilterStatus] = useState<string>('');

  const fetchResults = useCallback(async () => {
    try {
      const response = await api.get(`/exams/${examId}/results`);
      const data = response.data?.data;
      if (data) {
        setExamInfo(data.exam || null);
        setResults((data.results || []).map((r: StudentResult) => ({
          ...r,
          total_score: Number(r.total_score) || 0,
          max_score: Number(r.max_score) || 0,
          percentage: Number(r.percentage) || 0,
          score: r.score != null ? Number(r.score) : null,
          total_correct: Number(r.total_correct) || 0,
          total_wrong: Number(r.total_wrong) || 0,
          total_answered: Number(r.total_answered) || 0,
          total_essays: Number(r.total_essays) || 0,
          graded_essays: Number(r.graded_essays) || 0,
          ungraded_essays: Number(r.ungraded_essays) || 0,
        })));
        const s = data.summary;
        if (s) {
          setSummary({
            total_students: Number(s.total_students) || 0,
            completed: Number(s.completed) || 0,
            in_progress: Number(s.in_progress) || 0,
            not_started: Number(s.not_started) || 0,
            missed: Number(s.missed) || 0,
            average_score: s.average_score != null ? Number(s.average_score) : null,
            highest_score: s.highest_score != null ? Number(s.highest_score) : null,
            lowest_score: s.lowest_score != null ? Number(s.lowest_score) : null,
            passed: Number(s.passed) || 0,
            total_essay_questions: Number(s.total_essay_questions) || 0,
            total_ungraded_essays: Number(s.total_ungraded_essays) || 0,
            students_with_ungraded: Number(s.students_with_ungraded) || 0,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch results:', error);
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const filteredResults = results
    .filter(r => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = r.student?.name?.toLowerCase().includes(q) ||
          r.student?.nisn?.includes(searchQuery);
        if (!matchesSearch) return false;
      }
      if (filterStatus === 'needs_grading') {
        return r.ungraded_essays > 0;
      }
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.student?.name || '').localeCompare(b.student?.name || '');
      // not_started and missed go to bottom
      if ((a.status === 'not_started' || a.status === 'missed') && b.status !== 'not_started' && b.status !== 'missed') return 1;
      if ((b.status === 'not_started' || b.status === 'missed') && a.status !== 'not_started' && a.status !== 'missed') return -1;
      return b.percentage - a.percentage;
    });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-700 dark:text-green-400';
    if (score >= 60) return 'text-yellow-700 dark:text-yellow-400';
    return 'text-red-700 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'graded':
        return (
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
            Selesai
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-xs font-medium rounded-full">
            Mengerjakan
          </span>
        );
      case 'submitted':
        return (
          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
            Dikumpulkan
          </span>
        );
      case 'not_started':
        return (
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium rounded-full">
            Belum Mulai
          </span>
        );
      case 'missed':
        return (
          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium rounded-full">
            Tidak Mengerjakan
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full">
            {status}
          </span>
        );
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

  const avgScore = summary?.average_score ?? 0;
  const passedCount = summary?.passed ?? 0;
  const failedCount = (summary?.completed ?? 0) - passedCount + (summary?.missed ?? 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(user?.role === 'admin' ? '/admin/ujian' : '/ujian')}
              className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
              aria-label="Kembali ke daftar ujian"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hasil Ujian</h1>
              <p className="text-slate-600 dark:text-slate-400">
                {examInfo ? `${examInfo.title} — ${examInfo.subject}` : 'Lihat hasil ujian seluruh siswa'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
              <Printer className="w-5 h-5 mr-2" />
              Cetak
            </Button>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Total Peserta</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.total_students}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {summary.completed} selesai · {summary.in_progress} mengerjakan · {summary.not_started + summary.missed} belum
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/20 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Rata-rata Nilai</p>
                  <p className={`text-xl font-bold ${getScoreColor(avgScore)}`}>
                    {avgScore ? avgScore.toFixed(1) : '-'}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Lulus</p>
                  <p className="text-xl font-bold text-green-600">{passedCount}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Tertinggi: {summary.highest_score?.toFixed(1) ?? '-'}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Tidak Lulus</p>
                  <p className="text-xl font-bold text-red-600">{failedCount > 0 ? failedCount : 0}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Terendah: {summary.lowest_score?.toFixed(1) ?? '-'}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Ungraded essays alert */}
        {summary && summary.total_ungraded_essays > 0 && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                {summary.total_ungraded_essays} essay belum dinilai
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                {summary.students_with_ungraded} siswa memiliki jawaban essay yang perlu dinilai. 
                Klik ikon <Eye className="w-3.5 h-3.5 inline -mt-0.5" /> pada siswa bertanda <MessageSquare className="w-3.5 h-3.5 inline -mt-0.5 text-amber-600" /> untuk menilai.
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 dark:text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama atau NIS siswa…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              aria-label="Cari nama atau NIS siswa"
              name="searchResults"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            aria-label="Filter status"
            name="filterStatus"
          >
            <option value="">Semua Status</option>
            <option value="completed">Selesai</option>
            <option value="in_progress">Mengerjakan</option>
            <option value="needs_grading">Perlu Dinilai (Essay)</option>
            <option value="not_started">Belum Mulai</option>
            <option value="missed">Tidak Mengerjakan</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'rank' | 'name')}
            className="px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            aria-label="Urutkan hasil"
            name="sortBy"
          >
            <option value="rank">Urutkan: Nilai Tertinggi</option>
            <option value="name">Urutkan: Nama A-Z</option>
          </select>
        </div>

        {/* Results Table */}
        <Card className="overflow-hidden">
          {filteredResults.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada hasil ujian</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Hasil akan muncul setelah siswa mengerjakan ujian</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider w-12">
                      #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Siswa
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Benar/Salah
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Skor
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Nilai
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Waktu Selesai
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider print:hidden">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200">
                  {filteredResults.map((result, index) => (
                    <tr key={result.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-4 py-3 text-center text-sm text-slate-600 dark:text-slate-400 font-medium">
                        {sortBy === 'rank' ? index + 1 : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-900 dark:text-white">{result.student?.name}</span>
                            {result.ungraded_essays > 0 && (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-medium rounded-full"
                                title={`${result.ungraded_essays} dari ${result.total_essays} essay belum dinilai`}
                              >
                                <MessageSquare className="w-2.5 h-2.5" />
                                {result.ungraded_essays}
                              </span>
                            )}
                            {result.total_essays > 0 && result.ungraded_essays === 0 && (
                              <span 
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium rounded-full"
                                title={`Semua ${result.total_essays} essay sudah dinilai`}
                              >
                                <CheckCircle className="w-2.5 h-2.5" />
                                {result.graded_essays}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">{result.student?.nisn}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                        {result.status === 'in_progress' ? (
                          <span className="text-slate-600 dark:text-slate-400">-</span>
                        ) : (
                          <>
                            <span className="text-green-600 font-medium tabular-nums">{result.total_correct}</span>
                            <span className="text-slate-600 dark:text-slate-400 mx-1">/</span>
                            <span className="text-red-600 font-medium tabular-nums">{result.total_wrong}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                        {result.status === 'in_progress' ? (
                          <span className="text-slate-600 dark:text-slate-400">-</span>
                        ) : (
                          <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                            {result.total_score}/{result.max_score}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {result.status === 'in_progress' ? (
                          <Clock className="w-5 h-5 text-teal-500 mx-auto" />
                        ) : (
                          <div className={`inline-flex items-center justify-center w-11 h-11 rounded-full ${getScoreBg(result.percentage)}`}>
                            <span className={`text-sm font-bold tabular-nums ${getScoreColor(result.percentage)}`}>
                              {Number(result.percentage ?? 0).toFixed(0)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {getStatusBadge(result.status)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-slate-600 dark:text-slate-400">
                        {formatDate(result.finished_at || result.submitted_at)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center print:hidden">
                        {result.status !== 'not_started' && result.status !== 'missed' ? (
                          <Link href={`/ujian/${examId}/hasil/${result.student_id}`}>
                            <button className="p-2 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg" title="Lihat detail" aria-label="Lihat detail hasil">
                              <Eye className="w-4 h-4" />
                            </button>
                          </Link>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
