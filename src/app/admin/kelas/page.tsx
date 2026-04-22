'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, Users, Download, Loader2, Eye, Upload } from 'lucide-react';
import { classAPI, getSecureFileUrl } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/api-error';

interface Student {
  id: number;
  name: string;
  nisn: string;
  email: string;
  photo?: string | null;
  avatar?: string | null;
}

interface ClassRoom {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  students_count?: number;
  students?: Student[];
}

interface ClassImportPreviewRow {
  row: number;
  action: 'create' | 'update';
  name: string;
}

interface ClassImportPreviewError {
  row?: number;
  message: string;
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreviewToken, setImportPreviewToken] = useState('');
  const [importSummary, setImportSummary] = useState<{ total_rows: number; to_create: number; to_update: number; to_skip: number } | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<ClassImportPreviewRow[]>([]);
  const [importPreviewErrors, setImportPreviewErrors] = useState<ClassImportPreviewError[]>([]);
  const [isImportProcessing, setIsImportProcessing] = useState(false);
  const [brokenStudentPhotoIds, setBrokenStudentPhotoIds] = useState<Record<number, boolean>>({});
  const [profilePreview, setProfilePreview] = useState<{ src: string; name: string } | null>(null);
  const [isProfilePreviewBroken, setIsProfilePreviewBroken] = useState(false);
  const [isProfilePreviewClosing, setIsProfilePreviewClosing] = useState(false);
  const [profilePreviewFitMode, setProfilePreviewFitMode] = useState<'contain' | 'cover'>('contain');
  const profilePreviewCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    grade_level: '',
    academic_year: '2025/2026',
  });

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    return () => {
      if (profilePreviewCloseTimerRef.current) {
        clearTimeout(profilePreviewCloseTimerRef.current);
        profilePreviewCloseTimerRef.current = null;
      }
    };
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

  const openProfilePreview = (name: string, rawUrl?: string | null) => {
    const safeUrl = getSecureFileUrl(rawUrl);
    if (!safeUrl) return;

    if (profilePreviewCloseTimerRef.current) {
      clearTimeout(profilePreviewCloseTimerRef.current);
      profilePreviewCloseTimerRef.current = null;
    }

    setIsProfilePreviewClosing(false);
    setIsProfilePreviewBroken(false);
    setProfilePreviewFitMode('contain');
    setProfilePreview({ src: safeUrl, name });
  };

  const toggleProfilePreviewFitMode = () => {
    if (isProfilePreviewBroken) return;
    setProfilePreviewFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  };

  const closeProfilePreview = () => {
    if (!profilePreview || isProfilePreviewClosing) return;

    setIsProfilePreviewClosing(true);

    if (profilePreviewCloseTimerRef.current) {
      clearTimeout(profilePreviewCloseTimerRef.current);
    }

    profilePreviewCloseTimerRef.current = setTimeout(() => {
      setProfilePreview(null);
      setIsProfilePreviewBroken(false);
      setIsProfilePreviewClosing(false);
      setProfilePreviewFitMode('contain');
      profilePreviewCloseTimerRef.current = null;
    }, 180);
  };

  const resetImportState = () => {
    setImportFile(null);
    setImportPreviewToken('');
    setImportSummary(null);
    setImportPreviewRows([]);
    setImportPreviewErrors([]);
    setIsImportProcessing(false);
  };

  const handleExportClasses = async (format: 'xlsx' | 'csv') => {
    try {
      const res = await classAPI.exportData({
        format,
        grade_level: gradeFilter || undefined,
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `classes_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Export kelas ${format.toUpperCase()} berhasil`);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal export kelas'));
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) {
      toast.warning('Pilih file import terlebih dahulu');
      return;
    }
    try {
      setIsImportProcessing(true);
      const res = await classAPI.importPreview(importFile);
      const data = res.data?.data;
      setImportPreviewToken(data?.preview_token || '');
      setImportSummary(data?.summary || null);
      setImportPreviewRows(Array.isArray(data?.preview_rows) ? data.preview_rows : []);
      setImportPreviewErrors(Array.isArray(data?.errors) ? data.errors : []);
      toast.success('Preview import kelas berhasil dibuat');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal membuat preview import kelas'));
    } finally {
      setIsImportProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreviewToken) {
      toast.warning('Silakan lakukan preview sebelum konfirmasi import');
      return;
    }
    try {
      setIsImportProcessing(true);
      const res = await classAPI.importConfirm(importPreviewToken);
      toast.success(res.data?.message || 'Import kelas selesai');
      setIsImportModalOpen(false);
      resetImportState();
      fetchClasses();
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal konfirmasi import kelas'));
    } finally {
      setIsImportProcessing(false);
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
                  leftIcon={<Upload className="w-4 h-4" />}
                  onClick={() => {
                    resetImportState();
                    setIsImportModalOpen(true);
                  }}
                >
                  Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() => handleExportClasses('xlsx')}
                >
                  Export XLSX
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() => handleExportClasses('csv')}
                >
                  Export CSV
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

      {/* Import Classes Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          resetImportState();
        }}
        title="Import Kelas (XLSX/CSV)"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Upload file kelas dengan header: <code>name,grade_level,academic_year</code>.
            </p>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white hover:file:bg-sky-700"
            />
          </div>

          {importSummary && (
            <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4">
              <p className="text-sm font-semibold text-sky-800 dark:text-sky-300 mb-2">Ringkasan Preview</p>
              <p className="text-sm text-sky-700 dark:text-sky-300">
                Total {importSummary.total_rows} baris • Buat baru {importSummary.to_create} • Update {importSummary.to_update} • Skip {importSummary.to_skip}
              </p>
              <p className="text-xs mt-1 text-sky-600 dark:text-sky-400">
                {importSummary.to_update} data akan diupdate, lanjut?
              </p>
            </div>
          )}

          {importPreviewRows.length > 0 && (
            <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-3 py-2">Baris</th>
                    <th className="text-left px-3 py-2">Aksi</th>
                    <th className="text-left px-3 py-2">Nama Kelas</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreviewRows.map((item, idx) => (
                    <tr key={`${item.row}-${idx}`} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">{item.row}</td>
                      <td className="px-3 py-2">{item.action === 'update' ? 'Update' : 'Create'}</td>
                      <td className="px-3 py-2">{item.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importPreviewErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 max-h-40 overflow-auto">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Baris Dilewati</p>
              <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                {importPreviewErrors.slice(0, 20).map((err, idx) => (
                  <li key={`err-${idx}`}>Baris {err.row ?? '-'}: {err.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreviewImport}
              disabled={isImportProcessing}
            >
              {isImportProcessing ? 'Memproses…' : 'Preview Import'}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmImport}
              disabled={!importPreviewToken || isImportProcessing}
            >
              {isImportProcessing ? 'Mengimport…' : 'Konfirmasi Import'}
            </Button>
          </div>
        </div>
      </Modal>

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
                              {(student.photo || student.avatar) && !brokenStudentPhotoIds[student.id] ? (
                                <button
                                  type="button"
                                  onClick={() => openProfilePreview(student.name, student.photo || student.avatar)}
                                  title="Klik untuk perbesar foto profil"
                                  className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700 shrink-0 cursor-zoom-in"
                                >
                                  <Image
                                    src={getSecureFileUrl(student.photo || student.avatar)}
                                    alt={`Foto profil ${student.name}`}
                                    width={28}
                                    height={28}
                                    className="w-full h-full object-cover"
                                    onError={() => {
                                      setBrokenStudentPhotoIds((prev) => ({ ...prev, [student.id]: true }));
                                    }}
                                  />
                                </button>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
                                  <span className="text-white text-[11px] font-semibold">
                                    {student.name?.charAt(0)?.toUpperCase() || '?'}
                                  </span>
                                </div>
                              )}
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

      {/* Profile Photo Preview Modal */}
      <Modal
        isOpen={!!profilePreview}
        onClose={closeProfilePreview}
        title={`Foto Profil${profilePreview?.name ? `: ${profilePreview.name}` : ''}`}
        size="md"
        overlayClassName={isProfilePreviewClosing ? 'animate-backdropFadeOut' : 'animate-backdropFadeIn'}
      >
        {profilePreview && (
          <div className={`space-y-3 ${isProfilePreviewClosing ? 'animate-zoomOutSoft' : 'animate-zoomInSoft'}`}>
            <div className="w-full max-w-md mx-auto aspect-square rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
              {isProfilePreviewBroken ? (
                <div className="text-center text-slate-500 dark:text-slate-400 px-4">
                  <p className="text-sm">Foto profil tidak dapat dimuat.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={toggleProfilePreviewFitMode}
                  title="Klik untuk ubah mode tampilan foto"
                  className="w-full h-full relative cursor-zoom-in"
                >
                  <Image
                    src={profilePreview.src}
                    alt={`Foto profil ${profilePreview.name}`}
                    width={640}
                    height={640}
                    className={`w-full h-full transition-all duration-200 ${profilePreviewFitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                    onError={() => setIsProfilePreviewBroken(true)}
                  />
                  <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 text-white text-[10px] font-medium">
                    {profilePreviewFitMode === 'contain' ? 'Mode: Fit' : 'Mode: Fill'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">{profilePreview.name}</p>
            {!isProfilePreviewBroken && (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Klik foto untuk ubah mode tampilan.
              </p>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
