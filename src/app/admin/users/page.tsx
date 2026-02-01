'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Search, Edit2, Trash2, UserPlus, Download, Loader2 } from 'lucide-react';
import { userAPI, classAPI } from '@/services/api';

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
  const [users, setUsers] = useState<User[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  };

  const handleDeleteClick = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
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
      console.error('Failed to save user:', error);
      alert('Gagal menyimpan data pengguna');
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
      console.error('Failed to delete user:', error);
      alert('Gagal menghapus pengguna');
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
            ? 'bg-teal-100 text-teal-700'
            : 'bg-blue-100 text-blue-700'
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
                placeholder="Cari nama atau email..."
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
            <Input
              label="Password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
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
                  Menyimpan...
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
    </DashboardLayout>
  );
}
