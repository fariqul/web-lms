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
  FileSpreadsheet,
} from 'lucide-react';
import api, { exportAPI } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useExamSocket } from '@/hooks/useSocket';

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
    nomor_tes?: string;
    class_id?: number;
    class_room?: { id: number; name: string } | null;
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
  const [sortBy, setSortBy] = useState<'rank' | 'name' | 'nomor_tes'>('nomor_tes');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterClass, setFilterClass] = useState<string>('');
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

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

  // Real-time updates via WebSocket
  const examSocket = useExamSocket(examId);

  useEffect(() => {
    if (!examSocket.isConnected) return;

    // New student submitted exam
    examSocket.onStudentSubmitted((data: unknown) => {
      const d = data as { student_id: number; student_name?: string; score?: number; percentage?: number; status?: string };
      setResults(prev => {
        const exists = prev.find(r => r.student_id === d.student_id);
        if (exists) {
          return prev.map(r => r.student_id === d.student_id ? {
            ...r,
            status: d.status || 'completed',
            total_score: d.score ?? r.total_score,
            percentage: d.percentage ?? r.percentage,
          } : r);
        }
        // If not in list yet, re-fetch to get full data
        fetchResults();
        return prev;
      });
      setSummary(prev => prev ? {
        ...prev,
        completed: prev.completed + 1,
        in_progress: Math.max(0, prev.in_progress - 1),
      } : prev);
    });

    // Student started exam
    examSocket.onStudentJoined((data: unknown) => {
      const d = data as { student_id: number };
      setResults(prev => prev.map(r => r.student_id === d.student_id ? { ...r, status: 'in_progress' } : r));
      setSummary(prev => prev ? {
        ...prev,
        in_progress: prev.in_progress + 1,
        not_started: Math.max(0, prev.not_started - 1),
      } : prev);
    });

    // Essay answer graded
    examSocket.onAnswerGraded((data: unknown) => {
      const d = data as { student_id: number; exam_result?: { id: number; total_score: number; percentage: number; status: string } };
      if (d.exam_result) {
        setResults(prev => prev.map(r => r.student_id === d.student_id ? {
          ...r,
          total_score: d.exam_result!.total_score,
          percentage: d.exam_result!.percentage,
          status: d.exam_result!.status,
          graded_essays: r.graded_essays + 1,
          ungraded_essays: Math.max(0, r.ungraded_essays - 1),
        } : r));
        setSummary(prev => prev ? {
          ...prev,
          total_ungraded_essays: Math.max(0, prev.total_ungraded_essays - 1),
        } : prev);
      }
    });

    // Manual score update
    examSocket.onResultScoreUpdated((data: unknown) => {
      const d = data as { student_id: number; result_id: number; total_score: number; percentage: number; status: string };
      setResults(prev => prev.map(r => r.student_id === d.student_id ? {
        ...r,
        total_score: d.total_score,
        percentage: d.percentage,
        status: d.status,
      } : r));
    });

    return () => {
      examSocket.off(`exam.${examId}.student-submitted`);
      examSocket.off(`exam.${examId}.student-joined`);
      examSocket.off(`exam.${examId}.answer-graded`);
      examSocket.off(`exam.${examId}.result-updated`);
    };
  }, [examSocket, examId, fetchResults]);

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try {
      const res = await exportAPI.exportExamResults(examId, { format });
      const blob = res.data;

      // Check if the response is actually a JSON error (500 returns JSON but responseType is blob)
      if (blob.type === 'application/json') {
        const text = await blob.text();
        const json = JSON.parse(text);
        alert(`Export gagal: ${json.message || 'Server error'}`);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Hasil_Ujian_${examInfo?.title?.replace(/\s+/g, '_') || examId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      // Try to extract error message from blob response
      const axiosErr = error as { response?: { data?: Blob } };
      if (axiosErr.response?.data instanceof Blob) {
        try {
          const text = await axiosErr.response.data.text();
          const json = JSON.parse(text);
          alert(`Export gagal: ${json.message || 'Server error'}`);
        } catch {
          alert('Gagal mengekspor data. Pastikan server sudah di-rebuild dengan package terbaru.');
        }
      } else {
        alert('Gagal mengekspor data. Coba lagi.');
      }
    } finally {
      setExporting(null);
    }
  };

  const filteredResults = results
    .filter(r => {
      // 1. Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSearch = r.student?.name?.toLowerCase().includes(q) ||
          r.student?.nisn?.toLowerCase().includes(q) ||
          r.student?.nomor_tes?.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      
      // 2. Class filter
      if (filterClass) {
        const studentClassId = r.student?.class_room?.id ?? r.student?.class_id;
        if (String(studentClassId) !== filterClass) {
          return false;
        }
      }
      
      // 3. Status filter
      if (filterStatus) {
        switch (filterStatus) {
          case 'needs_grading':
            if (!(r.ungraded_essays > 0)) return false;
            break;
          case 'all_finished':
            if (!['completed', 'graded', 'submitted'].includes(r.status)) return false;
            break;
          case 'completed':
            // "Selesai (Nilai Final)" includes completed and graded
            if (!['completed', 'graded'].includes(r.status)) return false;
            break;
          default:
            // Direct status match
            if (r.status !== filterStatus) return false;
        }
      }
      
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.student?.name || '').localeCompare(b.student?.name || '');
      if (sortBy === 'nomor_tes') {
        const aNt = a.student?.nomor_tes || '';
        const bNt = b.student?.nomor_tes || '';
        if (!aNt && !bNt) return 0;
        if (!aNt) return 1;
        if (!bNt) return -1;
        return aNt.localeCompare(bNt, undefined, { numeric: true });
      }
      // rank (by score)
      // not_started and missed go to bottom
      if ((a.status === 'not_started' || a.status === 'missed') && b.status !== 'not_started' && b.status !== 'missed') return 1;
      if ((b.status === 'not_started' || b.status === 'missed') && a.status !== 'not_started' && a.status !== 'missed') return -1;
      return b.percentage - a.percentage;
    });

  // Extract unique classes from results for filter dropdown
  const uniqueClasses = Array.from(
    new Map(
      results
        .filter(r => r.student?.class_room)
        .map(r => [r.student.class_room!.id, r.student.class_room!])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

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
        return (
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full" title="Ujian selesai, nilai final">
            Selesai
          </span>
        );
      case 'graded':
        return (
          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full" title="Semua essay sudah dinilai">
            Selesai
          </span>
        );
      case 'in_progress':
        return (
          <span className="px-2 py-1 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-xs font-medium rounded-full" title="Siswa sedang mengerjakan ujian">
            Mengerjakan
          </span>
        );
      case 'submitted':
        return (
          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full" title="Sudah dikumpulkan, ada essay yang belum dinilai">
            Perlu Dinilai
          </span>
        );
      case 'not_started':
        return (
          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium rounded-full" title="Siswa belum memulai ujian">
            Belum Mulai
          </span>
        );
      case 'missed':
        return (
          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-medium rounded-full" title="Waktu ujian sudah habis, siswa tidak mengerjakan">
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
            <Button
              variant="outline"
              onClick={() => handleExport('xlsx')}
              disabled={exporting !== null}
              className="print:hidden"
            >
              {exporting === 'xlsx' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 mr-2" />
              )}
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="print:hidden"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 mr-2" />
              )}
              PDF
            </Button>
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 dark:text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, NIS, atau No. Tes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              aria-label="Cari nama, NIS, atau No. Tes"
              name="searchResults"
            />
          </div>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            aria-label="Filter kelas"
            name="filterClass"
          >
            <option value="">Semua Kelas</option>
            {uniqueClasses.map(c => (
              <option key={c.id} value={String(c.id)}>{c.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            aria-label="Filter status"
            name="filterStatus"
          >
            <option value="">Semua Status</option>
            <option value="all_finished">Semua Sudah Selesai</option>
            <option value="completed">Selesai (Nilai Final)</option>
            <option value="submitted">Dikumpulkan (Perlu Dinilai Essay)</option>
            <option value="in_progress">Sedang Mengerjakan</option>
            <option value="needs_grading">Semua Perlu Dinilai</option>
            <option value="not_started">Belum Mulai</option>
            <option value="missed">Tidak Mengerjakan</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'rank' | 'name' | 'nomor_tes')}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            aria-label="Urutkan hasil"
            name="sortBy"
          >
            <option value="nomor_tes">Urutkan: No. Tes</option>
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
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      No. Tes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Siswa
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Kelas
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
                      <td className="px-4 py-3 text-center text-sm">
                        {result.student?.nomor_tes ? (
                          <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-xs font-mono rounded">
                            {result.student.nomor_tes}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-900 dark:text-white">{result.student?.name}</span>
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">{result.student?.nisn}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center text-sm">
                        {result.student?.class_room?.name ? (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium rounded">
                            {result.student.class_room.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
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
