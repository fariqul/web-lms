'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, DashboardSkeleton } from '@/components/ui';
import {
  QrCode,
  FileText,
  BookOpen,
  Clock,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle,
  ClipboardList,
  Bell,
  Megaphone,
  Calendar,
  User,
  GraduationCap,
  TrendingUp,
  ArrowRight,
  BarChart3,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api, { assignmentAPI, announcementAPI } from '@/services/api';
import { getTimeGreeting, getConditionTextColor, getConditionHex } from '@/lib/dashboard-utils';

interface ScheduleItem {
  id: number;
  subject: string;
  room: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
}

interface ExamResult {
  id: number;
  title: string;
  subject: string;
  completed_at?: string;
}

interface DashboardStats {
  attendance_percentage: number;
  upcoming_exams_count: number;
  completed_exams_count: number;
  pending_assignments_count: number;
  total_present: number;  // hadir
  total_late: number;     // izin
  total_sick: number;     // sakit
  total_absent: number;   // alpha
}

interface PendingAssignment {
  id: number;
  title: string;
  subject: string;
  deadline: string;
  teacher?: { name: string };
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  created_at: string;
  author?: { name: string; role: string };
}

interface UpcomingEvent {
  id: number;
  title: string;
  description?: string;
  date: string;
  time: string;
  type: 'exam' | 'assignment' | 'event';
}

export default function SiswaDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    attendance_percentage: 0,
    upcoming_exams_count: 0,
    completed_exams_count: 0,
    pending_assignments_count: 0,
    total_present: 0,
    total_late: 0,
    total_sick: 0,
    total_absent: 0,
  });

  const [todaySchedule, setTodaySchedule] = useState<ScheduleItem[]>([]);
  const [examResults, setExamResults] = useState<ExamResult[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<PendingAssignment[]>([]);
  const [newAssignmentsCount, setNewAssignmentsCount] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncementsCount, setNewAnnouncementsCount] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [scheduleRes, examsRes, attendanceRes, pendingRes, newCountRes, announcementsRes, announcementsCountRes] = await Promise.all([
        api.get('/my-schedule').catch(() => ({ data: { data: {} } })),
        api.get('/exams').catch(() => ({ data: { data: [] } })),
        api.get('/my-attendance-stats').catch(() => ({ data: { data: null } })),
        assignmentAPI.getPending().catch(() => ({ data: { data: [] } })),
        assignmentAPI.getNewCount().catch(() => ({ data: { data: { count: 0 } } })),
        announcementAPI.getLatest(5).catch(() => ({ data: { data: [] } })),
        announcementAPI.getUnreadCount().catch(() => ({ data: { data: { count: 0 } } })),
      ]);

      // Process announcements
      setAnnouncements(announcementsRes.data?.data || []);
      setNewAnnouncementsCount(announcementsCountRes.data?.data?.count || 0);

      // Process pending assignments
      const pendingData = pendingRes.data?.data || [];
      setPendingAssignments(pendingData.slice(0, 5));
      setNewAssignmentsCount(newCountRes.data?.data?.count || 0);

      // Process schedule - get today's schedule
      const today = new Date().getDay();
      const dayOfWeek = today === 0 ? 1 : today;
      const scheduleData = scheduleRes.data?.data || {};
      const todaySchedules = scheduleData[dayOfWeek] || [];
      setTodaySchedule(todaySchedules.slice(0, 6));

      // Process exams
      const examsRaw = examsRes.data?.data;
      const examsData = Array.isArray(examsRaw) ? examsRaw : (examsRaw?.data || []);

      const now = new Date();
      const upcoming = examsData.filter((e: { start_time: string; my_result?: unknown }) =>
        new Date(e.start_time) > now && !e.my_result
      );
      const completed = examsData.filter((e: { my_result?: { status?: string; score?: number }; title: string; subject: string; max_score: number }) =>
        e.my_result && ['completed', 'graded', 'submitted'].includes(e.my_result?.status || '')
      );

      // Set exam results
      const results: ExamResult[] = completed.slice(0, 6).map((e: { id: number; title: string; subject: string; my_result?: { completed_at?: string } }) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        completed_at: e.my_result?.completed_at,
      }));
      setExamResults(results);

      // Build upcoming events from exams and assignments
      const events: UpcomingEvent[] = [];

      upcoming.slice(0, 3).forEach((e: { id: number; title: string; subject: string; start_time: string }) => {
        events.push({
          id: e.id,
          title: e.title,
          description: e.subject,
          date: e.start_time,
          time: formatEventTime(e.start_time),
          type: 'exam',
        });
      });

      pendingData.slice(0, 3).forEach((a: { id: number; title: string; subject: string; deadline: string }) => {
        events.push({
          id: a.id + 1000,
          title: a.title,
          description: `Deadline: ${a.subject}`,
          date: a.deadline,
          time: formatEventTime(a.deadline),
          type: 'assignment',
        });
      });

      setUpcomingEvents(events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 4));

      // Process attendance stats
      const attendanceStats = attendanceRes.data?.data;
      if (attendanceStats) {
        setStats({
          attendance_percentage: attendanceStats.percentage || 0,
          upcoming_exams_count: upcoming.length,
          completed_exams_count: completed.length,
          pending_assignments_count: pendingData.length,
          total_present: attendanceStats.hadir || 0,
          total_late: attendanceStats.izin || 0,
          total_sick: attendanceStats.sakit || 0,
          total_absent: attendanceStats.alpha || 0,
        });
      } else {
        setStats({
          attendance_percentage: 0,
          upcoming_exams_count: upcoming.length,
          completed_exams_count: completed.length,
          pending_assignments_count: pendingData.length,
          total_present: 0,
          total_late: 0,
          total_sick: 0,
          total_absent: 0,
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
    return time.substring(0, 5);
  };

  const formatEventTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const formatAnnouncementDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getScheduleStatus = (startTime: string, endTime: string) => {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;

    if (currentTime > end) return 'completed';
    if (currentTime >= start && currentTime <= end) return 'inprogress';
    return 'upcoming';
  };

  // Calendar functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const days: (number | null)[] = [];

    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() &&
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear();
  };

  const hasEvent = (day: number) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return upcomingEvents.some(e => e.date.startsWith(dateStr));
  };

  if (loading) {
    return (
      <DashboardLayout>
        <DashboardSkeleton />
      </DashboardLayout>
    );
  }

  const totalAttendance = stats.total_present + stats.total_late + stats.total_sick + stats.total_absent;
  const attendancePct = stats.attendance_percentage;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[1280px] mx-auto stagger-children">

        {/* ── Welcome Header ─────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-500 dark:from-sky-800 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-800/20 hero-radial">
          {/* Decorative circles */}
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/10 overflow-hidden ring-2 ring-white/30">
                {user?.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photo} alt={user.name || ''} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-blue-200/70 mb-0.5">{getTimeGreeting().emoji} {getTimeGreeting().greeting}</p>
                <h1 className="text-lg font-bold text-white truncate">
                  Halo, {user?.name?.split(' ')[0]}!
                </h1>
                <p className="text-sm text-blue-100/80">
                  {user?.class?.name || 'Siswa'} &middot; NISN {user?.nisn || '-'}
                </p>
              </div>
            </div>
            {/* Inline notification badges */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {newAssignmentsCount > 0 && (
                <Link href="/tugas-siswa" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white border border-white/20 rounded-full text-xs font-medium hover:bg-white/30 transition-colors">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {newAssignmentsCount} tugas baru
                </Link>
              )}
              {newAnnouncementsCount > 0 && (
                <Link href="/pengumuman" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur-sm text-white border border-white/20 rounded-full text-xs font-medium hover:bg-white/30 transition-colors">
                  <Bell className="w-3.5 h-3.5" />
                  {newAnnouncementsCount} pengumuman
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Quick Actions ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 stagger-children">
          {[
            { href: '/scan-qr', icon: QrCode, label: 'Scan QR', sub: 'Absensi', color: 'from-cyan-500 to-cyan-600' },
            { href: '/ujian-siswa', icon: FileText, label: 'Ujian', sub: `${stats.upcoming_exams_count} tersedia`, color: 'from-violet-500 to-violet-600' },
            { href: '/tugas-siswa', icon: ClipboardList, label: 'Tugas', sub: `${stats.pending_assignments_count} pending`, color: 'from-orange-400 to-orange-500', badge: stats.pending_assignments_count },
            { href: '/materi-siswa', icon: BookOpen, label: 'Materi', sub: 'Belajar', color: 'from-sky-500 to-sky-600' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group relative flex items-center gap-3 p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-[var(--shadow-card)] hover:shadow-md hover:border-slate-200 dark:hover:border-slate-600 hover:-translate-y-1 transition-all duration-200 cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{action.label}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">{action.sub}</p>
              </div>
              {action.badge ? (
                <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {action.badge}
                </span>
              ) : null}
            </Link>
          ))}
        </div>

        {/* ── Stats Strip ────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-[var(--shadow-card)] card-hover">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide">Kehadiran</p>
              <p className={`text-lg font-bold tabular-nums ${attendancePct > 0 ? getConditionTextColor(attendancePct) : 'text-slate-900 dark:text-white'}`}>{attendancePct > 0 ? `${attendancePct}%` : '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-[var(--shadow-card)] card-hover">
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/50 flex items-center justify-center">
              <GraduationCap className="w-4.5 h-4.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide">Ujian Selesai</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{stats.completed_exams_count}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-[var(--shadow-card)] card-hover">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-blue-800 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide">Jadwal Hari Ini</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{todaySchedule.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-[var(--shadow-card)] card-hover">
            <div className="w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/50 flex items-center justify-center">
              <ClipboardList className="w-4.5 h-4.5 text-orange-500 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium uppercase tracking-wide">Tugas Pending</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">{stats.pending_assignments_count}</p>
            </div>
          </div>
        </div>

        {/* ── Main Content Grid ──────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

          {/* ── Left: Attendance + Exams + Assignments (3 cols) */}
          <div className="lg:col-span-3 space-y-6">

            {/* Attendance */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Statistik Kehadiran</h3>
                </div>
                <Link href="/riwayat-absensi" className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1">
                  Detail <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="px-5 pb-5">
                <div className="flex items-center gap-6">
                  {/* Donut Chart */}
                  <div className="relative w-28 h-28 flex-shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="#f1f5f9" strokeWidth="12" />
                      {totalAttendance > 0 && (
                        <>
                          {stats.total_present > 0 && (
                            <circle
                              cx="50" cy="50" r="40"
                              fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round"
                              strokeDasharray={`${(stats.total_present / totalAttendance) * 251.2} 251.2`}
                              strokeDashoffset="0"
                            />
                          )}
                          {stats.total_late > 0 && (
                            <circle
                              cx="50" cy="50" r="40"
                              fill="none" stroke="#FB923C" strokeWidth="12" strokeLinecap="round"
                              strokeDasharray={`${(stats.total_late / totalAttendance) * 251.2} 251.2`}
                              strokeDashoffset={`${-(stats.total_present / totalAttendance) * 251.2}`}
                            />
                          )}
                          {stats.total_sick > 0 && (
                            <circle
                              cx="50" cy="50" r="40"
                              fill="none" stroke="#0EA5E9" strokeWidth="12" strokeLinecap="round"
                              strokeDasharray={`${(stats.total_sick / totalAttendance) * 251.2} 251.2`}
                              strokeDashoffset={`${-((stats.total_present + stats.total_late) / totalAttendance) * 251.2}`}
                            />
                          )}
                          {stats.total_absent > 0 && (
                            <circle
                              cx="50" cy="50" r="40"
                              fill="none" stroke="#ef4444" strokeWidth="12" strokeLinecap="round"
                              strokeDasharray={`${(stats.total_absent / totalAttendance) * 251.2} 251.2`}
                              strokeDashoffset={`${-((stats.total_present + stats.total_late + stats.total_sick) / totalAttendance) * 251.2}`}
                            />
                          )}
                        </>
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-xl font-bold tabular-nums leading-none ${attendancePct > 0 ? getConditionTextColor(attendancePct) : 'text-slate-900 dark:text-white'}`}>
                        {attendancePct > 0 ? attendancePct : 0}
                      </span>
                      <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium">persen</span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
                    {[
                      { label: 'Hadir', value: stats.total_present, color: 'bg-emerald-500' },
                      { label: 'Izin', value: stats.total_late, color: 'bg-orange-400' },
                      { label: 'Sakit', value: stats.total_sick, color: 'bg-sky-500' },
                      { label: 'Alpha', value: stats.total_absent, color: 'bg-red-500' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.color}`} />
                        <span className="text-xs text-slate-600 dark:text-slate-400">{item.label}</span>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 ml-auto tabular-nums">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Exam Results */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Riwayat Ujian Terbaru</h3>
                </div>
                <Link href="/nilai-siswa" className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1">
                  Semua Riwayat <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {examResults.length > 0 ? (
                <div className="px-5 pb-4">
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {examResults.map((exam) => {
                      return (
                        <div key={exam.id} className="flex items-center gap-3 py-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-50 dark:bg-green-900/30">
                            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{exam.title}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">{exam.subject}</p>
                          </div>
                          <div className="flex-shrink-0">
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium rounded-full">
                              Selesai
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 px-5">
                  <GraduationCap className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Belum ada hasil ujian</p>
                </div>
              )}
            </Card>

            {/* Pending Assignments */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tugas Belum Dikerjakan</h3>
                  {pendingAssignments.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-bold rounded-md">
                      {pendingAssignments.length}
                    </span>
                  )}
                </div>
                <Link href="/tugas-siswa" className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1">
                  Semua <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {pendingAssignments.length > 0 ? (
                <div className="px-5 pb-4 space-y-2">
                  {pendingAssignments.map((assignment) => {
                    const deadline = new Date(assignment.deadline);
                    const now = new Date();
                    const diffMs = deadline.getTime() - now.getTime();
                    const isUrgent = diffMs < 24 * 60 * 60 * 1000 && diffMs > 0;
                    const isOverdue = diffMs <= 0;

                    return (
                      <div
                        key={assignment.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                          isOverdue ? 'bg-red-50/50 border-red-200' :
                          isUrgent ? 'bg-orange-50/50 border-orange-200' :
                          'bg-slate-50/50 border-slate-100 dark:border-slate-700 hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isOverdue ? 'bg-red-100' : isUrgent ? 'bg-amber-100' : 'bg-slate-100'
                        }`}>
                          <ClipboardList className={`w-4 h-4 ${
                            isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-500' : 'text-slate-600 dark:text-slate-400'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{assignment.title}</p>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400">{assignment.subject}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-[11px] font-semibold ${
                            isOverdue ? 'text-red-600' : isUrgent ? 'text-orange-500' : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            {isOverdue ? 'Terlambat' : deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-400">{formatEventTime(assignment.deadline)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 px-5">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-emerald-300 dark:text-emerald-700" />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Semua tugas selesai!</p>
                </div>
              )}
            </Card>
          </div>

          {/* ── Right Sidebar (2 cols) ───────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Today's Schedule */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Jadwal Hari Ini</h3>
                </div>
                <Link href="/jadwal" className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1">
                  Semua <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              {todaySchedule.length > 0 ? (
                <div className="px-5 pb-4 space-y-1.5">
                  {todaySchedule.map((item) => {
                    const status = getScheduleStatus(item.start_time, item.end_time);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                          status === 'inprogress' ? 'bg-sky-50 border border-sky-200' :
                          status === 'completed' ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="text-center flex-shrink-0 w-12">
                          <p className={`text-xs font-bold tabular-nums ${status === 'inprogress' ? 'text-sky-700' : 'text-slate-700 dark:text-slate-300'}`}>
                            {formatTime(item.start_time)}
                          </p>
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 tabular-nums">{formatTime(item.end_time)}</p>
                        </div>
                        <div className={`w-0.5 h-8 rounded-full flex-shrink-0 ${
                          status === 'inprogress' ? 'bg-sky-500' :
                          status === 'completed' ? 'bg-slate-200' : 'bg-slate-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${status === 'inprogress' ? 'text-sky-900' : 'text-slate-900 dark:text-white'}`}>
                            {item.subject}
                          </p>
                          {item.room && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-400">{item.room}</p>
                          )}
                        </div>
                        {status === 'inprogress' && (
                          <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse flex-shrink-0" />
                        )}
                        {status === 'completed' && (
                          <CheckCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 px-5">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Tidak ada jadwal hari ini</p>
                </div>
              )}
            </Card>

            {/* Calendar */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-2">
                <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Bulan sebelumnya">
                  <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </h3>
                <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Bulan berikutnya">
                  <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
              </div>
              <div className="px-4 pb-4">
                <div className="grid grid-cols-7 gap-0.5 text-center">
                  {['M', 'S', 'S', 'R', 'K', 'J', 'S'].map((day, i) => (
                    <div key={i} className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 py-1.5">{day}</div>
                  ))}
                  {getDaysInMonth(currentMonth).map((day, index) => (
                    <div key={index} className="aspect-square flex items-center justify-center">
                      {day && (
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs relative transition-colors ${
                          isToday(day) ? 'bg-blue-800 text-white font-bold shadow-sm' :
                          hasEvent(day) ? 'bg-orange-50 text-orange-600 font-semibold' :
                          'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}>
                          {day}
                          {hasEvent(day) && !isToday(day) && (
                            <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-400" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Upcoming Events */}
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Mendatang</h3>
                </div>
              </div>
              {upcomingEvents.length > 0 ? (
                <div className="px-5 pb-4 space-y-2">
                  {upcomingEvents.map((event) => (
                    <Link
                      key={event.id}
                      href={event.type === 'exam' ? '/ujian-siswa' : '/tugas-siswa'}
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
                    >
                      <div className={`w-1 h-full min-h-[40px] rounded-full flex-shrink-0 ${
                        event.type === 'exam' ? 'bg-violet-400' : 'bg-amber-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-sky-600 transition-colors">{event.title}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          {new Date(event.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} &middot; {event.time}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-sky-500 mt-1 transition-colors flex-shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 px-5">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs text-slate-600 dark:text-slate-400">Tidak ada acara mendatang</p>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ── Announcements ──────────────────────────────── */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Pengumuman</h3>
              {newAnnouncementsCount > 0 && (
                <span className="px-1.5 py-0.5 bg-sky-100 text-sky-600 text-[10px] font-bold rounded-md">
                  {newAnnouncementsCount} baru
                </span>
              )}
            </div>
            <Link href="/pengumuman" className="text-xs text-sky-500 hover:text-sky-600 font-medium flex items-center gap-1">
              Semua <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {announcements.length > 0 ? (
            <div className="px-5 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {announcements.slice(0, 6).map((announcement) => (
                  <Link
                    key={announcement.id}
                    href="/pengumuman"
                    className="flex gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:border-slate-200 hover:bg-slate-50/50 transition-all group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      announcement.priority === 'urgent' ? 'bg-red-100' :
                      announcement.priority === 'important' ? 'bg-amber-100' : 'bg-slate-100'
                    }`}>
                      <Megaphone className={`w-4 h-4 ${
                        announcement.priority === 'urgent' ? 'text-red-600' :
                        announcement.priority === 'important' ? 'text-orange-500' : 'text-slate-600 dark:text-slate-400'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-sky-600 transition-colors">{announcement.title}</p>
                        {announcement.priority === 'urgent' && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded flex-shrink-0">!</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1 mt-0.5">{announcement.content}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">{formatAnnouncementDate(announcement.created_at)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-5">
              <Megaphone className="w-10 h-10 mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-600 dark:text-slate-400">Belum ada pengumuman</p>
            </div>
          )}
        </Card>

      </div>
    </DashboardLayout>
  );
}
