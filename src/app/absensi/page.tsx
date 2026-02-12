'use client';

import React, { useState, useEffect, useCallback, useId } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Select, Table } from '@/components/ui';
import { QrCode, Clock, CheckCircle, RefreshCw, Download, StopCircle, Loader2, History, Smartphone, AlertTriangle, UserCheck } from 'lucide-react';
import { classAPI } from '@/services/api';
import api from '@/services/api';
import { QRCodeSVG } from 'qrcode.react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { useAttendanceSocket } from '@/hooks/useSocket';
import { SessionHistoryTab, SessionHistory } from '@/components/absensi/SessionHistoryTab';
import { ManualAttendanceTab } from '@/components/absensi/ManualAttendanceTab';

interface AttendanceRecord {
  id: number;
  name: string;
  time: string;
  status: string;
}



interface ClassOption {
  value: string;
  label: string;
}

const subjects = [
  { value: 'Bahasa Indonesia', label: 'Bahasa Indonesia' },
  { value: 'Bahasa Inggris', label: 'Bahasa Inggris' },
  { value: 'Matematika', label: 'Matematika' },
  { value: 'Fisika', label: 'Fisika' },
  { value: 'Kimia', label: 'Kimia' },
  { value: 'Biologi', label: 'Biologi' },
  { value: 'Sejarah', label: 'Sejarah' },
  { value: 'Sosiologi', label: 'Sosiologi' },
  { value: 'Ekonomi', label: 'Ekonomi' },
  { value: 'Geografi', label: 'Geografi' },
  { value: 'PKN', label: 'PKN' },
  { value: 'Informatika', label: 'Informatika' },
  { value: 'Seni Budaya', label: 'Seni Budaya' },
  { value: 'Pendidikan Agama', label: 'Pendidikan Agama' },
  { value: 'PJOK', label: 'PJOK' },
  { value: 'IPA', label: 'IPA' },
  { value: 'Pengetahuan Umum', label: 'Pengetahuan Umum' },
];

export default function AbsensiPage() {
  const toast = useToast();
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
  const [activeTab, setActiveTab] = useState<'create' | 'manual' | 'history'>('create');
  
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
        return;
      }
      
      const session = JSON.parse(savedSession);
      
      try {
        // Verify session is still active via API
        const response = await api.get(`/attendance-sessions/${session.id}`);
        
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
        } else {
          // Session is no longer active, clear localStorage
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

  // WebSocket for real-time attendance updates (fallback to 30s polling)
  const attendanceSocket = useAttendanceSocket(currentSessionId || 0);

  useEffect(() => {
    if (!isSessionActive || !currentSessionId) return;

    // Fetch immediately on session start
    fetchAttendanceRecords();

    // Listen for real-time scan events via WebSocket
    const handleStudentScanned = (data: unknown) => {
      const scanData = data as { student_id: number; student_name?: string; scanned_at?: string; status?: string };
      if (scanData.student_id) {
        setAttendanceRecords((prev) => {
          // Avoid duplicates
          if (prev.some((r) => r.id === scanData.student_id)) return prev;
          return [
            ...prev,
            {
              id: scanData.student_id,
              name: scanData.student_name || 'Unknown',
              time: scanData.scanned_at
                ? new Date(scanData.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
                : new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
              status: scanData.status || 'hadir',
            },
          ];
        });
      }
    };

    attendanceSocket.onStudentScanned(handleStudentScanned);

    // Fallback: poll every 30s in case WebSocket is unavailable
    const fallbackInterval = setInterval(fetchAttendanceRecords, 30000);

    return () => {
      clearInterval(fallbackInterval);
      attendanceSocket.off(`attendance.${currentSessionId}.scanned`);
    };
  }, [isSessionActive, currentSessionId, fetchAttendanceRecords, attendanceSocket]);

  // Listen for real-time device switch requests to update pending count
  useEffect(() => {
    if (!currentSessionId) return;

    const handleDeviceSwitch = () => {
      // Increment pending count immediately for instant feedback
      setPendingDeviceRequests(prev => prev + 1);
    };

    attendanceSocket.onDeviceSwitchRequested(handleDeviceSwitch);

    return () => {
      attendanceSocket.off(`attendance.${currentSessionId}.device-switch-requested`);
    };
  }, [currentSessionId, attendanceSocket]);

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

  // Export attendance to CSV
  const handleExport = (records: AttendanceRecord[], sessionInfo?: { className?: string; subject?: string; date?: string }) => {
    if (records.length === 0) {
      toast.warning('Tidak ada data untuk di-export');
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
      toast.warning('Pilih kelas dan mata pelajaran terlebih dahulu');
      return;
    }

    try {
      // Calculate valid_from and valid_until (session valid for 2 hours)
      const now = new Date();
      const validFrom = now.toISOString();
      const validUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now

      // Create session via API
      const response = await api.post('/attendance-sessions', {
        class_id: parseInt(selectedClass),
        subject: selectedSubject,
        valid_from: validFrom,
        valid_until: validUntil,
        require_school_network: requireSchoolNetwork,
      });

      // Get the QR token from server response
      if (response.data?.data?.qr_token) {
        setQrToken(response.data.data.qr_token);
      } else {
        // Fallback to local generated token
        generateQRToken();
      }

      // Save session ID for later use (close session)
      const sessionId = response.data?.data?.id;
      
      if (sessionId) {
        setCurrentSessionId(sessionId);
        // Save to localStorage for persistence
        const selectedClassData = classes.find((c) => c.value === selectedClass);
        const studentsCount = (selectedClassData as { studentsCount?: number })?.studentsCount || 30;
        
        saveSessionToStorage(sessionId, selectedClass, selectedSubject, studentsCount);
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
      toast.error('Gagal memulai sesi absensi. Pastikan API backend sudah berjalan.');
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
      toast.error('Gagal menutup sesi. Coba lagi.');
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
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
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
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-blue-500 text-sky-500'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <QrCode className="w-4 h-4 inline mr-2" />
            Buat Sesi
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'manual'
                ? 'border-blue-500 text-sky-500'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            <UserCheck className="w-4 h-4 inline mr-2" />
            Absen Manual
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'history'
                ? 'border-blue-500 text-sky-500'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-700'
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
                      options={[{ value: '', label: 'Pilih kelas…' }, ...classes]}
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                    />
                    <Select
                      label="Mata Pelajaran"
                      options={[{ value: '', label: 'Pilih mata pelajaran…' }, ...subjects]}
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                    />
                  </div>
                  
                  {/* Anti-Cheat Options */}
                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-800">
                    <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Pengaturan Anti-Titip</h4>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requireSchoolNetwork}
                        onChange={(e) => setRequireSchoolNetwork(e.target.checked)}
                        className="w-4 h-4 text-sky-500 border-slate-300 rounded focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Wajibkan WiFi Sekolah</span>
                        <p className="text-xs text-slate-600 dark:text-slate-400">Siswa hanya bisa absen jika terhubung ke jaringan sekolah</p>
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
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-sky-700 mb-2">
                  <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                  <span className="font-medium">Sesi Aktif</span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">
                  {classes.find((c) => c.value === selectedClass)?.label} -{' '}
                  {subjects.find((s) => s.value === selectedSubject)?.label}
                </p>
              </div>

              {/* QR Code Display */}
              <div className="flex flex-col items-center">
                <div className="w-64 h-64 bg-white dark:bg-slate-900 border-4 border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center mb-4 p-2">
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

                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Token: <span className="font-mono font-semibold">{qrToken}</span></p>

                {/* Timer */}
                <div className="flex items-center gap-2 text-lg font-mono">
                  <Clock className="w-5 h-5 text-orange-500" />
                  <span className={`${timeRemaining < 60 ? 'text-red-600' : 'text-orange-600'}`}>
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">QR akan refresh otomatis setiap 5 menit</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-sky-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-sky-500">{attendanceRecords.length}</p>
                  <p className="text-sm text-sky-700">Sudah Absen</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{totalStudents - attendanceRecords.length}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">Belum Absen</p>
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
                  {isClosing ? 'Menutup…' : 'Akhiri Sesi'}
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
                  <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                    <QrCode className="w-12 h-12 mx-auto mb-2 text-slate-400 dark:text-slate-600" />
                    <p>Belum ada siswa yang absen</p>
                    <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Siswa dapat scan QR code di atas untuk absen</p>
                  </div>
                )}
              </Card>
            )}
          </>
        ) : activeTab === 'manual' ? (
          <ManualAttendanceTab
            classes={classes}
            subjects={subjects}
            onSessionCreated={fetchSessionHistory}
          />
        ) : (
          <SessionHistoryTab
            sessions={sessionHistory}
            loadingHistory={loadingHistory}
            onRefresh={fetchSessionHistory}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
