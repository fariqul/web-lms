'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { BarChart3, Award, Loader2, FileText, ClipboardList, BookCheck, Layers } from 'lucide-react';
import api from '@/services/api';

interface ExamGrade {
  id: number;
  exam_title: string;
  subject: string;
  score: number;
  total_correct: number;
  total_wrong: number;
  finished_at: string;
  passed: boolean;
  result_status: string;
}

interface AssignmentGrade {
  id: number;
  assignment_title: string;
  subject: string;
  score: number | null;
  max_score: number;
  percentage: number | null;
  status: string;
  submitted_at: string;
}

type ActiveTab = 'gabungan' | 'ujian' | 'tugas';

export default function NilaiSiswaPage() {
  const [examGrades, setExamGrades] = useState<ExamGrade[]>([]);
  const [assignmentGrades, setAssignmentGrades] = useState<AssignmentGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('gabungan');

  useEffect(() => {
    fetchGrades();
  }, []);

  const fetchGrades = async () => {
    try {
      const [examsRes, assignmentsRes] = await Promise.all([
        api.get('/exams'),
        api.get('/assignments'),
      ]);

      // Process exam grades
      const rawExams = examsRes.data?.data;
      const examsData = Array.isArray(rawExams) ? rawExams : (rawExams?.data || []);
      const examGradesData = examsData
        .filter((exam: { my_result?: { status?: string } }) =>
          exam.my_result && ['completed', 'graded', 'submitted'].includes(exam.my_result.status || '')
        )
        .map((exam: { id: number; title: string; subject: string; my_result?: { status?: string; score?: number; percentage?: number; total_correct?: number; total_wrong?: number; finished_at?: string } }) => ({
          id: exam.id,
          exam_title: exam.title,
          subject: exam.subject,
          score: Number(exam.my_result?.percentage ?? exam.my_result?.score ?? 0) || 0,
          total_correct: exam.my_result?.total_correct || 0,
          total_wrong: exam.my_result?.total_wrong || 0,
          finished_at: exam.my_result?.finished_at || '',
          passed: (exam.my_result?.percentage ?? exam.my_result?.score ?? 0) >= 70,
          result_status: exam.my_result?.status || '',
        }));
      setExamGrades(examGradesData);

      // Process assignment grades
      const rawAssignments = assignmentsRes.data?.data;
      const assignmentsData = Array.isArray(rawAssignments) ? rawAssignments : (rawAssignments?.data || []);
      const assignmentGradesData = assignmentsData
        .filter((a: { has_submitted?: boolean; my_submission?: object | null }) =>
          a.has_submitted || a.my_submission
        )
        .map((a: { id: number; title: string; subject: string; max_score: number; my_submission?: { score?: number | null; status?: string; submitted_at?: string } }) => ({
          id: a.id,
          assignment_title: a.title,
          subject: a.subject,
          score: a.my_submission?.score ?? null,
          max_score: a.max_score || 100,
          percentage: (a.my_submission?.score !== null && a.my_submission?.score !== undefined && a.max_score > 0)
            ? Math.round((a.my_submission.score / a.max_score) * 100)
            : null,
          status: a.my_submission?.status || 'submitted',
          submitted_at: a.my_submission?.submitted_at || '',
        }));
      setAssignmentGrades(assignmentGradesData);
    } catch (error) {
      console.error('Failed to fetch grades:', error);
      setExamGrades([]);
      setAssignmentGrades([]);
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

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-teal-600';
    if (score >= 55) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return 'bg-green-100';
    if (score >= 70) return 'bg-teal-50';
    if (score >= 55) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  // Calculate stats
  const examAvg = examGrades.length > 0
    ? Math.round(examGrades.reduce((s, g) => s + g.score, 0) / examGrades.length)
    : 0;
  const gradedAssignments = assignmentGrades.filter(a => a.percentage !== null);
  const assignmentAvg = gradedAssignments.length > 0
    ? Math.round(gradedAssignments.reduce((s, g) => s + (g.percentage || 0), 0) / gradedAssignments.length)
    : 0;
  const allScores = [
    ...examGrades.map(g => g.score),
    ...gradedAssignments.map(g => g.percentage || 0),
  ];
  const combinedAvg = allScores.length > 0
    ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
    : 0;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  const tabs: { key: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { key: 'gabungan', label: 'Gabungan', icon: <Layers className="w-4 h-4" /> },
    { key: 'ujian', label: 'Ujian', icon: <BookCheck className="w-4 h-4" /> },
    { key: 'tugas', label: 'Tugas', icon: <ClipboardList className="w-4 h-4" /> },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nilai Saya</h1>
          <p className="text-slate-600">Lihat rekap nilai ujian dan tugas Anda</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-teal-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Rata-rata Gabungan</p>
                <p className={`text-2xl font-bold ${getScoreColor(combinedAvg)}`}>{combinedAvg || '-'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-teal-100 rounded-lg flex items-center justify-center">
                <BookCheck className="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Rata-rata Ujian</p>
                <p className={`text-2xl font-bold ${getScoreColor(examAvg)}`}>{examAvg || '-'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Rata-rata Tugas</p>
                <p className={`text-2xl font-bold ${getScoreColor(assignmentAvg)}`}>{assignmentAvg || '-'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Award className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Dinilai</p>
                <p className="text-2xl font-bold text-green-600">
                  {examGrades.length + gradedAssignments.length}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Exam Grades Table */}
        {(activeTab === 'ujian' || activeTab === 'gabungan') && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b flex items-center gap-2">
              <BookCheck className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-semibold text-slate-900">Nilai Ujian</h2>
              <span className="text-sm text-slate-500">({examGrades.length})</span>
            </div>

            {examGrades.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Belum ada riwayat nilai ujian</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Ujian</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mata Pelajaran</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Benar/Salah</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Nilai</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {examGrades.map((grade) => (
                      <tr key={`exam-${grade.id}`} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{grade.exam_title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-teal-100 text-teal-700 text-sm rounded-full">{grade.subject}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {grade.total_correct === 0 && grade.total_wrong === 0 ? (
                            <span className="text-slate-400 text-sm">-</span>
                          ) : (
                            <>
                              <span className="text-green-600 font-medium">{grade.total_correct}</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="text-red-600 font-medium">{grade.total_wrong}</span>
                            </>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold ${getScoreBg(grade.score)} ${getScoreColor(grade.score)}`}>
                            {grade.score}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {['graded', 'completed'].includes(grade.result_status) ? (
                            grade.passed ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">Lulus</span>
                            ) : (
                              <span className="px-2 py-1 bg-red-100 text-red-700 text-sm rounded-full">Remedial</span>
                            )
                          ) : (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-full">Menunggu Nilai</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(grade.finished_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Assignment Grades Table */}
        {(activeTab === 'tugas' || activeTab === 'gabungan') && (
          <Card className="overflow-hidden">
            <div className="p-4 border-b flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold text-slate-900">Nilai Tugas</h2>
              <span className="text-sm text-slate-500">({assignmentGrades.length})</span>
            </div>

            {assignmentGrades.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">Belum ada riwayat nilai tugas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tugas</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Mata Pelajaran</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Skor</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Nilai</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {assignmentGrades.map((grade) => (
                      <tr key={`assignment-${grade.id}`} className="hover:bg-slate-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{grade.assignment_title}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm rounded-full">{grade.subject}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {grade.score !== null ? (
                            <span className="text-slate-700 font-medium">{grade.score}/{grade.max_score}</span>
                          ) : (
                            <span className="text-slate-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {grade.percentage !== null ? (
                            <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold ${getScoreBg(grade.percentage)} ${getScoreColor(grade.percentage)}`}>
                              {grade.percentage}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {grade.status === 'graded' ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">Dinilai</span>
                          ) : grade.status === 'late' ? (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 text-sm rounded-full">Terlambat</span>
                          ) : (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-full">Menunggu Nilai</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{formatDate(grade.submitted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
