'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, Button, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Download, FileSpreadsheet, FileText, Loader2, BarChart3, ClipboardList, Users } from 'lucide-react';
import { classAPI, exportAPI } from '@/services/api';

type ExportType = 'grades' | 'attendance' | 'student-report';
type ExportFormat = 'xlsx' | 'pdf';

export default function ExportPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [exportType, setExportType] = useState<ExportType>('grades');
  const [selectedClass, setSelectedClass] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [semester, setSemester] = useState('ganjil');

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
          const res = await exportAPI.exportAttendance({
            class_id: selectedClass ? parseInt(selectedClass) : undefined,
            month,
            year,
            format,
          });
          blob = res.data;
          filename = `absensi_${className.replace(/\s+/g, '_')}_${year}-${String(month).padStart(2, '0')}.${format}`;
          break;
        }
        case 'student-report': {
          // Export all student reports for the class
          const res = await exportAPI.exportGrades({
            class_id: parseInt(selectedClass),
            format,
          });
          blob = res.data;
          filename = `rapor_${className.replace(/\s+/g, '_')}_${semester}.${format}`;
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
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Export Data</h1>
          <p className="text-slate-600 dark:text-slate-400">Ekspor data nilai, absensi, dan rapor ke Excel atau PDF</p>
        </div>

        {/* Export Type Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { type: 'grades' as ExportType, icon: BarChart3, title: 'Nilai Ujian', desc: 'Export semua nilai ujian siswa', color: 'blue' },
            { type: 'attendance' as ExportType, icon: ClipboardList, title: 'Data Absensi', desc: 'Export rekap kehadiran per bulan', color: 'teal' },
            { type: 'student-report' as ExportType, icon: Users, title: 'Rapor Siswa', desc: 'Export laporan progress per kelas', color: 'purple' },
          ].map(({ type, icon: Icon, title, desc, color }) => (
            <Card
              key={type}
              className={`p-4 cursor-pointer transition-colors border-2 ${exportType === type ? `border-${color}-500 bg-${color}-50` : 'border-transparent hover:border-slate-200'}`}
              onClick={() => setExportType(type)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-lg bg-${color}-100 flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 text-${color}-600`} />
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
                  label="Bulan"
                  options={months}
                  value={month.toString()}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                />
                <Select
                  label="Tahun"
                  options={[
                    { value: '2026', label: '2026' },
                    { value: '2025', label: '2025' },
                    { value: '2024', label: '2024' },
                  ]}
                  value={year.toString()}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                />
              </>
            )}

            {exportType === 'student-report' && (
              <Select
                label="Semester"
                options={[{ value: 'ganjil', label: 'Ganjil' }, { value: 'genap', label: 'Genap' }]}
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
              />
            )}
          </div>

          {/* Format Selection */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Format File</label>
            <div className="flex gap-3">
              <button
                onClick={() => setFormat('xlsx')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${format === 'xlsx' ? 'border-green-500 bg-green-50' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <FileSpreadsheet className={`w-6 h-6 ${format === 'xlsx' ? 'text-green-600' : 'text-slate-600 dark:text-slate-400'}`} />
                <div className="text-left">
                  <p className="font-medium text-sm">Excel (.xlsx)</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Untuk pengolahan data</p>
                </div>
              </button>
              <button
                onClick={() => setFormat('pdf')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${format === 'pdf' ? 'border-red-500 bg-red-50' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <FileText className={`w-6 h-6 ${format === 'pdf' ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}`} />
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
