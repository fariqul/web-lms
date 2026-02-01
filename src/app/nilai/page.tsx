'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { 
  Award, 
  Search, 
  Download,
  Filter,
  Loader2,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  FileText
} from 'lucide-react';
import { classAPI } from '@/services/api';

interface StudentGrade {
  id: number;
  student_name: string;
  student_nis: string;
  class_name: string;
  exams: {
    exam_name: string;
    score: number;
    max_score: number;
    submitted_at: string;
  }[];
  average: number;
}

export default function NilaiPage() {
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const classesRes = await classAPI.getAll();
      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );
      // Grades would come from API
      setGrades([]);
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

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const classAverages = classes.map(c => {
    const classGrades = grades.filter(g => g.class_name === c.label);
    const avg = classGrades.length > 0 
      ? classGrades.reduce((sum, g) => sum + g.average, 0) / classGrades.length
      : 0;
    return { class: c.label, average: avg, count: classGrades.length };
  });

  const overallAverage = grades.length > 0
    ? grades.reduce((sum, g) => sum + g.average, 0) / grades.length
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nilai Siswa</h1>
            <p className="text-gray-600">Lihat dan kelola nilai ujian siswa</p>
          </div>
          <Button variant="outline">
            <Download className="w-5 h-5 mr-2" />
            Export Nilai
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
              <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                <Award className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Rata-rata Nilai</p>
                <p className={`text-xl font-bold ${getScoreColor(overallAverage)}`}>
                  {overallAverage.toFixed(1)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Lulus (≥75)</p>
                <p className="text-xl font-bold text-green-600">
                  {grades.filter(g => g.average >= 75).length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Perlu Remedial</p>
                <p className="text-xl font-bold text-red-600">
                  {grades.filter(g => g.average < 75).length}
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
              placeholder="Cari nama atau NIS siswa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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
              <p className="text-sm text-gray-400 mt-1">Nilai akan muncul setelah siswa mengerjakan ujian</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Siswa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kelas
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Jumlah Ujian
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rata-rata
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredGrades.map((grade) => (
                    <React.Fragment key={grade.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="font-medium text-gray-900">{grade.student_name}</div>
                            <div className="text-sm text-gray-500">{grade.student_nis}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                            {grade.class_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {grade.exams.length}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`text-lg font-bold ${getScoreColor(grade.average)}`}>
                            {grade.average.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {grade.average >= 75 ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                              Lulus
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                              Remedial
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button
                            onClick={() => setExpandedStudent(expandedStudent === grade.id ? null : grade.id)}
                            className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                          >
                            {expandedStudent === grade.id ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedStudent === grade.id && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-gray-50">
                            <div className="space-y-2">
                              <h4 className="font-medium text-gray-700 mb-3">Detail Nilai Ujian</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {grade.exams.map((exam, i) => (
                                  <div key={i} className="bg-white p-3 rounded-lg border border-gray-200">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <p className="font-medium text-gray-900">{exam.exam_name}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                          Dikerjakan: {new Date(exam.submitted_at).toLocaleDateString('id-ID')}
                                        </p>
                                      </div>
                                      <div className={`px-2 py-1 rounded ${getScoreBg(exam.score)}`}>
                                        <span className={`font-bold ${getScoreColor(exam.score)}`}>
                                          {exam.score}/{exam.max_score}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
