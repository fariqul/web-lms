'use client';

import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input, ConfirmDialog } from '@/components/ui';
import { Calendar, Plus, Edit2, Trash2, Clock, User, MapPin, X, Loader2, Search, ChevronDown, Check } from 'lucide-react';
import { classAPI, userAPI, scheduleAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { SUBJECT_OPTIONS } from '@/constants/subjects';

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

interface JamKeOption {
  value: string;
  label: string;
  start: string;
  end: string;
}

// Jam Ke sesuai jadwal sekolah
const JAM_KE_OPTIONS: JamKeOption[] = [
  { value: '1', label: 'Jam 1', start: '07:30', end: '08:10' },
  { value: '2', label: 'Jam 2', start: '08:10', end: '08:50' },
  { value: '3', label: 'Jam 3', start: '08:50', end: '09:30' },
  { value: '4', label: 'Jam 4', start: '09:30', end: '10:10' },
  { value: 'R-1', label: 'Istirahat 1 (R-1)', start: '10:10', end: '10:25' },
  { value: '5', label: 'Jam 5', start: '10:25', end: '11:05' },
  { value: '6', label: 'Jam 6', start: '11:05', end: '11:45' },
  { value: 'R-2', label: 'Istirahat 2 (R-2)', start: '11:45', end: '12:45' },
  { value: '7', label: 'Jam 7', start: '12:45', end: '13:25' },
  { value: '8', label: 'Jam 8', start: '13:25', end: '14:05' },
  { value: '9', label: 'Jam 9', start: '14:05', end: '14:45' },
  { value: '10', label: 'Jam 10', start: '14:45', end: '15:25' },
];

function SearchableTeacherSelect({
  teachers,
  value,
  onChange,
}: {
  teachers: { id: number; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedTeacher = teachers.find((t) => t.id.toString() === value);

  const filteredTeachers = teachers.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        Guru Pengajar <span className="text-red-500">*</span>
      </label>
      
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 bg-white dark:bg-slate-800 text-foreground cursor-pointer flex items-center justify-between min-h-[42px]"
      >
        <span className={selectedTeacher ? 'text-slate-900 dark:text-white font-medium text-sm' : 'text-slate-400 text-sm'}>
          {selectedTeacher ? selectedTeacher.name : 'Pilih / Cari Guru...'}
        </span>
        <div className="flex items-center gap-1 text-slate-400">
          {selectedTeacher && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
              }}
              className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Bersihkan pilihan guru"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <ChevronDown className="w-4 h-4" />
        </div>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 flex flex-col">
          <div className="p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama guru untuk mencari..."
              className="w-full text-sm bg-transparent border-none focus:outline-none text-slate-800 dark:text-white placeholder:text-slate-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600"
                aria-label="Bersihkan pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-700/50 max-h-48">
            {filteredTeachers.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                Guru &quot;{search}&quot; tidak ditemukan
              </div>
            ) : (
              filteredTeachers.map((t) => {
                const isSelected = t.id.toString() === value;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onChange(t.id.toString());
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span>{t.name}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
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
        userAPI.getAll({ role: 'guru', per_page: 1000 }),
        scheduleAPI.getAll(),
      ]);

      // Process classes
      const classesData = classesRes.data?.data || [];
      setClasses(classesData.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));

      // Process teachers
      const usersRaw = usersRes.data?.data;
      const usersData = Array.isArray(usersRaw) ? usersRaw : (usersRaw?.data || []);
      const teachersList = usersData.filter((u: { role?: string }) => !u.role || u.role === 'guru');
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
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mata Pelajaran</label>
                    <select
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    >
                      <option value="">Pilih Mapel</option>
                      {SUBJECT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <SearchableTeacherSelect
                  teachers={teachers}
                  value={formData.teacher_id}
                  onChange={(id) => setFormData({ ...formData, teacher_id: id })}
                />

                <Input
                  label="Ruangan"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                  placeholder="Contoh: Lab Komputer 1"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Dari Jam</label>
                    <select
                      value={
                        JAM_KE_OPTIONS.find(j => j.start === formData.start_time.slice(0, 5))?.value || ''
                      }
                      onChange={(e) => {
                        const startVal = e.target.value;
                        const startOpt = JAM_KE_OPTIONS.find(j => j.value === startVal);
                        if (!startOpt) {
                          setFormData({ ...formData, start_time: '', end_time: '' });
                          return;
                        }
                        const currentEndVal = JAM_KE_OPTIONS.find(j => j.end === formData.end_time.slice(0, 5))?.value || startVal;
                        const currentEndIdx = JAM_KE_OPTIONS.findIndex(j => j.value === currentEndVal);
                        const newStartIdx = JAM_KE_OPTIONS.findIndex(j => j.value === startVal);
                        let endOpt = JAM_KE_OPTIONS.find(j => j.value === currentEndVal);
                        if (!endOpt || currentEndIdx < newStartIdx) {
                          endOpt = startOpt;
                        }
                        setFormData({ ...formData, start_time: startOpt.start, end_time: endOpt.end });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-800 text-foreground"
                      required
                    >
                      <option value="">Pilih Jam...</option>
                      {JAM_KE_OPTIONS.map(jam => (
                        <option key={jam.value} value={jam.value}>
                          {jam.label} ({jam.start})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sampai Jam</label>
                    <select
                      value={
                        JAM_KE_OPTIONS.find(j => j.end === formData.end_time.slice(0, 5))?.value || 
                        JAM_KE_OPTIONS.find(j => j.start === formData.start_time.slice(0, 5))?.value || ''
                      }
                      onChange={(e) => {
                        const endVal = e.target.value;
                        const endOpt = JAM_KE_OPTIONS.find(j => j.value === endVal);
                        if (!endOpt) return;
                        const currentStartVal = JAM_KE_OPTIONS.find(j => j.start === formData.start_time.slice(0, 5))?.value;
                        const startOpt = JAM_KE_OPTIONS.find(j => j.value === currentStartVal) || endOpt;
                        setFormData({
                          ...formData,
                          start_time: startOpt.start,
                          end_time: endOpt.end,
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white dark:bg-slate-800 text-foreground"
                      required
                    >
                      <option value="">Pilih Jam...</option>
                      {JAM_KE_OPTIONS.filter(j => {
                        const currentStartVal = JAM_KE_OPTIONS.find(o => o.start === formData.start_time.slice(0, 5))?.value;
                        if (!currentStartVal) return true;
                        const startIdx = JAM_KE_OPTIONS.findIndex(o => o.value === currentStartVal);
                        const thisIdx = JAM_KE_OPTIONS.findIndex(o => o.value === j.value);
                        return thisIdx >= startIdx;
                      }).map(jam => (
                        <option key={jam.value} value={jam.value}>
                          {jam.label} ({jam.end})
                        </option>
                      ))}
                    </select>
                  </div>
                  {formData.start_time && formData.end_time && (
                    <div className="col-span-2 flex items-center gap-2 px-3 py-2 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800/50">
                      <Clock className="w-4 h-4 text-sky-500" />
                      <span className="text-sm text-sky-700 dark:text-sky-300">
                        Waktu: <strong>{formData.start_time.slice(0, 5)}</strong> — <strong>{formData.end_time.slice(0, 5)}</strong>
                      </span>
                    </div>
                  )}
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
