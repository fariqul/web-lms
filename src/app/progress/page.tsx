'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, Button, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { BarChart3, TrendingUp, TrendingDown, Minus, Loader2, Download, Users, BookOpen, ClipboardList, GraduationCap, Printer } from 'lucide-react';
import { classAPI, progressAPI, exportAPI } from '@/services/api';
import { SimpleBarChart } from '@/components/ui/Chart';

interface StudentReport {
  student: {
    id: number;
    name: string;
    nisn: string;
    class_name: string;
  };
  summary: {
    average_score: number;
    total_exams: number;
    attendance_rate: number;
    total_assignments: number;
    assignments_submitted: number;
  };
  exam_scores: Array<{
    exam_id: number;
    title: string;
    subject: string;
    score: number;
    max_score: number;
    percentage: number;
    date: string;
  }>;
  subject_averages: Array<{
    subject: string;
    average: number;
    count: number;
  }>;
  attendance_summary: {
    hadir: number;
    izin: number;
    sakit: number;
    alpha: number;
    total_sessions: number;
  };
  trend: 'up' | 'down' | 'stable';
}

interface ClassReport {
  class_name: string;
  total_students: number;
  class_average: number;
  attendance_rate: number;
  students: Array<{
    id: number;
    name: string;
    nisn: string;
    average_score: number;
    attendance_rate: number;
    rank: number;
  }>;
  subject_averages: Array<{
    subject: string;
    average: number;
  }>;
}

export default function ProgressPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [semester, setSemester] = useState('ganjil');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [viewMode, setViewMode] = useState<'class' | 'student'>('class');
  const [classReport, setClassReport] = useState<ClassReport | null>(null);
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await classAPI.getAll();
        const data = res.data?.data || [];
        setClasses(data.map((c: { id: number; name: string }) => ({ value: c.id.toString(), label: c.name })));
      } catch {
        toast.error('Gagal memuat data kelas');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchClassReport = useCallback(async () => {
    if (!selectedClass) return;
    setLoadingReport(true);
    setClassReport(null);
    setStudentReport(null);
    try {
      const res = await progressAPI.getClassReport(parseInt(selectedClass), { semester, academic_year: academicYear });
      setClassReport(res.data?.data || null);
      setViewMode('class');
    } catch {
      toast.error('Gagal memuat laporan kelas');
    } finally {
      setLoadingReport(false);
    }
  }, [selectedClass, semester, academicYear, toast]);

  const fetchStudentReport = useCallback(async (studentId: number) => {
    setLoadingReport(true);
    setStudentReport(null);
    try {
      const res = await progressAPI.getStudentReport(studentId, { semester, academic_year: academicYear });
      setStudentReport(res.data?.data || null);
      setSelectedStudent(studentId.toString());
      setViewMode('student');
    } catch {
      toast.error('Gagal memuat laporan siswa');
    } finally {
      setLoadingReport(false);
    }
  }, [semester, academicYear, toast]);

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      let blob: Blob;
      let filename: string;

      if (viewMode === 'student' && studentReport) {
        const res = await exportAPI.exportStudentReport(studentReport.student.id, { semester, format });
        blob = res.data;
        filename = `rapor_${studentReport.student.name.replace(/\s+/g, '_')}_${semester}.${format}`;
      } else if (selectedClass) {
        const res = await exportAPI.exportGrades({ class_id: parseInt(selectedClass), format });
        blob = res.data;
        const className = classes.find(c => c.value === selectedClass)?.label || 'kelas';
        filename = `laporan_${className.replace(/\s+/g, '_')}_${semester}.${format}`;
      } else {
        toast.warning('Pilih kelas terlebih dahulu');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Berhasil mengekspor ${format.toUpperCase()}`);
    } catch {
      toast.error('Gagal mengekspor laporan');
    } finally {
      setExporting(false);
    }
  };

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Laporan Progress Siswa</h1>
            <p className="text-gray-600">Rapor dan analisis nilai per semester</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />Cetak
            </Button>
            <Button variant="outline" onClick={() => handleExport('xlsx')} disabled={exporting || (!classReport && !studentReport)}>
              <Download className="w-4 h-4 mr-2" />{exporting ? 'Mengekspor...' : 'Excel'}
            </Button>
            <Button variant="outline" onClick={() => handleExport('pdf')} disabled={exporting || (!classReport && !studentReport)}>
              <Download className="w-4 h-4 mr-2" />{exporting ? 'Mengekspor...' : 'PDF'}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4 print:hidden">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Select
              label="Kelas"
              options={[{ value: '', label: 'Pilih kelas...' }, ...classes]}
              value={selectedClass}
              onChange={(e) => { setSelectedClass(e.target.value); setSelectedStudent(''); }}
            />
            <Select
              label="Semester"
              options={[{ value: 'ganjil', label: 'Ganjil' }, { value: 'genap', label: 'Genap' }]}
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
            />
            <Select
              label="Tahun Ajaran"
              options={[
                { value: '2025/2026', label: '2025/2026' },
                { value: '2024/2025', label: '2024/2025' },
                { value: '2023/2024', label: '2023/2024' },
              ]}
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
            <div className="flex items-end">
              <Button onClick={fetchClassReport} disabled={!selectedClass || loadingReport} className="w-full">
                {loadingReport ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-2" />}
                Tampilkan
              </Button>
            </div>
          </div>
        </Card>

        {loadingReport && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          </div>
        )}

        {/* Class Report View */}
        {viewMode === 'class' && classReport && !loadingReport && (
          <>
            {/* Class Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Jumlah Siswa</p>
                    <p className="text-xl font-bold text-gray-900">{classReport.total_students}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Rata-rata Kelas</p>
                    <p className={`text-xl font-bold ${getScoreColor(Number(classReport.class_average ?? 0))}`}>{Number(classReport.class_average ?? 0).toFixed(1)}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <ClipboardList className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Kehadiran</p>
                    <p className="text-xl font-bold text-gray-900">{Number(classReport.attendance_rate ?? 0).toFixed(1)}%</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Mata Pelajaran</p>
                    <p className="text-xl font-bold text-gray-900">{classReport.subject_averages.length}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Subject Averages Chart */}
            {classReport.subject_averages.length > 0 && (
              <Card className="p-4">
                <CardHeader title="Rata-rata per Mata Pelajaran" subtitle={classReport.class_name} />
                <div className="h-64">
                  <SimpleBarChart
                    data={classReport.subject_averages.map(sa => ({
                      name: sa.subject.length > 12 ? sa.subject.substring(0, 12) + '...' : sa.subject,
                      value: Math.round(Number(sa.average) * 10) / 10,
                    }))}
                    dataKey="value"
                    color="#0d9488"
                  />
                </div>
              </Card>
            )}

            {/* Student Rankings Table */}
            <Card>
              <CardHeader title="Peringkat Siswa" subtitle={`${classReport.class_name} - Semester ${semester === 'ganjil' ? 'Ganjil' : 'Genap'} ${academicYear}`} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm print-table">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Peringkat</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">NISN</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Nama</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Rata-rata</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">Kehadiran</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600 print:hidden">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classReport.students.map((s) => (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${s.rank <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                            {s.rank}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 font-mono text-xs">{s.nisn}</td>
                        <td className="py-3 px-4 font-medium">{s.name}</td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${getScoreColor(Number(s.average_score ?? 0))}`}>{Number(s.average_score ?? 0).toFixed(1)}</span>
                        </td>
                        <td className="py-3 px-4">{Number(s.attendance_rate ?? 0).toFixed(0)}%</td>
                        <td className="py-3 px-4 print:hidden">
                          <Button size="sm" variant="outline" onClick={() => fetchStudentReport(s.id)}>
                            Detail
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Individual Student Report View */}
        {viewMode === 'student' && studentReport && !loadingReport && (
          <>
            {/* Back Button */}
            <div className="print:hidden">
              <Button variant="outline" onClick={() => { setViewMode('class'); setStudentReport(null); }}>
                ← Kembali ke laporan kelas
              </Button>
            </div>

            {/* Student Info Header */}
            <Card className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{studentReport.student.name}</h2>
                  <p className="text-gray-500">NISN: {studentReport.student.nisn} • {studentReport.student.class_name}</p>
                  <p className="text-sm text-gray-400">Semester {semester === 'ganjil' ? 'Ganjil' : 'Genap'} {academicYear}</p>
                </div>
                <div className="flex items-center gap-2">
                  <TrendIcon trend={studentReport.trend} />
                  <span className="text-sm text-gray-500">
                    {studentReport.trend === 'up' ? 'Meningkat' : studentReport.trend === 'down' ? 'Menurun' : 'Stabil'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-4 text-center">
                <GraduationCap className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                <p className={`text-2xl font-bold ${getScoreColor(Number(studentReport.summary.average_score ?? 0))}`}>{Number(studentReport.summary.average_score ?? 0).toFixed(1)}</p>
                <p className="text-xs text-gray-500">Rata-rata Nilai</p>
              </Card>
              <Card className="p-4 text-center">
                <ClipboardList className="w-6 h-6 text-teal-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{Number(studentReport.summary.attendance_rate ?? 0).toFixed(0)}%</p>
                <p className="text-xs text-gray-500">Kehadiran</p>
              </Card>
              <Card className="p-4 text-center">
                <BookOpen className="w-6 h-6 text-purple-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{studentReport.summary.total_exams}</p>
                <p className="text-xs text-gray-500">Ujian Diikuti</p>
              </Card>
              <Card className="p-4 text-center">
                <BarChart3 className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-900">{studentReport.summary.assignments_submitted}/{studentReport.summary.total_assignments}</p>
                <p className="text-xs text-gray-500">Tugas Dikumpulkan</p>
              </Card>
            </div>

            {/* Subject Averages */}
            {studentReport.subject_averages.length > 0 && (
              <Card>
                <CardHeader title="Nilai per Mata Pelajaran" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm print-table">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">No</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Mata Pelajaran</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Rata-rata</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Jumlah Ujian</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Predikat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentReport.subject_averages.map((sa, idx) => (
                        <tr key={sa.subject} className="border-b border-gray-100">
                          <td className="py-3 px-4">{idx + 1}</td>
                          <td className="py-3 px-4 font-medium">{sa.subject}</td>
                          <td className="py-3 px-4">
                            <span className={`font-semibold ${getScoreColor(Number(sa.average ?? 0))}`}>{Number(sa.average ?? 0).toFixed(1)}</span>
                          </td>
                          <td className="py-3 px-4">{sa.count}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${Number(sa.average) >= 90 ? 'bg-green-100 text-green-700' : Number(sa.average) >= 80 ? 'bg-blue-100 text-blue-700' : Number(sa.average) >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {Number(sa.average) >= 90 ? 'A' : Number(sa.average) >= 80 ? 'B' : Number(sa.average) >= 70 ? 'C' : 'D'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Attendance Summary */}
            <Card>
              <CardHeader title="Rekap Kehadiran" />
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-lg font-bold text-gray-900">{studentReport.attendance_summary.total_sessions}</p>
                  <p className="text-xs text-gray-500">Total Sesi</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-lg font-bold text-green-600">{studentReport.attendance_summary.hadir}</p>
                  <p className="text-xs text-gray-500">Hadir</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-lg font-bold text-blue-600">{studentReport.attendance_summary.izin}</p>
                  <p className="text-xs text-gray-500">Izin</p>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <p className="text-lg font-bold text-yellow-600">{studentReport.attendance_summary.sakit}</p>
                  <p className="text-xs text-gray-500">Sakit</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-lg font-bold text-red-600">{studentReport.attendance_summary.alpha}</p>
                  <p className="text-xs text-gray-500">Alpha</p>
                </div>
              </div>
            </Card>

            {/* Exam Details */}
            {studentReport.exam_scores.length > 0 && (
              <Card>
                <CardHeader title="Rincian Nilai Ujian" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm print-table">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Ujian</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Mata Pelajaran</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Nilai</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Persentase</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentReport.exam_scores.map((es) => (
                        <tr key={es.exam_id} className="border-b border-gray-100">
                          <td className="py-3 px-4 font-medium">{es.title}</td>
                          <td className="py-3 px-4">{es.subject}</td>
                          <td className="py-3 px-4">{es.score}/{es.max_score}</td>
                          <td className="py-3 px-4">
                            <span className={`font-semibold ${getScoreColor(Number(es.percentage ?? 0))}`}>{Number(es.percentage ?? 0).toFixed(0)}%</span>
                          </td>
                          <td className="py-3 px-4 text-gray-500">
                            {new Date(es.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Empty State */}
        {!classReport && !studentReport && !loadingReport && (
          <Card className="p-12 text-center">
            <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-500 mb-2">Pilih Kelas untuk Melihat Laporan</h3>
            <p className="text-sm text-gray-400">Gunakan filter di atas untuk menampilkan laporan progress siswa</p>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
