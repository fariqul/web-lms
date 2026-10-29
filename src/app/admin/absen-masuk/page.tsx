'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { staffAttendanceAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import {
  ClipboardCheck,
  Download,
  Settings,
  Loader2,
  Users,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Navigation,
  Wifi,
  MapPin,
} from 'lucide-react';

interface StaffRow {
  user_id: number;
  name: string;
  nip: string;
  jabatan: string;
  role: 'guru' | 'staff';
  has_checked_in: boolean;
  checked_in_at: string | null;
  location_method: 'gps' | 'network' | 'manual' | null;
  is_location_valid: boolean;
}

interface Summary {
  total: number;
  sudah_absen: number;
  belum_absen: number;
}

const locationLabel = (method: string | null) => {
  if (method === 'gps')     return 'GPS';
  if (method === 'network') return 'Jaringan';
  if (method === 'manual')  return 'Manual';
  return '-';
};

const locationIcon = (method: string | null) => {
  if (method === 'gps')     return <Navigation className="w-3.5 h-3.5 text-blue-500" />;
  if (method === 'network') return <Wifi className="w-3.5 h-3.5 text-teal-500" />;
  return <MapPin className="w-3.5 h-3.5 text-slate-400" />;
};

export default function AdminAbsenMasukPage() {
  const toast = useToast();

  const [list, setList]         = useState<StaffRow[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [downloading, setDownloading] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [roleFilter, setRoleFilter]     = useState<'all' | 'guru' | 'staff'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffAttendanceAPI.adminIndex({
        date: selectedDate,
        role: roleFilter !== 'all' ? roleFilter : undefined,
      });
      const d = res.data?.data;
      setList(d?.list ?? []);
      setSummary(d?.summary ?? null);
    } catch {
      toast.error('Gagal memuat data rekap');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, roleFilter, toast]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const handleExport = async () => {
    setDownloading(true);
    try {
      const res = await staffAttendanceAPI.adminExportCsv({
        date: selectedDate,
        role: roleFilter !== 'all' ? roleFilter : undefined,
      });
      const url  = URL.createObjectURL(new Blob([res.data as BlobPart]));
      const link = document.createElement('a');
      link.href  = url;
      link.download = `absen-masuk-${selectedDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengunduh CSV');
    } finally {
      setDownloading(false);
    }
  };

  const pct = summary && summary.total > 0
    ? Math.round((summary.sudah_absen / summary.total) * 100)
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ClipboardCheck className="w-6 h-6 text-teal-500" />
              Absen Masuk Pegawai
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Rekap kehadiran guru dan staff</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/absen-masuk/settings"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm transition-colors"
            >
              <Settings className="w-4 h-4" /> Pengaturan
            </Link>
            <button
              onClick={() => void handleExport()}
              disabled={downloading || list.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tanggal</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Role</label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'all' | 'guru' | 'staff')}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="all">Semua</option>
              <option value="guru">Guru</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="mt-5 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
              <Users className="w-5 h-5 text-slate-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{summary.total}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total Pegawai</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 text-center">
              <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.sudah_absen}</p>
              <p className="text-xs text-slate-500 mt-0.5">Sudah Absen</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
              <AlertCircle className="w-5 h-5 text-amber-400 mx-auto mb-1" />
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.belum_absen}</p>
              <p className="text-xs text-slate-500 mt-0.5">Belum Absen ({pct}%)</p>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Memuat…
            </div>
          ) : list.length === 0 ? (
            <div className="text-center py-14 text-slate-500 dark:text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
              <p>Tidak ada data pegawai</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">No</th>
                    <th className="text-left px-4 py-3 font-medium">Nama</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">NIP / Jabatan</th>
                    <th className="text-center px-3 py-3 font-medium">Role</th>
                    <th className="text-center px-3 py-3 font-medium">Jam Masuk</th>
                    <th className="text-center px-3 py-3 font-medium hidden sm:table-cell">Metode</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {list.map((row, i) => (
                    <tr
                      key={row.user_id}
                      className={`transition-colors ${
                        !row.has_checked_in
                          ? 'bg-slate-50/80 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{row.name}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-slate-600 dark:text-slate-300">{row.nip}</p>
                        <p className="text-xs text-slate-400">{row.jabatan}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.role === 'guru'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {row.role === 'guru' ? 'Guru' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-sm tabular-nums text-slate-700 dark:text-slate-200">
                        {row.checked_in_at
                          ? new Date(row.checked_in_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-3 py-3 text-center hidden sm:table-cell">
                        {row.location_method ? (
                          <span className="flex items-center justify-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                            {locationIcon(row.location_method)}
                            {locationLabel(row.location_method)}
                          </span>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.has_checked_in ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                            <CheckCircle className="w-3 h-3" /> Hadir
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs rounded-full">
                            Belum
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
