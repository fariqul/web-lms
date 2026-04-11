'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, Users, Download, Loader2, Eye, User } from 'lucide-react';
import { classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface Student {
  id: number;
  name: string;
  nisn: string;
  email: string;
}

interface ClassRoom {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  students_count?: number;
  students?: Student[];
}

const gradeOptions = [
  { value: '', label: 'Semua Kelas' },
  { value: 'X', label: 'Kelas X' },
  { value: 'XI', label: 'Kelas XI' },
  { value: 'XII', label: 'Kelas XII' },
];

export default function AdminKelasPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Detail modal state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailClass, setDetailClass] = useState<ClassRoom | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    grade_level: '',
    academic_year: '2025/2026',
  });

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const response = await classAPI.getAll();
      setClasses(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClasses = classes.filter((cls) => {
    const matchesSearch = cls.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGrade = !gradeFilter || cls.grade_level === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  const totalStudents = filteredClasses.reduce((sum, cls) => sum + (cls.students_count || 0), 0);

  const handleOpenModal = (cls?: ClassRoom) => {
    if (cls) {
      setSelectedClass(cls);
      setFormData({
        name: cls.name,
        grade_level: cls.grade_level,
        academic_year: cls.academic_year,
      });
    } else {
      setSelectedClass(null);
      setFormData({
        name: '',
        grade_level: '',
        academic_year: '2025/2026',
      });
    }
    setIsModalOpen(true);
  };

  const handleDeleteClick = (cls: ClassRoom) => {
    setSelectedClass(cls);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (selectedClass) {
        await classAPI.update(selectedClass.id, formData);
      } else {
        await classAPI.create(formData);
      }
      setIsModalOpen(false);
      fetchClasses(); // Refresh data
    } catch {
      toast.error('Gagal menyimpan data kelas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedClass) return;
    try {
      await classAPI.delete(selectedClass.id);
      setIsDeleteDialogOpen(false);
      fetchClasses(); // Refresh data
    } catch {
      toast.error('Gagal menghapus kelas');
    }
  };

  const handleViewDetail = async (cls: ClassRoom) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setStudentSearch('');
    try {
      const response = await classAPI.getById(cls.id);
      setDetailClass(response.data?.data || null);
    } catch {
      toast.error('Gagal memuat detail kelas');
      setDetailClass(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredStudents = detailClass?.students?.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.nisn?.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email?.toLowerCase().includes(studentSearch.toLowerCase())
  ) || [];

  const columns = [
    { key: 'name', header: 'Nama Kelas' },
    { key: 'grade_level', header: 'Tingkat' },
    { key: 'academic_year', header: 'Tahun Ajaran' },
    {
      key: 'students_count',
      header: 'Jumlah Siswa',
      render: (item: ClassRoom) => (
        <button
          onClick={() => handleViewDetail(item)}
          className="flex items-center gap-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
        >
          <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <span className="underline underline-offset-2">{item.students_count || 0} siswa</span>
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (item: ClassRoom) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleViewDetail(item)}
            className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Lihat detail kelas"
            title="Lihat detail"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
            aria-label="Edit kelas"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            aria-label="Hapus kelas"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

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
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{classes.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Kelas</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-sky-500">{totalStudents}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Siswa</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {classes.filter((c) => c.grade_level === 'XII').length}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Kelas XII</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {classes.filter((c) => c.grade_level === 'XI').length}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Kelas XI</p>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Kelola Kelas"
            subtitle={`${filteredClasses.length} kelas terdaftar`}
            action={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                >
                  Export
                </Button>
                <Button
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => handleOpenModal()}
                >
                  Tambah Kelas
                </Button>
              </div>
            }
          />

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Cari nama kelas…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="w-full md:w-48">
              <Select
                options={gradeOptions}
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <Table
            columns={columns}
            data={filteredClasses}
            keyExtractor={(item) => item.id}
          />
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedClass ? 'Edit Kelas' : 'Tambah Kelas'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nama Kelas"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Contoh: XII IPA 1"
            required
          />
          <Select
            label="Tingkat"
            options={[
              { value: '', label: 'Pilih Tingkat' },
              { value: 'X', label: 'Kelas X' },
              { value: 'XI', label: 'Kelas XI' },
              { value: 'XII', label: 'Kelas XII' },
            ]}
            value={formData.grade_level}
            onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
          />
          <Input
            label="Tahun Ajaran"
            value={formData.academic_year}
            onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
            placeholder="Contoh: 2025/2026"
            required
          />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan…
                </>
              ) : selectedClass ? (
                'Simpan Perubahan'
              ) : (
                'Tambah Kelas'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Kelas"
        message={`Apakah Anda yakin ingin menghapus kelas ${selectedClass?.name}? Semua data siswa di kelas ini akan terpengaruh.`}
        confirmText="Hapus"
        variant="danger"
      />

      {/* Detail Class Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Detail Kelas: ${detailClass?.name || ''}`}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : detailClass ? (
          <div className="space-y-4">
            {/* Class Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tingkat</p>
                <p className="font-medium text-slate-900 dark:text-white">Kelas {detailClass.grade_level}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tahun Ajaran</p>
                <p className="font-medium text-slate-900 dark:text-white">{detailClass.academic_year}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Siswa</p>
                <p className="font-medium text-slate-900 dark:text-white">{detailClass.students_count || detailClass.students?.length || 0} siswa</p>
              </div>
            </div>

            {/* Students List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900 dark:text-white">Daftar Siswa</h4>
                <div className="w-48">
                  <Input
                    placeholder="Cari siswa..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    leftIcon={<Search className="w-4 h-4" />}
                  />
                </div>
              </div>
              
              {filteredStudents.length > 0 ? (
                <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">No</th>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">Nama</th>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">NISN</th>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredStudents.map((student, idx) => (
                        <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center">
                                <User className="w-3.5 h-3.5 text-white" />
                              </div>
                              <span className="font-medium text-slate-900 dark:text-white">{student.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{student.nisn || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{student.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{studentSearch ? 'Tidak ada siswa yang cocok' : 'Belum ada siswa di kelas ini'}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>Gagal memuat data kelas</p>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
