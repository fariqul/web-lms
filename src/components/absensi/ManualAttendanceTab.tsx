'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, Button, Select } from '@/components/ui';
import { UserCheck, Save, Loader2, CheckCircle, AlertCircle, Search } from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface Student {
  id: number;
  name: string;
  nisn?: string;
}

interface ClassOption {
  value: string;
  label: string;
}

interface SubjectOption {
  value: string;
  label: string;
}

interface StudentStatus {
  student_id: number;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
}

const statusOptions = [
  { value: 'hadir', label: 'Hadir', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'izin', label: 'Izin', color: 'bg-sky-50 text-sky-700 border-sky-300' },
  { value: 'sakit', label: 'Sakit', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'alpha', label: 'Alpa', color: 'bg-red-100 text-red-700 border-red-300' },
];

interface ManualAttendanceTabProps {
  classes: ClassOption[];
  subjects: SubjectOption[];
  onSessionCreated?: () => void;
}

export function ManualAttendanceTab({ classes, subjects, onSessionCreated }: ManualAttendanceTabProps) {
  const toast = useToast();
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saved, setSaved] = useState(false);

  // Fetch students when class is selected
  useEffect(() => {
    if (selectedClass) {
      fetchStudents(selectedClass);
    } else {
      setStudents([]);
      setStatuses({});
    }
  }, [selectedClass]);

  const fetchStudents = async (classId: string) => {
    setLoading(true);
    try {
      const response = await api.get(`/classes/${classId}`);
      const classData = response.data?.data;
      const studentList: Student[] = classData?.students || [];
      // Sort by name
      studentList.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(studentList);
      // Default all to 'hadir'
      const defaultStatuses: Record<number, string> = {};
      studentList.forEach((s) => {
        defaultStatuses[s.id] = 'hadir';
      });
      setStatuses(defaultStatuses);
      setSaved(false);
    } catch (error) {
      console.error('Failed to fetch students:', error);
      toast.error('Gagal memuat daftar siswa');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (studentId: number, status: string) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
    setSaved(false);
  };

  const handleSetAllStatus = (status: string) => {
    const newStatuses: Record<number, string> = {};
    students.forEach((s) => {
      newStatuses[s.id] = status;
    });
    setStatuses(newStatuses);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedClass || !selectedSubject) {
      toast.warning('Pilih kelas dan mata pelajaran terlebih dahulu');
      return;
    }

    if (students.length === 0) {
      toast.warning('Tidak ada siswa di kelas ini');
      return;
    }

    setSaving(true);
    try {
      let activeSessionId = sessionId;

      // Create a session if one doesn't exist yet
      if (!activeSessionId) {
        const now = new Date();
        const validFrom = now.toISOString();
        const validUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

        const sessionResponse = await api.post('/attendance-sessions', {
          class_id: parseInt(selectedClass),
          subject: selectedSubject,
          valid_from: validFrom,
          valid_until: validUntil,
          require_school_network: false,
        });

        activeSessionId = sessionResponse.data?.data?.id;
        if (!activeSessionId) {
          toast.error('Gagal membuat sesi absensi');
          return;
        }
        setSessionId(activeSessionId);
      }

      // Build updates array
      const updates: StudentStatus[] = students.map((s) => ({
        student_id: s.id,
        status: (statuses[s.id] || 'hadir') as StudentStatus['status'],
      }));

      // Bulk update
      await api.post(`/attendance-sessions/${activeSessionId}/bulk-update-status`, {
        updates,
      });

      // Close session after saving
      await api.post(`/attendance-sessions/${activeSessionId}/close`);

      toast.success('Absensi berhasil disimpan!');
      setSaved(true);
      onSessionCreated?.();
    } catch (error) {
      console.error('Failed to save attendance:', error);
      toast.error('Gagal menyimpan absensi');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedClass('');
    setSelectedSubject('');
    setStudents([]);
    setStatuses({});
    setSessionId(null);
    setSaved(false);
    setSearchQuery('');
  };

  // Filter students by search
  const filteredStudents = students.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.nisn && s.nisn.includes(searchQuery))
  );

  // Summary counts
  const summary = {
    hadir: Object.values(statuses).filter((s) => s === 'hadir').length,
    izin: Object.values(statuses).filter((s) => s === 'izin').length,
    sakit: Object.values(statuses).filter((s) => s === 'sakit').length,
    alpha: Object.values(statuses).filter((s) => s === 'alpha').length,
  };

  return (
    <div className="space-y-6">
      {/* Setup Card */}
      <Card>
        <CardHeader
          title="Absensi Manual"
          subtitle="Absen siswa secara manual oleh guru"
        />

        {!saved ? (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Select
                label="Pilih Kelas"
                options={[{ value: '', label: 'Pilih kelas…' }, ...classes]}
                value={selectedClass}
                onChange={(e) => {
                  setSelectedClass(e.target.value);
                  setSessionId(null);
                  setSaved(false);
                }}
              />
              <Select
                label="Mata Pelajaran"
                options={[{ value: '', label: 'Pilih mata pelajaran…' }, ...subjects]}
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              />
            </div>

            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
              </div>
            )}

            {!loading && students.length > 0 && (
              <>
                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm font-medium text-slate-600 mr-2">Set semua:</span>
                  {statusOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleSetAllStatus(opt.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80 ${opt.color}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-green-600">{summary.hadir}</p>
                    <p className="text-xs text-green-700">Hadir</p>
                  </div>
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-sky-500">{summary.izin}</p>
                    <p className="text-xs text-sky-700">Izin</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-yellow-600">{summary.sakit}</p>
                    <p className="text-xs text-yellow-700">Sakit</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-red-600">{summary.alpha}</p>
                    <p className="text-xs text-red-700">Alpa</p>
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari nama siswa…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Student List */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2.5 flex items-center text-xs font-medium text-slate-500 uppercase tracking-wider border-b">
                    <span className="w-10">No</span>
                    <span className="flex-1">Nama Siswa</span>
                    <span className="w-52 text-center">Status</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                    {filteredStudents.map((student, index) => {
                      const currentStatus = statuses[student.id] || 'hadir';
                      return (
                        <div
                          key={student.id}
                          className="flex items-center px-4 py-3 hover:bg-slate-50 transition-colors"
                        >
                          <span className="w-10 text-sm text-slate-400">{index + 1}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-800">{student.name}</p>
                            {student.nisn && (
                              <p className="text-xs text-slate-400">NISN: {student.nisn}</p>
                            )}
                          </div>
                          <div className="w-52 flex gap-1 justify-center">
                            {statusOptions.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={() => handleStatusChange(student.id, opt.value)}
                                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                                  currentStatus === opt.value
                                    ? `${opt.color} ring-2 ring-offset-1 ${
                                        opt.value === 'hadir' ? 'ring-green-400' :
                                        opt.value === 'izin' ? 'ring-blue-400' :
                                        opt.value === 'sakit' ? 'ring-yellow-400' :
                                        'ring-red-400'
                                      }`
                                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || !selectedSubject}
                    leftIcon={
                      saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )
                    }
                  >
                    {saving ? 'Menyimpan…' : 'Simpan Absensi'}
                  </Button>
                </div>
              </>
            )}

            {!loading && selectedClass && students.length === 0 && (
              <div className="text-center py-8 text-slate-500">
                <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Tidak ada siswa di kelas ini</p>
              </div>
            )}

            {!loading && !selectedClass && (
              <div className="text-center py-8 text-slate-500">
                <UserCheck className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                <p>Pilih kelas untuk mulai absensi manual</p>
                <p className="text-sm text-slate-400 mt-1">
                  Guru dapat menandai status setiap siswa: Hadir, Izin, Sakit, atau Alpa
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Success state */
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Absensi Berhasil Disimpan!</h3>
            <p className="text-slate-500 mb-2">
              {classes.find((c) => c.value === selectedClass)?.label} -{' '}
              {subjects.find((s) => s.value === selectedSubject)?.label}
            </p>
            <div className="flex justify-center gap-4 mb-6">
              <span className="text-green-600 font-medium">{summary.hadir} Hadir</span>
              <span className="text-sky-500 font-medium">{summary.izin} Izin</span>
              <span className="text-yellow-600 font-medium">{summary.sakit} Sakit</span>
              <span className="text-red-600 font-medium">{summary.alpha} Alpa</span>
            </div>
            <Button onClick={handleReset} leftIcon={<UserCheck className="w-4 h-4" />}>
              Buat Absensi Baru
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
