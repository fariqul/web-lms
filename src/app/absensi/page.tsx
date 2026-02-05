'use client';

import React, { useState, useEffect, useCallback, useId } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Select, Table } from '@/components/ui';
import { QrCode, Clock, CheckCircle, RefreshCw, Download, StopCircle, Loader2, History, Eye, Users, Edit2, Save, X, Smartphone, AlertTriangle } from 'lucide-react';
import { classAPI } from '@/services/api';
import api from '@/services/api';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';

interface AttendanceRecord {
  id: number;
  name: string;
  time: string;
  status: string;
}

interface StudentAttendance {
  student: {
    id: number;
    name: string;
    nisn: string;
  };
  status: string;
  attendance?: {
    id: number;
    scanned_at: string | null;
  };
}

interface SessionHistory {
  id: number;
  class_name: string;
  subject: string;
  status: 'active' | 'closed';
  created_at: string;
  total_present: number;
  total_students: number;
}

interface ClassOption {
  value: string;
  label: string;
}

const subjects = [
  { value: 'matematika', label: 'Matematika' },
  { value: 'fisika', label: 'Fisika' },
  { value: 'biologi', label: 'Biologi' },
  { value: 'kimia', label: 'Kimia' },
  { value: 'informatika', label: 'Informatika' },
  { value: 'bahasa_indonesia', label: 'Bahasa Indonesia' },
  { value: 'bahasa_inggris', label: 'Bahasa Inggris' },
];

const statusOptions = [
  { value: 'hadir', label: 'Hadir', color: 'bg-green-100 text-green-700' },
  { value: 'izin', label: 'Izin', color: 'bg-blue-100 text-blue-700' },
  { value: 'sakit', label: 'Sakit', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'alpha', label: 'Alpha', color: 'bg-red-100 text-red-700' },
  { value: 'belum', label: 'Belum Absen', color: 'bg-gray-100 text-gray-600' },
];

export default function AbsensiPage() {
  const qrId = useId();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [qrToken, setQrToken] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(300);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  
  // Session history states
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistorySession, setSelectedHistorySession] = useState<number | null>(null);
  const [historyAttendances, setHistoryAttendances] = useState<AttendanceRecord[]>([]);
  const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  
  // Edit status states
  const [allStudentAttendances, setAllStudentAttendances] = useState<StudentAttendance[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedStatuses, setEditedStatuses] = useState<Record<number, string>>({});
  const [savingStatus, setSavingStatus] = useState(false);
  
  // Anti-cheat options
  const [requireSchoolNetwork, setRequireSchoolNetwork] = useState(false);
  
  // Pending device switch requests count
  const [pendingDeviceRequests, setPendingDeviceRequests] = useState(0);

  // Load active session from localStorage or API on mount
  useEffect(() => {
    const initialize = async () => {
      await fetchClasses();
      await fetchSessionHistory();
      await fetchPendingDeviceRequests();
      await loadActiveSession();
      setLoading(false);
    };
    initialize();
  }, []);

  const loadActiveSession = async () => {
    try {
      // Check localStorage first
      const savedSession = localStorage.getItem('activeAttendanceSession');
      
      if (!savedSession) {
        console.log('No saved session in localStorage');
        return;
      }
      
      const session = JSON.parse(savedSession);
      console.log('Found saved session:', session);
      
      try {
        // Verify session is still active via API
        console.log('Verifying session via API:', `/attendance-sessions/${session.id}`);
        const response = await api.get(`/attendance-sessions/${session.id}`);
        console.log('API response status:', response.data?.data?.status);
        
        if (response.data?.data?.status === 'active') {
          // Set all session data
          setCurrentSessionId(session.id);
          setSelectedClass(session.class_id.toString());
          setSelectedSubject(session.subject);
          setTotalStudents(session.totalStudents || 30);
          setQrToken(response.data.data.qr_token);
          setIsSessionActive(true);
          
          // Load attendance records
          if (response.data.data.attendances) {
            const records = response.data.data.attendances
              .filter((a: { status: string }) => a.status === 'hadir')
              .map((a: { student_id: number; student?: { name: string }; scanned_at: string; status: string }) => ({
                id: a.student_id,
                name: a.student?.name || 'Unknown',
                time: new Date(a.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                status: a.status,
              }));
            setAttendanceRecords(records);
          }
          console.log('Session restored successfully!');
        } else {
          // Session is no longer active, clear localStorage
          console.log('Session status is not active:', response.data?.data?.status);
          clearSessionFromStorage();
        }
      } catch (apiError) {
        console.error('Failed to verify session via API:', apiError);
        // Session might not exist anymore, clear storage
        clearSessionFromStorage();
      }
    } catch (error) {
      console.error('Failed to parse saved session:', error);
      clearSessionFromStorage();
    }
  };

  const resetSessionState = () => {
    setCurrentSessionId(null);
    setSelectedClass('');
    setSelectedSubject('');
    setQrToken('');
    setIsSessionActive(false);
    setAttendanceRecords([]);
  };

  const saveSessionToStorage = (sessionId: number, classId: string, subject: string, totalStudents: number) => {
    localStorage.setItem('activeAttendanceSession', JSON.stringify({
      id: sessionId,
      class_id: classId,
      subject: subject,
      totalStudents: totalStudents,
    }));
  };

  const clearSessionFromStorage = () => {
    localStorage.removeItem('activeAttendanceSession');
  };

  // Fetch attendance records for active session
  const fetchAttendanceRecords = useCallback(async () => {
    if (!currentSessionId) return;
    
    try {
      const response = await api.get(`/attendance-sessions/${currentSessionId}`);
      if (response.data?.data?.attendances) {
        const records = response.data.data.attendances
          .filter((a: { status: string }) => a.status === 'hadir')
          .map((a: { student_id: number; student?: { name: string }; scanned_at: string; status: string }) => ({
            id: a.student_id,
            name: a.student?.name || 'Unknown',
            time: new Date(a.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
            status: a.status,
          }));
        setAttendanceRecords(records);
      }
    } catch (error) {
      console.error('Failed to fetch attendance records:', error);
    }
  }, [currentSessionId]);

  // Poll for attendance updates every 5 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSessionActive && currentSessionId) {
      // Fetch immediately
      fetchAttendanceRecords();
      // Then poll every 5 seconds
      interval = setInterval(fetchAttendanceRecords, 5000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive, currentSessionId, fetchAttendanceRecords]);

  // Timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSessionActive && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // Auto refresh QR when timer reaches 0
            generateQRToken();
            return 300;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive, timeRemaining]);

  const fetchClasses = async () => {
    try {
      const response = await classAPI.getAll();
      const classesData = response.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string; students_count?: number }) => ({
          value: c.id.toString(),
          label: c.name,
          studentsCount: c.students_count || 0,
        }))
      );
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    }
    // Note: setLoading is now handled in initialize()
  };

  // Fetch session history
  const fetchSessionHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await api.get('/attendance-sessions');
      const sessions = response.data?.data?.data || response.data?.data || [];
      const formattedSessions: SessionHistory[] = sessions.map((s: {
        id: number;
        class?: { name: string };
        subject: string;
        status: string;
        created_at: string;
        summary?: { hadir: number; total: number };
      }) => ({
        id: s.id,
        class_name: s.class?.name || 'Unknown',
        subject: subjects.find(sub => sub.value === s.subject)?.label || s.subject,
        status: s.status,
        created_at: s.created_at,
        total_present: s.summary?.hadir || 0,
        total_students: s.summary?.total || 0,
      }));
      setSessionHistory(formattedSessions);
    } catch (error) {
      console.error('Failed to fetch session history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch pending device switch requests count
  const fetchPendingDeviceRequests = async () => {
    try {
      const sessionsResponse = await api.get('/attendance-sessions/my-sessions');
      const sessions = sessionsResponse.data?.data || [];
      
      let pendingCount = 0;
      for (const session of sessions) {
        try {
          const response = await api.get(`/attendance-sessions/${session.id}/device-switch-requests`);
          const requests = response.data?.data || [];
          pendingCount += requests.filter((r: { status: string }) => r.status === 'pending').length;
        } catch {
          // Session might not have any requests
        }
      }
      
      setPendingDeviceRequests(pendingCount);
    } catch (error) {
      console.error('Failed to fetch pending device requests:', error);
    }
  };

  // View session detail - shows all students with their status
  const handleViewSession = async (sessionId: number) => {
    setSelectedHistorySession(sessionId);
    setLoadingHistoryDetail(true);
    setIsEditMode(false);
    setEditedStatuses({});
    
    try {
      const response = await api.get(`/attendance-sessions/${sessionId}`);
      const data = response.data?.data;
      
      // Get all student attendances (including those who haven't scanned)
      if (data?.student_attendances) {
        setAllStudentAttendances(data.student_attendances);
      }
      
      // Also set the records for export (only hadir)
      if (data?.attendances) {
        const records = data.attendances
          .filter((a: { status: string }) => a.status === 'hadir')
          .map((a: { student_id: number; student?: { name: string }; scanned_at: string; status: string }) => ({
            id: a.student_id,
            name: a.student?.name || 'Unknown',
            time: a.scanned_at ? new Date(a.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-',
            status: a.status,
          }));
        setHistoryAttendances(records);
      }
    } catch (error) {
      console.error('Failed to fetch session detail:', error);
    } finally {
      setLoadingHistoryDetail(false);
    }
  };

  // Handle status change in edit mode
  const handleStatusChange = (studentId: number, newStatus: string) => {
    setEditedStatuses(prev => ({
      ...prev,
      [studentId]: newStatus,
    }));
  };

  // Save edited statuses
  const handleSaveStatuses = async () => {
    if (!selectedHistorySession || Object.keys(editedStatuses).length === 0) return;
    
    setSavingStatus(true);
    try {
      const updates = Object.entries(editedStatuses).map(([studentId, status]) => ({
        student_id: parseInt(studentId),
        status,
      }));

      await api.post(`/attendance-sessions/${selectedHistorySession}/bulk-update-status`, {
        updates,
      });

      // Refresh session detail
      await handleViewSession(selectedHistorySession);
      // Refresh session history to update summary counts
      await fetchSessionHistory();
      
      setIsEditMode(false);
      setEditedStatuses({});
      alert('Status kehadiran berhasil disimpan');
    } catch (error) {
      console.error('Failed to save statuses:', error);
      alert('Gagal menyimpan status kehadiran');
    } finally {
      setSavingStatus(false);
    }
  };

  // Export all students attendance to CSV
  const handleExportAll = (studentAttendances: StudentAttendance[], sessionInfo?: { className?: string; subject?: string; date?: string }) => {
    if (studentAttendances.length === 0) {
      alert('Tidak ada data untuk di-export');
      return;
    }

    const className = sessionInfo?.className || 'Unknown';
    const subjectName = sessionInfo?.subject || 'Unknown';
    const dateStr = sessionInfo?.date || new Date().toLocaleDateString('id-ID');

    // Create CSV content with all students
    const headers = ['No', 'NISN', 'Nama Siswa', 'Status', 'Waktu Absen'];
    const rows = studentAttendances.map((sa, index) => [
      index + 1,
      sa.student.nisn || '-',
      sa.student.name,
      statusOptions.find(s => s.value === sa.status)?.label || sa.status,
      sa.attendance?.scanned_at ? new Date(sa.attendance.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) : '-'
    ]);

    const csvContent = [
      `Daftar Kehadiran - ${className}`,
      `Mata Pelajaran: ${subjectName}`,
      `Tanggal: ${dateStr}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download file
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

  // Export attendance to CSV
  const handleExport = (records: AttendanceRecord[], sessionInfo?: { className?: string; subject?: string; date?: string }) => {
    if (records.length === 0) {
      alert('Tidak ada data untuk di-export');
      return;
    }

    const className = sessionInfo?.className || classes.find(c => c.value === selectedClass)?.label || 'Unknown';
    const subjectName = sessionInfo?.subject || subjects.find(s => s.value === selectedSubject)?.label || 'Unknown';
    const dateStr = sessionInfo?.date || new Date().toLocaleDateString('id-ID');

    // Create CSV content
    const headers = ['No', 'Nama Siswa', 'Waktu Absen', 'Status'];
    const rows = records.map((record, index) => [
      index + 1,
      record.name,
      record.time,
      record.status
    ]);

    const csvContent = [
      `Daftar Hadir - ${className}`,
      `Mata Pelajaran: ${subjectName}`,
      `Tanggal: ${dateStr}`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `absensi_${className.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const generateQRToken = useCallback(() => {
    const token = 'QR-' + Date.now().toString(36).toUpperCase() + '-' + qrId.replace(/:/g, '').slice(0, 4).toUpperCase();
    setQrToken(token);
    setTimeRemaining(300);
    return token;
  }, [qrId]);

  const handleStartSession = async () => {
    if (!selectedClass || !selectedSubject) {
      alert('Pilih kelas dan mata pelajaran terlebih dahulu');
      return;
    }

    try {
      // Calculate valid_from and valid_until (session valid for 2 hours)
      const now = new Date();
      const validFrom = now.toISOString();
      const validUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now

      // Create session via API
      console.log('Creating attendance session...');
      const response = await api.post('/attendance-sessions', {
        class_id: parseInt(selectedClass),
        subject: selectedSubject,
        valid_from: validFrom,
        valid_until: validUntil,
        require_school_network: requireSchoolNetwork,
      });
      console.log('API response:', response.data);

      // Get the QR token from server response
      if (response.data?.data?.qr_token) {
        setQrToken(response.data.data.qr_token);
      } else {
        // Fallback to local generated token
        generateQRToken();
      }

      // Save session ID for later use (close session)
      const sessionId = response.data?.data?.id;
      console.log('Session ID from response:', sessionId);
      
      if (sessionId) {
        setCurrentSessionId(sessionId);
        // Save to localStorage for persistence
        const selectedClassData = classes.find((c) => c.value === selectedClass);
        const studentsCount = (selectedClassData as { studentsCount?: number })?.studentsCount || 30;
        
        console.log('Saving to localStorage:', { id: sessionId, class_id: selectedClass, subject: selectedSubject, totalStudents: studentsCount });
        saveSessionToStorage(sessionId, selectedClass, selectedSubject, studentsCount);
        
        // Verify it was saved
        const saved = localStorage.getItem('activeAttendanceSession');
        console.log('Verified localStorage after save:', saved);
      } else {
        console.error('No session ID in API response!');
      }

      // Get students count for selected class
      const selectedClassData = classes.find((c) => c.value === selectedClass);
      setTotalStudents((selectedClassData as { studentsCount?: number })?.studentsCount || 30);
      setIsSessionActive(true);
      setAttendanceRecords([]);
      setTimeRemaining(300); // 5 minutes display timer
    } catch (error) {
      console.error('Failed to start session:', error);
      alert('Gagal memulai sesi absensi. Pastikan API backend sudah berjalan.');
    }
  };

  const handleStopSession = async () => {
    if (!currentSessionId) {
      // Fallback if no session ID
      setIsSessionActive(false);
      setQrToken('');
      setAttendanceRecords([]);
      clearSessionFromStorage();
      return;
    }

    setIsClosing(true);
    try {
      await api.post(`/attendance-sessions/${currentSessionId}/close`);
      setIsSessionActive(false);
      setQrToken('');
      setAttendanceRecords([]);
      setCurrentSessionId(null);
      clearSessionFromStorage();
      // Refresh history after closing session
      fetchSessionHistory();
    } catch (error) {
      console.error('Failed to close session:', error);
      alert('Gagal menutup sesi. Coba lagi.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleRefreshQR = () => {
    generateQRToken();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const columns = [
    { key: 'name', header: 'Nama Siswa' },
    { key: 'time', header: 'Waktu Absen' },
    {
      key: 'status',
      header: 'Status',
      render: (item: AttendanceRecord) => (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
          <CheckCircle className="w-3 h-3" />
          {item.status}
        </span>
      ),
    },
  ];

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
        {/* Pending Device Requests Alert */}
        {pendingDeviceRequests > 0 && (
          <Link href="/absensi/persetujuan-device">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 cursor-pointer hover:bg-yellow-100 transition-colors">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div className="flex-1">
                <h3 className="font-medium text-yellow-800">
                  {pendingDeviceRequests} permintaan pindah perangkat menunggu persetujuan
                </h3>
                <p className="text-sm text-yellow-700">
                  Klik untuk melihat dan memproses permintaan
                </p>
              </div>
              <Smartphone className="w-5 h-5 text-yellow-600" />
            </div>
          </Link>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <QrCode className="w-4 h-4 inline mr-2" />
            Buat Sesi
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <History className="w-4 h-4 inline mr-2" />
            Riwayat Sesi
          </button>
        </div>

        {activeTab === 'create' ? (
          <>
            {/* Session Controls */}
            <Card>
              <CardHeader
                title="Buat Sesi Absensi"
                subtitle="Buat sesi absensi dengan QR Code dinamis"
              />

              {!isSessionActive ? (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <Select
                      label="Pilih Kelas"
                      options={[{ value: '', label: 'Pilih kelas...' }, ...classes]}
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                    />
                    <Select
                      label="Mata Pelajaran"
                      options={[{ value: '', label: 'Pilih mata pelajaran...' }, ...subjects]}
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                    />
                  </div>
                  
                  {/* Anti-Cheat Options */}
                  <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Pengaturan Anti-Titip</h4>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requireSchoolNetwork}
                        onChange={(e) => setRequireSchoolNetwork(e.target.checked)}
                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-700">Wajibkan WiFi Sekolah</span>
                        <p className="text-xs text-gray-500">Siswa hanya bisa absen jika terhubung ke jaringan sekolah</p>
                      </div>
                    </label>
                  </div>
                  
                  <Button
                    onClick={handleStartSession}
                    leftIcon={<QrCode className="w-5 h-5" />}
                  >
                Mulai Sesi Absensi
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Session Info */}
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-teal-700 mb-2">
                  <span className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                  <span className="font-medium">Sesi Aktif</span>
                </div>
                <p className="text-gray-700">
                  {classes.find((c) => c.value === selectedClass)?.label} -{' '}
                  {subjects.find((s) => s.value === selectedSubject)?.label}
                </p>
              </div>

              {/* QR Code Display */}
              <div className="flex flex-col items-center">
                <div className="w-64 h-64 bg-white border-4 border-gray-200 rounded-xl flex items-center justify-center mb-4 p-2">
                  {qrToken ? (
                    <QRCodeSVG 
                      value={qrToken}
                      size={224}
                      level="H"
                      includeMargin={false}
                    />
                  ) : (
                    <div className="w-48 h-48 bg-gradient-to-br from-gray-800 to-gray-600 rounded-lg flex items-center justify-center">
                      <QrCode className="w-32 h-32 text-white" />
                    </div>
                  )}
                </div>

                <p className="text-sm text-gray-500 mb-2">Token: <span className="font-mono font-semibold">{qrToken}</span></p>

                {/* Timer */}
                <div className="flex items-center gap-2 text-lg font-mono">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <span className={`${timeRemaining < 60 ? 'text-red-600' : 'text-orange-600'}`}>
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">QR akan refresh otomatis setiap 5 menit</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{attendanceRecords.length}</p>
                  <p className="text-sm text-blue-700">Sudah Absen</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-600">{totalStudents - attendanceRecords.length}</p>
                  <p className="text-sm text-gray-700">Belum Absen</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleRefreshQR}
                  variant="outline"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                >
                  Refresh QR
                </Button>
                <Button
                  onClick={handleStopSession}
                  variant="danger"
                  leftIcon={isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                  disabled={isClosing}
                >
                  {isClosing ? 'Menutup...' : 'Akhiri Sesi'}
                </Button>
              </div>
            </div>
          )}
        </Card>

            {/* Attendance Records */}
            {isSessionActive && (
              <Card>
                <CardHeader
                  title="Daftar Kehadiran"
                  subtitle={`${attendanceRecords.length} dari ${totalStudents} siswa`}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Download className="w-4 h-4" />}
                      onClick={() => handleExport(attendanceRecords)}
                    >
                      Export CSV
                    </Button>
                  }
                />
                {attendanceRecords.length > 0 ? (
                  <Table
                    columns={columns}
                    data={attendanceRecords}
                    keyExtractor={(item) => item.id}
                  />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <QrCode className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Belum ada siswa yang absen</p>
                    <p className="text-sm text-gray-400 mt-1">Siswa dapat scan QR code di atas untuk absen</p>
                  </div>
                )}
              </Card>
            )}
          </>
        ) : (
          /* History Tab */
          <div className="space-y-6">
            {/* Session History List */}
            <Card>
              <CardHeader
                title="Riwayat Sesi Absensi"
                subtitle="Lihat dan export data absensi sebelumnya"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<RefreshCw className="w-4 h-4" />}
                    onClick={fetchSessionHistory}
                    disabled={loadingHistory}
                  >
                    Refresh
                  </Button>
                }
              />
              
              {loadingHistory ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                </div>
              ) : sessionHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Tanggal</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Kelas</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Mata Pelajaran</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Kehadiran</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-600">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionHistory.map((session) => (
                        <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            {new Date(session.created_at).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-3 px-4 font-medium">{session.class_name}</td>
                          <td className="py-3 px-4">{session.subject}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-4 h-4 text-gray-400" />
                              {session.total_present}/{session.total_students}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              session.status === 'active' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {session.status === 'active' ? 'Aktif' : 'Selesai'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <Button
                              size="sm"
                              variant="outline"
                              leftIcon={<Eye className="w-4 h-4" />}
                              onClick={() => handleViewSession(session.id)}
                            >
                              Lihat
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Belum ada riwayat sesi absensi</p>
                </div>
              )}
            </Card>

            {/* Session Detail Modal/Card */}
            {selectedHistorySession && (
              <Card>
                <CardHeader
                  title="Detail Kehadiran"
                  subtitle={`Sesi #${selectedHistorySession} - ${sessionHistory.find(s => s.id === selectedHistorySession)?.class_name || ''}`}
                  action={
                    <div className="flex gap-2">
                      {isEditMode ? (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            leftIcon={savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            onClick={handleSaveStatuses}
                            disabled={savingStatus || Object.keys(editedStatuses).length === 0}
                          >
                            Simpan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<X className="w-4 h-4" />}
                            onClick={() => {
                              setIsEditMode(false);
                              setEditedStatuses({});
                            }}
                            disabled={savingStatus}
                          >
                            Batal
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<Edit2 className="w-4 h-4" />}
                            onClick={() => setIsEditMode(true)}
                          >
                            Edit Status
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<Download className="w-4 h-4" />}
                            onClick={() => {
                              const session = sessionHistory.find(s => s.id === selectedHistorySession);
                              handleExportAll(allStudentAttendances, {
                                className: session?.class_name,
                                subject: session?.subject,
                                date: session ? new Date(session.created_at).toLocaleDateString('id-ID') : undefined
                              });
                            }}
                            disabled={allStudentAttendances.length === 0}
                          >
                            Export CSV
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedHistorySession(null);
                              setHistoryAttendances([]);
                              setAllStudentAttendances([]);
                              setIsEditMode(false);
                              setEditedStatuses({});
                            }}
                          >
                            Tutup
                          </Button>
                        </>
                      )}
                    </div>
                  }
                />
                
                {loadingHistoryDetail ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                  </div>
                ) : allStudentAttendances.length > 0 ? (
                  <div className="overflow-x-auto">
                    {/* Summary */}
                    <div className="flex gap-4 mb-4 px-4 py-2 bg-gray-50 rounded-lg">
                      {statusOptions.filter(s => s.value !== 'belum').map(status => {
                        const count = allStudentAttendances.filter(sa => 
                          (editedStatuses[sa.student.id] || sa.status) === status.value
                        ).length;
                        return (
                          <span key={status.value} className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${status.color}`}>
                            {status.label}: {count}
                          </span>
                        );
                      })}
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">
                        Belum: {allStudentAttendances.filter(sa => 
                          (editedStatuses[sa.student.id] || sa.status) === 'belum'
                        ).length}
                      </span>
                    </div>
                    
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-3 px-4 font-medium text-gray-600">No</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">NISN</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Nama Siswa</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Status</th>
                          <th className="text-left py-3 px-4 font-medium text-gray-600">Waktu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allStudentAttendances.map((sa, index) => {
                          const currentStatus = editedStatuses[sa.student.id] || sa.status;
                          const statusInfo = statusOptions.find(s => s.value === currentStatus);
                          
                          return (
                            <tr key={sa.student.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="py-3 px-4">{index + 1}</td>
                              <td className="py-3 px-4 text-gray-500">{sa.student.nisn || '-'}</td>
                              <td className="py-3 px-4 font-medium">{sa.student.name}</td>
                              <td className="py-3 px-4">
                                {isEditMode ? (
                                  <select
                                    value={currentStatus}
                                    onChange={(e) => handleStatusChange(sa.student.id, e.target.value)}
                                    className="block w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                                  >
                                    {statusOptions.filter(s => s.value !== 'belum').map(option => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusInfo?.color || 'bg-gray-100 text-gray-600'}`}>
                                    {statusInfo?.label || currentStatus}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-gray-500">
                                {sa.attendance?.scanned_at 
                                  ? new Date(sa.attendance.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                                  : '-'
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Tidak ada data siswa pada sesi ini</p>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
