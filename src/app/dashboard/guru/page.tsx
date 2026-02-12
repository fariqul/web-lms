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
  Megaphone,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api, { announcementAPI } from '@/services/api';

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
      default: return 'bg-teal-50 text-teal-700 border-teal-200';
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
          <h1 className="text-2xl font-bold text-slate-900">Selamat Datang, {user?.name?.split(' ')[0]}!</h1>
          <p className="text-slate-600">Kelola absensi dan ujian Anda di sini</p>
        </div>

        {/* Notification Banner for Announcements */}
        {newAnnouncementsCount > 0 && (
          <div className="p-4 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-teal-900">
                  Ada {newAnnouncementsCount} pengumuman baru minggu ini!
                </p>
                <p className="text-sm text-teal-700">Jangan lewatkan informasi penting</p>
              </div>
              <Link 
                href="/pengumuman"
                className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-medium hover:bg-teal-600 transition-colors"
              >
                Lihat Semua
              </Link>
            </div>
          </div>
        )}

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
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                      <Clock className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-900">{item.subject}</p>
                      <p className="text-sm text-slate-500">{item.class_room?.name || '-'}</p>
                    </div>
                    <span className="text-sm font-medium text-teal-600">{formatTime(item.start_time)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
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
          <div className="text-center py-8 text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
            <p>Belum ada hasil ujian</p>
            <Link href="/ujian" className="text-teal-600 hover:underline text-sm mt-2 inline-block">
              Buat Ujian Pertama
            </Link>
          </div>
        </Card>

        {/* Latest Announcements */}
        <Card>
          <CardHeader 
            title="Pengumuman Terbaru" 
            action={
              <Link href="/pengumuman" className="text-teal-600 text-sm hover:underline flex items-center gap-1">
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
                  className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      announcement.priority === 'urgent' ? 'bg-red-100' :
                      announcement.priority === 'important' ? 'bg-orange-100' : 'bg-teal-100'
                    }`}>
                      <Megaphone className={`w-5 h-5 ${
                        announcement.priority === 'urgent' ? 'text-red-600' :
                        announcement.priority === 'important' ? 'text-orange-600' : 'text-teal-600'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900 truncate">{announcement.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(announcement.priority)}`}>
                          {getPriorityLabel(announcement.priority)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 line-clamp-1 mt-1">{announcement.content}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {announcement.author?.name} • {formatAnnouncementDate(announcement.created_at)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Megaphone className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p>Belum ada pengumuman</p>
              <Link href="/pengumuman" className="text-teal-600 hover:underline text-sm mt-2 inline-block">
                Buat Pengumuman
              </Link>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
