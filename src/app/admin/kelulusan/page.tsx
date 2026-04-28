'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input, Select, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { classAPI, graduationAPI } from '@/services/api';
import {
  GraduationCap,
  Search,
  Check,
  X,
  Clock,
  Loader2,
  Save,
  Edit2,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
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
  skl_path?: string;
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<{ status: string; notes: string }>({
    status: '',
    notes: '',
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkFormData, setBulkFormData] = useState<{ status: 'lulus' | 'tidak_lulus'; notes: string }>({
    status: 'lulus',
    notes: '',
  });
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClass) {
      fetchGraduations();
    }
  }, [selectedClass]);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const response = await classAPI.getAll();
      setClasses(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
      toast.error('Gagal memuat data kelas');
    } finally {
      setLoading(false);
    }
  };

  const fetchGraduations = async () => {
    if (!selectedClass) return;
    
    try {
      setSearching(true);
      const response = await graduationAPI.getByClass(selectedClass.id);
      setGraduations(response.data?.data || []);
      setSelectedStudents(new Set());
    } catch (error) {
      console.error('Failed to fetch graduations:', error);
      toast.error('Gagal memuat data kelulusan');
    } finally {
      setSearching(false);
    }
  };

  const filteredGraduations = graduations.filter(g =>
    g.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.student.nisn?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.student.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleEditClick = (graduation: StudentGraduation) => {
    setEditingId(graduation.id);
    setEditFormData({
      status: graduation.status,
      notes: graduation.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedClass || editingId === null) return;

    const graduation = graduations.find(g => g.id === editingId);
    if (!graduation) return;

    try {
      setIsSaving(true);
      await graduationAPI.setGraduationStatus(
        graduation.student.id,
        selectedClass.id,
        {
          status: editFormData.status as 'lulus' | 'tidak_lulus',
          notes: editFormData.notes,
        }
      );
      toast.success('Status kelulusan berhasil diperbarui');
      setIsEditModalOpen(false);
      setEditingId(null);
      fetchGraduations();
    } catch (error) {
      console.error('Failed to save graduation:', error);
      toast.error('Gagal menyimpan status kelulusan');
    } finally {
      setIsSaving(false);
    }
  };

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
    } catch (error) {
      console.error('Failed to bulk save graduations:', error);
      toast.error('Gagal menyimpan status kelulusan');
    } finally {
      setIsBulkSaving(false);
    }
  };

  const toggleStudentSelection = (studentId: number) => {
    const newSelected = new Set(selectedStudents);
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId);
    } else {
      newSelected.add(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedStudents.size === filteredGraduations.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(filteredGraduations.map(g => g.student.id)));
    }
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
            Tentukan status kelulusan siswa dan generate SKL otomatis
          </p>
        </div>

        {/* Class Selection */}
        <Card className="p-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Pilih Kelas
          </label>
          <Select
            value={selectedClass?.id.toString() || ''}
            onChange={(event) => {
              const cls = classes.find(c => c.id === Number(event.target.value));
              setSelectedClass(cls || null);
            }}
            options={[
              { value: '', label: '-- Pilih Kelas --' },
              ...classes.map(cls => ({
                value: cls.id.toString(),
                label: `${cls.name} (${cls.academic_year})`,
              })),
            ]}
          />
        </Card>

        {selectedClass && (
          <>
            {/* Search and Actions */}
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
                  {searchQuery ? 'Tidak ada siswa yang sesuai' : 'Tidak ada data kelulusan'}
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredGraduations.map((graduation) => (
                  <Card
                    key={graduation.id}
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
                          <div className="flex items-center gap-2 mb-1">
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
                            {graduation.notes && <p className="text-teal-600 dark:text-teal-400">Catatan: {graduation.notes}</p>}
                            {graduation.decided_at && (
                              <p className="text-slate-500 dark:text-slate-500">
                                Diputuskan oleh {graduation.decided_by} pada {new Date(graduation.decided_at).toLocaleDateString('id-ID')}
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
                    {graduations.filter(g => g.status === 'lulus').length}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Lulus</p>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-red-600 mb-1">
                    {graduations.filter(g => g.status === 'tidak_lulus').length}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Tidak Lulus</p>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-600 mb-1">
                    {graduations.filter(g => g.status === 'pending').length}
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Menunggu Keputusan</p>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingId(null);
        }}
        title="Ubah Status Kelulusan"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Status
            </label>
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
            <Button
              variant="outline"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingId(null);
              }}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSaving}
              isLoading={isSaving}
              loadingText="Menyimpan..."
            >
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
              onChange={(event) => setBulkFormData({ ...bulkFormData, status: event.target.value as 'lulus' | 'tidak_lulus' })}
              options={[
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
            <Button
              variant="outline"
              onClick={() => setIsBulkModalOpen(false)}
              disabled={isBulkSaving}
            >
              Batal
            </Button>
            <Button
              onClick={handleBulkSave}
              disabled={isBulkSaving}
              isLoading={isBulkSaving}
              loadingText="Menyimpan..."
            >
              <Save className="w-4 h-4 mr-2" />
              Simpan untuk {selectedStudents.size} Siswa
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
