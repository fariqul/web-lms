'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { BarChart3, TrendingUp, Award, BookOpen, Loader2, FileText } from 'lucide-react';
import api from '@/services/api';

interface GradeRecord {
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

export default function NilaiSiswaPage() {
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageScore, setAverageScore] = useState(0);

  useEffect(() => {
    fetchGrades();
  }, []);

  const fetchGrades = async () => {
    try {
      // Fetch all exams for the student (scheduled + active)
      const response = await api.get('/exams');
      const rawData = response.data?.data;
      const examsData = Array.isArray(rawData) ? rawData : (rawData?.data || []);
      // Filter exams that have been completed/graded by the student
      const gradesData = examsData
        .filter((exam: { my_result?: { status?: string } }) => 
          exam.my_result && ['completed', 'graded', 'submitted'].includes(exam.my_result.status || '')
        )
        .map((exam: { id: number; title: string; subject: string; my_result?: { status?: string; score?: number; percentage?: number; total_correct?: number; total_wrong?: number; finished_at?: string } }) => ({
          id: exam.id,
          exam_title: exam.title,
          subject: exam.subject,
          score: exam.my_result?.percentage ?? exam.my_result?.score ?? 0,
          total_correct: exam.my_result?.total_correct || 0,
          total_wrong: exam.my_result?.total_wrong || 0,
          finished_at: exam.my_result?.finished_at || '',
          passed: (exam.my_result?.percentage ?? exam.my_result?.score ?? 0) >= 70,
          result_status: exam.my_result?.status || '',
        }));
      setGrades(gradesData);
      
      if (gradesData.length > 0) {
        const avg = gradesData.reduce((sum: number, g: GradeRecord) => sum + g.score, 0) / gradesData.length;
        setAverageScore(Math.round(avg));
      }
    } catch (error) {
      console.error('Failed to fetch grades:', error);
      // Empty state if API fails
      setGrades([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 55) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return 'bg-green-100';
    if (score >= 70) return 'bg-blue-100';
    if (score >= 55) return 'bg-yellow-100';
    return 'bg-red-100';
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

  const passedCount = grades.filter(g => g.passed).length;
  const failedCount = grades.filter(g => !g.passed).length;
  const highestScore = grades.length > 0 ? Math.max(...grades.map(g => g.score)) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nilai Saya</h1>
          <p className="text-gray-600">Lihat rekap nilai ujian Anda</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Rata-rata Nilai</p>
                <p className={`text-2xl font-bold ${getScoreColor(averageScore)}`}>{averageScore || '-'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Ujian Lulus</p>
                <p className="text-2xl font-bold text-green-600">{passedCount}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Award className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Nilai Tertinggi</p>
                <p className="text-2xl font-bold text-yellow-600">{highestScore || '-'}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Ujian</p>
                <p className="text-2xl font-bold text-purple-600">{grades.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Grades List */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Riwayat Nilai Ujian</h2>
          </div>
          
          {grades.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Belum ada riwayat nilai</p>
              <p className="text-sm text-gray-400 mt-1">Nilai akan muncul setelah Anda mengerjakan ujian</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ujian
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mata Pelajaran
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Benar/Salah
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nilai
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tanggal
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {grades.map((grade) => (
                    <tr key={grade.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{grade.exam_title}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-teal-100 text-teal-700 text-sm rounded-full">
                          {grade.subject}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className="text-green-600">{grade.total_correct}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-600">{grade.total_wrong}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold ${getScoreBg(grade.score)} ${getScoreColor(grade.score)}`}>
                          {grade.score}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {grade.result_status === 'graded' ? (
                          grade.passed ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                              Lulus
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                              Remedial
                            </span>
                          )
                        ) : grade.result_status === 'completed' ? (
                          grade.passed ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                              Lulus
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 text-sm rounded-full">
                              Remedial
                            </span>
                          )
                        ) : (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-sm rounded-full">
                            Menunggu Nilai
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(grade.finished_at)}
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
