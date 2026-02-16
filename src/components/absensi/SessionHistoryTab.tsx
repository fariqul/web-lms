'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardHeader, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { History, Eye, Users, Edit2, Save, X, Download, Loader2, RefreshCw, Filter, ChevronDown, FileSpreadsheet, ClipboardList } from 'lucide-react';
import api from '@/services/api';

const statusOptions = [
  { value: 'hadir', label: 'Hadir', color: 'bg-green-100 text-green-700' },
  { value: 'izin', label: 'Izin', color: 'bg-sky-50 text-sky-700' },
  { value: 'sakit', label: 'Sakit', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'alpha', label: 'Alpha', color: 'bg-red-100 text-red-700' },
  { value: 'belum', label: 'Belum Absen', color: 'bg-slate-100 text-slate-600 dark:text-slate-400' },
];

export interface SessionHistory {
  id: number;
  class_name: string;
  subject: string;
  status: 'active' | 'closed';
  created_at: string;
  total_present: number;
  total_students: number;
}

interface StudentAttendance {
  student: { id: number; name: string; nisn: string };
  status: string;
  attendance?: { id: number; scanned_at: string | null };
}

interface SessionHistoryTabProps {
  sessions: SessionHistory[];
  loadingHistory: boolean;
  onRefresh: () => void;
}

export function SessionHistoryTab({ sessions, loadingHistory, onRefresh }: SessionHistoryTabProps) {
  const toast = useToast();
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [allStudents, setAllStudents] = useState<StudentAttendance[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedStatuses, setEditedStatuses] = useState<Record<number, string>>({});
  const [savingStatus, setSavingStatus] = useState(false);
  const [filterSubject, setFilterSubject] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Close download menu on outside click
  useEffect(() => {
    const handleClick = () => setShowDownloadMenu(false);
    if (showDownloadMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showDownloadMenu]);

  // Unique subjects & classes from sessions
  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => { if (s.subject) set.add(s.subject); });
    return Array.from(set).sort();
  }, [sessions]);

  const uniqueClasses = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => { if (s.class_name) set.add(s.class_name); });
    return Array.from(set).sort();
  }, [sessions]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      if (filterSubject && s.subject !== filterSubject) return false;
      if (filterClass && s.class_name !== filterClass) return false;
      return true;
    });
  }, [sessions, filterSubject, filterClass]);

  // Per-subject stats from all sessions
  const subjectStats = useMemo(() => {
    const map = new Map<string, { subject: string; sessions: number; totalPresent: number; totalStudents: number }>();
    sessions.forEach(s => {
      const key = s.subject;
      if (!map.has(key)) map.set(key, { subject: key, sessions: 0, totalPresent: 0, totalStudents: 0 });
      const stat = map.get(key)!;
      stat.sessions++;
      stat.totalPresent += s.total_present;
      stat.totalStudents += s.total_students;
    });
    return Array.from(map.values()).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [sessions]);

  const handleViewSession = useCallback(async (sessionId: number) => {
    setSelectedSession(sessionId);
    setLoadingDetail(true);
    setIsEditMode(false);
    setEditedStatuses({});
    try {
      const response = await api.get(`/attendance-sessions/${sessionId}`);
      const data = response.data?.data;
      if (data?.student_attendances) {
        setAllStudents(data.student_attendances);
      }
    } catch {
      toast.error('Gagal memuat detail sesi');
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  const handleStatusChange = (studentId: number, newStatus: string) => {
    setEditedStatuses(prev => ({ ...prev, [studentId]: newStatus }));
  };

  const handleSaveStatuses = async () => {
    if (!selectedSession || Object.keys(editedStatuses).length === 0) return;
    setSavingStatus(true);
    try {
      const updates = Object.entries(editedStatuses).map(([studentId, status]) => ({
        student_id: parseInt(studentId),
        status,
      }));
      await api.post(`/attendance-sessions/${selectedSession}/bulk-update-status`, { updates });
      await handleViewSession(selectedSession);
      onRefresh();
      setIsEditMode(false);
      setEditedStatuses({});
      toast.success('Status kehadiran berhasil disimpan');
    } catch {
      toast.error('Gagal menyimpan status kehadiran');
    } finally {
      setSavingStatus(false);
    }
  };

  // --- CSV Download Helpers ---
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

  const formatDateShort = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Export single session detail
  const handleExportSession = (studentAttendances: StudentAttendance[], sessionInfo?: { className?: string; subject?: string; date?: string }) => {
    if (studentAttendances.length === 0) {
      toast.warning('Tidak ada data untuk di-export');
      return;
    }
    const className = sessionInfo?.className || 'Unknown';
    const subjectName = sessionInfo?.subject || 'Unknown';
    const dateStr = sessionInfo?.date || new Date().toLocaleDateString('id-ID');
    const headers = ['No', 'NISN', 'Nama Siswa', 'Status', 'Waktu Absen'];
    const rows = studentAttendances.map((sa, index) => [
      index + 1,
      sa.student.nisn || '-',
      sa.student.name,
      statusOptions.find(s => s.value === sa.status)?.label || sa.status,
      sa.attendance?.scanned_at ? new Date(sa.attendance.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-',
    ]);
    const csv = [
      `Daftar Kehadiran - ${className}`,
      `Mata Pelajaran: ${subjectName}`,
      `Tanggal: ${dateStr}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');
    downloadCSV(csv, `absensi_${className.replace(/\s+/g, '_')}_${subjectName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.csv`);
  };

  // Export recap by subject (all sessions for that subject)
  const handleExportBySubject = (subject: string) => {
    const subjectSessions = sessions.filter(s => s.subject === subject);
    if (subjectSessions.length === 0) return;

    const totalPresent = subjectSessions.reduce((acc, s) => acc + s.total_present, 0);
    const totalStudents = subjectSessions.reduce((acc, s) => acc + s.total_students, 0);
    const pct = totalStudents > 0 ? Math.round((totalPresent / totalStudents) * 100) : 0;

    const headers = ['No', 'Tanggal', 'Kelas', 'Hadir / Total', 'Persentase', 'Status'];
    const rows = subjectSessions.map((s, i) => [
      i + 1,
      formatDateShort(s.created_at),
      s.class_name,
      `${s.total_present}/${s.total_students}`,
      s.total_students > 0 ? `${Math.round((s.total_present / s.total_students) * 100)}%` : '0%',
      s.status === 'active' ? 'Aktif' : 'Selesai',
    ]);

    const csv = [
      `REKAP KEHADIRAN PER MATA PELAJARAN`,
      `Mata Pelajaran: ${subject}`,
      `Total Sesi: ${subjectSessions.length}`,
      `Rata-rata Kehadiran: ${pct}%`,
      `Tanggal Download: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(',')),
      '',
      `TOTAL,,,"${totalPresent}/${totalStudents}",${pct}%,`,
    ].join('\n');

    downloadCSV(csv, `rekap_absensi_${subject.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  // Export comprehensive recap (all subjects)
  const handleExportAll = () => {
    if (sessions.length === 0) return;

    // Summary per subject
    const summaryHeaders = ['Mata Pelajaran', 'Total Sesi', 'Total Hadir', 'Total Siswa', 'Kehadiran (%)'];
    const summaryRows = subjectStats.map(s => {
      const pct = s.totalStudents > 0 ? Math.round((s.totalPresent / s.totalStudents) * 100) : 0;
      return [s.subject, s.sessions, s.totalPresent, s.totalStudents, `${pct}%`];
    });

    const overallPresent = subjectStats.reduce((acc, s) => acc + s.totalPresent, 0);
    const overallStudents = subjectStats.reduce((acc, s) => acc + s.totalStudents, 0);
    const overallPct = overallStudents > 0 ? Math.round((overallPresent / overallStudents) * 100) : 0;

    // Detail all sessions
    const detailHeaders = ['No', 'Tanggal', 'Kelas', 'Mata Pelajaran', 'Hadir / Total', 'Persentase', 'Status'];
    const detailRows = sessions.map((s, i) => [
      i + 1,
      formatDateShort(s.created_at),
      s.class_name,
      s.subject,
      `${s.total_present}/${s.total_students}`,
      s.total_students > 0 ? `${Math.round((s.total_present / s.total_students) * 100)}%` : '0%',
      s.status === 'active' ? 'Aktif' : 'Selesai',
    ]);

    const csv = [
      'REKAP KEHADIRAN LENGKAP',
      `Tanggal Download: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Total Sesi: ${sessions.length}`,
      '',
      '=== RINGKASAN PER MATA PELAJARAN ===',
      '',
      summaryHeaders.join(','),
      ...summaryRows.map(r => r.join(',')),
      ['TOTAL', sessions.length, overallPresent, overallStudents, `${overallPct}%`].join(','),
      '',
      '=== DETAIL SEMUA SESI ===',
      '',
      detailHeaders.join(','),
      ...detailRows.map(r => r.join(',')),
    ].join('\n');

    downloadCSV(csv, `rekap_kehadiran_lengkap_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const closeDetail = () => {
    setSelectedSession(null);
    setAllStudents([]);
    setIsEditMode(false);
    setEditedStatuses({});
  };

  const hasFilters = filterSubject || filterClass;

  return (
    <div className="space-y-6">
      {/* Filters & Download */}
      {sessions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Subject Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="pl-9 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 appearance-none cursor-pointer min-w-[180px] focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Semua Mapel</option>
                {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {/* Class Filter */}
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="pl-9 pr-8 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 appearance-none cursor-pointer min-w-[140px] focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="">Semua Kelas</option>
                {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setFilterSubject(''); setFilterClass(''); }}
                className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Download Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDownloadMenu(!showDownloadMenu); }}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4" />
              Download Rekap
              <ChevronDown className={`w-4 h-4 transition-transform ${showDownloadMenu ? 'rotate-180' : ''}`} />
            </button>
            {showDownloadMenu && (
              <div
                className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-slideDown"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pilih Rekap Download</p>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {/* Download All */}
                  <button
                    onClick={() => { handleExportAll(); setShowDownloadMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center flex-shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Rekap Semua Mapel</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{sessions.length} sesi • ringkasan + detail</p>
                    </div>
                  </button>
                  {/* Per Subject */}
                  {uniqueSubjects.length > 0 && (
                    <div className="border-t border-slate-100 dark:border-slate-700">
                      <p className="px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Per Mata Pelajaran</p>
                      {uniqueSubjects.map(subj => {
                        const stat = subjectStats.find(s => s.subject === subj);
                        const pct = stat && stat.totalStudents > 0 ? Math.round((stat.totalPresent / stat.totalStudents) * 100) : 0;
                        return (
                          <button
                            key={subj}
                            onClick={() => { handleExportBySubject(subj); setShowDownloadMenu(false); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left cursor-pointer"
                          >
                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <ClipboardList className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{subj}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {stat?.sessions || 0} sesi • {pct}% hadir
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
        </div>
      )}

      {/* Session History List */}
      <Card>
        <CardHeader
          title="Riwayat Sesi Absensi"
          subtitle={`Lihat dan export data absensi sebelumnya${hasFilters ? ` (${filteredSessions.length} dari ${sessions.length} sesi)` : ''}`}
          action={
            <Button size="sm" variant="outline" leftIcon={<RefreshCw className="w-4 h-4" />} onClick={onRefresh} disabled={loadingHistory}>
              Refresh
            </Button>
          }
        />
        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
          </div>
        ) : filteredSessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm print-table">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Tanggal</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Kelas</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Mata Pelajaran</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Kehadiran</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400 print:hidden">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr key={session.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">
                      {new Date(session.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{session.class_name}</td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">{session.subject}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                        <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        {session.total_present}/{session.total_students}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${session.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 dark:text-slate-400'}`}>
                        {session.status === 'active' ? 'Aktif' : 'Selesai'}
                      </span>
                    </td>
                    <td className="py-3 px-4 print:hidden">
                      <Button size="sm" variant="outline" leftIcon={<Eye className="w-4 h-4" />} onClick={() => handleViewSession(session.id)}>
                        Lihat
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : sessions.length > 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <Filter className="w-12 h-12 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
            <p>Tidak ada sesi yang cocok dengan filter</p>
            <button
              onClick={() => { setFilterSubject(''); setFilterClass(''); }}
              className="mt-2 text-sm text-sky-600 dark:text-sky-400 font-medium hover:underline cursor-pointer"
            >
              Reset filter
            </button>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <History className="w-12 h-12 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
            <p>Belum ada riwayat sesi absensi</p>
          </div>
        )}
      </Card>

      {/* Session Detail */}
      {selectedSession && (
        <Card>
          <CardHeader
            title="Detail Kehadiran"
            subtitle={`Sesi #${selectedSession} - ${sessions.find(s => s.id === selectedSession)?.class_name || ''} • ${sessions.find(s => s.id === selectedSession)?.subject || ''}`}
            action={
              <div className="flex gap-2 print:hidden">
                {isEditMode ? (
                  <>
                    <Button size="sm" variant="primary" leftIcon={savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} onClick={handleSaveStatuses} disabled={savingStatus || Object.keys(editedStatuses).length === 0}>
                      Simpan
                    </Button>
                    <Button size="sm" variant="outline" leftIcon={<X className="w-4 h-4" />} onClick={() => { setIsEditMode(false); setEditedStatuses({}); }} disabled={savingStatus}>
                      Batal
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="outline" leftIcon={<Edit2 className="w-4 h-4" />} onClick={() => setIsEditMode(true)}>
                      Edit Status
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Download className="w-4 h-4" />}
                      onClick={() => {
                        const session = sessions.find(s => s.id === selectedSession);
                        handleExportSession(allStudents, {
                          className: session?.class_name,
                          subject: session?.subject,
                          date: session ? new Date(session.created_at).toLocaleDateString('id-ID') : undefined,
                        });
                      }}
                      disabled={allStudents.length === 0}
                    >
                      Export CSV
                    </Button>
                    <Button size="sm" variant="outline" onClick={closeDetail}>
                      Tutup
                    </Button>
                  </>
                )}
              </div>
            }
          />
          {loadingDetail ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
            </div>
          ) : allStudents.length > 0 ? (
            <div className="overflow-x-auto">
              {/* Summary */}
              <div className="flex flex-wrap gap-3 mb-4 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                {statusOptions.filter(s => s.value !== 'belum').map(status => {
                  const count = allStudents.filter(sa => (editedStatuses[sa.student.id] || sa.status) === status.value).length;
                  return (
                    <span key={status.value} className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${status.color}`}>
                      {status.label}: {count}
                    </span>
                  );
                })}
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-200 text-slate-700 dark:text-slate-300">
                  Belum: {allStudents.filter(sa => (editedStatuses[sa.student.id] || sa.status) === 'belum').length}
                </span>
              </div>
              <table className="w-full text-sm print-table">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">No</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">NISN</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Nama Siswa</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudents.map((sa, index) => {
                    const currentStatus = editedStatuses[sa.student.id] || sa.status;
                    const statusInfo = statusOptions.find(s => s.value === currentStatus);
                    return (
                      <tr key={sa.student.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{index + 1}</td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{sa.student.nisn || '-'}</td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{sa.student.name}</td>
                        <td className="py-3 px-4">
                          {isEditMode ? (
                            <select
                              value={currentStatus}
                              onChange={(e) => handleStatusChange(sa.student.id, e.target.value)}
                              className="block w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {statusOptions.filter(s => s.value !== 'belum').map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo?.color || 'bg-slate-100 text-slate-600 dark:text-slate-400'}`}>
                              {statusInfo?.label || currentStatus}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {sa.attendance?.scanned_at
                            ? new Date(sa.attendance.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                            : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
              <p>Tidak ada data siswa pada sesi ini</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
