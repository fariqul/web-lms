'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, StatCard, QuickActionCard, AttendanceChart, DashboardSkeleton } from '@/components/ui';
import {
  QrCode,
  FileText,
  BookOpen,
  Clock,
  ChevronRight,
  AlertCircle,
  Loader2,
  Megaphone,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api, { announcementAPI } from '@/services/api';
import { getTimeGreeting } from '@/lib/dashboard-utils';

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

interface Announcement {
  id: number;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  created_at: string;
  author?: { name: string; role: string };
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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncementsCount, setNewAnnouncementsCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all data in parallel
      const [examsRes, scheduleRes, sessionsRes, attendanceRes, announcementsRes, announcementsCountRes] = await Promise.all([
        api.get('/exams').catch(() => ({ data: { data: [] } })),
        api.get('/teacher-schedule').catch(() => ({ data: { data: {} } })),
        api.get('/attendance-sessions', { params: { status: 'active' } }).catch(() => ({ data: { data: { data: [] } } })),
        api.get('/teacher-attendance-stats').catch(() => ({ data: { data: null } })),
        announcementAPI.getLatest(3).catch(() => ({ data: { data: [] } })),
        announcementAPI.getUnreadCount().catch(() => ({ data: { data: { count: 0 } } })),
      ]);

      // Process announcements
      setAnnouncements(announcementsRes.data?.data || []);
      setNewAnnouncementsCount(announcementsCountRes.data?.data?.count || 0);

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

  const formatAnnouncementDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes} menit lalu`;
    }
    if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours} jam lalu`;
    }
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days} hari lalu`;
    }
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'important': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-sky-50 text-sky-700 border-sky-200';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'Mendesak';
      case 'important': return 'Penting';
      default: return 'Umum';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 stagger-children">
        {/* Welcome */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20 hero-radial">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <p className="text-sm text-blue-200/70 mb-1">{getTimeGreeting().emoji} {getTimeGreeting().greeting}</p>
            <h1 className="text-2xl font-bold text-white">Halo, {user?.name?.split(' ')[0]}!</h1>
            <p className="text-blue-100/80">Kelola absensi dan ujian Anda di sini</p>
          </div>
        </div>

        {/* Notification Banner for Announcements */}
        {newAnnouncementsCount > 0 && (
          <div className="p-4 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30 border border-sky-200 dark:border-sky-800 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-800 rounded-lg flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sky-900">
                  Ada {newAnnouncementsCount} pengumuman baru minggu ini!
                </p>
                <p className="text-sm text-sky-700">Jangan lewatkan informasi penting</p>
              </div>
              <Link
                href="/pengumuman"
                className="px-4 py-2 bg-cyan-500 text-white rounded-lg text-sm font-medium hover:bg-blue-900 transition-colors cursor-pointer"
              >
                Lihat Semua
              </Link>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <Link href="/jadwal" className="text-sky-500 dark:text-sky-400 text-sm font-medium hover:text-sky-600 dark:hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer">
                  Lihat Semua <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            {schedule.length > 0 ? (
              <div className="space-y-3">
                {schedule.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/50 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-sky-500 dark:text-sky-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{item.subject}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{item.class_room?.name || '-'}</p>
                    </div>
                    <span className="text-sm font-medium text-sky-500">{formatTime(item.start_time)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-slate-600 dark:text-slate-400">Tidak ada jadwal hari ini</p>
              </div>
            )}
          </Card>

          {/* Attendance Chart */}
          <Card>
            <CardHeader 
              title="Statistik Kehadiran Minggu Ini" 
              action={
                <Link href="/nilai" className="text-sky-500 dark:text-sky-400 text-sm font-medium hover:text-sky-600 dark:hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer">
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
              <Link href="/nilai" className="text-sky-500 dark:text-sky-400 text-sm font-medium hover:text-sky-600 dark:hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer">
                Lihat Semua <ChevronRight className="w-4 h-4" />
              </Link>
            }
          />
          <div className="text-center py-8 text-slate-600 dark:text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-slate-600 dark:text-slate-400">Belum ada hasil ujian</p>
            <Link href="/ujian" className="text-sky-500 hover:underline text-sm mt-2 inline-block">
              Buat Ujian Pertama
            </Link>
          </div>
        </Card>

        {/* Latest Announcements */}
        <Card>
          <CardHeader 
            title="Pengumuman Terbaru" 
            action={
              <Link href="/pengumuman" className="text-sky-500 dark:text-sky-400 text-sm font-medium hover:text-sky-600 dark:hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer">
                Lihat Semua <ChevronRight className="w-4 h-4" />
              </Link>
            }
          />
          {announcements.length > 0 ? (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <Link
                  key={announcement.id}
                  href="/pengumuman"
                  className="block p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      announcement.priority === 'urgent' ? 'bg-red-100' :
                      announcement.priority === 'important' ? 'bg-orange-100' : 'bg-sky-100'
                    }`}>
                      <Megaphone className={`w-5 h-5 ${
                        announcement.priority === 'urgent' ? 'text-red-600' :
                        announcement.priority === 'important' ? 'text-orange-600' : 'text-sky-500'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-white truncate">{announcement.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(announcement.priority)}`}>
                          {getPriorityLabel(announcement.priority)}
                        </span>
                      </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-1 mt-1">{announcement.content}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {announcement.author?.name} • {formatAnnouncementDate(announcement.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-600 dark:text-slate-400">
              <Megaphone className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada pengumuman</p>
              <Link href="/pengumuman" className="text-sky-500 hover:underline text-sm mt-2 inline-block">
                Buat Pengumuman
              </Link>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
