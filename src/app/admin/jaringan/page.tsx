'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input, ConfirmDialog } from '@/components/ui';
import {
  Wifi,
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  Check,
  AlertCircle,
  Loader2,
  Globe,
  Shield,
  RefreshCw,
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';

interface NetworkSetting {
  id: number;
  name: string;
  ip_range: string;
  is_active: boolean;
  created_at: string;
}

export default function JaringanSekolahPage() {
  const toast = useToast();
  const [networks, setNetworks] = useState<NetworkSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentIp, setCurrentIp] = useState<string>('');
  const [isCurrentIpInNetwork, setIsCurrentIpInNetwork] = useState<boolean>(false);
  const [checkingIp, setCheckingIp] = useState(false);
  const [ipDebugInfo, setIpDebugInfo] = useState<{
    raw_ip?: string;
    x_forwarded_for?: string;
    x_real_ip?: string;
  }>({});
  const [deleteNetworkId, setDeleteNetworkId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    ip_range: '',
    is_active: true,
  });

  useEffect(() => {
    fetchNetworks();
    checkCurrentIp();
  }, []);

  const fetchNetworks = async () => {
    try {
      const response = await api.get('/school-network-settings');
      setNetworks(response.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch networks:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkCurrentIp = async () => {
    setCheckingIp(true);
    try {
      const response = await api.get('/school-network-settings/test-ip');
      const data = response.data?.data;
      setCurrentIp(data?.ip_address || '');
      setIsCurrentIpInNetwork(data?.is_school_network || false);
      setIpDebugInfo({
        raw_ip: data?.raw_ip,
        x_forwarded_for: data?.x_forwarded_for,
        x_real_ip: data?.x_real_ip,
      });
    } catch (error) {
      console.error('Failed to check IP:', error);
      toast.error('Gagal mengecek IP');
    } finally {
      setCheckingIp(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.ip_range) {
      toast.warning('Nama dan IP Range wajib diisi');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/school-network-settings/${editingId}`, formData);
      } else {
        await api.post('/school-network-settings', formData);
      }
      fetchNetworks();
      resetForm();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (network: NetworkSetting) => {
    setEditingId(network.id);
    setFormData({
      name: network.name,
      ip_range: network.ip_range,
      is_active: network.is_active,
    });
    setShowAddForm(true);
  };

  const handleDelete = (id: number) => {
    setDeleteNetworkId(id);
  };

  const confirmDelete = async () => {
    if (deleteNetworkId === null) return;
    try {
      await api.delete(`/school-network-settings/${deleteNetworkId}`);
      fetchNetworks();
    } catch (error) {
      console.error('Failed to delete:', error);
      toast.error('Gagal menghapus');
    } finally {
      setDeleteNetworkId(null);
    }
  };

  const handleToggleActive = async (network: NetworkSetting) => {
    try {
      await api.put(`/school-network-settings/${network.id}`, {
        is_active: !network.is_active,
      });
      fetchNetworks();
    } catch (error) {
      console.error('Failed to toggle:', error);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', ip_range: '', is_active: true });
    setEditingId(null);
    setShowAddForm(false);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pengaturan Jaringan Sekolah</h1>
            <p className="text-slate-600 dark:text-slate-400">Kelola IP range yang diizinkan untuk absensi</p>
          </div>
          <Button onClick={() => setShowAddForm(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Jaringan
          </Button>
        </div>

        {/* Current IP Info */}
        <Card className="p-4 bg-gradient-to-r from-teal-50 to-teal-100 border-sky-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-500 rounded-full flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-sky-500 font-medium">IP Address Anda Saat Ini</p>
              <p className="text-xl font-bold text-teal-900">
                {checkingIp ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Mengecek…
                  </span>
                ) : (
                  currentIp || 'Tidak terdeteksi'
                )}
              </p>
            </div>
            <button
              onClick={checkCurrentIp}
              disabled={checkingIp}
              className="px-4 py-2 bg-blue-800 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2 font-medium text-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${checkingIp ? 'animate-spin' : ''}`} />
              Tes IP
            </button>
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${
              isCurrentIpInNetwork 
                ? 'bg-green-100 text-green-700' 
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              {isCurrentIpInNetwork ? (
                <>
                  <Check className="w-4 h-4" />
                  <span className="font-medium">Dalam Jaringan Sekolah</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">Di Luar Jaringan Sekolah</span>
                </>
              )}
            </div>
          </div>
          {/* Debug info - show raw IP details */}
          {(ipDebugInfo.raw_ip || ipDebugInfo.x_forwarded_for || ipDebugInfo.x_real_ip) && (
            <div className="mt-3 pt-3 border-t border-sky-200 text-xs text-sky-500 space-y-1">
              {ipDebugInfo.raw_ip && (
                <p>Raw Server IP: <span className="font-mono">{ipDebugInfo.raw_ip}</span></p>
              )}
              {ipDebugInfo.x_forwarded_for && (
                <p>X-Forwarded-For: <span className="font-mono">{ipDebugInfo.x_forwarded_for}</span></p>
              )}
              {ipDebugInfo.x_real_ip && (
                <p>X-Real-IP: <span className="font-mono">{ipDebugInfo.x_real_ip}</span></p>
              )}
            </div>
          )}
        </Card>

        {/* Add/Edit Form */}
        {showAddForm && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Edit Jaringan' : 'Tambah Jaringan Baru'}
              </h3>
              <button onClick={resetForm} className="text-slate-500 dark:text-slate-500 hover:text-slate-600" aria-label="Tutup form">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Jaringan
                </label>
                <Input
                  placeholder="Contoh: WiFi Utama Sekolah"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  IP Range
                </label>
                <Input
                  placeholder="192.168.1.0/24 atau 192.168.1.1-192.168.1.255"
                  value={formData.ip_range}
                  onChange={(e) => setFormData({ ...formData, ip_range: e.target.value })}
                />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg mb-4">
              <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-2">Format IP Range:</h4>
              <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                <li>• <strong>CIDR:</strong> 192.168.1.0/24 (semua IP dari 192.168.1.0 - 192.168.1.255)</li>
                <li>• <strong>Range:</strong> 192.168.1.1-192.168.1.100 (IP spesifik)</li>
                <li>• <strong>Single IP:</strong> 192.168.1.1 (hanya satu IP)</li>
              </ul>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-sky-500 border-slate-300 rounded"
              />
              <label htmlFor="is_active" className="text-sm text-slate-700 dark:text-slate-300">
                Aktifkan jaringan ini
              </label>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} leftIcon={<Save className="w-4 h-4" />}>
                {saving ? 'Menyimpan…' : 'Simpan'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Batal
              </Button>
            </div>
          </Card>
        )}

        {/* Network List */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-slate-50 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-sky-500" />
              Daftar Jaringan yang Diizinkan
            </h3>
          </div>

          {networks.length === 0 ? (
            <div className="p-12 text-center">
              <Wifi className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada jaringan yang dikonfigurasi</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
                Absensi dapat dilakukan dari mana saja jika tidak ada jaringan yang dikonfigurasi
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {networks.map((network) => (
                <div
                  key={network.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      network.is_active ? 'bg-green-100' : 'bg-slate-100'
                    }`}>
                      <Wifi className={`w-5 h-5 ${
                        network.is_active ? 'text-green-600' : 'text-slate-500 dark:text-slate-500'
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{network.name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-mono">{network.ip_range}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleActive(network)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        network.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {network.is_active ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button
                      onClick={() => handleEdit(network)}
                      className="p-2 text-sky-500 hover:bg-sky-50 rounded-lg"
                      aria-label="Edit jaringan"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(network.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label="Hapus jaringan"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Info Card */}
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Penting</p>
              <p className="text-sm text-yellow-700 mt-1">
                Jika tidak ada jaringan yang dikonfigurasi atau semua dinonaktifkan, siswa dapat absensi 
                dari jaringan manapun. Untuk mengaktifkan validasi jaringan, guru harus mengaktifkan 
                opsi &quot;Wajibkan WiFi Sekolah&quot; saat membuat sesi absensi.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        isOpen={deleteNetworkId !== null}
        onClose={() => setDeleteNetworkId(null)}
        onConfirm={confirmDelete}
        title="Hapus Jaringan"
        message="Yakin ingin menghapus jaringan ini?"
        confirmText="Hapus"
        variant="danger"
      />
    </DashboardLayout>
  );
}
