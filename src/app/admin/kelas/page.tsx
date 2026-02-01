'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, Users, Download, Loader2 } from 'lucide-react';
import { classAPI } from '@/services/api';

interface ClassRoom {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  students_count?: number;
}

const gradeOptions = [
  { value: '', label: 'Semua Kelas' },
  { value: 'X', label: 'Kelas X' },
  { value: 'XI', label: 'Kelas XI' },
  { value: 'XII', label: 'Kelas XII' },
];

export default function AdminKelasPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    } catch (error) {
      console.error('Failed to save class:', error);
      alert('Gagal menyimpan data kelas');
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
    } catch (error) {
      console.error('Failed to delete class:', error);
      alert('Gagal menghapus kelas');
    }
  };

  const columns = [
    { key: 'name', header: 'Nama Kelas' },
    { key: 'grade_level', header: 'Tingkat' },
    { key: 'academic_year', header: 'Tahun Ajaran' },
    {
      key: 'students_count',
      header: 'Jumlah Siswa',
      render: (item: ClassRoom) => (
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span>{item.students_count || 0} siswa</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (item: ClassRoom) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
            <p className="text-3xl font-bold text-orange-600">{classes.length}</p>
            <p className="text-sm text-gray-500">Total Kelas</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-blue-600">{totalStudents}</p>
            <p className="text-sm text-gray-500">Total Siswa</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {classes.filter((c) => c.grade_level === 'XII').length}
            </p>
            <p className="text-sm text-gray-500">Kelas XII</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-purple-600">
              {classes.filter((c) => c.grade_level === 'XI').length}
            </p>
            <p className="text-sm text-gray-500">Kelas XI</p>
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
                placeholder="Cari nama kelas..."
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
                  Menyimpan...
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
    </DashboardLayout>
  );
}
