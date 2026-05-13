'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, Button, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Download, FileSpreadsheet, FileText, Loader2, BarChart3, ClipboardList, Users } from 'lucide-react';
import { classAPI, exportAPI, progressAPI } from '@/services/api';

type ExportType = 'grades' | 'attendance' | 'student-report';
type ExportFormat = 'xlsx' | 'pdf';
type AttendancePeriod = 'week' | 'month' | 'semester';

type SemesterOption = {
  value: string;
  label: string;
  semester: string;
  academic_year: string;
};

const getIsoWeek = (date: Date) => {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export default function ExportPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [semesterOptions, setSemesterOptions] = useState<SemesterOption[]>([]);
  const [exportType, setExportType] = useState<ExportType>('grades');
  const [selectedClass, setSelectedClass] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [studentReportSemester, setStudentReportSemester] = useState('ganjil');
  const [attendancePeriod, setAttendancePeriod] = useState<AttendancePeriod>('month');
  const [attendanceWeek, setAttendanceWeek] = useState(getIsoWeek(new Date()));
  const [attendanceSemester, setAttendanceSemester] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const [classRes, semesterRes] = await Promise.all([
          classAPI.getAll(),
          progressAPI.getSemesters(),
        ]);
        const classData = classRes.data?.data || [];
        setClasses(classData.map((c: { id: number; name: string }) => ({ value: c.id.toString(), label: c.name })));

        const semesterData = semesterRes.data?.data || [];
        setSemesterOptions(semesterData);
        if (semesterData.length > 0) {
          setAttendanceSemester(semesterData[0].value);
        }
      } catch {
        toast.error('Gagal memuat data export');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [toast]);

  const handleExport = async () => {
    if (!selectedClass && exportType !== 'grades') {
      toast.warning('Pilih kelas terlebih dahulu');
      return;
    }

    setExporting(true);
    try {
      let blob: Blob;
      let filename: string;
      const className = classes.find(c => c.value === selectedClass)?.label || 'semua';

      switch (exportType) {
        case 'grades': {
          const res = await exportAPI.exportGrades({
            class_id: selectedClass ? parseInt(selectedClass) : undefined,
            format,
          });
          blob = res.data;
          filename = `nilai_${className.replace(/\s+/g, '_')}.${format}`;
          break;
        }
        case 'attendance': {
          let semesterMeta: SemesterOption | undefined;
          if (attendancePeriod === 'semester') {
            semesterMeta = semesterOptions.find((opt) => opt.value === attendanceSemester);
            if (!semesterMeta) {
              toast.warning('Pilih semester terlebih dahulu');
              setExporting(false);
              return;
            }
          }

          const res = await exportAPI.exportAttendance({
            class_id: selectedClass ? parseInt(selectedClass) : undefined,
            period: attendancePeriod,
            month: attendancePeriod === 'month' ? month : undefined,
            week: attendancePeriod === 'week' ? attendanceWeek : undefined,
            year: attendancePeriod === 'month' || attendancePeriod === 'week' ? year : undefined,
            semester: semesterMeta ? parseInt(semesterMeta.semester) : undefined,
            academic_year: semesterMeta?.academic_year,
            format,
          });
          blob = res.data;
          let periodSuffix = `${year}-${String(month).padStart(2, '0')}`;
          if (attendancePeriod === 'week') {
            periodSuffix = `minggu-${attendanceWeek}_${year}`;
          }
          if (attendancePeriod === 'semester' && semesterMeta) {
            const safeYear = semesterMeta.academic_year.replace(/\s+/g, '_').replace(/\//g, '-');
            periodSuffix = `semester-${semesterMeta.semester}_${safeYear}`;
          }
          filename = `absensi_${className.replace(/\s+/g, '_')}_${periodSuffix}.${format}`;
          break;
        }
        case 'student-report': {
          // Export all student reports for the class
          const res = await exportAPI.exportGrades({
            class_id: parseInt(selectedClass),
            format,
          });
          blob = res.data;
          filename = `rapor_${className.replace(/\s+/g, '_')}_${studentReportSemester}.${format}`;
          break;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Berhasil mengekspor data ke ${format.toUpperCase()}`);
    } catch {
      toast.error('Gagal mengekspor data. Pastikan backend sudah mendukung fitur ini.');
    } finally {
      setExporting(false);
    }
  };

  const months = [
    { value: '1', label: 'Januari' }, { value: '2', label: 'Februari' },
    { value: '3', label: 'Maret' }, { value: '4', label: 'April' },
    { value: '5', label: 'Mei' }, { value: '6', label: 'Juni' },
    { value: '7', label: 'Juli' }, { value: '8', label: 'Agustus' },
    { value: '9', label: 'September' }, { value: '10', label: 'Oktober' },
    { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
  ];

  const weekOptions = Array.from({ length: 53 }, (_, i) => ({
    value: String(i + 1),
    label: `Minggu ${i + 1}`,
  }));

  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const optionYear = new Date().getFullYear() - i;
    return { value: optionYear.toString(), label: optionYear.toString() };
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-blue-800 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 p-5 sm:p-6 shadow-lg shadow-slate-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Export Data</h1>
            <p className="text-slate-300/80">Ekspor data nilai, absensi, dan rapor ke Excel atau PDF</p>
          </div>
        </div>

        {/* Export Type Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { type: 'grades' as ExportType, icon: BarChart3, title: 'Nilai Ujian', desc: 'Export semua nilai ujian siswa', color: 'blue' },
            { type: 'attendance' as ExportType, icon: ClipboardList, title: 'Data Absensi', desc: 'Export rekap kehadiran per minggu/bulan/semester', color: 'teal' },
            { type: 'student-report' as ExportType, icon: Users, title: 'Rapor Siswa', desc: 'Export laporan progress per kelas', color: 'purple' },
          ].map(({ type, icon: Icon, title, desc, color }) => (
            <Card
              key={type}
              className={`p-4 cursor-pointer transition-colors border-2 ${exportType === type ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/20` : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'}`}
              onClick={() => setExportType(type)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 text-${color}-600 dark:text-${color}-400`} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Export Settings */}
        <Card className="p-6">
          <CardHeader title="Pengaturan Export" subtitle="Konfigurasi data yang akan diekspor" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            <Select
              label="Kelas"
              options={[{ value: '', label: 'Semua Kelas' }, ...classes]}
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            />

            {exportType === 'attendance' && (
              <>
                <Select
                  label="Periode"
                  options={[
                    { value: 'week', label: 'Mingguan' },
                    { value: 'month', label: 'Bulanan' },
                    { value: 'semester', label: 'Semester' },
                  ]}
                  value={attendancePeriod}
                  onChange={(e) => setAttendancePeriod(e.target.value as AttendancePeriod)}
                />

                {attendancePeriod === 'week' && (
                  <>
                    <Select
                      label="Minggu"
                      options={weekOptions}
                      value={attendanceWeek.toString()}
                      onChange={(e) => setAttendanceWeek(parseInt(e.target.value))}
                    />
                    <Select
                      label="Tahun"
                      options={yearOptions}
                      value={year.toString()}
                      onChange={(e) => setYear(parseInt(e.target.value))}
                    />
                  </>
                )}

                {attendancePeriod === 'month' && (
                  <>
                    <Select
                      label="Bulan"
                      options={months}
                      value={month.toString()}
                      onChange={(e) => setMonth(parseInt(e.target.value))}
                    />
                    <Select
                      label="Tahun"
                      options={yearOptions}
                      value={year.toString()}
                      onChange={(e) => setYear(parseInt(e.target.value))}
                    />
                  </>
                )}

                {attendancePeriod === 'semester' && (
                  <Select
                    label="Semester"
                    options={semesterOptions.length > 0 ? semesterOptions : [{ value: '', label: 'Belum ada data semester' }]}
                    value={attendanceSemester}
                    onChange={(e) => setAttendanceSemester(e.target.value)}
                  />
                )}
              </>
            )}

            {exportType === 'student-report' && (
              <Select
                label="Semester"
                options={[{ value: 'ganjil', label: 'Ganjil' }, { value: 'genap', label: 'Genap' }]}
                value={studentReportSemester}
                onChange={(e) => setStudentReportSemester(e.target.value)}
              />
            )}
          </div>

          {/* Format Selection */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Format File</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormat('xlsx')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${format === 'xlsx' ? 'border-green-500 dark:border-green-700 bg-green-50 dark:bg-green-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <FileSpreadsheet className={`w-6 h-6 ${format === 'xlsx' ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-400'}`} />
                <div className="text-left">
                  <p className="font-medium text-sm">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Untuk pengolahan data</p>
                </div>
              </button>
              <button
                onClick={() => setFormat('pdf')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${format === 'pdf' ? 'border-red-500 dark:border-red-700 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <FileText className={`w-6 h-6 ${format === 'pdf' ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`} />
                <div className="text-left">
                  <p className="font-medium text-sm">PDF (.pdf)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Untuk cetak dan arsip</p>
                </div>
              </button>
            </div>
          </div>

          {/* Export Button */}
          <div className="mt-6 flex justify-end">
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengekspor…</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Export {format.toUpperCase()}</>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
