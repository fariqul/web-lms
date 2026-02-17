'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input, Textarea, ConfirmDialog } from '@/components/ui';
import { Bell, Plus, Calendar, Eye, Edit2, Trash2, X, Megaphone, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { announcementAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface Announcement {
  id: number;
  title: string;
  content: string;
  priority: 'normal' | 'important' | 'urgent';
  target: 'all' | 'guru' | 'siswa';
  is_active: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  author?: {
    id: number;
    name: string;
    role: string;
  };
}

export default function PengumumanPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  // Default target to 'siswa' for guru, 'all' for admin
  const getDefaultTarget = () => user?.role === 'guru' ? 'siswa' : 'all';
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    target: getDefaultTarget() as 'all' | 'guru' | 'siswa',
    priority: 'normal' as 'normal' | 'important' | 'urgent',
  });

  const canCreate = user?.role === 'admin' || user?.role === 'guru';

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await announcementAPI.getAll();
      setAnnouncements(response.data.data.data || response.data.data || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setLoading(false);
    }
  };

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

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'Mendesak';
      case 'important': return 'Penting';
      default: return 'Normal';
    }
  };

  const resetForm = () => {
    setFormData({ title: '', content: '', target: getDefaultTarget(), priority: 'normal' });
    setEditMode(false);
    setSelectedAnnouncement(null);
  };

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setFormData({
        title: announcement.title,
        content: announcement.content,
        target: announcement.target,
        priority: announcement.priority,
      });
      setSelectedAnnouncement(announcement);
      setEditMode(true);
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (editMode && selectedAnnouncement) {
        await announcementAPI.update(selectedAnnouncement.id, formData);
        toast.success('Pengumuman berhasil diperbarui!');
      } else {
        await announcementAPI.create(formData);
        toast.success('Pengumuman berhasil dibuat!');
      }
      
      setShowModal(false);
      resetForm();
      fetchAnnouncements();
    } catch {
      toast.error('Gagal menyimpan pengumuman. Silakan coba lagi.');
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
      await announcementAPI.delete(deleteId);
      toast.success('Pengumuman berhasil dihapus!');
      fetchAnnouncements();
    } catch {
      toast.error('Gagal menghapus pengumuman.');
    } finally {
      setDeleteId(null);
    }
  };

  const handleView = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setEditMode(false);
    setShowModal(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Pengumuman</h1>
              <p className="text-blue-100/80">Informasi dan pengumuman terbaru</p>
            </div>
            {canCreate && (
              <Button onClick={() => handleOpenModal()} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Buat Pengumuman
              </Button>
            )}
          </div>
        </div>

        {/* Announcements List */}
        {announcements.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Belum Ada Pengumuman</h3>
            <p className="text-slate-600 dark:text-slate-400">Pengumuman terbaru akan muncul di sini</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <Card 
                key={announcement.id} 
                className={`p-6 ${announcement.priority === 'urgent' ? 'border-l-4 border-red-500' : announcement.priority === 'important' ? 'border-l-4 border-orange-500' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      announcement.priority === 'urgent' ? 'bg-red-100 dark:bg-red-900/30' : 
                      announcement.priority === 'important' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-sky-50'
                    }`}>
                      {announcement.priority !== 'normal' ? (
                        <Megaphone className={`w-6 h-6 ${
                          announcement.priority === 'urgent' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'
                        }`} />
                      ) : (
                        <Bell className="w-6 h-6 text-sky-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{announcement.title}</h3>
                        {announcement.priority !== 'normal' && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            announcement.priority === 'urgent' 
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                              : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                          }`}>
                            {getPriorityLabel(announcement.priority)}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          announcement.target === 'all' 
                            ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                            : announcement.target === 'guru'
                            ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                            : 'bg-sky-50 text-sky-700 dark:text-sky-400'
                        }`}>
                          {getTargetLabel(announcement.target)}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-sm mb-3 line-clamp-2">{announcement.content}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                        <span>{announcement.author?.name || 'Admin'}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(announcement.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                      onClick={() => handleView(announcement)}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {canCreate && (user?.role === 'admin' || announcement.author?.id === user?.id) && (
                      <>
                        <button 
                          className="p-2 text-sky-500 hover:bg-sky-50 rounded-lg"
                          onClick={() => handleOpenModal(announcement)}
                        >
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

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">
                  {editMode ? 'Edit Pengumuman' : 'Buat Pengumuman Baru'}
                </h2>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="text-slate-600 dark:text-slate-400 hover:text-slate-700">
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
                <div className={user?.role === 'admin' ? 'grid grid-cols-2 gap-4' : ''}>
                  {/* Target dropdown - only visible for admin */}
                  {user?.role === 'admin' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target</label>
                      <select
                        value={formData.target}
                        onChange={(e) => setFormData({ ...formData, target: e.target.value as 'all' | 'guru' | 'siswa' })}
                        className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">Semua</option>
                        <option value="guru">Guru</option>
                        <option value="siswa">Siswa</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Prioritas</label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as 'normal' | 'important' | 'urgent' })}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="normal">Normal</option>
                      <option value="important">Penting</option>
                      <option value="urgent">Mendesak</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => { setShowModal(false); resetForm(); }}
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Menyimpan…
                      </>
                    ) : (
                      editMode ? 'Simpan Perubahan' : 'Publikasikan'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* View Modal */}
        {selectedAnnouncement && !showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-lg font-semibold">Detail Pengumuman</h2>
                <button onClick={() => setSelectedAnnouncement(null)} className="text-slate-600 dark:text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  {selectedAnnouncement.priority !== 'normal' && (
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      selectedAnnouncement.priority === 'urgent' 
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
                    }`}>
                      {getPriorityLabel(selectedAnnouncement.priority)}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                    selectedAnnouncement.target === 'all' 
                      ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300'
                      : selectedAnnouncement.target === 'guru'
                      ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
                      : 'bg-sky-50 text-sky-700 dark:text-sky-400'
                  }`}>
                    {getTargetLabel(selectedAnnouncement.target)}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{selectedAnnouncement.title}</h3>
                <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mb-4">
                  <span>{selectedAnnouncement.author?.name || 'Admin'}</span>
                  <span>{formatDate(selectedAnnouncement.created_at)}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{selectedAnnouncement.content}</p>
              </div>
              <div className="p-4 border-t">
                <Button variant="outline" className="w-full" onClick={() => setSelectedAnnouncement(null)}>
                  Tutup
                </Button>
              </div>
            </Card>
          </div>
        )}
        <ConfirmDialog
          isOpen={deleteId !== null}
          title="Hapus Pengumuman"
          message="Yakin ingin menghapus pengumuman ini?"
          confirmText="Hapus"
          onConfirm={confirmDelete}
          onClose={() => setDeleteId(null)}
          variant="danger"
        />
      </div>
    </DashboardLayout>
  );
}
