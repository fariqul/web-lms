'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardHeader, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { History, Eye, Users, Edit2, Save, X, Download, Loader2, RefreshCw } from 'lucide-react';
import api from '@/services/api';

const statusOptions = [
  { value: 'hadir', label: 'Hadir', color: 'bg-green-100 text-green-700' },
  { value: 'izin', label: 'Izin', color: 'bg-sky-50 text-sky-700' },
  { value: 'sakit', label: 'Sakit', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'alpha', label: 'Alpha', color: 'bg-red-100 text-red-700' },
  { value: 'belum', label: 'Belum Absen', color: 'bg-slate-100 text-slate-600' },
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

  const handleExportAll = (studentAttendances: StudentAttendance[], sessionInfo?: { className?: string; subject?: string; date?: string }) => {
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
    const csvContent = [
      `Daftar Kehadiran - ${className}`,
      `Mata Pelajaran: ${subjectName}`,
      `Tanggal: ${dateStr}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `absensi_lengkap_${className.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeDetail = () => {
    setSelectedSession(null);
    setAllStudents([]);
    setIsEditMode(false);
    setEditedStatuses({});
  };

  return (
    <div className="space-y-6">
      {/* Session History List */}
      <Card>
        <CardHeader
          title="Riwayat Sesi Absensi"
          subtitle="Lihat dan export data absensi sebelumnya"
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
        ) : sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm print-table">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Tanggal</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Kelas</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Mata Pelajaran</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Kehadiran</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 print:hidden">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      {new Date(session.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 font-medium">{session.class_name}</td>
                    <td className="py-3 px-4">{session.subject}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1">
                        <Users className="w-4 h-4 text-slate-400" />
                        {session.total_present}/{session.total_students}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${session.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
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
        ) : (
          <div className="text-center py-8 text-slate-500">
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
            subtitle={`Sesi #${selectedSession} - ${sessions.find(s => s.id === selectedSession)?.class_name || ''}`}
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
                        handleExportAll(allStudents, {
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
              <div className="flex gap-4 mb-4 px-4 py-2 bg-slate-50 rounded-lg">
                {statusOptions.filter(s => s.value !== 'belum').map(status => {
                  const count = allStudents.filter(sa => (editedStatuses[sa.student.id] || sa.status) === status.value).length;
                  return (
                    <span key={status.value} className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${status.color}`}>
                      {status.label}: {count}
                    </span>
                  );
                })}
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-200 text-slate-700">
                  Belum: {allStudents.filter(sa => (editedStatuses[sa.student.id] || sa.status) === 'belum').length}
                </span>
              </div>
              <table className="w-full text-sm print-table">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-medium text-slate-600">No</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">NISN</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Nama Siswa</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudents.map((sa, index) => {
                    const currentStatus = editedStatuses[sa.student.id] || sa.status;
                    const statusInfo = statusOptions.find(s => s.value === currentStatus);
                    return (
                      <tr key={sa.student.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4">{index + 1}</td>
                        <td className="py-3 px-4 text-slate-500">{sa.student.nisn || '-'}</td>
                        <td className="py-3 px-4 font-medium">{sa.student.name}</td>
                        <td className="py-3 px-4">
                          {isEditMode ? (
                            <select
                              value={currentStatus}
                              onChange={(e) => handleStatusChange(sa.student.id, e.target.value)}
                              className="block w-full px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {statusOptions.filter(s => s.value !== 'belum').map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo?.color || 'bg-slate-100 text-slate-600'}`}>
                              {statusInfo?.label || currentStatus}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
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
            <div className="text-center py-8 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
              <p>Tidak ada data siswa pada sesi ini</p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
