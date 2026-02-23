'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import {
  Loader2,
  FileText,
  ClipboardList,
  BookCheck,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Calendar,
  Search,
  GraduationCap,
  TimerOff,
  Send,
} from 'lucide-react';
import api from '@/services/api';

interface ExamRecord {
  id: number;
  title: string;
  subject: string;
  start_time: string;
  end_time: string;
  duration: number;
  status: 'completed' | 'in_progress' | 'missed' | 'upcoming';
  finished_at: string | null;
}

interface AssignmentRecord {
  id: number;
  title: string;
  subject: string;
  deadline: string;
  status: 'submitted' | 'graded' | 'late' | 'pending' | 'overdue';
  submitted_at: string | null;
}

type ActiveTab = 'semua' | 'ujian' | 'tugas';

export default function RiwayatPengumpulanPage() {
  const [examRecords, setExamRecords] = useState<ExamRecord[]>([]);
  const [assignmentRecords, setAssignmentRecords] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('semua');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    try {
      const [examsRes, assignmentsRes] = await Promise.all([
        api.get('/exams'),
        api.get('/assignments'),
      ]);

      const now = new Date();

      // Process exam records
      const rawExams = examsRes.data?.data;
      const examsData = Array.isArray(rawExams) ? rawExams : (rawExams?.data || []);
      const examRecordsData: ExamRecord[] = examsData.map(
        (exam: {
          id: number;
          title: string;
          subject: string;
          start_time: string;
          end_time: string;
          duration: number;
          my_result?: { status?: string; finished_at?: string };
        }) => {
          const startTime = new Date(exam.start_time);
          const endTime = new Date(exam.end_time);
          const resultStatus = exam.my_result?.status;

          let status: ExamRecord['status'] = 'upcoming';
          if (resultStatus === 'completed' || resultStatus === 'graded' || resultStatus === 'submitted') {
            status = 'completed';
          } else if (resultStatus === 'in_progress') {
            status = 'in_progress';
          } else if (now > endTime) {
            status = 'missed';
          } else if (now >= startTime && now <= endTime) {
            status = 'upcoming';
          }

          return {
            id: exam.id,
            title: exam.title,
            subject: exam.subject,
            start_time: exam.start_time,
            end_time: exam.end_time,
            duration: exam.duration,
            status,
            finished_at: exam.my_result?.finished_at || null,
          };
        }
      );
      setExamRecords(examRecordsData);

      // Process assignment records
      const rawAssignments = assignmentsRes.data?.data;
      const assignmentsData = Array.isArray(rawAssignments) ? rawAssignments : (rawAssignments?.data || []);
      const assignmentRecordsData: AssignmentRecord[] = assignmentsData.map(
        (a: {
          id: number;
          title: string;
          subject: string;
          deadline: string;
          has_submitted?: boolean;
          my_submission?: { status?: string; submitted_at?: string };
        }) => {
          const deadline = new Date(a.deadline);

          let status: AssignmentRecord['status'] = 'pending';
          if (a.has_submitted || a.my_submission) {
            if (a.my_submission?.status === 'graded') {
              status = 'graded';
            } else if (a.my_submission?.status === 'late') {
              status = 'late';
            } else {
              status = 'submitted';
            }
          } else if (now > deadline) {
            status = 'overdue';
          }

          return {
            id: a.id,
            title: a.title,
            subject: a.subject,
            deadline: a.deadline,
            status,
            submitted_at: a.my_submission?.submitted_at || null,
          };
        }
      );
      setAssignmentRecords(assignmentRecordsData);
    } catch (error) {
      console.error('Failed to fetch records:', error);
      setExamRecords([]);
      setAssignmentRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatDateTime = (dateString: string) => {
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

  // Stats
  const examCompleted = examRecords.filter(e => e.status === 'completed').length;
  const examMissed = examRecords.filter(e => e.status === 'missed').length;
  const assignmentSubmitted = assignmentRecords.filter(a => ['submitted', 'graded', 'late'].includes(a.status)).length;
  const assignmentPending = assignmentRecords.filter(a => a.status === 'pending').length;
  const assignmentOverdue = assignmentRecords.filter(a => a.status === 'overdue').length;

  // Filter by search
  const filteredExams = examRecords.filter(e =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredAssignments = assignmentRecords.filter(a =>
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getExamStatusBadge = (status: ExamRecord['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Selesai Dikerjakan
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium rounded-full">
            <Clock className="w-3.5 h-3.5" />
            Sedang Dikerjakan
          </span>
        );
      case 'missed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
            <TimerOff className="w-3.5 h-3.5" />
            Terlewat
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-medium rounded-full">
            <Clock className="w-3.5 h-3.5" />
            Belum Dikerjakan
          </span>
        );
    }
  };

  const getAssignmentStatusBadge = (status: AssignmentRecord['status']) => {
    switch (status) {
      case 'submitted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
            <Send className="w-3.5 h-3.5" />
            Sudah Dikumpulkan
          </span>
        );
      case 'graded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Sudah Dinilai
          </span>
        );
      case 'late':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded-full">
            <AlertTriangle className="w-3.5 h-3.5" />
            Terlambat Dikumpulkan
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-medium rounded-full">
            <Clock className="w-3.5 h-3.5" />
            Belum Dikumpulkan
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full">
            <XCircle className="w-3.5 h-3.5" />
            Melewati Deadline
          </span>
        );
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'semua', label: 'Semua', icon: <Layers className="w-4 h-4" />, count: examRecords.length + assignmentRecords.length },
    { key: 'ujian', label: 'Ujian', icon: <BookCheck className="w-4 h-4" />, count: examRecords.length },
    { key: 'tugas', label: 'Tugas', icon: <ClipboardList className="w-4 h-4" />, count: assignmentRecords.length },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Riwayat Pengumpulan</h1>
            <p className="text-blue-100/80">Rekap pengerjaan ujian dan pengumpulan tugas Anda</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Ujian Selesai</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{examCompleted}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <TimerOff className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Ujian Terlewat</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{examMissed}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Send className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Tugas Dikumpulkan</p>
                <p className="text-xl font-bold text-sky-600 dark:text-sky-400">{assignmentSubmitted}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Tugas Pending</p>
                <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{assignmentPending}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 col-span-2 md:col-span-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Lewat Deadline</p>
                <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{assignmentOverdue}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search & Tabs */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-lg">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key
                    ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari ujian atau tugas…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 dark:focus:border-sky-400 transition-colors"
              aria-label="Cari ujian atau tugas"
            />
          </div>
        </div>

        {/* Exam Records */}
        {(activeTab === 'ujian' || activeTab === 'semua') && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <div className="w-8 h-8 bg-sky-100 dark:bg-sky-900/30 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Riwayat Ujian</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{filteredExams.length} ujian</p>
              </div>
            </div>

            {filteredExams.length === 0 ? (
              <div className="p-8 text-center">
                <GraduationCap className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">Belum ada riwayat ujian</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredExams.map((exam) => (
                  <div
                    key={`exam-${exam.id}`}
                    className="px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-4"
                  >
                    {/* Status icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      exam.status === 'completed' ? 'bg-green-100 dark:bg-green-900/30' :
                      exam.status === 'in_progress' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                      exam.status === 'missed' ? 'bg-red-100 dark:bg-red-900/30' :
                      'bg-slate-100 dark:bg-slate-700/50'
                    }`}>
                      {exam.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" /> :
                       exam.status === 'in_progress' ? <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" /> :
                       exam.status === 'missed' ? <TimerOff className="w-5 h-5 text-red-600 dark:text-red-400" /> :
                       <GraduationCap className="w-5 h-5 text-slate-400 dark:text-slate-500" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">{exam.title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 rounded-full">{exam.subject}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDateTime(exam.start_time)}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {exam.duration} menit
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex-shrink-0">
                      {getExamStatusBadge(exam.status)}
                      {exam.finished_at && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 text-right">
                          Selesai: {formatDate(exam.finished_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Assignment Records */}
        {(activeTab === 'tugas' || activeTab === 'semua') && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Riwayat Tugas</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{filteredAssignments.length} tugas</p>
              </div>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="p-8 text-center">
                <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">Belum ada riwayat tugas</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAssignments.map((assignment) => (
                  <div
                    key={`assignment-${assignment.id}`}
                    className="px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex items-center gap-4"
                  >
                    {/* Status icon */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      assignment.status === 'submitted' || assignment.status === 'graded' ? 'bg-green-100 dark:bg-green-900/30' :
                      assignment.status === 'late' ? 'bg-orange-100 dark:bg-orange-900/30' :
                      assignment.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/30' :
                      'bg-slate-100 dark:bg-slate-700/50'
                    }`}>
                      {assignment.status === 'submitted' || assignment.status === 'graded' ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" /> :
                       assignment.status === 'late' ? <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" /> :
                       assignment.status === 'overdue' ? <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" /> :
                       <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white truncate">{assignment.title}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-full">{assignment.subject}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Deadline: {formatDateTime(assignment.deadline)}
                        </span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex-shrink-0">
                      {getAssignmentStatusBadge(assignment.status)}
                      {assignment.submitted_at && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 text-right">
                          Dikumpulkan: {formatDate(assignment.submitted_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
