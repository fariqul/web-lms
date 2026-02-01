'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, StatCard, QuickActionCard, MultiBarChart } from '@/components/ui';
import {
  Users,
  GraduationCap,
  Calendar,
  ChevronRight,
  FolderOpen,
  FileEdit,
  UserPlus,
  Loader2,
} from 'lucide-react';
import api from '@/services/api';

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

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalClasses: 0,
  });

  const [activities, setActivities] = useState<Activity[]>([]);
  const [attendanceChart, setAttendanceChart] = useState<AttendanceChartData[]>([]);

  useEffect(() => {
    fetchStats();
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
        return { icon: <FileEdit className="w-4 h-4" />, color: 'bg-orange-100 text-orange-600' };
      default:
        return { icon: <UserPlus className="w-4 h-4" />, color: 'bg-blue-100 text-blue-600' };
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <QuickActionCard
            icon={<Users className="w-8 h-8" />}
            title="Kelola Pengguna"
            href="/admin/users"
            color="orange"
          />
          <QuickActionCard
            icon={<GraduationCap className="w-8 h-8" />}
            title="Kelola Kelas"
            href="/admin/kelas"
            color="orange"
          />
          <QuickActionCard
            icon={<Calendar className="w-8 h-8" />}
            title="Manajemen Jadwal"
            href="/admin/jadwal"
            color="orange"
          />
        </div>

        {/* Statistics */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Statistik Pengguna</h3>
          <div className="grid grid-cols-3 gap-4">
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

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Aktivitas Terbaru */}
          <Card>
            <CardHeader title="Aktivitas Terbaru" />
            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((activity, index) => {
                  const { icon, color } = getActivityIcon(activity.type);
                  return (
                    <div key={index} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{activity.message}</p>
                        <p className="text-xs text-gray-500">{activity.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
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
                  className="text-orange-600 text-sm font-medium hover:underline flex items-center gap-1"
                >
                  Lihat Selengkapnya
                  <ChevronRight className="w-4 h-4" />
                </Link>
              }
            />
            <div className="flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl font-bold text-blue-600">{stats.totalStudents}</p>
                <p className="text-sm text-gray-500">Total Siswa Terdaftar</p>
                <div className="flex gap-1 mt-2 justify-center">
                  {[35, 28, 42, 30, 45, 38, 32].map((height, i) => (
                    <div
                      key={i}
                      className="w-3 bg-gradient-to-t from-blue-300 to-blue-500 rounded"
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
            <div className="text-center py-12 text-gray-500">
              <p>Belum ada data kehadiran minggu ini</p>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
