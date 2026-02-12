'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Search, Edit2, Trash2, UserPlus, Download, Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';
import { userAPI, classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  class_id?: number;
  class_room?: { id: number; name: string };
  nisn?: string;
  nip?: string;
}

interface ClassOption {
  id: number;
  name: string;
}

const roleOptions = [
  { value: '', label: 'Semua Role' },
  { value: 'siswa', label: 'Siswa' },
  { value: 'guru', label: 'Guru' },
  { value: 'admin', label: 'Admin' },
];

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({ password: '', showPassword: false });
  const [resetSuccess, setResetSuccess] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'siswa',
    class_id: '',
    nisn: '',
    nip: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch all users with high per_page to get all
      const usersRes = await userAPI.getAll({ per_page: 1000 });
      const usersData = usersRes.data?.data;
      const usersList = Array.isArray(usersData) ? usersData : (usersData?.data || []);
      setUsers(usersList);

      // Fetch classes for dropdown
      const classesRes = await classAPI.getAll();
      setClasses(classesRes.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenModal = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        class_id: user.class_id?.toString() || '',
        nisn: user.nisn || '',
        nip: user.nip || '',
      });
    } else {
      setSelectedUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'siswa',
        class_id: '',
        nisn: '',
        nip: '',
      });
    }
    setIsModalOpen(true);
    setShowPassword(false);
  };

  const handleDeleteClick = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleResetPasswordClick = (user: User) => {
    setSelectedUser(user);
    setResetPasswordData({ password: '', showPassword: false });
    setResetSuccess('');
    setIsResetPasswordOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !resetPasswordData.password) return;
    setSubmitting(true);
    try {
      await userAPI.resetPassword(selectedUser.id, resetPasswordData.password);
      setResetSuccess(`Password ${selectedUser.name} berhasil direset!`);
      setTimeout(() => {
        setIsResetPasswordOpen(false);
        setResetSuccess('');
      }, 2000);
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Gagal mereset password';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
      };

      if (formData.password) {
        payload.password = formData.password;
      }
      if (formData.role === 'siswa' && formData.class_id) {
        payload.class_id = parseInt(formData.class_id);
        payload.nisn = formData.nisn;
      }
      if (formData.role === 'guru' && formData.nip) {
        payload.nip = formData.nip;
      }

      if (selectedUser) {
        await userAPI.update(selectedUser.id, payload);
      } else {
        await userAPI.create(payload as Parameters<typeof userAPI.create>[0]);
      }

      setIsModalOpen(false);
      fetchData(); // Refresh data
    } catch (error) {
      toast.error('Gagal menyimpan data pengguna');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      await userAPI.delete(selectedUser.id);
      setIsDeleteDialogOpen(false);
      fetchData(); // Refresh data
    } catch (error) {
      toast.error('Gagal menghapus pengguna');
    }
  };

  const columns = [
    { key: 'name', header: 'Nama' },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (item: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          item.role === 'admin'
            ? 'bg-orange-100 text-orange-700'
            : item.role === 'guru'
            ? 'bg-sky-100 text-sky-700'
            : 'bg-sky-50 text-sky-700'
        }`}>
          {item.role.charAt(0).toUpperCase() + item.role.slice(1)}
        </span>
      ),
    },
    {
      key: 'class',
      header: 'Kelas',
      render: (item: User) => item.class_room?.name || '-',
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (item: User) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-sky-500 hover:bg-sky-50 rounded-lg transition-colors"
            title="Edit"
            aria-label="Edit pengguna"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleResetPasswordClick(item)}
            className="p-1.5 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
            title="Reset Password"
            aria-label="Reset password"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Hapus"
            aria-label="Hapus pengguna"
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
        <Card>
          <CardHeader
            title="Kelola Pengguna"
            subtitle={`Total ${users.length} pengguna`}
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
                  leftIcon={<UserPlus className="w-4 h-4" />}
                  onClick={() => handleOpenModal()}
                >
                  Tambah User
                </Button>
              </div>
            }
          />

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Cari nama atau email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="w-full md:w-48">
              <Select
                options={roleOptions}
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              />
            </div>
          </div>

          {/* Table */}
          <Table
            columns={columns}
            data={filteredUsers}
            keyExtractor={(item) => item.id}
          />
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedUser ? 'Edit Pengguna' : 'Tambah Pengguna'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nama Lengkap"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          {!selectedUser && (
            <div className="w-full">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full rounded-lg border border-slate-300 py-2.5 text-sm pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Min. 8 karakter (huruf besar, kecil, angka)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 dark:text-slate-500 hover:text-slate-600"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
          <Select
            label="Role"
            options={[
              { value: 'siswa', label: 'Siswa' },
              { value: 'guru', label: 'Guru' },
              { value: 'admin', label: 'Admin' },
            ]}
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          />
          {formData.role === 'siswa' && (
            <>
              <Select
                label="Kelas"
                options={[
                  { value: '', label: 'Pilih Kelas' },
                  ...classes.map((c) => ({ value: c.id.toString(), label: c.name })),
                ]}
                value={formData.class_id}
                onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
              />
              <Input
                label="NISN"
                value={formData.nisn}
                onChange={(e) => setFormData({ ...formData, nisn: e.target.value })}
                placeholder="Nomor Induk Siswa Nasional"
              />
            </>
          )}
          {formData.role === 'guru' && (
            <Input
              label="NIP"
              value={formData.nip}
              onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
              placeholder="Nomor Induk Pegawai"
            />
          )}
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
              ) : selectedUser ? (
                'Simpan Perubahan'
              ) : (
                'Tambah User'
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
        title="Hapus Pengguna"
        message={`Apakah Anda yakin ingin menghapus ${selectedUser?.name}? Tindakan ini tidak dapat dibatalkan.`}
        confirmText="Hapus"
        variant="danger"
      />

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetPasswordOpen}
        onClose={() => setIsResetPasswordOpen(false)}
        title="Reset Password"
        size="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          {resetSuccess ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm text-center">
              {resetSuccess}
            </div>
          ) : (
            <>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <p className="text-sm text-sky-700">
                  Reset password untuk: <strong>{selectedUser?.name}</strong>
                </p>
                <p className="text-xs text-sky-500 mt-1">{selectedUser?.email}</p>
              </div>

              <div className="w-full">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password Baru</label>
                <div className="relative">
                  <input
                    type={resetPasswordData.showPassword ? 'text' : 'password'}
                    value={resetPasswordData.password}
                    onChange={(e) => setResetPasswordData({ ...resetPasswordData, password: e.target.value })}
                    required
                    minLength={8}
                    className="w-full rounded-lg border border-slate-300 py-2.5 text-sm pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Min. 8 karakter (huruf besar, kecil, angka)"
                  />
                  <button
                    type="button"
                    onClick={() => setResetPasswordData({ ...resetPasswordData, showPassword: !resetPasswordData.showPassword })}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 dark:text-slate-500 hover:text-slate-600"
                    aria-label={resetPasswordData.showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {resetPasswordData.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Harus mengandung huruf besar, huruf kecil, dan angka</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={submitting || resetPasswordData.password.length < 8}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Mereset…
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </div>
            </>
          )}
        </form>
      </Modal>
    </DashboardLayout>
  );
}
