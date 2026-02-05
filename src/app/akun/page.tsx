'use client';

import React, { useState, useRef } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { User, Mail, Lock, Camera, Save, Loader2, X } from 'lucide-react';

export default function AkunPage() {
  const { user, refreshUser } = useAuth();
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

  const handleSave = async () => {
    // Would call API to update profile
    setIsEditing(false);
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('File harus berupa gambar!');
        return;
      }
      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        alert('Ukuran file maksimal 2MB!');
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
      alert('Foto profil berhasil diperbarui!');
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Gagal mengupload foto. Silakan coba lagi.');
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

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      alert('Password baru tidak cocok!');
      return;
    }
    // Would call API to change password
    setShowPasswordModal(false);
    setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
    alert('Password berhasil diubah!');
  };

  const getRoleBadgeColor = () => {
    switch (user?.role) {
      case 'admin': return 'bg-orange-100 text-orange-700';
      case 'guru': return 'bg-teal-100 text-teal-700';
      case 'siswa': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Akun Saya</h1>
          <p className="text-gray-600">Kelola informasi akun Anda</p>
        </div>

        {/* Profile Card */}
        <Card className="p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-3xl font-bold overflow-hidden">
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
                className="absolute bottom-0 right-0 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center border hover:bg-gray-50 transition-colors"
                title="Ganti foto profil"
              >
                <Camera className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Info */}
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-xl font-bold text-gray-900">{user?.name}</h2>
              <p className="text-gray-600">{user?.email}</p>
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
                        Mengupload...
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
            <h3 className="text-lg font-semibold text-gray-900">Informasi Akun</h3>
            {!isEditing ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Batal
                </Button>
                <Button size="sm" onClick={handleSave}>
                  <Save className="w-4 h-4 mr-1" />
                  Simpan
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <User className="w-5 h-5 text-gray-500" />
              <div className="flex-1">
                <p className="text-sm text-gray-500">Nama Lengkap</p>
                {isEditing ? (
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                  />
                ) : (
                  <p className="font-medium text-gray-900">{user?.name}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
              <Mail className="w-5 h-5 text-gray-500" />
              <div className="flex-1">
                <p className="text-sm text-gray-500">Email</p>
                <p className="font-medium text-gray-900">{user?.email}</p>
              </div>
            </div>

            {user?.role === 'siswa' && (
              <>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <User className="w-5 h-5 text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">NISN</p>
                    <p className="font-medium text-gray-900">{user?.nisn || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <User className="w-5 h-5 text-gray-500" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-500">Kelas</p>
                    <p className="font-medium text-gray-900">{user?.class?.name || '-'}</p>
                  </div>
                </div>
              </>
            )}

            {user?.role === 'guru' && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <User className="w-5 h-5 text-gray-500" />
                <div className="flex-1">
                  <p className="text-sm text-gray-500">NIP</p>
                  <p className="font-medium text-gray-900">{user?.nip || '-'}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Security */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Keamanan</h3>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-4">
              <Lock className="w-5 h-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900">Password</p>
                <p className="text-sm text-gray-500">Terakhir diubah: Tidak pernah</p>
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
                  value={passwordData.current_password}
                  onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  label="Password Baru"
                  value={passwordData.new_password}
                  onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                  required
                />
                <Input
                  type="password"
                  label="Konfirmasi Password Baru"
                  value={passwordData.confirm_password}
                  onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                  required
                />
                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowPasswordModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1">
                    Simpan
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
