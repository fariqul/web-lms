'use client';

import React, { useState, useRef } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { User, Mail, Lock, Camera, Save, Loader2, X } from 'lucide-react';

export default function AkunPage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSave = async () => {
    setSavingProfile(true);
    try {
      await api.post('/profile', { name: formData.name });
      if (refreshUser) {
        await refreshUser();
      }
      toast.success('Profil berhasil diperbarui!');
      setIsEditing(false);
    } catch {
      toast.error('Gagal memperbarui profil. Silakan coba lagi.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.warning('File harus berupa gambar!');
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.warning('Ukuran file maksimal 2MB!');
        return;
      }
      
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewPhoto(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPhoto = async () => {
    if (!selectedFile) return;
    
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('photo', selectedFile);
      
      await api.post('/profile/photo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // Refresh user data to get new photo
      if (refreshUser) {
        await refreshUser();
      }
      
      setPreviewPhoto(null);
      setSelectedFile(null);
      toast.success('Foto profil berhasil diperbarui!');
    } catch (error) {
      toast.error('Gagal mengupload foto. Silakan coba lagi.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const cancelPhotoUpload = () => {
    setPreviewPhoto(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.warning('Password baru tidak cocok!');
      return;
    }
    if (passwordData.new_password.length < 8) {
      toast.warning('Password minimal 8 karakter!');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/change-password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
        new_password_confirmation: passwordData.confirm_password,
      });
      toast.success('Password berhasil diubah!');
      setShowPasswordModal(false);
      setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msg = error.response?.data?.errors?.current_password?.[0]
        || error.response?.data?.errors?.new_password?.[0]
        || error.response?.data?.message
        || 'Gagal mengubah password. Silakan coba lagi.';
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'admin': return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
      case 'guru': return 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400';
      case 'siswa': return 'bg-sky-50 text-sky-700 dark:text-sky-400';
      default: return 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300';
    }
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'admin': return 'Administrator';
      case 'guru': return 'Guru';
      case 'siswa': return 'Siswa';
      default: return user?.role;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Akun Saya</h1>
            <p className="text-blue-100/80">Kelola informasi akun Anda</p>
          </div>
        </div>

        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden">
                {previewPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewPhoto} alt="Preview" className="w-full h-full object-cover" />
                ) : user?.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photo} alt={user.name || ''} className="w-full h-full object-cover" loading="eager" />
                ) : (
                  user?.name?.charAt(0).toUpperCase()
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button 
                onClick={handlePhotoClick}
                className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-slate-900 rounded-full shadow-lg flex items-center justify-center border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                title="Ganti foto profil"
                aria-label="Ganti foto profil"
              >
                <Camera className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            {/* Info */}
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user?.name}</h2>
              <p className="text-slate-600 dark:text-slate-400">{user?.email}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor()}`}>
                {getRoleLabel()}
              </span>
              
              {/* Photo Upload Actions */}
              {previewPhoto && (
                <div className="flex gap-2 mt-4">
                  <Button 
                    size="sm" 
                    onClick={handleUploadPhoto} 
                    disabled={uploadingPhoto}
                  >
                    {uploadingPhoto ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Mengupload…
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Simpan Foto
                      </>
                    )}
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={cancelPhotoUpload}
                    disabled={uploadingPhoto}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Batal
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Detail Info */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Informasi Akun</h3>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleSave} disabled={savingProfile}>
                  {savingProfile ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  {savingProfile ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <div className="flex-1">
                <p className="text-sm text-slate-600 dark:text-slate-400">Nama Lengkap</p>
                {isEditing ? (
                  <Input
                    label="Nama Lengkap"
                    name="name"
                    autoComplete="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="font-medium text-slate-900 dark:text-white">{user?.name}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <Mail className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <div className="flex-1">
                <p className="text-sm text-slate-600 dark:text-slate-400">Email</p>
                <p className="font-medium text-slate-900 dark:text-white">{user?.email}</p>
              </div>
            </div>

            {user?.role === 'siswa' && (
              <>
                <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-400">NISN</p>
                    <p className="font-medium text-slate-900 dark:text-white">{user?.nisn || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Kelas</p>
                    <p className="font-medium text-slate-900 dark:text-white">{user?.class?.name || '-'}</p>
                  </div>
                </div>
              </>
            )}

            {user?.role === 'guru' && (
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                <div className="flex-1">
                  <p className="text-sm text-slate-600 dark:text-slate-400">NIP</p>
                  <p className="font-medium text-slate-900 dark:text-white">{user?.nip || '-'}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Security */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Keamanan</h3>
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="flex items-center gap-4">
              <Lock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Password</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Terakhir diubah: Tidak pernah</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowPasswordModal(true)}>
              Ubah Password
            </Button>
          </div>
        </Card>

        {/* Change Password Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">Ubah Password</h2>
              </div>
              <form onSubmit={handleChangePassword} className="p-4 space-y-4">
                <Input
                  type="password"
                  label="Password Saat Ini"
                  name="current_password"
                  autoComplete="current-password"
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  label="Password Baru"
                  name="new_password"
                  autoComplete="new-password"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  label="Konfirmasi Password Baru"
                  name="confirm_password"
                  autoComplete="new-password"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  required
                />
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPasswordModal(false)} disabled={changingPassword}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1" disabled={changingPassword}>
                    {changingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Menyimpan…
                      </>
                    ) : (
                      'Simpan'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
