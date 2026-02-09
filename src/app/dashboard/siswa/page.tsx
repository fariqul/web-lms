'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card } from '@/components/ui';
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
  Edit,
  GraduationCap,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api, { assignmentAPI, announcementAPI } from '@/services/api';

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
  score?: number;
  max_score: number;
  status: string;
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
      const results: ExamResult[] = completed.slice(0, 6).map((e: { id: number; title: string; subject: string; max_score: number; my_result?: { score?: number; percentage?: number; total_score?: number; completed_at?: string } }) => ({
        id: e.id,
        title: e.title,
        subject: e.subject,
        score: e.my_result?.percentage ?? e.my_result?.score ?? e.my_result?.total_score,
        max_score: e.max_score || 100,
        status: (e.my_result?.percentage ?? e.my_result?.score ?? 0) >= 70 ? 'Pass' : 'Fail',
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

  const getGrade = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
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
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </DashboardLayout>
    );
  }

  const totalAttendance = stats.total_present + stats.total_late + stats.total_sick + stats.total_absent;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Notification Banners */}
        {(newAssignmentsCount > 0 || newAnnouncementsCount > 0) && (
          <div className="space-y-3">
            {newAssignmentsCount > 0 && (
              <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Bell className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-orange-900">Ada {newAssignmentsCount} tugas baru!</p>
                    <p className="text-sm text-orange-700">Segera kerjakan sebelum deadline</p>
                  </div>
                  <Link href="/tugas-siswa" className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
                    Lihat Tugas
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main Grid Layout */}
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Left Column - Profile Card */}
          <div className="col-span-12 lg:col-span-3 lg:sticky lg:top-6">
            <Card className="p-6 text-center bg-gradient-to-b from-blue-600 to-blue-700">
              <div className="w-20 h-20 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-4 overflow-hidden">
                {user?.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photo} alt={user.name || ''} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-white" />
                )}
              </div>
              <h3 className="text-white font-semibold text-lg">{user?.name}</h3>
              <p className="text-blue-200 text-sm">Kelas: {user?.class?.name || '-'}</p>
              <p className="text-blue-200 text-sm">NISN: {user?.nisn || '-'}</p>
              <Link href="/akun" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors">
                <Edit className="w-4 h-4" />
                Edit Profil
              </Link>
            </Card>

            {/* Mini Stats */}
            <div className="mt-4 space-y-3">
              <Card className="p-4 border-l-4 border-l-purple-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Jadwal Hari Ini</p>
                    <p className="text-xl font-bold text-gray-900">{todaySchedule.length}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-blue-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Bell className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Notifikasi</p>
                    <p className="text-xl font-bold text-gray-900">{newAssignmentsCount + newAnnouncementsCount}</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4 border-l-4 border-l-green-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Kehadiran</p>
                    <p className="text-xl font-bold text-gray-900">
                      {stats.attendance_percentage > 0 ? `${stats.attendance_percentage}%` : '-'}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Middle Column - Attendance & Exam Results */}
          <div className="col-span-12 lg:col-span-5 space-y-6 flex flex-col">
            {/* Attendance Donut Chart */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Statistik Kehadiran</h3>
                <select className="text-sm border rounded-lg px-3 py-1.5 text-gray-600">
                  <option>Semester Ini</option>
                </select>
              </div>

              <div className="flex items-center justify-center gap-8">
                {/* Donut Chart */}
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    {/* Background circle */}
                    <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="20" />

                    {totalAttendance > 0 && (
                      <>
                        {/* Present - Green */}
                        {stats.total_present > 0 && (
                          <circle
                            cx="50" cy="50" r="40"
                            fill="none" stroke="#22c55e" strokeWidth="20"
                            strokeDasharray={`${(stats.total_present / totalAttendance) * 251.2} 251.2`}
                            strokeDashoffset="0"
                            transform="rotate(-90 50 50)"
                          />
                        )}
                        {/* Izin - Yellow */}
                        {stats.total_late > 0 && (
                          <circle
                            cx="50" cy="50" r="40"
                            fill="none" stroke="#eab308" strokeWidth="20"
                            strokeDasharray={`${(stats.total_late / totalAttendance) * 251.2} 251.2`}
                            strokeDashoffset={`${-(stats.total_present / totalAttendance) * 251.2}`}
                            transform="rotate(-90 50 50)"
                          />
                        )}
                        {/* Sick - Blue */}
                        {stats.total_sick > 0 && (
                          <circle
                            cx="50" cy="50" r="40"
                            fill="none" stroke="#3b82f6" strokeWidth="20"
                            strokeDasharray={`${(stats.total_sick / totalAttendance) * 251.2} 251.2`}
                            strokeDashoffset={`${-((stats.total_present + stats.total_late) / totalAttendance) * 251.2}`}
                            transform="rotate(-90 50 50)"
                          />
                        )}
                        {/* Absent - Orange */}
                        {stats.total_absent > 0 && (
                          <circle
                            cx="50" cy="50" r="40"
                            fill="none" stroke="#f97316" strokeWidth="20"
                            strokeDasharray={`${(stats.total_absent / totalAttendance) * 251.2} 251.2`}
                            strokeDashoffset={`${-((stats.total_present + stats.total_late + stats.total_sick) / totalAttendance) * 251.2}`}
                            transform="rotate(-90 50 50)"
                          />
                        )}
                      </>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">
                      {stats.attendance_percentage > 0 ? `${stats.attendance_percentage}%` : '0%'}
                    </span>
                  </div>
                </div>

                {/* Legend */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-green-500" />
                    <span className="text-sm text-gray-600">Hadir</span>
                    <span className="text-sm font-semibold text-gray-900 ml-auto">{stats.total_present}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-yellow-500" />
                    <span className="text-sm text-gray-600">Izin</span>
                    <span className="text-sm font-semibold text-gray-900 ml-auto">{stats.total_late}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-blue-500" />
                    <span className="text-sm text-gray-600">Sakit</span>
                    <span className="text-sm font-semibold text-gray-900 ml-auto">{stats.total_sick}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-orange-500" />
                    <span className="text-sm text-gray-600">Alpha</span>
                    <span className="text-sm font-semibold text-gray-900 ml-auto">{stats.total_absent}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Exam Results Table */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Hasil Ujian</h3>
                <Link href="/nilai-siswa" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
                  Lihat Semua <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {examResults.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Ujian</th>
                        <th className="text-left py-3 px-2 font-medium text-gray-500">Mapel</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-500">Nilai</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-500">Grade</th>
                        <th className="text-center py-3 px-2 font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {examResults.map((exam) => (
                        <tr key={exam.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-2 font-medium text-gray-900">{exam.title}</td>
                          <td className="py-3 px-2 text-gray-600">{exam.subject}</td>
                          <td className="py-3 px-2 text-center">
                            <span className="font-semibold">{exam.score ?? '-'}</span>
                            <span className="text-gray-400">/{exam.max_score}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`font-semibold ${exam.score ? (getGrade(exam.score, exam.max_score) === 'A' ? 'text-green-600' :
                              getGrade(exam.score, exam.max_score) === 'F' ? 'text-red-600' : 'text-blue-600') : 'text-gray-400'
                              }`}>
                              {exam.score ? getGrade(exam.score, exam.max_score) : '-'}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${exam.status === 'Pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                              {exam.status === 'Pass' ? 'Lulus' : 'Tidak Lulus'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <GraduationCap className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Belum ada hasil ujian</p>
                </div>
              )}
            </Card>

            {/* Pending Assignments */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Tugas Belum Dikerjakan</h3>
                <Link href="/tugas-siswa" className="text-blue-600 text-sm hover:underline flex items-center gap-1">
                  Lihat Semua <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {pendingAssignments.length > 0 ? (
                <div className="space-y-3">
                  {pendingAssignments.map((assignment) => {
                    const deadline = new Date(assignment.deadline);
                    const now = new Date();
                    const isUrgent = deadline.getTime() - now.getTime() < 24 * 60 * 60 * 1000;

                    return (
                      <div key={assignment.id} className={`flex items-center gap-3 p-3 rounded-lg border ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                        }`}>
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isUrgent ? 'bg-red-100' : 'bg-orange-100'
                          }`}>
                          <ClipboardList className={`w-5 h-5 ${isUrgent ? 'text-red-600' : 'text-orange-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{assignment.title}</p>
                          <p className="text-sm text-gray-500">{assignment.subject} • {assignment.teacher?.name}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-medium ${isUrgent ? 'text-red-600' : 'text-orange-600'}`}>
                            {deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-xs text-gray-400">{formatEventTime(assignment.deadline)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-300" />
                  <p className="text-sm">Semua tugas sudah dikerjakan!</p>
                </div>
              )}
            </Card>

            {/* Quick Actions - Moved inside middle column */}
            <div className="grid grid-cols-4 gap-3 mt-auto">
              <Link href="/scan-qr" className="p-4 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl text-white hover:from-blue-600 hover:to-blue-700 transition-all">
                <QrCode className="w-7 h-7 mb-2" />
                <p className="font-medium text-sm">Scan QR</p>
              </Link>
              <Link href="/ujian-siswa" className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl text-white hover:from-purple-600 hover:to-purple-700 transition-all">
                <FileText className="w-7 h-7 mb-2" />
                <p className="font-medium text-sm">Ujian</p>
              </Link>
              <Link href="/tugas-siswa" className="p-4 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl text-white hover:from-orange-600 hover:to-orange-700 transition-all relative">
                <ClipboardList className="w-7 h-7 mb-2" />
                <p className="font-medium text-sm">Tugas</p>
                {stats.pending_assignments_count > 0 && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
                    {stats.pending_assignments_count}
                  </span>
                )}
              </Link>
              <Link href="/materi-siswa" className="p-4 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl text-white hover:from-teal-600 hover:to-teal-700 transition-all">
                <BookOpen className="w-7 h-7 mb-2" />
                <p className="font-medium text-sm">Materi</p>
              </Link>
            </div>
          </div>

          {/* Right Column - Today's Class, Calendar, Events, Notice Board */}
          <div className="col-span-12 lg:col-span-4 space-y-6 flex flex-col">
            {/* Today's Class */}
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Jadwal Hari Ini</h3>
              {todaySchedule.length > 0 ? (
                <div className="space-y-3">
                  {todaySchedule.map((item) => {
                    const status = getScheduleStatus(item.start_time, item.end_time);
                    return (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-900">{item.subject}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(item.start_time)} - {formatTime(item.end_time)}
                          </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${status === 'completed' ? 'bg-green-100 text-green-700' :
                          status === 'inprogress' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                          {status === 'completed' ? 'Selesai' :
                            status === 'inprogress' ? 'Berlangsung' : 'Mendatang'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Tidak ada jadwal hari ini</p>
                </div>
              )}
            </Card>

            {/* Calendar */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <h3 className="font-semibold text-gray-900">
                  {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </h3>
                <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((day) => (
                  <div key={day} className="text-xs font-medium text-gray-500 py-2">{day}</div>
                ))}
                {getDaysInMonth(currentMonth).map((day, index) => (
                  <div key={index} className="aspect-square flex items-center justify-center">
                    {day && (
                      <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm relative ${isToday(day) ? 'bg-blue-600 text-white font-semibold' :
                        hasEvent(day) ? 'bg-orange-100 text-orange-700 font-medium' :
                          'text-gray-700 hover:bg-gray-100'
                        }`}>
                        {day}
                        {hasEvent(day) && !isToday(day) && (
                          <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-orange-500" />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Upcoming Events */}
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Acara Mendatang</h3>
              {upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {upcomingEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-1 h-full min-h-[50px] rounded-full ${event.type === 'exam' ? 'bg-blue-500' : 'bg-orange-500'
                        }`} />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-gray-500">{event.time}</p>
                        <p className="font-medium text-gray-900 mt-1">{event.title}</p>
                        {event.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
                        )}
                      </div>
                      <Link href={event.type === 'exam' ? '/ujian-siswa' : '/tugas-siswa'} className="text-blue-600 text-xs hover:underline">
                        Lihat
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-gray-500">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Tidak ada acara mendatang</p>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Pengumuman - Full Width */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Pengumuman</h3>
            <Link href="/pengumuman" className="text-blue-600 text-xs hover:underline">
              Lihat Semua
            </Link>
          </div>
          {announcements.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {announcements.slice(0, 8).map((announcement) => (
                <Link
                  key={announcement.id}
                  href="/pengumuman"
                  className="flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${announcement.priority === 'urgent' ? 'bg-red-100' :
                    announcement.priority === 'important' ? 'bg-orange-100' : 'bg-blue-100'
                    }`}>
                    <Megaphone className={`w-5 h-5 ${announcement.priority === 'urgent' ? 'text-red-600' :
                      announcement.priority === 'important' ? 'text-orange-600' : 'text-blue-600'
                      }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{announcement.author?.name || 'Admin'}</p>
                      {announcement.priority === 'urgent' && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Mendesak</span>
                      )}
                      {announcement.priority === 'important' && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">Penting</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1 font-medium">{announcement.title}</p>
                    <p className="text-xs text-gray-600 line-clamp-2 mt-1">{announcement.content}</p>
                    <p className="text-xs text-gray-400 mt-2">{formatAnnouncementDate(announcement.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Megaphone className="w-16 h-16 mb-3 text-gray-200" />
              <p className="font-medium text-sm">Belum ada pengumuman</p>
              <p className="text-xs text-gray-400 mt-1">Pengumuman dari sekolah akan muncul di sini</p>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
