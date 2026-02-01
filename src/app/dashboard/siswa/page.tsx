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
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface ScheduleItem {
  id: number;
  subject: string;
  room: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
}

interface UpcomingExam {
  id: number;
  title: string;
  subject: string;
  start_time: string;
  duration_minutes: number;
}

interface DashboardStats {
  attendance_percentage: number;
  upcoming_exams_count: number;
  completed_exams_count: number;
}

export default function SiswaDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    attendance_percentage: 0,
    upcoming_exams_count: 0,
    completed_exams_count: 0,
  });

  const [attendanceData, setAttendanceData] = useState([
    { day: 'Sen', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Sel', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Rab', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Kam', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
    { day: 'Jum', hadir: 0, izin: 0, sakit: 0, alpha: 0 },
  ]);

  const [todaySchedule, setTodaySchedule] = useState<ScheduleItem[]>([]);
  const [upcomingExam, setUpcomingExam] = useState<UpcomingExam | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch dashboard data from APIs
      const [scheduleRes, examsRes, attendanceRes] = await Promise.all([
        api.get('/my-schedule').catch(() => ({ data: { data: {} } })),
        api.get('/exams').catch(() => ({ data: { data: [] } })),
        api.get('/my-attendance-stats').catch(() => ({ data: { data: null } })),
      ]);

      // Process schedule - get today's schedule
      const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, ...
      const dayOfWeek = today === 0 ? 1 : today; // If Sunday, default to Monday
      const scheduleData = scheduleRes.data?.data || {};
      const todaySchedules = scheduleData[dayOfWeek] || [];
      setTodaySchedule(todaySchedules.slice(0, 5)); // Show max 5 items

      // Process exams
      const examsRaw = examsRes.data?.data;
      const examsData = Array.isArray(examsRaw) ? examsRaw : (examsRaw?.data || []);
      
      // Count upcoming and completed exams
      const now = new Date();
      const upcoming = examsData.filter((e: { start_time: string; my_result?: unknown }) => 
        new Date(e.start_time) > now && !e.my_result
      );
      const completed = examsData.filter((e: { my_result?: { status?: string } }) => 
        e.my_result?.status === 'completed'
      );

      // Get nearest upcoming exam
      if (upcoming.length > 0) {
        const nearest = upcoming.sort((a: { start_time: string }, b: { start_time: string }) => 
          new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        )[0];
        setUpcomingExam({
          id: nearest.id,
          title: nearest.title,
          subject: nearest.subject,
          start_time: nearest.start_time,
          duration_minutes: nearest.duration_minutes,
        });
      }

      // Process attendance stats
      const attendanceStats = attendanceRes.data?.data;
      if (attendanceStats) {
        setStats({
          attendance_percentage: attendanceStats.percentage || 0,
          upcoming_exams_count: upcoming.length,
          completed_exams_count: completed.length,
        });

        // Set weekly attendance data if available
        if (attendanceStats.weekly) {
          setAttendanceData(attendanceStats.weekly);
        }
      } else {
        // Fallback stats from exams data
        setStats({
          attendance_percentage: 0,
          upcoming_exams_count: upcoming.length,
          completed_exams_count: completed.length,
        });
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    return time.substring(0, 5); // "08:00:00" -> "08:00"
  };

  const formatExamDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const formatExamTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('id-ID', { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Halo, {user?.name?.split(' ')[0]}!</h1>
          <p className="text-gray-600">Kelas {user?.class?.name || '-'} • Tahun Ajaran 2025/2026</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <QuickActionCard
            icon={<QrCode className="w-8 h-8" />}
            title="Scan QR Absensi"
            href="/scan-qr"
            color="blue"
          />
          <QuickActionCard
            icon={<FileText className="w-8 h-8" />}
            title="Ujian Saya"
            href="/ujian-siswa"
            color="blue"
          />
          <QuickActionCard
            icon={<BookOpen className="w-8 h-8" />}
            title="Materi"
            href="/materi-siswa"
            color="blue"
          />
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard
            value={stats.attendance_percentage > 0 ? `${stats.attendance_percentage}%` : '-'}
            label="Kehadiran"
            color="green"
          />
          <StatCard
            value={stats.upcoming_exams_count}
            label="Ujian Mendatang"
            color="blue"
          />
          <StatCard
            value={stats.completed_exams_count}
            label="Ujian Selesai"
            color="teal"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Today's Schedule */}
          <Card>
            <CardHeader 
              title="Jadwal Hari Ini" 
              action={
                <Link href="/jadwal" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
                  Lihat Semua <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            {todaySchedule.length > 0 ? (
              <div className="space-y-3">
                {todaySchedule.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.subject}</p>
                      <p className="text-sm text-gray-500">{item.room || '-'}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500">
                      {formatTime(item.start_time)} - {formatTime(item.end_time)}
                    </span>
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

          {/* Upcoming Exam */}
          <Card>
            <CardHeader 
              title="Ujian Mendatang" 
              action={
                <Link href="/ujian-siswa" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
                  Lihat Semua <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            {upcomingExam ? (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{upcomingExam.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatExamDate(upcomingExam.start_time)}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-gray-500">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {formatExamTime(upcomingExam.start_time)}
                      </span>
                      <span className="text-gray-500">
                        {upcomingExam.duration_minutes} menit
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-300" />
                <p>Tidak ada ujian mendatang</p>
              </div>
            )}
          </Card>
        </div>

        {/* Attendance Chart */}
        <Card>
          <CardHeader 
            title="Statistik Kehadiran Minggu Ini" 
            action={
              <Link href="/riwayat-absensi" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
                Lihat Riwayat <ChevronRight className="w-4 h-4" />
              </Link>
            }
          />
          <AttendanceChart data={attendanceData} height={250} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
