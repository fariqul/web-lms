'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Search, Edit2, Trash2, UserPlus, Download, Loader2, Eye, EyeOff, KeyRound, Eraser, Users, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Ban, UserCheck } from 'lucide-react';
import { userAPI, classAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { extractNomorTesNumber } from '@/utils/nomorTes';
import { getApiErrorMessage } from '@/lib/api-error';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  class_id?: number;
  class_room?: { id: number; name: string };
  jenis_kelamin?: 'L' | 'P';
  nisn?: string;
  nis?: string;
  nip?: string;
  nomor_tes?: string;
  is_blocked?: boolean;
  block_reason?: string;
  blocked_at?: string;
}

interface ClassOption {
  id: number;
  name: string;
  grade_level?: string;
  students_count?: number;
}

interface NomorTesConflict {
  id: number;
  name: string;
  from: string;
  to: string;
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
  const [classFilter, setClassFilter] = useState('');
  const [studentBlockFilter, setStudentBlockFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({ password: '', showPassword: false });
  const [resetSuccess, setResetSuccess] = useState('');
  const [isClearNomorTesOpen, setIsClearNomorTesOpen] = useState(false);
  const [isNormalizeNomorTesOpen, setIsNormalizeNomorTesOpen] = useState(false);
  const [isNormalizeConflictOpen, setIsNormalizeConflictOpen] = useState(false);
  const [normalizeConflicts, setNormalizeConflicts] = useState<NomorTesConflict[]>([]);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockAction, setBlockAction] = useState<'block' | 'unblock'>('block');
  const [isBulkBlockModalOpen, setIsBulkBlockModalOpen] = useState(false);
  const [bulkBlockReason, setBulkBlockReason] = useState('');
  const [bulkBlockAction, setBulkBlockAction] = useState<'block' | 'unblock'>('block');
  const [bulkBlockScope, setBulkBlockScope] = useState<'all' | 'class' | 'filter'>('all');

  // Sorting state
  const [sortKey, setSortKey] = useState<'name' | 'nomor_tes' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'siswa',
    jenis_kelamin: '',
    class_id: '',
    nisn: '',
    nis: '',
    nip: '',
    nomor_tes: '',
  });

  const [totalUsers, setTotalUsers] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUsers = useCallback(async (search?: string, role?: string, classId?: string) => {
    try {
      setLoading(true);
      const params: { per_page: number; search?: string; role?: string; class_id?: string } = { per_page: 500 };
      if (search) params.search = search;
      if (role) params.role = role;
      if (classId) params.class_id = classId;
      const usersRes = await userAPI.getAll(params);
      const usersData = usersRes.data?.data;
      const usersList = Array.isArray(usersData) ? usersData : (usersData?.data || []);
      setUsers(usersList);
      // Get total from pagination meta
      const total = usersData?.total ?? usersList.length;
      setTotalUsers(total);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    // Fetch classes for dropdown
    classAPI.getAll().then(res => setClasses(res.data?.data || [])).catch(() => {});
  }, [fetchUsers]);

  // Server-side search with debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchUsers(searchQuery, roleFilter, classFilter);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, roleFilter, classFilter, fetchUsers]);

  const fetchData = () => fetchUsers(searchQuery, roleFilter, classFilter);

  // Toggle sort function
  const handleSort = (key: 'name' | 'nomor_tes') => {
    if (sortKey === key) {
      // Toggle order if same key
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new key with ascending order
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  // Sort users based on sortKey and sortOrder
  const sortedUsers = React.useMemo(() => {
    if (!sortKey) return users;
    
    return [...users].sort((a, b) => {
      if (sortKey === 'name') {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        if (sortOrder === 'asc') {
          return nameA.localeCompare(nameB, 'id');
        } else {
          return nameB.localeCompare(nameA, 'id');
        }
      } else if (sortKey === 'nomor_tes') {
        const numA = extractNomorTesNumber(a.nomor_tes);
        const numB = extractNomorTesNumber(b.nomor_tes);
        if (sortOrder === 'asc') {
          return numA - numB;
        } else {
          return numB - numA;
        }
      }
      return 0;
    });
  }, [users, sortKey, sortOrder]);

  const filteredUsers = React.useMemo(() => {
    if (studentBlockFilter === 'all') return sortedUsers;

    return sortedUsers.filter((u) => {
      if (u.role !== 'siswa') return false;
      if (studentBlockFilter === 'blocked') return u.is_blocked === true;
      return u.is_blocked !== true;
    });
  }, [sortedUsers, studentBlockFilter]);

  const totalStudentsCount = React.useMemo(
    () => users.filter((u) => u.role === 'siswa').length,
    [users]
  );
  const blockedStudentsCount = React.useMemo(
    () => users.filter((u) => u.role === 'siswa' && u.is_blocked === true).length,
    [users]
  );
  const activeStudentsCount = Math.max(0, totalStudentsCount - blockedStudentsCount);

  const allStudentCount = React.useMemo(
    () => users.filter((u) => u.role === 'siswa').length,
    [users]
  );
  const classScopedStudentCount = React.useMemo(() => {
    if (!classFilter) return 0;
    return users.filter((u) => u.role === 'siswa' && String(u.class_id) === classFilter).length;
  }, [users, classFilter]);
  const filteredStudentIds = React.useMemo(
    () => filteredUsers.filter((u) => u.role === 'siswa').map((u) => u.id),
    [filteredUsers]
  );
  const selectedClassName = classes.find((c) => c.id.toString() === classFilter)?.name;

  const handleOpenModal = (user?: User) => {
    if (user) {
      setSelectedUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        jenis_kelamin: user.jenis_kelamin || '',
        class_id: user.class_id?.toString() || '',
        nisn: user.nisn || '',
        nis: user.nis || '',
        nip: user.nip || '',
        nomor_tes: user.nomor_tes || '',
      });
    } else {
      setSelectedUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'siswa',
        jenis_kelamin: '',
        class_id: '',
        nisn: '',
        nis: '',
        nip: '',
        nomor_tes: '',
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
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error, 'Gagal mereset password');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlockClick = (user: User, action: 'block' | 'unblock') => {
    setSelectedUser(user);
    setBlockAction(action);
    setBlockReason('');
    setIsBlockModalOpen(true);
  };

  const handleToggleBlock = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const isBlocking = blockAction === 'block';
      await userAPI.toggleBlock(selectedUser.id, isBlocking, blockReason || undefined);
      const action = isBlocking ? 'diblokir' : 'diaktifkan kembali';
      toast.success(`Akun ${selectedUser.name} berhasil ${action}`);
      setIsBlockModalOpen(false);
      fetchData();
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error, 'Gagal mengubah status blokir');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkBlockClick = (action: 'block' | 'unblock') => {
    setBulkBlockAction(action);
    setBulkBlockReason('');
    setBulkBlockScope('all');
    setIsBulkBlockModalOpen(true);
  };

  const handleToggleAllStudentsBlock = async () => {
    setSubmitting(true);
    try {
      const isBlocking = bulkBlockAction === 'block';
      let response;

      if (bulkBlockScope === 'all') {
        response = await userAPI.toggleBlockAllStudents(isBlocking, bulkBlockReason || undefined);
      } else if (bulkBlockScope === 'class') {
        if (!classFilter) {
          toast.error('Pilih filter kelas terlebih dahulu untuk aksi per kelas.');
          return;
        }
        response = await userAPI.toggleBlockStudentsByClass(Number(classFilter), isBlocking, bulkBlockReason || undefined);
      } else {
        if (filteredStudentIds.length === 0) {
          toast.error('Tidak ada siswa sesuai filter aktif.');
          return;
        }
        response = await userAPI.bulkToggleBlock(filteredStudentIds, isBlocking, bulkBlockReason || undefined);
      }

      const message = response.data?.message || (isBlocking ? 'Akun siswa berhasil diblokir' : 'Akun siswa berhasil diaktifkan kembali');
      toast.success(message);
      setIsBulkBlockModalOpen(false);
      fetchData();
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error, 'Gagal mengubah status blokir semua siswa');
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
        jenis_kelamin: formData.jenis_kelamin || null,
      };

      if (formData.password) {
        payload.password = formData.password;
      }
      if (formData.role === 'siswa' && formData.class_id) {
        payload.class_id = parseInt(formData.class_id);
        payload.nisn = formData.nisn;
        payload.nis = formData.nis;
      }
      if (formData.role === 'siswa') {
        payload.nomor_tes = formData.nomor_tes || null;
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

  const handleClearNomorTes = async () => {
    try {
      const res = await userAPI.clearNomorTes();
      const msg = res.data?.message || 'Nomor tes berhasil dihapus';
      toast.success(msg);
      setIsClearNomorTesOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Gagal menghapus nomor tes');
    }
  };

  const handleNormalizeNomorTes = async () => {
    try {
      const scopedClassId = classFilter ? Number(classFilter) : undefined;
      const classId = Number.isFinite(scopedClassId as number) ? (scopedClassId as number) : undefined;
      const res = await userAPI.normalizeNomorTes(classId);
      const msg = res.data?.message || 'Normalisasi nomor tes selesai';
      toast.success(msg);
      const rawConflicts: unknown[] = Array.isArray(res.data?.conflicts) ? res.data.conflicts : [];
      const parsedConflicts: NomorTesConflict[] = rawConflicts
        .map((item: unknown) => {
          const conflict = item as Partial<NomorTesConflict> | null;
          return {
            id: Number(conflict?.id) || 0,
            name: String(conflict?.name || '-'),
            from: String(conflict?.from || '-'),
            to: String(conflict?.to || '-'),
          };
        })
        .filter((item: NomorTesConflict) => item.id > 0);

      setNormalizeConflicts(parsedConflicts);
      if (parsedConflicts.length > 0) {
        toast.warning(`Ada ${parsedConflicts.length} konflik nomor tes. Periksa detail konflik.`);
        setIsNormalizeConflictOpen(true);
      }
      setIsNormalizeNomorTesOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Gagal menormalisasi nomor tes');
    }
  };

  // Sort icon component
  const SortIcon = ({ columnKey }: { columnKey: 'name' | 'nomor_tes' }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    }
    return sortOrder === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 text-sky-500" />
      : <ArrowDown className="w-3.5 h-3.5 text-sky-500" />;
  };

  const columns = [
    { 
      key: 'name', 
      header: (
        <button 
          onClick={() => handleSort('name')}
          className="flex items-center gap-1.5 hover:text-sky-600 dark:hover:text-sky-400 transition-colors group"
        >
          <span>Nama</span>
          <SortIcon columnKey="name" />
        </button>
      ),
      render: (item: User) => (
        <div className="flex items-center gap-2">
          <span>{item.name}</span>
          {item.role === 'siswa' && item.is_blocked && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              DIBLOKIR
            </span>
          )}
        </div>
      ),
    },
    { key: 'email', header: 'Email' },
    {
      key: 'role',
      header: 'Role',
      render: (item: User) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          item.role === 'admin'
            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
            : item.role === 'guru'
            ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400'
            : 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400'
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
      key: 'nisn',
      header: 'NIS',
      render: (item: User) => item.role === 'siswa' && item.nis ? (
        <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
          {item.nis}
        </span>
      ) : '-',
    },
    {
      key: 'nomor_tes',
      header: (
        <button 
          onClick={() => handleSort('nomor_tes')}
          className="flex items-center gap-1.5 hover:text-sky-600 dark:hover:text-sky-400 transition-colors group"
        >
          <span>No. Tes</span>
          <SortIcon columnKey="nomor_tes" />
        </button>
      ),
      render: (item: User) => item.role === 'siswa' && item.nomor_tes ? (
        <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-xs font-mono rounded">
          {item.nomor_tes}
        </span>
      ) : '-',
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (item: User) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
            title="Edit"
            aria-label="Edit pengguna"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleResetPasswordClick(item)}
            className="p-1.5 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
            title="Reset Password"
            aria-label="Reset password"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          {item.role === 'siswa' && (
            item.is_blocked ? (
              <button
                onClick={() => handleBlockClick(item, 'unblock')}
                className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                title="Aktifkan Kembali"
                aria-label="Aktifkan kembali akun"
              >
                <UserCheck className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleBlockClick(item, 'block')}
                className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                title="Blokir Siswa"
                aria-label="Blokir siswa"
              >
                <Ban className="w-4 h-4" />
              </button>
            )
          )}
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
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
            subtitle={`Total ${totalUsers} pengguna${roleFilter ? ` (${roleFilter})` : ''}${classFilter ? ` — ${classes.find(c => c.id.toString() === classFilter)?.name || 'Kelas'}` : ''}${studentBlockFilter !== 'all' ? ` — status ${studentBlockFilter === 'blocked' ? 'terblokir' : 'aktif'}` : ''}${searchQuery ? ` — hasil pencarian "${searchQuery}"` : ''}`}
            action={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Ban className="w-4 h-4" />}
                  onClick={() => handleBulkBlockClick('block')}
                  className="text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                  title={`Target: Semua ${allStudentCount}, Kelas ${classScopedStudentCount}, Filter ${filteredStudentIds.length}`}
                >
                  Blokir Siswa
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40">A:{allStudentCount}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">K:{classScopedStudentCount}</span>
                    <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40">F:{filteredStudentIds.length}</span>
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<UserCheck className="w-4 h-4" />}
                  onClick={() => handleBulkBlockClick('unblock')}
                  className="text-green-700 dark:text-green-400 border-green-300 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20"
                  title={`Target: Semua ${allStudentCount}, Kelas ${classScopedStudentCount}, Filter ${filteredStudentIds.length}`}
                >
                  Aktifkan Siswa
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-semibold">
                    <span className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40">A:{allStudentCount}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">K:{classScopedStudentCount}</span>
                    <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40">F:{filteredStudentIds.length}</span>
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ArrowUpDown className="w-4 h-4" />}
                  onClick={() => setIsNormalizeNomorTesOpen(true)}
                  className="text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                >
                  Normalisasi No. Tes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Eraser className="w-4 h-4" />}
                  onClick={() => setIsClearNomorTesOpen(true)}
                  className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Hapus Semua No. Tes
                </Button>
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
                placeholder="Cari nama, email, NIS, NISN, NIP, No. Tes…"
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
            <div className="w-full md:w-56">
              <Select
                options={[
                  { value: '', label: 'Semua Kelas' },
                  ...classes.map((c) => ({ value: c.id.toString(), label: `${c.name}${c.students_count !== undefined ? ` (${c.students_count} siswa)` : ''}` })),
                ]}
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  if (e.target.value) setRoleFilter('siswa');
                }}
              />
            </div>
            <div className="w-full md:w-56">
              <Select
                options={[
                  { value: 'all', label: 'Status Siswa: Semua' },
                  { value: 'active', label: 'Status Siswa: Aktif' },
                  { value: 'blocked', label: 'Status Siswa: Terblokir' },
                ]}
                value={studentBlockFilter}
                onChange={(e) => {
                  const val = e.target.value as 'all' | 'active' | 'blocked';
                  setStudentBlockFilter(val);
                  if (val !== 'all' && roleFilter !== 'siswa') {
                    setRoleFilter('siswa');
                  }
                }}
              />
            </div>
          </div>

          {/* Student block summary */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setStudentBlockFilter('all');
                if (roleFilter !== 'siswa') setRoleFilter('siswa');
              }}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                studentBlockFilter === 'all'
                  ? 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title="Tampilkan semua siswa"
            >
              Total Siswa: {totalStudentsCount}
            </button>
            <button
              type="button"
              onClick={() => {
                setStudentBlockFilter('active');
                if (roleFilter !== 'siswa') setRoleFilter('siswa');
              }}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                studentBlockFilter === 'active'
                  ? 'bg-green-200 dark:bg-green-900/40 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300'
                  : 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/40'
              }`}
              title="Filter siswa aktif"
            >
              Aktif: {activeStudentsCount}
            </button>
            <button
              type="button"
              onClick={() => {
                setStudentBlockFilter('blocked');
                if (roleFilter !== 'siswa') setRoleFilter('siswa');
              }}
              className={`px-2.5 py-1 rounded-full border transition-colors ${
                studentBlockFilter === 'blocked'
                  ? 'bg-red-200 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300'
                  : 'bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40'
              }`}
              title="Filter siswa terblokir"
            >
              Terblokir: {blockedStudentsCount}
            </button>
          </div>

          {/* Class info bar */}
          {classFilter && (
            <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Kelas {classes.find(c => c.id.toString() === classFilter)?.name}
                </span>
                <span className="text-xs text-blue-600 dark:text-blue-400">
                  — {filteredUsers.length} siswa
                </span>
              </div>
              <button
                onClick={() => { setClassFilter(''); setRoleFilter(''); }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline underline-offset-2"
              >
                Tampilkan semua
              </button>
            </div>
          )}

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
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 py-2.5 text-sm pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-white"
                  placeholder="Min. 8 karakter (huruf besar, kecil, angka)"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-600"
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
          {(formData.role === 'siswa' || formData.role === 'guru') && (
            <Select
              label="Jenis Kelamin"
              options={[
                { value: '', label: 'Pilih Jenis Kelamin' },
                { value: 'L', label: 'Laki-laki' },
                { value: 'P', label: 'Perempuan' },
              ]}
              value={formData.jenis_kelamin}
              onChange={(e) => setFormData({ ...formData, jenis_kelamin: e.target.value })}
            />
          )}
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
                label="No. Induk Sekolah (NIS)"
                value={formData.nis}
                onChange={(e) => setFormData({ ...formData, nis: e.target.value })}
                placeholder="Nomor Induk Sekolah"
              />
              <Input
                label="NISN"
                value={formData.nisn}
                onChange={(e) => setFormData({ ...formData, nisn: e.target.value })}
                placeholder="Nomor Induk Siswa Nasional (opsional)"
              />
              <Input
                label="Nomor Tes"
                value={formData.nomor_tes}
                onChange={(e) => setFormData({ ...formData, nomor_tes: e.target.value })}
                placeholder="Nomor tes ujian (opsional)"
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
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg text-green-700 dark:text-green-400 text-sm text-center">
              {resetSuccess}
            </div>
          ) : (
            <>
              <div className="p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/50 rounded-lg">
                <p className="text-sm text-sky-700 dark:text-sky-400">
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
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 py-2.5 text-sm pl-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-white"
                    placeholder="Min. 8 karakter (huruf besar, kecil, angka)"
                  />
                  <button
                    type="button"
                    onClick={() => setResetPasswordData({ ...resetPasswordData, showPassword: !resetPasswordData.showPassword })}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-600"
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

      {/* Clear Nomor Tes Confirmation */}
      <ConfirmDialog
        isOpen={isClearNomorTesOpen}
        onClose={() => setIsClearNomorTesOpen(false)}
        onConfirm={handleClearNomorTes}
        title="Hapus Semua Nomor Tes"
        message="Apakah Anda yakin ingin menghapus semua nomor tes dari seluruh siswa? Lakukan ini setelah periode ujian selesai."
        confirmText="Hapus Semua"
        variant="danger"
      />

      {/* Normalize Nomor Tes Confirmation */}
      <ConfirmDialog
        isOpen={isNormalizeNomorTesOpen}
        onClose={() => setIsNormalizeNomorTesOpen(false)}
        onConfirm={handleNormalizeNomorTes}
        title={classFilter ? 'Normalisasi Nomor Tes Kelas' : 'Normalisasi Semua Nomor Tes'}
        message={classFilter
          ? `Nomor tes siswa di kelas ${classes.find(c => c.id.toString() === classFilter)?.name || 'terpilih'} akan dinormalisasi (trim, hapus spasi/karakter tersembunyi, uppercase).`
          : 'Nomor tes seluruh siswa akan dinormalisasi (trim, hapus spasi/karakter tersembunyi, uppercase).'}
        confirmText="Normalisasi"
      />

      {/* Normalize Konflik Detail */}
      <Modal
        isOpen={isNormalizeConflictOpen}
        onClose={() => setIsNormalizeConflictOpen(false)}
        title="Detail Konflik Nomor Tes"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Beberapa data dilewati karena hasil normalisasi bertabrakan dengan nomor tes yang sudah dipakai pengguna lain.
          </p>

          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">Siswa</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">Sebelum</th>
                  <th className="text-left px-3 py-2 font-semibold text-slate-700 dark:text-slate-300">Setelah</th>
                </tr>
              </thead>
              <tbody>
                {normalizeConflicts.map((item) => (
                  <tr key={item.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{item.name}</td>
                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{item.from}</td>
                    <td className="px-3 py-2 font-mono text-red-600 dark:text-red-400">{item.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={() => setIsNormalizeConflictOpen(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* Block/Unblock Modal */}
      <Modal
        isOpen={isBlockModalOpen}
        onClose={() => setIsBlockModalOpen(false)}
        title={blockAction === 'block' ? 'Blokir Siswa' : 'Aktifkan Kembali Siswa'}
        size="sm"
      >
        <div className="space-y-4">
          <div className={`p-3 rounded-lg border ${
            blockAction === 'block' 
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50' 
              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'
          }`}>
            <p className={`text-sm ${
              blockAction === 'block' 
                ? 'text-amber-700 dark:text-amber-400' 
                : 'text-green-700 dark:text-green-400'
            }`}>
              {blockAction === 'block' 
                ? <>Blokir akun: <strong>{selectedUser?.name}</strong></>
                : <>Aktifkan kembali: <strong>{selectedUser?.name}</strong></>
              }
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedUser?.email}</p>
            {selectedUser?.class_room && (
              <p className="text-xs text-slate-600 dark:text-slate-400">Kelas: {selectedUser.class_room.name}</p>
            )}
          </div>

          {blockAction === 'block' && (
            <>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
                <p className="text-xs text-red-600 dark:text-red-400">
                  <strong>Perhatian:</strong> Siswa yang diblokir tidak dapat login ke sistem. 
                  Gunakan fitur ini untuk mencegah siswa mengerjakan ujian di luar sekolah.
                </p>
              </div>

              <Input
                label="Alasan Pemblokiran (opsional)"
                placeholder="Contoh: Tidak hadir di sekolah"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </>
          )}

          {blockAction === 'unblock' && selectedUser?.block_reason && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                <strong>Alasan blokir sebelumnya:</strong> {selectedUser.block_reason}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsBlockModalOpen(false)}>
              Batal
            </Button>
            <Button 
              onClick={handleToggleBlock} 
              disabled={submitting}
              variant={blockAction === 'block' ? 'primary' : 'primary'}
              className={blockAction === 'block' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Memproses…
                </>
              ) : blockAction === 'block' ? (
                <>
                  <Ban className="w-4 h-4 mr-2" />
                  Blokir Siswa
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Aktifkan Kembali
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Block/Unblock Modal */}
      <Modal
        isOpen={isBulkBlockModalOpen}
        onClose={() => setIsBulkBlockModalOpen(false)}
        title={bulkBlockAction === 'block' ? 'Blokir Akun Siswa (Massal)' : 'Aktifkan Akun Siswa (Massal)'}
        size="sm"
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Scope Aksi</label>
            <Select
              options={[
                { value: 'all', label: 'Semua siswa' },
                { value: 'class', label: classFilter ? `Semua siswa di kelas ${selectedClassName || classFilter}` : 'Semua siswa di kelas terfilter (pilih kelas dulu)' },
                { value: 'filter', label: `Siswa sesuai filter aktif (${filteredStudentIds.length} siswa)` },
              ]}
              value={bulkBlockScope}
              onChange={(e) => setBulkBlockScope(e.target.value as 'all' | 'class' | 'filter')}
            />
            {!classFilter && bulkBlockScope === 'class' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Filter kelas belum dipilih.</p>
            )}
          </div>

          <div className={`p-3 rounded-lg border ${
            bulkBlockAction === 'block'
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'
              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'
          }`}>
            <p className={`text-sm ${
              bulkBlockAction === 'block'
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-green-700 dark:text-green-400'
            }`}>
              {bulkBlockAction === 'block'
                ? 'Anda akan memblokir akun siswa sesuai scope yang dipilih.'
                : 'Anda akan mengaktifkan kembali akun siswa sesuai scope yang dipilih.'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {bulkBlockScope === 'all'
                ? 'Aksi akan mempengaruhi seluruh pengguna dengan role siswa.'
                : bulkBlockScope === 'class'
                  ? `Aksi akan mempengaruhi seluruh siswa pada ${selectedClassName || 'kelas terpilih'}.`
                  : `Aksi akan mempengaruhi ${filteredStudentIds.length} siswa sesuai filter aktif.`}
            </p>
          </div>

          {bulkBlockAction === 'block' && (
            <>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
                <p className="text-xs text-red-600 dark:text-red-400">
                  <strong>Perhatian:</strong> Siswa yang diblokir akan langsung logout dan tidak bisa login sampai diaktifkan kembali.
                </p>
              </div>

              <Input
                label="Alasan Pemblokiran Massal (opsional)"
                placeholder="Contoh: Ujian sedang berlangsung di sekolah"
                value={bulkBlockReason}
                onChange={(e) => setBulkBlockReason(e.target.value)}
              />
            </>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsBulkBlockModalOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={handleToggleAllStudentsBlock}
              disabled={submitting}
              className={bulkBlockAction === 'block' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Memproses…
                </>
              ) : bulkBlockAction === 'block' ? (
                <>
                  <Ban className="w-4 h-4 mr-2" />
                  Blokir Semua Siswa
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Aktifkan Semua Siswa
                </>
              )}
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
