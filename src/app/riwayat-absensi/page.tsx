'use client';

import React, { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { attendanceAPI } from '@/services/api';
import { ClipboardList, CheckCircle, XCircle, Clock, AlertCircle, Download, Filter, ChevronDown, FileSpreadsheet } from 'lucide-react';

interface AttendanceRecord {
  id: number;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
  scanned_at: string | null;
  session: {
    id: number;
    subject: string;
    created_at: string;
    valid_from: string;
    valid_until: string;
    class?: {
      name: string;
    };
    teacher?: {
      name: string;
    };
  };
}

interface SubjectStats {
  subject: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  total: number;
  percentage: number;
}

export default function RiwayatAbsensiPage() {
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  useEffect(() => {
    fetchAttendanceHistory();
  }, []);

  // Close download menu on outside click
  useEffect(() => {
    const handleClick = () => setShowDownloadMenu(false);
    if (showDownloadMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showDownloadMenu]);

  const fetchAttendanceHistory = async () => {
    try {
      const response = await attendanceAPI.getStudentHistory();
      const data = response.data.data.data || response.data.data;
      setAttendances(data);
    } catch (error) {
      console.error('Failed to fetch attendance history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get unique subjects
  const subjects = useMemo(() => {
    const uniqueSubjects = new Set<string>();
    attendances.forEach(att => {
      if (att.session?.subject) uniqueSubjects.add(att.session.subject);
    });
    return Array.from(uniqueSubjects).sort();
  }, [attendances]);

  // Calculate stats per subject
  const subjectStats = useMemo((): SubjectStats[] => {
    const statsMap = new Map<string, { hadir: number; izin: number; sakit: number; alpha: number }>();
    attendances.forEach(att => {
      const subj = att.session?.subject || 'Tidak Diketahui';
      if (!statsMap.has(subj)) statsMap.set(subj, { hadir: 0, izin: 0, sakit: 0, alpha: 0 });
      const s = statsMap.get(subj)!;
      if (s[att.status] !== undefined) s[att.status]++;
    });
    return Array.from(statsMap.entries()).map(([subject, s]) => {
      const total = s.hadir + s.izin + s.sakit + s.alpha;
      return { subject, ...s, total, percentage: total > 0 ? Math.round((s.hadir / total) * 100) : 0 };
    }).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [attendances]);

  // Overall stats (filtered)
  const filteredAttendances = useMemo(() => {
    if (!filterSubject) return attendances;
    return attendances.filter(att => att.session?.subject === filterSubject);
  }, [attendances, filterSubject]);

  const stats = useMemo(() => {
    const s = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
    filteredAttendances.forEach(att => {
      if (s[att.status] !== undefined) s[att.status]++;
    });
    return s;
  }, [filteredAttendances]);

  const total = stats.hadir + stats.izin + stats.sakit + stats.alpha;
  const attendancePercentage = total > 0 ? Math.round((stats.hadir / total) * 100) : 0;

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'hadir':
        return { label: 'Hadir', color: 'bg-green-100 text-green-700', icon: CheckCircle };
      case 'izin':
        return { label: 'Izin', color: 'bg-sky-50 text-sky-700', icon: Clock };
      case 'sakit':
        return { label: 'Sakit', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle };
      case 'alpha':
        return { label: 'Alpha', color: 'bg-red-100 text-red-700', icon: XCircle };
      default:
        return { label: status, color: 'bg-slate-100 text-slate-700 dark:text-slate-300', icon: Clock };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  // --- Download Functions ---
  const downloadCSV = (content: string, filename: string) => {
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadBySubject = (subject: string) => {
    const subjectData = attendances.filter(att => att.session?.subject === subject);
    if (subjectData.length === 0) return;

    const subjectStat = subjectStats.find(s => s.subject === subject);
    const headers = ['No', 'Tanggal', 'Guru', 'Kelas', 'Status', 'Waktu Absen'];
    const rows = subjectData.map((att, i) => [
      i + 1,
      att.session?.created_at ? formatDateShort(att.session.created_at) : '-',
      att.session?.teacher?.name || '-',
      att.session?.class?.name || '-',
      getStatusConfig(att.status).label,
      att.scanned_at ? new Date(att.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
    ]);

    const csv = [
      `Rekap Kehadiran - ${subject}`,
      `Total Pertemuan: ${subjectStat?.total || 0}`,
      `Hadir: ${subjectStat?.hadir || 0} | Izin: ${subjectStat?.izin || 0} | Sakit: ${subjectStat?.sakit || 0} | Alpha: ${subjectStat?.alpha || 0}`,
      `Persentase Kehadiran: ${subjectStat?.percentage || 0}%`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(',')),
    ].join('\n');

    downloadCSV(csv, `rekap_absensi_${subject.replace(/\s+/g, '_')}.csv`);
  };

  const handleDownloadAll = () => {
    if (attendances.length === 0) return;

    // Summary section
    const summaryHeaders = ['Mata Pelajaran', 'Total', 'Hadir', 'Izin', 'Sakit', 'Alpha', 'Kehadiran (%)'];
    const summaryRows = subjectStats.map(s => [
      s.subject, s.total, s.hadir, s.izin, s.sakit, s.alpha, `${s.percentage}%`,
    ]);

    // Overall
    const overallTotal = subjectStats.reduce((acc, s) => acc + s.total, 0);
    const overallHadir = subjectStats.reduce((acc, s) => acc + s.hadir, 0);
    const overallIzin = subjectStats.reduce((acc, s) => acc + s.izin, 0);
    const overallSakit = subjectStats.reduce((acc, s) => acc + s.sakit, 0);
    const overallAlpha = subjectStats.reduce((acc, s) => acc + s.alpha, 0);
    const overallPct = overallTotal > 0 ? Math.round((overallHadir / overallTotal) * 100) : 0;

    // Detail section
    const detailHeaders = ['No', 'Tanggal', 'Mata Pelajaran', 'Guru', 'Kelas', 'Status', 'Waktu Absen'];
    const detailRows = attendances.map((att, i) => [
      i + 1,
      att.session?.created_at ? formatDateShort(att.session.created_at) : '-',
      att.session?.subject || '-',
      att.session?.teacher?.name || '-',
      att.session?.class?.name || '-',
      getStatusConfig(att.status).label,
      att.scanned_at ? new Date(att.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-',
    ]);

    const csv = [
      'REKAP KEHADIRAN SISWA',
      `Tanggal Download: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      '=== RINGKASAN PER MATA PELAJARAN ===',
      '',
      summaryHeaders.join(','),
      ...summaryRows.map(r => r.join(',')),
      ['TOTAL', overallTotal, overallHadir, overallIzin, overallSakit, overallAlpha, `${overallPct}%`].join(','),
      '',
      '=== DETAIL KEHADIRAN ===',
      '',
      detailHeaders.join(','),
      ...detailRows.map(r => r.join(',')),
    ].join('\n');

    downloadCSV(csv, `rekap_kehadiran_lengkap_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Banner Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Riwayat Absensi</h1>
            <p className="text-blue-100/80">Lihat dan download rekap kehadiran Anda</p>
          </div>
        </div>

        {/* Download Button - outside banner to avoid overflow clipping */}
        {!loading && attendances.length > 0 && (
          <div className="flex justify-end relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDownloadMenu(!showDownloadMenu); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-medium transition-colors cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Rekap
              <ChevronDown className={`w-4 h-4 transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
            </button>
            {showDownloadMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-slideDown"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pilih Rekap</p>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {/* Download All */}
                  <button
                    onClick={() => { handleDownloadAll(); setShowDownloadMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Semua Mata Pelajaran</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Rekap lengkap + ringkasan</p>
                    </div>
                  </button>
                  {/* Per Subject */}
                  {subjects.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-700">
                      <p className="px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Per Mata Pelajaran</p>
                      {subjects.map(subj => {
                        const stat = subjectStats.find(s => s.subject === subj);
                        return (
                          <button
                            key={subj}
                            onClick={() => { handleDownloadBySubject(subj); setShowDownloadMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left cursor-pointer"
                          >
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <ClipboardList className="w-4 h-4 text-slate-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{subj}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {stat?.total || 0} pertemuan • {stat?.percentage || 0}% hadir
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter & Stats Row */}
        {!loading && attendances.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Subject Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 appearance-none cursor-pointer min-w-[200px] focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="">Semua Mapel</option>
                {subjects.map(subj => (
                  <option key={subj} value={subj}>{subj}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {filterSubject && (
              <button
                onClick={() => setFilterSubject('')}
                className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium cursor-pointer"
              >
                Reset filter
              </button>
            )}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-sky-600">{attendancePercentage}%</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Kehadiran</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.hadir}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Hadir</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-sky-600">{stats.izin}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Izin</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-yellow-600">{stats.sakit}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Sakit</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-red-600">{stats.alpha}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Alpha</p>
          </Card>
        </div>

        {/* Per-Subject Summary Table */}
        {!loading && subjectStats.length > 1 && !filterSubject && (
          <Card>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold text-sm text-slate-800 dark:text-white">Ringkasan Per Mapel</h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Mata Pelajaran</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Total</th>
                    <th className="text-center py-3 px-4 font-medium text-green-700 dark:text-green-400">Hadir</th>
                    <th className="text-center py-3 px-4 font-medium text-sky-700 dark:text-sky-400">Izin</th>
                    <th className="text-center py-3 px-4 font-medium text-yellow-700 dark:text-yellow-400">Sakit</th>
                    <th className="text-center py-3 px-4 font-medium text-red-700 dark:text-red-400">Alpha</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-600 dark:text-slate-400">%</th>
                    <th className="text-center py-3 px-4 font-medium text-slate-600 dark:text-slate-400 print:hidden"></th>
                  </tr>
                </thead>
                <tbody>
                  {subjectStats.map(s => (
                    <tr key={s.subject} className="border-b border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{s.subject}</td>
                      <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-400">{s.total}</td>
                      <td className="py-3 px-4 text-center font-semibold text-green-700">{s.hadir}</td>
                      <td className="py-3 px-4 text-center font-semibold text-sky-600">{s.izin}</td>
                      <td className="py-3 px-4 text-center font-semibold text-yellow-700">{s.sakit}</td>
                      <td className="py-3 px-4 text-center font-semibold text-red-700">{s.alpha}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          s.percentage >= 80 ? 'bg-green-100 text-green-700' :
                          s.percentage >= 60 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {s.percentage}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center print:hidden">
                        <button
                          onClick={() => handleDownloadBySubject(s.subject)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
                          title={`Download rekap ${s.subject}`}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Attendance List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
          </div>
        ) : filteredAttendances.length === 0 ? (
          <Card className="p-12 text-center">
            <ClipboardList className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
              {filterSubject ? 'Tidak Ada Data' : 'Belum Ada Riwayat'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              {filterSubject ? `Tidak ada riwayat absensi untuk ${filterSubject}` : 'Riwayat absensi Anda akan muncul di sini'}
            </p>
          </Card>
        ) : (
          <Card>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Menampilkan {filteredAttendances.length} catatan{filterSubject ? ` untuk ${filterSubject}` : ''}
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {filteredAttendances.map((attendance) => {
                const statusConfig = getStatusConfig(attendance.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <div key={attendance.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                        <ClipboardList className="w-6 h-6 text-slate-500" />
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-900 dark:text-white">{attendance.session?.subject || 'Mata Pelajaran'}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {attendance.session?.created_at ? formatDate(attendance.session.created_at) : '-'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          {attendance.session?.teacher?.name || 'Guru'} • {attendance.session?.class?.name || ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                      {attendance.scanned_at && (
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                          {new Date(attendance.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
