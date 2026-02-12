'use client';

import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input, ConfirmDialog } from '@/components/ui';
import { 
  BookOpen, 
  Plus, 
  Search, 
  FileText, 
  Video, 
  Download, 
  Trash2, 
  Edit, 
  Upload,
  Eye,
  X,
  Loader2,
  Link as LinkIcon,
  ExternalLink,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { classAPI, materialAPI, getSecureFileUrl } from '@/services/api';
import { SUBJECT_LIST } from '@/constants/subjects';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

interface Material {
  id: number;
  title: string;
  description: string;
  subject: string;
  type: 'document' | 'video' | 'link';
  file_url?: string;
  teacher_id: number;
  class_id: number;
  created_at: string;
  teacher?: {
    id: number;
    name: string;
  };
  class_room?: {
    id: number;
    name: string;
  };
}

interface ClassOption {
  value: string;
  label: string;
}

export default function MateriPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject: '',
    class_id: '',
    type: 'document' as 'document' | 'video' | 'link',
    file_url: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch classes
      const classesRes = await classAPI.getAll();
      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );

      // Fetch materials
      const materialsRes = await materialAPI.getAll();
      const materialsData = materialsRes.data?.data?.data || materialsRes.data?.data || [];
      setMaterials(materialsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      subject: '',
      class_id: '',
      type: 'document',
      file_url: '',
    });
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file size (100MB max)
      if (file.size > 100 * 1024 * 1024) {
        setError('Ukuran file maksimal 100MB');
        return;
      }
      
      setSelectedFile(file);
      setError('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const fakeEvent = {
        target: { files: [file] }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(fakeEvent);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // Validation
      if (!formData.title || !formData.subject || !formData.class_id) {
        setError('Judul, mata pelajaran, dan kelas wajib diisi');
        setSubmitting(false);
        return;
      }

      if (formData.type === 'link' && !formData.file_url) {
        setError('URL link wajib diisi untuk tipe Link Eksternal');
        setSubmitting(false);
        return;
      }

      if (formData.type !== 'link' && !selectedFile) {
        setError('File wajib diunggah untuk tipe dokumen atau video');
        setSubmitting(false);
        return;
      }

      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('subject', formData.subject);
      submitData.append('class_id', formData.class_id);
      submitData.append('type', formData.type);
      
      if (formData.type === 'link') {
        submitData.append('file_url', formData.file_url);
      } else if (selectedFile) {
        submitData.append('file', selectedFile);
      }

      await materialAPI.create(submitData);
      
      setSuccess('Materi berhasil ditambahkan!');
      setShowAddModal(false);
      resetForm();
      fetchData();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Failed to create material:', error);
      setError(error.response?.data?.message || 'Gagal menyimpan materi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMaterial) return;
    
    setError('');
    setSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append('_method', 'PUT');
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('subject', formData.subject);
      submitData.append('class_id', formData.class_id);
      submitData.append('type', formData.type);
      
      if (formData.type === 'link') {
        submitData.append('file_url', formData.file_url);
      } else if (selectedFile) {
        submitData.append('file', selectedFile);
      }

      await materialAPI.update(editingMaterial.id, submitData);
      
      setSuccess('Materi berhasil diperbarui!');
      setShowEditModal(false);
      setEditingMaterial(null);
      resetForm();
      fetchData();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Failed to update material:', error);
      setError(error.response?.data?.message || 'Gagal memperbarui materi');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    try {
      await materialAPI.delete(deleteId);
      setSuccess('Materi berhasil dihapus!');
      toast.success('Materi berhasil dihapus!');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Failed to delete material:', error);
      setError(error.response?.data?.message || 'Gagal menghapus materi');
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (material: Material) => {
    setEditingMaterial(material);
    setFormData({
      title: material.title,
      description: material.description || '',
      subject: material.subject,
      class_id: material.class_id.toString(),
      type: material.type,
      file_url: material.type === 'link' ? (material.file_url || '') : '',
    });
    setSelectedFile(null);
    setShowEditModal(true);
  };

  const openFile = async (material: Material) => {
    if (!material.file_url) return;
    
    if (material.type === 'link') {
      window.open(material.file_url, '_blank');
      return;
    }

    try {
      const response = await materialAPI.download(material.id);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Get filename from Content-Disposition header or use material title
      const contentDisposition = response.headers['content-disposition'];
      let filename = material.title;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) filename = match[1].replace(/['"]/g, '');
      } else {
        // Infer extension from file_url
        const ext = material.file_url.split('.').pop()?.split('?')[0];
        if (ext && !filename.endsWith(`.${ext}`)) {
          filename = `${filename}.${ext}`;
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(material.file_url, '_blank');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document': return <FileText className="w-5 h-5 text-blue-500" />;
      case 'video': return <Video className="w-5 h-5 text-red-500" />;
      case 'link': return <LinkIcon className="w-5 h-5 text-green-500" />;
      default: return <BookOpen className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'document': return 'Dokumen';
      case 'video': return 'Video';
      case 'link': return 'Link Eksternal';
      default: return type;
    }
  };

  const isTeacherOrAdmin = user?.role === 'guru' || user?.role === 'admin';

  // Render Form Component
  const renderForm = (isEdit: boolean = false) => (
    <form onSubmit={isEdit ? handleUpdate : handleSubmit} className="p-4 space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}
      
      <Input
        label="Judul Materi"
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        placeholder="Masukkan judul materi"
        required
      />
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Deskripsi singkat materi"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mata Pelajaran <span className="text-red-500">*</span></label>
          <select
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            required
          >
            <option value="">Pilih Mata Pelajaran</option>
            {SUBJECT_LIST.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Kelas</label>
          <select
            value={formData.class_id}
            onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            required
          >
            <option value="">Pilih Kelas</option>
            {classes.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Materi</label>
        <select
          value={formData.type}
          onChange={(e) => {
            setFormData({ ...formData, type: e.target.value as 'document' | 'video' | 'link', file_url: '' });
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
        >
          <option value="document">Dokumen (PDF, Word, dll)</option>
          <option value="video">Video</option>
          <option value="link">Link Eksternal</option>
        </select>
      </div>
      
      {/* Upload File Section - For Document or Video */}
      {formData.type !== 'link' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload {formData.type === 'document' ? 'Dokumen' : 'Video'}
          </label>
          <div 
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
              ${selectedFile ? 'border-teal-500 bg-teal-50' : 'border-gray-300 hover:border-teal-500'}`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              accept={formData.type === 'document' 
                ? '.pdf,.doc,.docx,.ppt,.pptx' 
                : '.mp4,.webm,.avi,.mov'}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <CheckCircle className="w-8 h-8 text-teal-500" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{selectedFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Klik atau drag & drop file di sini</p>
                <p className="text-xs text-gray-400 mt-1">
                  {formData.type === 'document' 
                    ? 'PDF, DOC, DOCX, PPT, PPTX (Max. 50MB)' 
                    : 'MP4, WEBM, AVI, MOV (Max. 50MB)'}
                </p>
              </>
            )}
          </div>
          {isEdit && !selectedFile && editingMaterial?.file_url && (
            <p className="text-sm text-gray-500 mt-2">
              File saat ini tersimpan. Kosongkan jika tidak ingin mengubah file.
            </p>
          )}
        </div>
      )}
      
      {/* External Link Section */}
      {formData.type === 'link' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL Link</label>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="url"
              value={formData.file_url}
              onChange={(e) => setFormData({ ...formData, file_url: e.target.value })}
              placeholder="https://example.com/materi"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Masukkan URL lengkap termasuk https://
          </p>
        </div>
      )}
      
      <div className="flex gap-3 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          className="flex-1" 
          onClick={() => {
            if (isEdit) {
              setShowEditModal(false);
              setEditingMaterial(null);
            } else {
              setShowAddModal(false);
            }
            resetForm();
            setError('');
          }}
          disabled={submitting}
        >
          Batal
        </Button>
        <Button type="submit" className="flex-1" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {isEdit ? 'Memperbarui…' : 'Menyimpan…'}
            </>
          ) : (
            isEdit ? 'Perbarui Materi' : 'Simpan Materi'
          )}
        </Button>
      </div>
    </form>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Success Message */}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Materi Pembelajaran</h1>
            <p className="text-gray-600">
              {isTeacherOrAdmin ? 'Kelola materi untuk siswa' : 'Akses materi pembelajaran'}
            </p>
          </div>
          {isTeacherOrAdmin && (
            <Button onClick={() => { resetForm(); setShowAddModal(true); }}>
              <Plus className="w-5 h-5 mr-2" />
              Tambah Materi
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Cari materi…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Materi</p>
                <p className="text-xl font-bold text-gray-900">{materials.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Video className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Video</p>
                <p className="text-xl font-bold text-gray-900">
                  {materials.filter(m => m.type === 'video').length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <LinkIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Link Eksternal</p>
                <p className="text-xl font-bold text-gray-900">
                  {materials.filter(m => m.type === 'link').length}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Materials List */}
        <div className="space-y-4">
          {filteredMaterials.length === 0 ? (
            <Card className="p-8 text-center">
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Belum ada materi</p>
              {isTeacherOrAdmin && (
                <p className="text-sm text-gray-400 mt-1">Klik tombol "Tambah Materi" untuk membuat materi baru</p>
              )}
            </Card>
          ) : (
            filteredMaterials.map((material) => (
              <Card key={material.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {getTypeIcon(material.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-gray-900">{material.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">{material.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2 py-1 bg-teal-100 text-teal-700 text-xs rounded-full">
                            {material.subject}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            {material.class_room?.name || '-'}
                          </span>
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">
                            {getTypeLabel(material.type)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {material.file_url && (
                          <button
                            onClick={() => openFile(material)}
                            className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                            title={material.type === 'link' ? 'Buka Link' : 'Download/Lihat'}
                          >
                            {material.type === 'link' ? (
                              <ExternalLink className="w-4 h-4" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedMaterial(material)}
                          className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                          title="Detail"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {isTeacherOrAdmin && (
                          <>
                            <button 
                              onClick={() => handleEdit(material)}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(material.id)}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Hapus"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span>Oleh: {material.teacher?.name || '-'}</span>
                      <span>•</span>
                      <span>
                        {new Date(material.created_at).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Add Material Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold">Tambah Materi Baru</h2>
                <button 
                  onClick={() => { setShowAddModal(false); resetForm(); setError(''); }} 
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderForm(false)}
            </Card>
          </div>
        )}

        {/* Edit Material Modal */}
        {showEditModal && editingMaterial && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold">Edit Materi</h2>
                <button 
                  onClick={() => { setShowEditModal(false); setEditingMaterial(null); resetForm(); setError(''); }} 
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {renderForm(true)}
            </Card>
          </div>
        )}

        {/* View Material Modal */}
        {selectedMaterial && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Detail Materi</h2>
                <button onClick={() => setSelectedMaterial(null)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                    {getTypeIcon(selectedMaterial.type)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedMaterial.title}</h3>
                    <p className="text-sm text-gray-500">{getTypeLabel(selectedMaterial.type)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Deskripsi</p>
                  <p className="text-gray-600">{selectedMaterial.description || '-'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Mata Pelajaran</p>
                    <p className="text-gray-600">{selectedMaterial.subject}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Kelas</p>
                    <p className="text-gray-600">{selectedMaterial.class_room?.name || '-'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">Pengajar</p>
                  <p className="text-gray-600">{selectedMaterial.teacher?.name || '-'}</p>
                </div>
                {selectedMaterial.file_url && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      {selectedMaterial.type === 'link' ? 'URL' : 'File'}
                    </p>
                    <a 
                      href={selectedMaterial.type === 'link' ? selectedMaterial.file_url : getSecureFileUrl(selectedMaterial.file_url)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-teal-600 hover:underline break-all text-sm"
                    >
                      {selectedMaterial.file_url}
                    </a>
                  </div>
                )}
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedMaterial(null)}>
                    Tutup
                  </Button>
                  {selectedMaterial.file_url && (
                    <Button className="flex-1" onClick={() => openFile(selectedMaterial)}>
                      {selectedMaterial.type === 'link' ? (
                        <>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Buka Link
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Hapus Materi"
        message="Yakin ingin menghapus materi ini?"
        confirmText="Hapus"
        cancelText="Batal"
      />
    </DashboardLayout>
  );
}
