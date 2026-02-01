'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input } from '@/components/ui';
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
  Loader2
} from 'lucide-react';
import { classAPI } from '@/services/api';

interface Material {
  id: number;
  title: string;
  description: string;
  subject: string;
  class_name: string;
  type: 'document' | 'video' | 'link';
  file_url?: string;
  created_at: string;
  downloads: number;
}

export default function MateriPage() {
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject: '',
    class_id: '',
    type: 'document' as 'document' | 'video' | 'link',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch classes
      const classesRes = await classAPI.getAll();
      const classesData = classesRes.data?.data || [];
      setClasses(
        classesData.map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );

      // Materials would come from API - for now empty
      setMaterials([]);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedClass = classes.find(c => c.value === formData.class_id);
    const newMaterial: Material = {
      id: Date.now(),
      title: formData.title,
      description: formData.description,
      subject: formData.subject,
      class_name: selectedClass?.label || '',
      type: formData.type,
      created_at: new Date().toISOString().split('T')[0],
      downloads: 0,
    };
    setMaterials([newMaterial, ...materials]);
    setShowAddModal(false);
    setFormData({ title: '', description: '', subject: '', class_id: '', type: 'document' });
  };

  const handleDelete = (id: number) => {
    if (confirm('Yakin ingin menghapus materi ini?')) {
      setMaterials(materials.filter(m => m.id !== id));
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document': return <FileText className="w-5 h-5 text-blue-500" />;
      case 'video': return <Video className="w-5 h-5 text-red-500" />;
      default: return <BookOpen className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'document': return 'Dokumen';
      case 'video': return 'Video';
      case 'link': return 'Link';
      default: return type;
    }
  };

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
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Materi Pembelajaran</h1>
            <p className="text-gray-600">Kelola materi untuk siswa</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-5 h-5 mr-2" />
            Tambah Materi
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Cari materi..."
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
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Unduhan</p>
                <p className="text-xl font-bold text-gray-900">
                  {materials.reduce((sum, m) => sum + m.downloads, 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Kelas Terjangkau</p>
                <p className="text-xl font-bold text-gray-900">
                  {new Set(materials.map(m => m.class_name)).size}
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
              <p className="text-sm text-gray-400 mt-1">Klik tombol "Tambah Materi" untuk membuat materi baru</p>
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
                            {material.class_name}
                          </span>
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">
                            {getTypeLabel(material.type)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setSelectedMaterial(material)}
                          className="p-2 text-gray-500 hover:text-teal-600 hover:bg-teal-50 rounded-lg"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(material.id)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                      <span>Diunggah: {material.created_at}</span>
                      <span>•</span>
                      <span>{material.downloads} unduhan</span>
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
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-lg font-semibold">Tambah Materi Baru</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
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
                  <Input
                    label="Mata Pelajaran"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="Contoh: Informatika"
                    required
                  />
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
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as 'document' | 'video' | 'link' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="document">Dokumen (PDF, Word, dll)</option>
                    <option value="video">Video</option>
                    <option value="link">Link Eksternal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Upload File</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-teal-500 cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Klik atau drag & drop file di sini</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DOC, PPT, MP4 (Max. 50MB)</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1">
                    Simpan Materi
                  </Button>
                </div>
              </form>
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
                  <p className="text-gray-600">{selectedMaterial.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Mata Pelajaran</p>
                    <p className="text-gray-600">{selectedMaterial.subject}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Kelas</p>
                    <p className="text-gray-600">{selectedMaterial.class_name}</p>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setSelectedMaterial(null)}>
                    Tutup
                  </Button>
                  <Button className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
