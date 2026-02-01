'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { attendanceAPI } from '@/services/api';
import { ClipboardList, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';

interface AttendanceRecord {
  id: number;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
  scanned_at: string | null;
  session: {
    id: number;
    subject: string;
    created_at: string;
    valid_from: string;
    valid_until: string;
    class?: {
      name: string;
    };
    teacher?: {
      name: string;
    };
  };
}

export default function RiwayatAbsensiPage() {
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    hadir: 0,
    izin: 0,
    sakit: 0,
    alpha: 0,
  });

  useEffect(() => {
    fetchAttendanceHistory();
  }, []);

  const fetchAttendanceHistory = async () => {
    try {
      const response = await attendanceAPI.getStudentHistory();
      const data = response.data.data.data || response.data.data;
      setAttendances(data);
      
      // Calculate stats
      const newStats = { hadir: 0, izin: 0, sakit: 0, alpha: 0 };
      data.forEach((att: AttendanceRecord) => {
        if (newStats[att.status] !== undefined) {
          newStats[att.status]++;
        }
      });
      setStats(newStats);
    } catch (error) {
      console.error('Failed to fetch attendance history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'hadir':
        return { label: 'Hadir', color: 'bg-green-100 text-green-700', icon: CheckCircle };
      case 'izin':
        return { label: 'Izin', color: 'bg-blue-100 text-blue-700', icon: Clock };
      case 'sakit':
        return { label: 'Sakit', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle };
      case 'alpha':
        return { label: 'Alpha', color: 'bg-red-100 text-red-700', icon: XCircle };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-700', icon: Clock };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (timeString: string) => {
    return timeString.substring(0, 5);
  };

  const total = stats.hadir + stats.izin + stats.sakit + stats.alpha;
  const attendancePercentage = total > 0 ? Math.round((stats.hadir / total) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Riwayat Absensi</h1>
          <p className="text-gray-600">Lihat riwayat kehadiran Anda</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{attendancePercentage}%</p>
            <p className="text-sm text-gray-600">Kehadiran</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.hadir}</p>
            <p className="text-sm text-gray-600">Hadir</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{stats.izin}</p>
            <p className="text-sm text-gray-600">Izin</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-yellow-600">{stats.sakit}</p>
            <p className="text-sm text-gray-600">Sakit</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-3xl font-bold text-red-600">{stats.alpha}</p>
            <p className="text-sm text-gray-600">Alpha</p>
          </Card>
        </div>

        {/* Attendance List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : attendances.length === 0 ? (
          <Card className="p-12 text-center">
            <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Belum Ada Riwayat</h3>
            <p className="text-gray-500">Riwayat absensi Anda akan muncul di sini</p>
          </Card>
        ) : (
          <Card>
            <div className="divide-y">
              {attendances.map((attendance) => {
                const statusConfig = getStatusConfig(attendance.status);
                const StatusIcon = statusConfig.icon;
                
                return (
                  <div key={attendance.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <ClipboardList className="w-6 h-6 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{attendance.session?.subject || 'Mata Pelajaran'}</h3>
                        <p className="text-sm text-gray-500">
                          {attendance.session?.created_at ? formatDate(attendance.session.created_at) : '-'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {attendance.session?.teacher?.name || 'Guru'} • {attendance.session?.class?.name || ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusConfig.label}
                      </span>
                      {attendance.scanned_at && (
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(attendance.scanned_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
