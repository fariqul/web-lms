'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Download, Search, Filter, RefreshCw, AlertCircle, Users, Loader2, TrendingUp } from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface RecapStudent {
  student_id: number;
  name: string;
  nisn: string;
  nis: string;
  class_id: number | null;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total_tercatat: number;
  total_sesi: number;
  persentase: number;
}

interface RecapData {
  students: RecapStudent[];
  total_sessions: number;
  filters: {
    class_id?: string;
    subject?: string;
    date_from?: string;
    date_to?: string;
  };
}

interface ClassOption {
  id: number;
  name: string;
}

interface AttendanceRecapTabProps {
  classes: ClassOption[];
}

const SUBJECTS = [
  'Bahasa Indonesia', 'Bahasa Inggris', 'Bahasa Inggris Tingkat Lanjut',
  'Bahasa Jerman', 'Matematika', 'Matematika Tingkat Lanjut',
  'Fisika', 'Kimia', 'Biologi', 'Sejarah', 'Sejarah Tingkat Lanjut',
  'Sosiologi', 'Ekonomi', 'Geografi', 'Pendidikan Pancasila',
  'Informatika', 'Seni Budaya', 'Pendidikan Agama Islam',
  'Pendidikan Agama Kristen', 'PJOK', 'Prakarya dan Kewirausahaan',
];

export function AttendanceRecapTab({ classes }: AttendanceRecapTabProps) {
  const toast = useToast();

  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState('');

  // Filter state
  const [classId, setClassId] = useState('');
  const [subject, setSubject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchRecap = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (classId)   params.class_id  = classId;
      if (subject)   params.subject   = subject;
      if (dateFrom)  params.date_from = dateFrom;
      if (dateTo)    params.date_to   = dateTo;

      const res = await api.get('/attendance-recap', { params });
      setData(res.data?.data ?? null);
    } catch {
      toast.error('Gagal memuat rekap absensi');
    } finally {
      setLoading(false);
    }
  }, [classId, subject, dateFrom, dateTo, toast]);

  // Load on mount
  useEffect(() => {
    void fetchRecap();
  }, [fetchRecap]);

  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const params: Record<string, string> = { format: 'csv' };
      if (classId)  params.class_id  = classId;
      if (subject)  params.subject   = subject;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo)   params.date_to   = dateTo;

      const res = await api.get('/attendance-recap', {
        params,
        responseType: 'blob',
      });

      const url  = URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `rekap-absensi-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengunduh rekap CSV');
    } finally {
      setDownloading(false);
    }
  };

  // Filter by search term
  const filtered = (data?.students ?? []).filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.nisn.includes(search) ||
    s.nis.includes(search)
  );

  const getRiskColor = (pct: number) => {
    if (pct >= 80) return 'text-green-600 dark:text-green-400';
    if (pct >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getRowHighlight = (pct: number) => {
    if (pct < 60) return 'bg-red-50/60 dark:bg-red-950/20';
    return '';
  };

  const summaryStats = data ? {
    totalSiswa: data.students.length,
    avgPct: data.students.length
      ? Math.round(data.students.reduce((s, x) => s + x.persentase, 0) / data.students.length)
      : 0,
    risikoTinggi: data.students.filter(s => s.persentase < 60).length,
  } : null;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Filter className="w-4 h-4" />
          Filter Rekap
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Kelas */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Kelas</label>
            <select
              value={classId}
              onChange={e => setClassId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="">Semua Kelas</option>
              {classes.map(c => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>
          {/* Mapel */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mata Pelajaran</label>
            <select
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="">Semua Mapel</option>
              {SUBJECTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {/* Dari */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>
          {/* Sampai */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={() => { setClassId(''); setSubject(''); setDateFrom(''); setDateTo(''); }}
            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
          >
            Reset filter
          </button>
          <button
            onClick={() => void fetchRecap()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Tampilkan
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summaryStats && data && data.total_sessions > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{summaryStats.totalSiswa}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total Siswa</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className={`text-2xl font-bold ${getRiskColor(summaryStats.avgPct)}`}>{summaryStats.avgPct}%</p>
            <p className="text-xs text-slate-500 mt-0.5">Rata-rata Kehadiran</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center">
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{summaryStats.risikoTinggi}</p>
            <p className="text-xs text-slate-500 mt-0.5">Siswa &lt;60% Hadir</p>
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Table Header Toolbar */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-500" />
              Rekap Kehadiran Siswa
              {data && (
                <span className="text-xs font-normal text-slate-500">
                  · {data.total_sessions} sesi · {filtered.length} siswa
                </span>
              )}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama / NISN..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 w-44"
              />
            </div>
            {/* Download CSV */}
            {data && data.students.length > 0 && (
              <button
                onClick={() => void handleDownloadCsv()}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {downloading
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                Unduh CSV
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Memuat rekap...
          </div>
        )}

        {/* Empty — no sessions */}
        {!loading && data && data.total_sessions === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-slate-500 dark:text-slate-400">
            <AlertCircle className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-600" />
            <p className="font-medium">Belum ada sesi absensi</p>
            <p className="text-sm mt-1">Buat sesi absensi terlebih dahulu di tab Buat Sesi.</p>
          </div>
        )}

        {/* Empty — no students after filter */}
        {!loading && data && data.total_sessions > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-slate-500 dark:text-slate-400">
            <Search className="w-10 h-10 mb-3 text-slate-300 dark:text-slate-600" />
            <p className="font-medium">Tidak ada siswa ditemukan</p>
            <p className="text-sm mt-1">Coba ubah filter atau kata pencarian.</p>
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">No</th>
                  <th className="text-left px-4 py-3 font-medium">Nama Siswa</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">NISN / NIS</th>
                  <th className="text-center px-3 py-3 font-medium text-green-600">Hadir</th>
                  <th className="text-center px-3 py-3 font-medium text-blue-600">Izin</th>
                  <th className="text-center px-3 py-3 font-medium text-amber-600">Sakit</th>
                  <th className="text-center px-3 py-3 font-medium text-red-600">Alpha</th>
                  <th className="text-center px-3 py-3 font-medium">Total Sesi</th>
                  <th className="text-center px-4 py-3 font-medium">
                    <span className="flex items-center justify-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> %
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((s, idx) => (
                  <tr key={s.student_id} className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${getRowHighlight(s.persentase)}`}>
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{s.name}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                      <span className="text-xs">{s.nisn !== '-' ? s.nisn : s.nis !== '-' ? s.nis : '-'}</span>
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-green-600 dark:text-green-400 tabular-nums">{s.hadir}</td>
                    <td className="px-3 py-3 text-center font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{s.izin}</td>
                    <td className="px-3 py-3 text-center font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{s.sakit}</td>
                    <td className="px-3 py-3 text-center font-semibold text-red-600 dark:text-red-400 tabular-nums">{s.alpha}</td>
                    <td className="px-3 py-3 text-center text-slate-500 tabular-nums">{s.total_sesi}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Progress bar mini */}
                        <div className="w-14 h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden hidden md:block">
                          <div
                            className={`h-full rounded-full ${s.persentase >= 80 ? 'bg-green-500' : s.persentase >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${s.persentase}%` }}
                          />
                        </div>
                        <span className={`font-semibold tabular-nums text-sm ${getRiskColor(s.persentase)}`}>
                          {s.persentase}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> ≥80% Baik</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> 60–79% Perlu Perhatian</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &lt;60% Risiko</span>
          </div>
        )}
      </div>
    </div>
  );
}
