'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { SimplePieChart, SimpleBarChart } from '@/components/ui/Chart';
import api from '@/services/api';
import { Users, GraduationCap, UserCheck, BookOpen, TrendingUp, Calendar } from 'lucide-react';

interface MonthlyActivity {
  sessions: number;
  exams: number;
  materials: number;
}

interface TodaySchedule {
  total: number;
  active_classes: number;
  teaching_teachers: number;
}

interface AcademicPerformance {
  attendance_percentage: number;
  avg_score: number;
  pass_rate: number;
}

export default function AdminStatistikPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
  });

  const [usersByRole, setUsersByRole] = useState<{ name: string; value: number; color: string }[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<{ name: string; jumlah: number }[]>([]);
  const [monthlyActivity, setMonthlyActivity] = useState<MonthlyActivity>({ sessions: 0, exams: 0, materials: 0 });
  const [todaySchedule, setTodaySchedule] = useState<TodaySchedule>({ total: 0, active_classes: 0, teaching_teachers: 0 });
  const [academicPerformance, setAcademicPerformance] = useState<AcademicPerformance>({ attendance_percentage: 0, avg_score: 0, pass_rate: 0 });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await api.get('/dashboard/admin');
      const data = response.data?.data;

      if (data) {
        const statsData = data.stats || {};
        const usersRole = data.users_by_role || [];
        const studentsClass = data.students_by_class || [];

        setStats({
          totalUsers: statsData.total_users || 0,
          totalStudents: statsData.total_students || 0,
          totalTeachers: statsData.total_teachers || 0,
          totalClasses: statsData.total_classes || 0,
        });

        setUsersByRole(usersRole.map((r: { name: string; value: number }, index: number) => ({
          name: r.name,
          value: r.value,
          color: ['#3B82F6', '#14B8A6', '#F97316'][index] || '#6B7280',
        })));

        setStudentsByClass(studentsClass);

        // Additional stats
        if (data.monthly_activity) {
          setMonthlyActivity(data.monthly_activity);
        }
        if (data.today_schedule) {
          setTodaySchedule(data.today_schedule);
        }
        if (data.academic_performance) {
          setAcademicPerformance(data.academic_performance);
        }
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: 'Total Pengguna', value: stats.totalUsers, icon: Users, color: 'bg-cyan-500' },
    { label: 'Total Siswa', value: stats.totalStudents, icon: GraduationCap, color: 'bg-green-500' },
    { label: 'Total Guru', value: stats.totalTeachers, icon: UserCheck, color: 'bg-purple-500' },
    { label: 'Total Kelas', value: stats.totalClasses, icon: BookOpen, color: 'bg-orange-500' },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Statistik</h1>
          <p className="text-slate-600 dark:text-slate-400">Ringkasan data dan statistik sistem</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="p-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Pengguna Berdasarkan Role</h3>
            <SimplePieChart data={usersByRole} />
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Siswa Per Kelas</h3>
            <SimpleBarChart data={studentsByClass} dataKey="jumlah" />
          </Card>
        </div>

        {/* Additional Info */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Aktivitas Bulan Ini</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Sesi Absensi</span>
                <span className="font-semibold">{monthlyActivity.sessions}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Ujian Dilaksanakan</span>
                <span className="font-semibold">{monthlyActivity.exams}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Materi Diunggah</span>
                <span className="font-semibold">{monthlyActivity.materials}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-sky-500" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Jadwal Hari Ini</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Total Jadwal</span>
                <span className="font-semibold">{todaySchedule.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Kelas Aktif</span>
                <span className="font-semibold">{todaySchedule.active_classes}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Guru Mengajar</span>
                <span className="font-semibold">{todaySchedule.teaching_teachers}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-purple-600" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Performa Akademik</h3>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Rata-rata Kehadiran</span>
                <span className="font-semibold text-green-600">{academicPerformance.attendance_percentage}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Rata-rata Nilai Ujian</span>
                <span className="font-semibold text-sky-500">{academicPerformance.avg_score}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600 dark:text-slate-400">Tingkat Kelulusan</span>
                <span className="font-semibold text-green-600">{academicPerformance.pass_rate}%</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
