'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input, ConfirmDialog } from '@/components/ui';
import { Calendar, Plus, Edit2, Trash2, Clock, User, MapPin, X, Loader2 } from 'lucide-react';
import { classAPI, userAPI, scheduleAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface Schedule {
  id: number;
  class_id: number;
  class_room?: { id: number; name: string };
  subject: string;
  teacher_id: number;
  teacher?: { id: number; name: string };
  room: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

// Generate time options from 06:00 to 18:00 with 15 minute intervals
const TIME_OPTIONS: string[] = [];
for (let hour = 6; hour <= 18; hour++) {
  for (let min = 0; min < 60; min += 15) {
    const h = hour.toString().padStart(2, '0');
    const m = min.toString().padStart(2, '0');
    TIME_OPTIONS.push(`${h}:${m}`);
  }
}

export default function AdminJadwalPage() {
  const toast = useToast();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<{ id: number; name: string }[]>([]);
  const [teachers, setTeachers] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(1);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [formData, setFormData] = useState({
    class_id: '',
    subject: '',
    teacher_id: '',
    room: '',
    day_of_week: 1,
    start_time: '',
    end_time: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all data in parallel
      const [classesRes, usersRes, schedulesRes] = await Promise.all([
        classAPI.getAll(),
        userAPI.getAll({ per_page: 1000 }),
        scheduleAPI.getAll(),
      ]);

      // Process classes
      const classesData = classesRes.data?.data || [];
      setClasses(classesData.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));

      // Process teachers
      const usersRaw = usersRes.data?.data;
      const usersData = Array.isArray(usersRaw) ? usersRaw : (usersRaw?.data || []);
      const teachersList = usersData.filter((u: { role: string }) => u.role === 'guru');
      setTeachers(teachersList.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })));

      // Process schedules
      const schedulesRaw = schedulesRes.data?.data;
      const schedulesData = Array.isArray(schedulesRaw) ? schedulesRaw : (schedulesRaw?.data || []);
      setSchedules(schedulesData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSchedules = schedules.filter(s => s.day_of_week === selectedDay);

  const resetForm = () => {
    setFormData({
      class_id: '',
      subject: '',
      teacher_id: '',
      room: '',
      day_of_week: selectedDay,
      start_time: '',
      end_time: '',
    });
    setEditingSchedule(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        class_id: Number(formData.class_id),
        subject: formData.subject,
        teacher_id: Number(formData.teacher_id),
        room: formData.room,
        day_of_week: formData.day_of_week,
        start_time: formData.start_time,
        end_time: formData.end_time,
      };

      if (editingSchedule) {
        // Update existing schedule
        await scheduleAPI.update(editingSchedule.id, payload);
      } else {
        // Create new schedule
        await scheduleAPI.create(payload);
      }

      // Refresh data
      await fetchData();
      setShowModal(false);
      resetForm();
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error('Gagal menyimpan jadwal. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (schedule: Schedule) => {
    setFormData({
      class_id: schedule.class_id.toString(),
      subject: schedule.subject,
      teacher_id: schedule.teacher_id.toString(),
      room: schedule.room || '',
      day_of_week: schedule.day_of_week,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
    });
    setEditingSchedule(schedule);
    setShowModal(true);
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    try {
      await scheduleAPI.delete(deleteId);
      await fetchData();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      toast.error('Gagal menghapus jadwal.');
    } finally {
      setDeleteId(null);
    }
  };

  // Helper to get class name from schedule
  const getClassName = (schedule: Schedule) => {
    if (schedule.class_room?.name) return schedule.class_room.name;
    const cls = classes.find(c => c.id === schedule.class_id);
    return cls?.name || '-';
  };

  // Helper to get teacher name from schedule
  const getTeacherName = (schedule: Schedule) => {
    if (schedule.teacher?.name) return schedule.teacher.name;
    const teacher = teachers.find(t => t.id === schedule.teacher_id);
    return teacher?.name || '-';
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
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-blue-800 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 p-5 sm:p-6 shadow-lg shadow-slate-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Manajemen Jadwal</h1>
              <p className="text-slate-300/80">Kelola jadwal pelajaran untuk semua kelas</p>
            </div>
            <Button onClick={() => { resetForm(); setShowModal(true); }} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Tambah Jadwal
            </Button>
          </div>
        </div>

        {/* Day Selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {DAYS.map((day, index) => (
            <button
              key={day}
              onClick={() => setSelectedDay(index + 1)}
              className={`px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap ${
                selectedDay === index + 1
                  ? 'bg-cyan-500 text-white'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        {/* Schedule List */}
        <Card className="overflow-hidden">
          {filteredSchedules.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada jadwal untuk {DAYS[selectedDay - 1]}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Klik tombol &quot;Tambah Jadwal&quot; untuk membuat jadwal baru</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Waktu
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Mata Pelajaran
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Kelas
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Guru
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Ruangan
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200">
                  {filteredSchedules
                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    .map((schedule) => (
                      <tr key={schedule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            <span className="font-medium text-slate-900 dark:text-white">
                              {schedule.start_time.slice(0, 5)} - {schedule.end_time.slice(0, 5)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 bg-sky-100 text-sky-700 text-sm rounded-full">
                            {schedule.subject}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-900 dark:text-white">
                          {getClassName(schedule)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            <span className="text-slate-600 dark:text-slate-400">{getTeacherName(schedule)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            <span className="text-slate-600 dark:text-slate-400">{schedule.room || '-'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(schedule)}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                              aria-label="Edit jadwal"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(schedule.id)}
                              className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              aria-label="Hapus jadwal"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {editingSchedule ? 'Edit Jadwal' : 'Tambah Jadwal Baru'}
                </h2>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded" aria-label="Tutup">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Hari</label>
                  <select
                    value={formData.day_of_week}
                    onChange={(e) => setFormData({ ...formData, day_of_week: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    required
                  >
                    {DAYS.map((day, index) => (
                      <option key={day} value={index + 1}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kelas</label>
                    <select
                      value={formData.class_id}
                      onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    >
                      <option value="">Pilih Kelas</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Mata Pelajaran"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="Contoh: Informatika"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Guru Pengajar</label>
                  <select
                    value={formData.teacher_id}
                    onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    required
                  >
                    <option value="">Pilih Guru</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <Input
                  label="Ruangan"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  placeholder="Contoh: Lab Komputer 1"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Waktu Mulai</label>
                    <select
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    >
                      <option value="">Pilih Waktu</option>
                      {TIME_OPTIONS.map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Waktu Selesai</label>
                    <select
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    >
                      <option value="">Pilih Waktu</option>
                      {TIME_OPTIONS.filter(t => t > formData.start_time).map(time => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowModal(false); resetForm(); }}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Menyimpan…
                      </>
                    ) : (
                      editingSchedule ? 'Simpan Perubahan' : 'Simpan Jadwal'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Hapus Jadwal"
        message="Yakin ingin menghapus jadwal ini?"
        confirmText="Hapus"
        variant="danger"
      />
    </DashboardLayout>
  );
}
