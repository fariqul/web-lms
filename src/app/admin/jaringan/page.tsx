'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, Button, Input } from '@/components/ui';
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
} from 'lucide-react';
import api from '@/services/api';

interface NetworkSetting {
  id: number;
  name: string;
  ip_range: string;
  is_active: boolean;
  created_at: string;
}

export default function JaringanSekolahPage() {
  const [networks, setNetworks] = useState<NetworkSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentIp, setCurrentIp] = useState<string>('');
  const [isCurrentIpInNetwork, setIsCurrentIpInNetwork] = useState<boolean>(false);

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
    try {
      const response = await api.get('/school-network-settings/test-ip');
      setCurrentIp(response.data?.data?.ip_address || '');
      setIsCurrentIpInNetwork(response.data?.data?.is_school_network || false);
    } catch (error) {
      console.error('Failed to check IP:', error);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.ip_range) {
      alert('Nama dan IP Range wajib diisi');
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
      alert(err.response?.data?.message || 'Gagal menyimpan');
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

  const handleDelete = async (id: number) => {
    if (!confirm('Yakin ingin menghapus jaringan ini?')) return;

    try {
      await api.delete(`/school-network-settings/${id}`);
      fetchNetworks();
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Gagal menghapus');
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
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
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
            <h1 className="text-2xl font-bold text-gray-900">Pengaturan Jaringan Sekolah</h1>
            <p className="text-gray-600">Kelola IP range yang diizinkan untuk absensi</p>
          </div>
          <Button onClick={() => setShowAddForm(true)} leftIcon={<Plus className="w-4 h-4" />}>
            Tambah Jaringan
          </Button>
        </div>

        {/* Current IP Info */}
        <Card className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-blue-600 font-medium">IP Address Anda Saat Ini</p>
              <p className="text-xl font-bold text-blue-900">{currentIp || 'Tidak terdeteksi'}</p>
            </div>
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
        </Card>

        {/* Add/Edit Form */}
        {showAddForm && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {editingId ? 'Edit Jaringan' : 'Tambah Jaringan Baru'}
              </h3>
              <button onClick={resetForm} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nama Jaringan
                </label>
                <Input
                  placeholder="Contoh: WiFi Utama Sekolah"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IP Range
                </label>
                <Input
                  placeholder="192.168.1.0/24 atau 192.168.1.1-192.168.1.255"
                  value={formData.ip_range}
                  onChange={(e) => setFormData({ ...formData, ip_range: e.target.value })}
                />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <h4 className="font-medium text-gray-700 mb-2">Format IP Range:</h4>
              <ul className="text-sm text-gray-600 space-y-1">
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
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                Aktifkan jaringan ini
              </label>
            </div>

            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving} leftIcon={<Save className="w-4 h-4" />}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Batal
              </Button>
            </div>
          </Card>
        )}

        {/* Network List */}
        <Card className="overflow-hidden">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Daftar Jaringan yang Diizinkan
            </h3>
          </div>

          {networks.length === 0 ? (
            <div className="p-12 text-center">
              <Wifi className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Belum ada jaringan yang dikonfigurasi</p>
              <p className="text-sm text-gray-400 mt-2">
                Absensi dapat dilakukan dari mana saja jika tidak ada jaringan yang dikonfigurasi
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {networks.map((network) => (
                <div
                  key={network.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      network.is_active ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Wifi className={`w-5 h-5 ${
                        network.is_active ? 'text-green-600' : 'text-gray-400'
                      }`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{network.name}</p>
                      <p className="text-sm text-gray-500 font-mono">{network.ip_range}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleActive(network)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        network.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {network.is_active ? 'Aktif' : 'Nonaktif'}
                    </button>
                    <button
                      onClick={() => handleEdit(network)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(network.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
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
    </DashboardLayout>
  );
}
