'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, StatCard, QuickActionCard, AttendanceChart } from '@/components/ui';
import {
  QrCode,
  FileText,
  BookOpen,
  Clock,
  ChevronRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface ScheduleItem {
  id: number;
  subject: string;
  start_time: string;
  end_time: string;
  room: string;
  class_room?: {
    id: number;
    name: string;
  };
}

interface AttendanceDay {
  day: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
}

export default function GuruDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalExams: 0,
    activeSessionCount: 0,
    todayScheduleCount: 0,
  });

  const [attendanceData, setAttendanceData] = useState<AttendanceDay[]>([
    { day: 'Sen', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Sel', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Rab', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Kam', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Jum', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
  ]);

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all data in parallel
      const [examsRes, scheduleRes, sessionsRes, attendanceRes] = await Promise.all([
        api.get('/exams').catch(() => ({ data: { data: [] } })),
        api.get('/teacher-schedule').catch(() => ({ data: { data: {} } })),
        api.get('/attendance-sessions', { params: { status: 'active' } }).catch(() => ({ data: { data: { data: [] } } })),
        api.get('/teacher-attendance-stats').catch(() => ({ data: { data: null } })),
      ]);

      // Process exams
      const examsRaw = examsRes.data?.data;
      const exams = Array.isArray(examsRaw) ? examsRaw : (examsRaw?.data || []);

      // Process schedule - get today's schedule
      const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
      const dayOfWeek = today === 0 ? 7 : today; // Sunday = 7 for our system
      const scheduleData = scheduleRes.data?.data || {};
      const todaySchedules = scheduleData[dayOfWeek] || [];
      setSchedule(todaySchedules.slice(0, 5));

      // Process active sessions
      const sessionsRaw = sessionsRes.data?.data;
      const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : (sessionsRaw?.data || []);
      const activeCount = sessions.filter((s: { status: string }) => s.status === 'active').length;

      // Process attendance stats
      const attendanceStats = attendanceRes.data?.data;
      if (attendanceStats?.weekly) {
        setAttendanceData(attendanceStats.weekly);
      }

      setStats({
        totalExams: exams.length,
        activeSessionCount: activeCount,
        todayScheduleCount: todaySchedules.length,
      });
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    return time.substring(0, 5); // "08:00:00" -> "08:00"
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
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Selamat Datang, {user?.name?.split(' ')[0]}!</h1>
          <p className="text-gray-600">Kelola absensi dan ujian Anda di sini</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <QuickActionCard
            icon={<QrCode className="w-8 h-8" />}
            title="Buat Sesi Absensi"
            href="/absensi"
            color="teal"
          />
          <QuickActionCard
            icon={<FileText className="w-8 h-8" />}
            title="Buat Ujian"
            href="/ujian"
            color="teal"
          />
          <QuickActionCard
            icon={<BookOpen className="w-8 h-8" />}
            title="Upload Materi"
            href="/materi"
            color="teal"
          />
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            value={stats.totalExams}
            label="Total Ujian"
            color="teal"
          />
          <StatCard
            value={stats.activeSessionCount}
            label="Sesi Absensi Aktif"
            color="blue"
          />
          <StatCard
            value={stats.todayScheduleCount}
            label="Jadwal Hari Ini"
            color="green"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Active Session / Today Schedule */}
          <Card>
            <CardHeader 
              title="Jadwal Hari Ini" 
              action={
                <Link href="/jadwal" className="text-teal-600 text-sm hover:underline flex items-center gap-1">
                  Lihat Semua <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            {schedule.length > 0 ? (
              <div className="space-y-3">
                {schedule.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.subject}</p>
                      <p className="text-sm text-gray-500">{item.class_room?.name || '-'}</p>
                    </div>
                    <span className="text-sm font-medium text-teal-600">{formatTime(item.start_time)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>Tidak ada jadwal hari ini</p>
              </div>
            )}
          </Card>

          {/* Attendance Chart */}
          <Card>
            <CardHeader 
              title="Statistik Kehadiran Minggu Ini" 
              action={
                <Link href="/nilai" className="text-teal-600 text-sm hover:underline flex items-center gap-1">
                  Detail <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            <AttendanceChart data={attendanceData} height={200} />
          </Card>
        </div>

        {/* Recent Exam Results */}
        <Card>
          <CardHeader 
            title="Hasil Ujian Terbaru" 
            action={
              <Link href="/nilai" className="text-teal-600 text-sm hover:underline flex items-center gap-1">
                Lihat Semua <ChevronRight className="w-4 h-4" />
              </Link>
            }
          />
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>Belum ada hasil ujian</p>
            <Link href="/ujian" className="text-teal-600 hover:underline text-sm mt-2 inline-block">
              Buat Ujian Pertama
            </Link>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
