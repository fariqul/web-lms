'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { 
  Award, 
  Search, 
  Download,
  Printer,
  Loader2,
  Users,
  ChevronDown,
  ChevronUp,
  FileText,
  Pencil,
  Check,
  X,
  BookCheck,
  ClipboardList,
  Layers
} from 'lucide-react';
import { classAPI } from '@/services/api';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface ExamDetail {
  result_id: number;
  exam_name: string;
  subject: string;
  score: number;
  max_score: number;
  percentage: number;
  status: string;
  submitted_at: string;
}

interface AssignmentDetail {
  submission_id: number;
  assignment_name: string;
  subject: string;
  score: number | null;
  max_score: number;
  percentage: number | null;
  status: string;
  submitted_at: string;
}

interface StudentGrade {
  id: number;
  student_name: string;
  student_nis: string;
  class_name: string;
  exams: ExamDetail[];
  assignments: AssignmentDetail[];
  exam_average: number;
  assignment_average: number;
  average: number;
}

type ViewTab = 'gabungan' | 'ujian' | 'tugas';

export default function NilaiPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>('gabungan');
  const [editingExam, setEditingExam] = useState<{ studentId: number; resultId: number } | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<{ studentId: number; submissionId: number } | null>(null);
  const [editScore, setEditScore] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [classesRes, gradesRes] = await Promise.all([
        classAPI.getAll(),
        api.get('/teacher-grades'),
      ]);
      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );
      const gradesData = gradesRes.data?.data || [];
      setGrades(gradesData.map((g: StudentGrade) => ({
        id: g.id,
        student_name: g.student_name,
        student_nis: g.student_nis,
        class_name: g.class_name,
        exam_average: g.exam_average || 0,
        assignment_average: g.assignment_average || 0,
        average: g.average || 0,
        exams: (g.exams || []).map((e: ExamDetail) => ({
          result_id: e.result_id,
          exam_name: e.exam_name,
          subject: e.subject || '',
          score: e.score,
          max_score: e.max_score,
          percentage: e.percentage,
          status: e.status,
          submitted_at: e.submitted_at,
        })),
        assignments: (g.assignments || []).map((a: AssignmentDetail) => ({
          submission_id: a.submission_id,
          assignment_name: a.assignment_name,
          subject: a.subject || '',
          score: a.score,
          max_score: a.max_score,
          percentage: a.percentage,
          status: a.status,
          submitted_at: a.submitted_at,
        })),
      })));
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredGrades = grades.filter(g => {
    const matchesSearch = 
      g.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.student_nis.includes(searchQuery);
    const matchesClass = !filterClass || g.class_name === filterClass;
    return matchesSearch && matchesClass;
  });

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const handleEditExamScore = async (studentId: number, resultId: number) => {
    setSaving(true);
    try {
      await api.put(`/exam-results/${resultId}/score`, { score: Number(editScore) });
      toast.success('Nilai ujian berhasil diperbarui');
      setEditingExam(null);
      setEditScore('');
      fetchData();
    } catch {
      toast.error('Gagal memperbarui nilai');
    } finally {
      setSaving(false);
    }
  };

  const handleEditAssignmentScore = async (studentId: number, submissionId: number) => {
    setSaving(true);
    try {
      await api.post(`/submissions/${submissionId}/grade`, { score: Number(editScore) });
      toast.success('Nilai tugas berhasil diperbarui');
      setEditingAssignment(null);
      setEditScore('');
      fetchData();
    } catch {
      toast.error('Gagal memperbarui nilai');
    } finally {
      setSaving(false);
    }
  };

  const classAverages = classes.map(c => {
    const classGrades = grades.filter(g => g.class_name === c.label);
    const avg = classGrades.length > 0 
      ? classGrades.reduce((sum, g) => sum + g.average, 0) / classGrades.length
      : 0;
    return { class: c.label, average: avg, count: classGrades.length };
  });

  const overallExamAvg = grades.length > 0
    ? grades.reduce((sum, g) => sum + g.exam_average, 0) / grades.length
    : 0;

  const overallAssignmentAvg = grades.length > 0
    ? grades.reduce((sum, g) => sum + g.assignment_average, 0) / grades.length
    : 0;

  const overallAverage = grades.length > 0
    ? grades.reduce((sum, g) => sum + g.average, 0) / grades.length
    : 0;

  const totalExams = grades.reduce((sum, g) => sum + g.exams.length, 0);
  const totalAssignments = grades.reduce((sum, g) => sum + g.assignments.length, 0);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nilai Siswa</h1>
            <p className="text-gray-600">Lihat dan kelola nilai ujian & tugas siswa</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()} className="print:hidden">
              <Printer className="w-5 h-5 mr-2" />
              Cetak
            </Button>
            <Button variant="outline" className="print:hidden">
              <Download className="w-5 h-5 mr-2" />
              Export Nilai
            </Button>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { key: 'gabungan' as ViewTab, label: 'Gabungan', icon: Layers },
            { key: 'ujian' as ViewTab, label: 'Ujian', icon: BookCheck },
            { key: 'tugas' as ViewTab, label: 'Tugas', icon: ClipboardList },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewTab === tab.key
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Siswa</p>
                <p className="text-xl font-bold text-gray-900">{grades.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                <BookCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rata-rata Ujian</p>
                <p className={`text-xl font-bold ${getScoreColor(overallExamAvg)}`}>
                  {overallExamAvg.toFixed(1)}
                </p>
                <p className="text-xs text-gray-400">{totalExams} ujian</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rata-rata Tugas</p>
                <p className={`text-xl font-bold ${getScoreColor(overallAssignmentAvg)}`}>
                  {overallAssignmentAvg.toFixed(1)}
                </p>
                <p className="text-xs text-gray-400">{totalAssignments} tugas</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                <Award className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rata-rata Gabungan</p>
                <p className={`text-xl font-bold ${getScoreColor(overallAverage)}`}>
                  {overallAverage.toFixed(1)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Class Averages */}
        {classAverages.length > 0 && classAverages.some(c => c.count > 0) && (
          <Card className="p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Rata-rata Per Kelas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {classAverages.filter(c => c.count > 0).map((c, i) => (
                <div key={i} className="text-center">
                  <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${getScoreBg(c.average)}`}>
                    <span className={`text-lg font-bold ${getScoreColor(c.average)}`}>
                      {c.average.toFixed(0)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-700 mt-2">{c.class}</p>
                  <p className="text-xs text-gray-500">{c.count} siswa</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Cari nama atau NIS siswa…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              aria-label="Cari nama atau NIS siswa"
              name="searchNilai"
            />
          </div>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            aria-label="Filter kelas"
            name="filterClass"
          >
            <option value="">Semua Kelas</option>
            {classes.map(c => (
              <option key={c.value} value={c.label}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Grades Table */}
        <Card className="overflow-hidden">
          {filteredGrades.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Belum ada data nilai</p>
              <p className="text-sm text-gray-400 mt-1">Nilai akan muncul setelah siswa mengerjakan ujian atau tugas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Siswa
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kelas
                    </th>
                    {(viewTab === 'gabungan' || viewTab === 'ujian') && (
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ujian
                      </th>
                    )}
                    {(viewTab === 'gabungan' || viewTab === 'tugas') && (
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tugas
                      </th>
                    )}
                    {(viewTab === 'gabungan' || viewTab === 'ujian') && (
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Ujian
                      </th>
                    )}
                    {(viewTab === 'gabungan' || viewTab === 'tugas') && (
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Tugas
                      </th>
                    )}
                    {viewTab === 'gabungan' && (
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Gabungan
                      </th>
                    )}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredGrades.map((grade) => {
                    const displayAvg = viewTab === 'ujian' ? grade.exam_average
                      : viewTab === 'tugas' ? grade.assignment_average
                      : grade.average;
                    return (
                      <React.Fragment key={grade.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div>
                              <div className="font-medium text-gray-900">{grade.student_name}</div>
                              <div className="text-sm text-gray-500">{grade.student_nis}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                              {grade.class_name}
                            </span>
                          </td>
                          {(viewTab === 'gabungan' || viewTab === 'ujian') && (
                            <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                              {grade.exams.length}
                            </td>
                          )}
                          {(viewTab === 'gabungan' || viewTab === 'tugas') && (
                            <td className="px-4 py-4 whitespace-nowrap text-center text-sm text-gray-600">
                              {grade.assignments.length}
                            </td>
                          )}
                          {(viewTab === 'gabungan' || viewTab === 'ujian') && (
                            <td className="px-4 py-4 whitespace-nowrap text-center">
                              <span className={`font-bold tabular-nums ${getScoreColor(grade.exam_average)}`}>
                                {grade.exam_average.toFixed(1)}
                              </span>
                            </td>
                          )}
                          {(viewTab === 'gabungan' || viewTab === 'tugas') && (
                            <td className="px-4 py-4 whitespace-nowrap text-center">
                              <span className={`font-bold tabular-nums ${getScoreColor(grade.assignment_average)}`}>
                                {grade.assignment_average.toFixed(1)}
                              </span>
                            </td>
                          )}
                          {viewTab === 'gabungan' && (
                            <td className="px-4 py-4 whitespace-nowrap text-center">
                              <span className={`text-lg font-bold tabular-nums ${getScoreColor(grade.average)}`}>
                                {grade.average.toFixed(1)}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            {displayAvg >= 75 ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                                Lulus
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                                Remedial
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-center">
                            <button
                              onClick={() => setExpandedStudent(expandedStudent === grade.id ? null : grade.id)}
                              className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                              aria-label={expandedStudent === grade.id ? 'Tutup detail nilai' : 'Lihat detail nilai'}
                            >
                              {expandedStudent === grade.id ? (
                                <ChevronUp className="w-5 h-5" />
                              ) : (
                                <ChevronDown className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expanded Detail */}
                        {expandedStudent === grade.id && (
                          <tr>
                            <td colSpan={10} className="px-4 py-4 bg-gray-50">
                              <div className="space-y-4">
                                {/* Exam Section */}
                                {(viewTab === 'gabungan' || viewTab === 'ujian') && (
                                  <div>
                                    <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                                      <BookCheck className="w-4 h-4 text-indigo-600" />
                                      Nilai Ujian ({grade.exams.length})
                                    </h4>
                                    {grade.exams.length === 0 ? (
                                      <p className="text-sm text-gray-400">Belum ada ujian yang dikerjakan</p>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {grade.exams.map((exam, i) => (
                                          <div key={i} className="bg-white p-3 rounded-lg border border-gray-200">
                                            <div className="flex justify-between items-start">
                                              <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">{exam.exam_name}</p>
                                                {exam.subject && (
                                                  <p className="text-xs text-indigo-600 mt-0.5">{exam.subject}</p>
                                                )}
                                                <p className="text-xs text-gray-500 mt-1">
                                                  {new Date(exam.submitted_at).toLocaleDateString('id-ID')}
                                                </p>
                                              </div>
                                              <div className="flex items-center gap-2 ml-2">
                                                {editingExam?.studentId === grade.id && editingExam?.resultId === exam.result_id ? (
                                                  <div className="flex items-center gap-1">
                                                    <input
                                                      type="number"
                                                      value={editScore}
                                                      onChange={(e) => setEditScore(e.target.value)}
                                                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500"
                                                      min="0"
                                                      max={exam.max_score}
                                                    />
                                                    <button
                                                      onClick={() => handleEditExamScore(grade.id, exam.result_id)}
                                                      disabled={saving}
                                                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                      aria-label="Simpan nilai"
                                                    >
                                                      <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                      onClick={() => { setEditingExam(null); setEditScore(''); }}
                                                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                      aria-label="Batal edit"
                                                    >
                                                      <X className="w-4 h-4" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <>
                                                    <div className={`px-2 py-1 rounded ${getScoreBg(exam.percentage)}`}>
                                                      <span className={`text-sm font-bold ${getScoreColor(exam.percentage)}`}>
                                                        {exam.score}/{exam.max_score}
                                                      </span>
                                                    </div>
                                                    <button
                                                      onClick={() => {
                                                        setEditingExam({ studentId: grade.id, resultId: exam.result_id });
                                                        setEditScore(exam.score.toString());
                                                        setEditingAssignment(null);
                                                      }}
                                                      className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded"
                                                      title="Edit nilai"
                                                    >
                                                      <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Assignment Section */}
                                {(viewTab === 'gabungan' || viewTab === 'tugas') && (
                                  <div>
                                    <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                                      <ClipboardList className="w-4 h-4 text-purple-600" />
                                      Nilai Tugas ({grade.assignments.length})
                                    </h4>
                                    {grade.assignments.length === 0 ? (
                                      <p className="text-sm text-gray-400">Belum ada tugas yang dikumpulkan</p>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {grade.assignments.map((assignment, i) => (
                                          <div key={i} className="bg-white p-3 rounded-lg border border-gray-200">
                                            <div className="flex justify-between items-start">
                                              <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">{assignment.assignment_name}</p>
                                                {assignment.subject && (
                                                  <p className="text-xs text-purple-600 mt-0.5">{assignment.subject}</p>
                                                )}
                                                <p className="text-xs text-gray-500 mt-1">
                                                  {new Date(assignment.submitted_at).toLocaleDateString('id-ID')}
                                                </p>
                                              </div>
                                              <div className="flex items-center gap-2 ml-2">
                                                {editingAssignment?.studentId === grade.id && editingAssignment?.submissionId === assignment.submission_id ? (
                                                  <div className="flex items-center gap-1">
                                                    <input
                                                      type="number"
                                                      value={editScore}
                                                      onChange={(e) => setEditScore(e.target.value)}
                                                      className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-teal-500"
                                                      min="0"
                                                      max={assignment.max_score}
                                                    />
                                                    <button
                                                      onClick={() => handleEditAssignmentScore(grade.id, assignment.submission_id)}
                                                      disabled={saving}
                                                      className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                      aria-label="Simpan nilai"
                                                    >
                                                      <Check className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                      onClick={() => { setEditingAssignment(null); setEditScore(''); }}
                                                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                      aria-label="Batal edit"
                                                    >
                                                      <X className="w-4 h-4" />
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <>
                                                    {assignment.score !== null ? (
                                                      <div className={`px-2 py-1 rounded ${getScoreBg(assignment.percentage || 0)}`}>
                                                        <span className={`text-sm font-bold ${getScoreColor(assignment.percentage || 0)}`}>
                                                          {assignment.score}/{assignment.max_score}
                                                        </span>
                                                      </div>
                                                    ) : (
                                                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded">
                                                        Belum dinilai
                                                      </span>
                                                    )}
                                                    <button
                                                      onClick={() => {
                                                        setEditingAssignment({ studentId: grade.id, submissionId: assignment.submission_id });
                                                        setEditScore(assignment.score?.toString() || '');
                                                        setEditingExam(null);
                                                      }}
                                                      className="p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded"
                                                      title="Edit nilai"
                                                      aria-label="Edit nilai tugas"
                                                    >
                                                      <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
