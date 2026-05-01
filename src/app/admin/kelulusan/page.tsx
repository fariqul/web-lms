'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input, Select, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { classAPI, graduationAPI } from '@/services/api';
import {
  GraduationCap,
  Search,
  Clock,
  Loader2,
  Save,
  Edit2,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from 'lucide-react';

interface Student {
  id: number;
  name: string;
  nisn: string;
  email: string;
}

interface Class {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  students_count?: number;
}

interface StudentGraduation {
  id: number;
  student: Student;
  status: 'pending' | 'lulus' | 'tidak_lulus';
  status_label: string;
  notes?: string;
  decided_at?: string;
  decided_by?: string;
}

export default function AdminGraduationPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [graduations, setGraduations] = useState<StudentGraduation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Pickup message state
  const [pickupMessage, setPickupMessage] = useState('');
  const [isSavingMessage, setIsSavingMessage] = useState(false);

  // Edit single student
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<{ status: string; notes: string }>({ status: '', notes: '' });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Bulk edit
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkFormData, setBulkFormData] = useState<{ status: 'lulus' | 'tidak_lulus' | 'pending'; notes: string }>({
    status: 'lulus',
    notes: '',
  });
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Announcement settings
  const [announcementActive, setAnnouncementActive] = useState(false);
  const [announcementDatetime, setAnnouncementDatetime] = useState('');
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);

  useEffect(() => {
    fetchClasses();
    fetchAnnouncementSettings();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchGraduations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const response = await classAPI.getAll();
      setClasses(response.data?.data || []);
    } catch {
      toast.error('Gagal memuat data kelas');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnnouncementSettings = async () => {
    try {
      const response = await graduationAPI.getAnnouncementSettings();
      const data = response.data?.data;
      setAnnouncementActive(data?.active ?? false);
      if (data?.datetime) {
        // Convert UTC to local datetime-local format
        const local = new Date(data.datetime);
        const offset = local.getTimezoneOffset() * 60000;
        const localISO = new Date(local.getTime() - offset).toISOString().slice(0, 16);
        setAnnouncementDatetime(localISO);
      }
    } catch {
      // Settings may not exist yet
    }
  };

  const saveAnnouncementSettings = async () => {
    try {
      setIsSavingAnnouncement(true);
      await graduationAPI.updateAnnouncementSettings({
        active: announcementActive,
        datetime: announcementDatetime ? new Date(announcementDatetime).toISOString() : null,
      });
      toast.success('Pengaturan pengumuman berhasil disimpan');
    } catch {
      toast.error('Gagal menyimpan pengaturan pengumuman');
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const fetchGraduations = useCallback(async () => {
    if (!selectedClass) return;
    try {
      setSearching(true);
      const response = await graduationAPI.getByClass(selectedClass.id);
      setGraduations(response.data?.data || []);
      setPickupMessage(response.data?.pickup_message || '');
      setSelectedStudents(new Set());
    } catch {
      toast.error('Gagal memuat data kelulusan');
    } finally {
      setSearching(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass]);

  const filteredGraduations = graduations.filter(
    (g) =>
      g.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.student.nisn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.student.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  /* ---- Pickup Message ---- */
  const handleSavePickupMessage = async () => {
    if (!selectedClass) return;
    try {
      setIsSavingMessage(true);
      await graduationAPI.updatePickupMessage(selectedClass.id, pickupMessage || null);
      toast.success('Pesan pengambilan SKL berhasil disimpan');
    } catch {
      toast.error('Gagal menyimpan pesan');
    } finally {
      setIsSavingMessage(false);
    }
  };

  /* ---- Single Edit ---- */
  const handleEditClick = (graduation: StudentGraduation) => {
    setEditingStudentId(graduation.student.id);
    setEditFormData({ status: graduation.status, notes: graduation.notes || '' });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedClass || editingStudentId === null) return;
    try {
      setIsSaving(true);
      await graduationAPI.setGraduationStatus(editingStudentId, selectedClass.id, {
        status: editFormData.status as 'lulus' | 'tidak_lulus' | 'pending',
        notes: editFormData.notes,
      });
      toast.success('Status kelulusan berhasil diperbarui');
      setIsEditModalOpen(false);
      setEditingStudentId(null);
      fetchGraduations();
    } catch {
      toast.error('Gagal menyimpan status kelulusan');
    } finally {
      setIsSaving(false);
    }
  };

  /* ---- Bulk Edit ---- */
  const handleBulkSave = async () => {
    if (!selectedClass || selectedStudents.size === 0) {
      toast.warning('Pilih minimal satu siswa');
      return;
    }
    try {
      setIsBulkSaving(true);
      await graduationAPI.bulkSetGraduationStatus({
        class_id: selectedClass.id,
        student_ids: Array.from(selectedStudents),
        status: bulkFormData.status,
        notes: bulkFormData.notes,
      });
      toast.success(`Status kelulusan berhasil diperbarui untuk ${selectedStudents.size} siswa`);
      setIsBulkModalOpen(false);
      setSelectedStudents(new Set());
      fetchGraduations();
    } catch {
      toast.error('Gagal menyimpan status kelulusan');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const toggleStudentSelection = (studentId: number) => {
    const next = new Set(selectedStudents);
    next.has(studentId) ? next.delete(studentId) : next.add(studentId);
    setSelectedStudents(next);
  };

  const toggleSelectAll = () => {
    setSelectedStudents(
      selectedStudents.size === filteredGraduations.length
        ? new Set()
        : new Set(filteredGraduations.map((g) => g.student.id))
    );
  };

  const getStatusIcon = (status: string) => {
    if (status === 'lulus') return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (status === 'tidak_lulus') return <XCircle className="w-5 h-5 text-red-600" />;
    return <Clock className="w-5 h-5 text-yellow-600" />;
  };

  const getStatusBadgeColor = (status: string) => {
    if (status === 'lulus') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status === 'tidak_lulus') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <GraduationCap className="w-8 h-8 text-teal-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              Kelola Kelulusan Siswa
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Tentukan status kelulusan dan atur pesan informasi pengambilan SKL per kelas
          </p>
        </div>

        {/* Announcement Settings */}
        <Card className="p-4 border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Pengaturan Pengumuman Publik</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Atur countdown dan visibilitas halaman pengumuman kelulusan</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Status</label>
              <label className="inline-flex items-center gap-3 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={announcementActive}
                    onChange={(e) => setAnnouncementActive(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-checked:bg-teal-500 rounded-full transition-colors" />
                  <div className="absolute left-[2px] top-[2px] bg-white w-5 h-5 rounded-full transition-transform peer-checked:translate-x-full shadow" />
                </div>
                <span className={`text-sm font-medium ${announcementActive ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500'}`}>
                  {announcementActive ? 'Aktif' : 'Nonaktif'}
                </span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Waktu Pengumuman
              </label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                value={announcementDatetime}
                onChange={(e) => setAnnouncementDatetime(e.target.value)}
              />
            </div>

            <div>
              <Button
                onClick={saveAnnouncementSettings}
                disabled={isSavingAnnouncement}
                isLoading={isSavingAnnouncement}
                loadingText="Menyimpan..."
                className="w-full"
              >
                <Save className="w-4 h-4 mr-1" /> Simpan Pengaturan
              </Button>
            </div>
          </div>

          {announcementActive && (
            <div className="mt-3 p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200/60 dark:border-teal-800/40">
              <p className="text-xs text-teal-700 dark:text-teal-300">
                ✓ Halaman pengumuman publik aktif di{' '}
                <a href="/pengumuman-kelulusan" target="_blank" className="underline font-medium">/pengumuman-kelulusan</a>
                {announcementDatetime && (
                  <> — Countdown hingga {new Date(announcementDatetime).toLocaleString('id-ID', {
                    dateStyle: 'long', timeStyle: 'short',
                  })}</>
                )}
              </p>
            </div>
          )}
        </Card>

        {/* Class Selection */}
        <Card className="p-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Pilih Kelas
          </label>
          <Select
            value={selectedClass?.id.toString() || ''}
            onChange={(event) => {
              const cls = classes.find((c) => c.id === Number(event.target.value));
              setSelectedClass(cls || null);
              setPickupMessage('');
            }}
            options={[
              { value: '', label: '-- Pilih Kelas --' },
              ...classes.map((cls) => ({
                value: cls.id.toString(),
                label: `${cls.name} (${cls.academic_year})`,
              })),
            ]}
          />
        </Card>

        {selectedClass && (
          <>
            {/* ====== PESAN PENGAMBILAN SKL ====== */}
            <Card className="p-4 border-2 border-teal-200 dark:border-teal-800">
              <div className="flex items-start gap-3 mb-3">
                <MessageSquare className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-white">
                    Pesan Informasi Pengambilan SKL
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Pesan ini akan tampil di bawah status kelulusan siswa yang <strong>Lulus</strong> dari kelas ini.
                    Contoh: &ldquo;Pengambilan SKL dilakukan pada tanggal 10 Juni 2026, jam 08.00–12.00 WIB. Wajib berpakaian rapi.&rdquo;
                  </p>
                </div>
              </div>
              <textarea
                value={pickupMessage}
                onChange={(e) => setPickupMessage(e.target.value)}
                placeholder={`Contoh: Pengambilan SKL kelas ${selectedClass.name} dilakukan pada tanggal ..., jam ..., di ruang ..., wajib berpakaian rapi dan membawa kartu pelajar.`}
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm resize-none"
              />
              <div className="flex justify-end mt-3">
                <Button
                  onClick={handleSavePickupMessage}
                  disabled={isSavingMessage}
                  isLoading={isSavingMessage}
                  loadingText="Menyimpan..."
                  className="flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Simpan Pesan
                </Button>
              </div>
            </Card>

            {/* Search and Bulk Actions */}
            <Card className="p-4">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <Input
                      placeholder="Cari siswa..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      leftIcon={<Search className="w-4 h-4" />}
                    />
                  </div>
                  {selectedStudents.size > 0 && (
                    <Button
                      onClick={() => setIsBulkModalOpen(true)}
                      variant="secondary"
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Ubah {selectedStudents.size} Siswa
                    </Button>
                  )}
                </div>

                {filteredGraduations.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={selectedStudents.size === filteredGraduations.length && filteredGraduations.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 accent-teal-600"
                    />
                    <span>
                      {selectedStudents.size > 0
                        ? `${selectedStudents.size} siswa dipilih`
                        : `Pilih semua ${filteredGraduations.length} siswa`}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            {/* Graduations List */}
            {searching ? (
              <Card className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto" />
                <p className="text-slate-600 dark:text-slate-400 mt-2">Memuat data...</p>
              </Card>
            ) : filteredGraduations.length === 0 ? (
              <Card className="p-8 text-center">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-400">
                  {searchQuery ? 'Tidak ada siswa yang sesuai' : 'Tidak ada data siswa di kelas ini'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredGraduations.map((graduation) => (
                  <Card
                    key={graduation.student.id}
                    className="p-4 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(graduation.student.id)}
                          onChange={() => toggleStudentSelection(graduation.student.id)}
                          className="w-4 h-4 rounded border-slate-300 accent-teal-600 mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                              {graduation.student.name}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusBadgeColor(graduation.status)}`}>
                              {getStatusIcon(graduation.status)}
                              {graduation.status_label}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                            <p>NISN: {graduation.student.nisn}</p>
                            <p>Email: {graduation.student.email}</p>
                            {graduation.notes && (
                              <p className="text-teal-600 dark:text-teal-400">Catatan: {graduation.notes}</p>
                            )}
                            {graduation.decided_at && (
                              <p className="text-slate-500">
                                Diputuskan oleh {graduation.decided_by} pada{' '}
                                {new Date(graduation.decided_at).toLocaleDateString('id-ID')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditClick(graduation)}
                        className="flex items-center gap-2 whitespace-nowrap"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Stats */}
            {graduations.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-green-600 mb-1">
                    {graduations.filter((g) => g.status === 'lulus').length}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Lulus</p>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-red-600 mb-1">
                    {graduations.filter((g) => g.status === 'tidak_lulus').length}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Tidak Lulus</p>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-600 mb-1">
                    {graduations.filter((g) => g.status === 'pending').length}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Menunggu Keputusan</p>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Single Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setEditingStudentId(null); }}
        title="Ubah Status Kelulusan"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
            <Select
              value={editFormData.status}
              onChange={(event) => setEditFormData({ ...editFormData, status: event.target.value })}
              options={[
                { value: 'pending', label: 'Menunggu Keputusan' },
                { value: 'lulus', label: 'Lulus' },
                { value: 'tidak_lulus', label: 'Tidak Lulus' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Catatan (Opsional)
            </label>
            <textarea
              value={editFormData.notes}
              onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
              placeholder="Catatan untuk siswa..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setIsEditModalOpen(false); setEditingStudentId(null); }} disabled={isSaving}>
              Batal
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving} isLoading={isSaving} loadingText="Menyimpan...">
              <Save className="w-4 h-4 mr-2" />
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Edit Modal */}
      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title={`Ubah Status ${selectedStudents.size} Siswa`}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Status untuk {selectedStudents.size} siswa
            </label>
            <Select
              value={bulkFormData.status}
              onChange={(event) => setBulkFormData({ ...bulkFormData, status: event.target.value as 'lulus' | 'tidak_lulus' | 'pending' })}
              options={[
                { value: 'pending', label: 'Menunggu Keputusan' },
                { value: 'lulus', label: 'Lulus' },
                { value: 'tidak_lulus', label: 'Tidak Lulus' },
              ]}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Catatan (Opsional)
            </label>
            <textarea
              value={bulkFormData.notes}
              onChange={(e) => setBulkFormData({ ...bulkFormData, notes: e.target.value })}
              placeholder="Catatan untuk semua siswa..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsBulkModalOpen(false)} disabled={isBulkSaving}>
              Batal
            </Button>
            <Button onClick={handleBulkSave} disabled={isBulkSaving} isLoading={isBulkSaving} loadingText="Menyimpan...">
              <Save className="w-4 h-4 mr-2" />
              Simpan untuk {selectedStudents.size} Siswa
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
