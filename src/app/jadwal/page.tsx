'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card } from '@/components/ui';
import { Calendar, MapPin, User, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface ScheduleItem {
  id: number;
  subject: string;
  teacher?: { id: number; name: string };
  class_room?: { id: number; name: string };
  room: string;
  start_time: string;
  end_time: string;
  day_of_week: number;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export default function JadwalPage() {
  const { user } = useAuth();
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSchedules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const fetchSchedules = async () => {
    try {
      // Fetch schedules from API based on user role
      let endpoint = '/schedules'; // Default for admin
      if (user?.role === 'guru') {
        endpoint = '/teacher-schedule';
      } else if (user?.role === 'siswa') {
        endpoint = '/my-schedule';
      }
      
      const response = await api.get(endpoint);
      const rawData = response.data?.data;
      
      // The API may return grouped data by day_of_week or a flat array
      let schedulesData: ScheduleItem[] = [];
      
      if (rawData && typeof rawData === 'object' && !Array.isArray(rawData)) {
        // Data is grouped by day_of_week: { "1": [...], "2": [...] }
        Object.entries(rawData).forEach(([dayKey, daySchedules]) => {
          if (Array.isArray(daySchedules)) {
            const dayNum = parseInt(dayKey);
            daySchedules.forEach((s: ScheduleItem) => {
              schedulesData.push({ ...s, day_of_week: dayNum });
            });
          }
        });
      } else if (Array.isArray(rawData)) {
        schedulesData = rawData;
      }
      
      setSchedules(schedulesData);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredSchedules = schedules.filter(s => s.day_of_week === selectedDay);

  const getSubjectColor = (subject: string) => {
    const colors: Record<string, string> = {
      'Matematika': 'bg-sky-50 text-sky-700 border-sky-200',
      'Fisika': 'bg-purple-100 text-purple-700 border-purple-200',
      'Kimia': 'bg-green-100 text-green-700 border-green-200',
      'Biologi': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Bahasa Indonesia': 'bg-red-100 text-red-700 border-red-200',
      'Bahasa Inggris': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'Sejarah': 'bg-yellow-100 text-yellow-700 border-yellow-200',
      'Ekonomi': 'bg-orange-100 text-orange-700 border-orange-200',
      'Olahraga': 'bg-sky-100 text-sky-700 border-sky-200',
      'Seni Budaya': 'bg-pink-100 text-pink-700 border-pink-200',
      'Informatika': 'bg-cyan-100 text-cyan-700 border-cyan-200',
    };
    return colors[subject] || 'bg-slate-100 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Jadwal Pelajaran</h1>
          <p className="text-slate-600 dark:text-slate-400">
            {user?.role === 'siswa' ? `Kelas ${user?.class?.name || '-'}` : 'Jadwal mengajar Anda'}
          </p>
        </div>

        {/* Day Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {DAYS.map((day, index) => {
            const dayNum = index + 1;
            const hasSchedule = schedules.some(s => s.day_of_week === dayNum);
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(dayNum)}
                className={`relative px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  selectedDay === dayNum
                    ? 'bg-cyan-500 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {day}
                {hasSchedule && selectedDay !== dayNum && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-cyan-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Schedule List */}
        {filteredSchedules.length === 0 ? (
          <Card className="p-8 text-center">
            <Calendar className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Tidak ada jadwal untuk {DAYS[selectedDay - 1]}</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Jadwal akan muncul jika sudah ditambahkan oleh admin</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSchedules
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((schedule) => (
                <Card key={schedule.id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    {/* Time */}
                    <div className="flex-shrink-0 w-20 text-center">
                      <div className="bg-slate-100 rounded-lg p-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{schedule.start_time}</p>
                        <div className="w-4 h-0.5 bg-slate-300 mx-auto my-1" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">{schedule.end_time}</p>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getSubjectColor(schedule.subject)}`}>
                        {schedule.subject}
                      </div>
                      
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <User className="w-4 h-4 text-slate-500 dark:text-slate-500" />
                          <span>{schedule.teacher?.name || schedule.class_room?.name || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <MapPin className="w-4 h-4 text-slate-500 dark:text-slate-500" />
                          <span>{schedule.room || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
          </div>
        )}

        {/* Weekly Overview */}
        {schedules.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Ringkasan Minggu Ini</h3>
            <div className="grid grid-cols-6 gap-2">
              {DAYS.map((day, index) => {
                const daySchedules = schedules.filter(s => s.day_of_week === index + 1);
                return (
                  <div 
                    key={day} 
                    className={`text-center p-2 rounded-lg cursor-pointer transition-colors ${
                      selectedDay === index + 1 ? 'bg-sky-100' : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    onClick={() => setSelectedDay(index + 1)}
                  >
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{day.slice(0, 3)}</p>
                    <p className={`text-lg font-bold ${daySchedules.length > 0 ? 'text-sky-500' : 'text-slate-400 dark:text-slate-600'}`}>
                      {daySchedules.length}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">mata pelajaran</p>
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
