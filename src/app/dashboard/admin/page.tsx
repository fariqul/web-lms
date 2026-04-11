'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, StatCard, QuickActionCard, MultiBarChart, DashboardSkeleton } from '@/components/ui';
import {
  Users,
  GraduationCap,
  Calendar,
  BarChart3,
  ChevronRight,
  FolderOpen,
  FileEdit,
  UserPlus,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import api from '@/services/api';
import { getTimeGreeting } from '@/lib/dashboard-utils';

interface Activity {
  type: string;
  message: string;
  time: string;
}

interface AttendanceChartData {
  name: string;
  hadir: number;
  izin: number;
  sakit: number;
  alpha: number;
  [key: string]: string | number;
}

interface TeacherClass {
  class_name: string;
  subject: string;
  time: string;
  status: 'mengajar' | 'belum' | 'tidak_mengajar';
  session_id: number | null;
}

interface TeacherRecap {
  teacher_id: number;
  teacher_name: string;
  total_scheduled: number;
  taught: number;
  missed: number;
  pending: number;
  status: 'good' | 'warning' | 'pending';
  classes: TeacherClass[];
}

interface TeacherDailyRecap {
  date: string;
  day_name: string;
  summary: {
    total_teachers_scheduled: number;
    teachers_teaching: number;
    teachers_with_missed: number;
  };
  teachers: TeacherRecap[];
}

interface RiskySession {
  exam_id: number;
  exam_title: string;
  exam_type: string;
  student_id: number;
  student_name: string;
  status: string;
  violation_count: number;
  max_violations: number | null;
  started_at: string | null;
}

interface QuizObservabilitySummary {
  generated_at: string;
  active_exam_sessions: number;
  active_quiz_sessions: number;
  stale_sessions: number;
  high_risk_sessions: number;
  violation_events_last_24h: number;
  auto_submitted_last_24h: number;
  submitted_quiz_pending_grading: number;
  top_risky_sessions: RiskySession[];
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
  });

  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendanceChart, setAttendanceChart] = useState<AttendanceChartData[]>([]);
  const [teacherRecap, setTeacherRecap] = useState<TeacherDailyRecap | null>(null);
  const [expandedTeacher, setExpandedTeacher] = useState<number | null>(null);
  const [quizObservability, setQuizObservability] = useState<QuizObservabilitySummary>({
    generated_at: '',
    active_exam_sessions: 0,
    active_quiz_sessions: 0,
    stale_sessions: 0,
    high_risk_sessions: 0,
    violation_events_last_24h: 0,
    auto_submitted_last_24h: 0,
    submitted_quiz_pending_grading: 0,
    top_risky_sessions: [],
  });

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/admin');
      const data = response.data?.data;

      if (data) {
        setStats({
          totalStudents: data.stats?.total_students || 0,
          totalTeachers: data.stats?.total_teachers || 0,
          totalClasses: data.stats?.total_classes || 0,
        });

        // Process activities
        if (data.recent_activities && Array.isArray(data.recent_activities)) {
          setActivities(data.recent_activities.slice(0, 5).map((a: Activity) => ({
            ...a,
            time: formatRelativeTime(a.time),
          })));
        }

        // Process weekly attendance chart
        if (data.weekly_attendance && Array.isArray(data.weekly_attendance)) {
          setAttendanceChart(data.weekly_attendance);
        }
        
        // Process teacher daily recap
        if (data.teacher_daily_recap) {
          setTeacherRecap(data.teacher_daily_recap);
        }

        if (data.quiz_observability) {
          setQuizObservability({
            generated_at: data.quiz_observability.generated_at || '',
            active_exam_sessions: data.quiz_observability.active_exam_sessions || 0,
            active_quiz_sessions: data.quiz_observability.active_quiz_sessions || 0,
            stale_sessions: data.quiz_observability.stale_sessions || 0,
            high_risk_sessions: data.quiz_observability.high_risk_sessions || 0,
            violation_events_last_24h: data.quiz_observability.violation_events_last_24h || 0,
            auto_submitted_last_24h: data.quiz_observability.auto_submitted_last_24h || 0,
            submitted_quiz_pending_grading: data.quiz_observability.submitted_quiz_pending_grading || 0,
            top_risky_sessions: Array.isArray(data.quiz_observability.top_risky_sessions)
              ? data.quiz_observability.top_risky_sessions
              : [],
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    return `${diffDays} hari lalu`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'attendance':
        return { icon: <FolderOpen className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-600' };
      case 'exam':
        return { icon: <FileEdit className="w-4 h-4" />, color: 'bg-orange-100 text-orange-500' };
      default:
        return { icon: <UserPlus className="w-4 h-4" />, color: 'bg-cyan-50 text-cyan-500' };
    }
  };

  const getTeacherStatusBadge = (status: string) => {
    switch (status) {
      case 'good':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" />
            Lengkap
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" />
            Ada yang Terlewat
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
            <Clock className="w-3 h-3" />
            Belum Lengkap
          </span>
        );
      default:
        return null;
    }
  };

  const getClassStatusIcon = (status: string) => {
    switch (status) {
      case 'mengajar':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'tidak_mengajar':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
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
        {/* Welcome Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-blue-800 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 p-5 sm:p-6 shadow-lg shadow-slate-900/20 hero-radial">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <p className="text-sm text-slate-400 mb-1">{getTimeGreeting().emoji} {getTimeGreeting().greeting}</p>
            <h1 className="text-2xl font-bold text-white">Panel Admin</h1>
            <p className="text-slate-300/80">Kelola pengguna, kelas, dan seluruh sistem LMS</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          <QuickActionCard
            icon={<Users className="w-8 h-8" />}
            title="Kelola Pengguna"
            href="/admin/users"
            color="teal"
          />
          <QuickActionCard
            icon={<GraduationCap className="w-8 h-8" />}
            title="Kelola Kelas"
            href="/admin/kelas"
            color="teal"
          />
          <QuickActionCard
            icon={<Calendar className="w-8 h-8" />}
            title="Manajemen Jadwal"
            href="/admin/jadwal"
            color="teal"
          />
          <QuickActionCard
            icon={<BarChart3 className="w-8 h-8" />}
            title="Nilai Siswa"
            href="/nilai"
            color="teal"
          />
        </div>

        {/* Statistics */}
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Statistik Pengguna</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
            <StatCard
              value={stats.totalStudents}
              label="Siswa Aktif"
              color="blue"
            />
            <StatCard
              value={stats.totalTeachers}
              label="Guru"
              color="green"
            />
            <StatCard
              value={stats.totalClasses}
              label="Kelas"
              color="orange"
            />
          </div>
        </div>

        <Card>
          <CardHeader
            title="Monitoring Quiz & Ujian"
            subtitle="Ringkasan anomali sesi dan anti-cheat"
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className={`rounded-lg border p-3 ${quizObservability.stale_sessions > 0 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sesi Stale</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">{quizObservability.stale_sessions}</p>
            </div>
            <div className={`rounded-lg border p-3 ${quizObservability.high_risk_sessions > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400">Sesi Risiko Tinggi</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">{quizObservability.high_risk_sessions}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Pelanggaran 24 Jam</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">{quizObservability.violation_events_last_24h}</p>
            </div>
            <div className={`rounded-lg border p-3 ${quizObservability.auto_submitted_last_24h > 0 ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'}`}>
              <p className="text-xs text-slate-500 dark:text-slate-400">Auto Submit 24 Jam</p>
              <p className="text-xl font-semibold text-slate-900 dark:text-white">{quizObservability.auto_submitted_last_24h}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Sesi Ujian Aktif</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{quizObservability.active_exam_sessions}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Sesi Quiz Aktif</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{quizObservability.active_quiz_sessions}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 p-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">Quiz Menunggu Penilaian</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{quizObservability.submitted_quiz_pending_grading}</p>
            </div>
          </div>

          {quizObservability.top_risky_sessions.length > 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Sesi Risiko Tertinggi</p>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-700">
                {quizObservability.top_risky_sessions.map((session) => (
                  <div key={`${session.exam_id}-${session.student_id}`} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">{session.student_name} · {session.exam_title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {session.exam_type === 'quiz' ? 'Quiz' : 'Ujian'} · Mulai {session.started_at ? formatRelativeTime(session.started_at) : '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {session.violation_count}/{session.max_violations ?? '-'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{session.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-sm text-slate-600 dark:text-slate-400">
              Tidak ada sesi berisiko tinggi saat ini.
            </div>
          )}
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Aktivitas Terbaru */}
          <Card>
            <CardHeader title="Aktivitas Terbaru" />
            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((activity, index) => {
                  const { icon, color } = getActivityIcon(activity.type);
                  return (
                    <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{activity.message}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">{activity.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <p>Belum ada aktivitas terbaru</p>
              </div>
            )}
          </Card>

          {/* Grafik Kehadiran Ringkas */}
          <Card>
            <CardHeader
              title="Grafik Kehadiran"
              action={
                <Link
                  href="/admin/statistik"
                  className="text-sky-500 text-sm font-medium hover:underline flex items-center gap-1"
                >
                  Lihat Selengkapnya
                  <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            <div className="flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl font-bold text-blue-800">{stats.totalStudents}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Siswa Terdaftar</p>
                <div className="flex gap-1 mt-2 justify-center">
                  {[35, 28, 42, 30, 45, 38, 32].map((height, i) => (
                    <div
                      key={i}
                      className="w-3 bg-gradient-to-t from-blue-300 to-blue-600 rounded"
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Full Attendance Chart */}
        <Card>
          <CardHeader
            title="Grafik Kehadiran Mingguan"
            subtitle="Data kehadiran seluruh siswa"
          />
          {attendanceChart.length > 0 ? (
            <MultiBarChart
              data={attendanceChart}
              bars={[
                { dataKey: 'hadir', color: '#22C55E', name: 'Hadir' },
                { dataKey: 'izin', color: '#3B82F6', name: 'Izin' },
                { dataKey: 'sakit', color: '#F59E0B', name: 'Sakit' },
                { dataKey: 'alpha', color: '#EF4444', name: 'Alpha' },
              ]}
              height={300}
            />
          ) : (
            <div className="text-center py-12 text-slate-600 dark:text-slate-400">
              <p>Belum ada data kehadiran minggu ini</p>
            </div>
          )}
        </Card>

        {/* Teacher Daily Recap */}
        {teacherRecap && (
          <Card>
            <CardHeader
              title={`Rekap Aktivitas Guru - ${teacherRecap.day_name}`}
              subtitle="Monitoring kehadiran guru sesuai jadwal mengajar"
            />
            
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-800 dark:text-blue-400">{teacherRecap.summary.total_teachers_scheduled}</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">Guru Terjadwal</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{teacherRecap.summary.teachers_teaching}</p>
                <p className="text-sm text-green-700 dark:text-green-300">Sudah Mengajar</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{teacherRecap.summary.teachers_with_missed}</p>
                <p className="text-sm text-red-700 dark:text-red-300">Tidak Mengajar</p>
              </div>
            </div>

            {/* Alert if there are teachers not teaching */}
            {teacherRecap.summary.teachers_with_missed > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-red-800">Perhatian!</h4>
                  <p className="text-sm text-red-700">
                    Ada {teacherRecap.summary.teachers_with_missed} guru yang melewatkan jadwal mengajar hari ini.
                  </p>
                </div>
              </div>
            )}

            {/* Teacher List */}
            {teacherRecap.teachers.length > 0 ? (
              <div className="space-y-3">
                {teacherRecap.teachers.map((teacher) => (
                  <div key={teacher.teacher_id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                    {/* Teacher Header */}
                    <button
                      onClick={() => setExpandedTeacher(
                        expandedTeacher === teacher.teacher_id ? null : teacher.teacher_id
                      )}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          teacher.status === 'good' ? 'bg-green-100' :
                          teacher.status === 'warning' ? 'bg-red-100' : 'bg-yellow-100'
                        }`}>
                          <Users className={`w-5 h-5 ${
                            teacher.status === 'good' ? 'text-green-600' :
                            teacher.status === 'warning' ? 'text-red-600' : 'text-yellow-600'
                          }`} />
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-slate-900 dark:text-white">{teacher.teacher_name}</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {teacher.taught}/{teacher.total_scheduled} jadwal terpenuhi
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getTeacherStatusBadge(teacher.status)}
                        {expandedTeacher === teacher.teacher_id ? (
                          <ChevronUp className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Detail */}
                    {expandedTeacher === teacher.teacher_id && (
                      <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-slate-600 dark:text-slate-400">
                              <th scope="col" className="pb-2">Kelas</th>
                              <th scope="col" className="pb-2">Mata Pelajaran</th>
                              <th scope="col" className="pb-2">Jam</th>
                              <th scope="col" className="pb-2 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teacher.classes.map((cls, idx) => (
                              <tr key={idx} className="border-t border-slate-200 dark:border-slate-700">
                                <td className="py-2 font-medium text-slate-900 dark:text-white">{cls.class_name}</td>
                                <td className="py-2 text-slate-700 dark:text-slate-300">{cls.subject}</td>
                                <td className="py-2 text-slate-600 dark:text-slate-400">{cls.time}</td>
                                <td className="py-2 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    {getClassStatusIcon(cls.status)}
                                    <span className={`text-xs ${
                                      cls.status === 'mengajar' ? 'text-green-600' :
                                      cls.status === 'tidak_mengajar' ? 'text-red-600' : 'text-yellow-600'
                                    }`}>
                                      {cls.status === 'mengajar' ? 'Mengajar' :
                                       cls.status === 'tidak_mengajar' ? 'Tidak Mengajar' : 'Menunggu'}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 dark:text-slate-400">
                <Calendar className="w-12 h-12 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-slate-600 dark:text-slate-400">Tidak ada jadwal guru untuk hari ini</p>
              </div>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
