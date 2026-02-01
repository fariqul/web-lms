'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input, Textarea } from '@/components/ui';
import { Bell, Plus, Calendar, Eye, Edit2, Trash2, X, Megaphone } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Announcement {
  id: number;
  title: string;
  content: string;
  author: string;
  target: 'all' | 'guru' | 'siswa';
  created_at: string;
  is_pinned: boolean;
}

export default function PengumumanPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([
    {
      id: 1,
      title: 'Jadwal Ujian Tengah Semester',
      content: 'Ujian Tengah Semester akan dilaksanakan mulai tanggal 10 Februari 2026. Harap semua siswa mempersiapkan diri dengan baik. Jadwal lengkap akan diumumkan melalui wali kelas masing-masing.',
      author: 'Administrator',
      target: 'all',
      created_at: '2026-01-28T10:00:00',
      is_pinned: true,
    },
    {
      id: 2,
      title: 'Rapat Guru Bulanan',
      content: 'Rapat guru bulanan akan dilaksanakan pada hari Sabtu, 1 Februari 2026 pukul 09:00 WIB di Aula Sekolah. Kehadiran seluruh guru sangat diharapkan.',
      author: 'Administrator',
      target: 'guru',
      created_at: '2026-01-27T14:00:00',
      is_pinned: false,
    },
    {
      id: 3,
      title: 'Pendaftaran Ekstrakurikuler',
      content: 'Pendaftaran ekstrakurikuler semester genap dibuka mulai tanggal 1-7 Februari 2026. Silakan daftar melalui wali kelas atau langsung ke pembina masing-masing ekstrakurikuler.',
      author: 'Administrator',
      target: 'siswa',
      created_at: '2026-01-25T08:00:00',
      is_pinned: false,
    },
  ]);
  const [showModal, setShowModal] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target: 'all' as 'all' | 'guru' | 'siswa',
  });

  const canCreate = user?.role === 'admin' || user?.role === 'guru';

  const filteredAnnouncements = announcements.filter(a => {
    if (user?.role === 'admin') return true;
    if (a.target === 'all') return true;
    return a.target === user?.role;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTargetLabel = (target: string) => {
    switch (target) {
      case 'all': return 'Semua';
      case 'guru': return 'Guru';
      case 'siswa': return 'Siswa';
      default: return target;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newAnnouncement: Announcement = {
      id: announcements.length + 1,
      title: formData.title,
      content: formData.content,
      author: user?.name || 'Unknown',
      target: formData.target,
      created_at: new Date().toISOString(),
      is_pinned: false,
    };
    setAnnouncements([newAnnouncement, ...announcements]);
    setShowModal(false);
    setFormData({ title: '', content: '', target: 'all' });
  };

  const handleDelete = (id: number) => {
    if (confirm('Yakin ingin menghapus pengumuman ini?')) {
      setAnnouncements(announcements.filter(a => a.id !== id));
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pengumuman</h1>
            <p className="text-gray-600">Informasi dan pengumuman terbaru</p>
          </div>
          {canCreate && (
            <Button onClick={() => setShowModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Buat Pengumuman
            </Button>
          )}
        </div>

        {/* Announcements List */}
        {filteredAnnouncements.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Belum Ada Pengumuman</h3>
            <p className="text-gray-500">Pengumuman terbaru akan muncul di sini</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredAnnouncements.map((announcement) => (
              <Card 
                key={announcement.id} 
                className={`p-6 ${announcement.is_pinned ? 'border-l-4 border-orange-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      announcement.is_pinned ? 'bg-orange-100' : 'bg-blue-100'
                    }`}>
                      {announcement.is_pinned ? (
                        <Megaphone className={`w-6 h-6 ${announcement.is_pinned ? 'text-orange-600' : 'text-blue-600'}`} />
                      ) : (
                        <Bell className="w-6 h-6 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{announcement.title}</h3>
                        {announcement.is_pinned && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                            Penting
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          announcement.target === 'all' 
                            ? 'bg-gray-100 text-gray-700'
                            : announcement.target === 'guru'
                            ? 'bg-teal-100 text-teal-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {getTargetLabel(announcement.target)}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{announcement.content}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{announcement.author}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(announcement.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      onClick={() => setSelectedAnnouncement(announcement)}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {canCreate && (
                      <>
                        <button className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          onClick={() => handleDelete(announcement.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Create Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">Buat Pengumuman Baru</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <Input
                  label="Judul Pengumuman"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
                <Textarea
                  label="Isi Pengumuman"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={5}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
                  <select
                    value={formData.target}
                    onChange={(e) => setFormData({ ...formData, target: e.target.value as 'all' | 'guru' | 'siswa' })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Semua</option>
                    <option value="guru">Guru</option>
                    <option value="siswa">Siswa</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1">
                    Publikasikan
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* View Modal */}
        {selectedAnnouncement && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">Detail Pengumuman</h2>
                <button onClick={() => setSelectedAnnouncement(null)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{selectedAnnouncement.title}</h3>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span>{selectedAnnouncement.author}</span>
                  <span>{formatDate(selectedAnnouncement.created_at)}</span>
                </div>
                <p className="text-gray-600 whitespace-pre-wrap">{selectedAnnouncement.content}</p>
              </div>
              <div className="p-4 border-t">
                <Button variant="outline" className="w-full" onClick={() => setSelectedAnnouncement(null)}>
                  Tutup
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
