'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, Button, Select, Pagination } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import {
  Shield, Loader2, Search, Calendar, User, Clock,
  UserPlus, UserMinus, Edit, Trash2, Key, FileText,
  Settings, Eye, Download, RefreshCw,
} from 'lucide-react';
import { auditLogAPI, userAPI } from '@/services/api';

interface AuditLog {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  user_role: string;
  action: string;
  description: string;
  target_type?: string;
  target_id?: number;
  ip_address: string;
  user_agent?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  created_at: string;
}

const actionLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  'user.create': { label: 'Buat User', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: UserPlus },
  'user.update': { label: 'Edit User', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: Edit },
  'user.delete': { label: 'Hapus User', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', icon: UserMinus },
  'user.reset_password': { label: 'Reset Password', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', icon: Key },
  'class.create': { label: 'Buat Kelas', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: UserPlus },
  'class.update': { label: 'Edit Kelas', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: Edit },
  'class.delete': { label: 'Hapus Kelas', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', icon: Trash2 },
  'exam.create': { label: 'Buat Ujian', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: FileText },
  'exam.update': { label: 'Edit Ujian', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: Edit },
  'exam.delete': { label: 'Hapus Ujian', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', icon: Trash2 },
  'attendance.start': { label: 'Mulai Absensi', color: 'bg-sky-100 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: Clock },
  'attendance.close': { label: 'Tutup Absensi', color: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400', icon: Clock },
  'settings.update': { label: 'Ubah Pengaturan', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', icon: Settings },
  'login': { label: 'Login', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: Key },
  'logout': { label: 'Logout', color: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400', icon: Key },
};

export default function AuditLogPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actions, setActions] = useState<string[]>([]);
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, per_page: 25 };
      if (filterAction) params.action = filterAction;
      if (filterUser) params.user_id = parseInt(filterUser);
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await auditLogAPI.getAll(params as Parameters<typeof auditLogAPI.getAll>[0]);
      const data = res.data?.data;
      setLogs(data?.data || data || []);
      setTotalPages(data?.meta?.last_page || data?.last_page || 1);
      setCurrentPage(page);
    } catch {
      toast.error('Gagal memuat audit log');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterUser, dateFrom, dateTo, toast]);

  useEffect(() => {
    const init = async () => {
      try {
        const [actionsRes, usersRes] = await Promise.all([
          auditLogAPI.getActions().catch(() => ({ data: { data: [] } })),
          userAPI.getAll({ per_page: 200 }).catch(() => ({ data: { data: [] } })),
        ]);
        setActions(actionsRes.data?.data || []);
        const usersData: Array<{ id: number; name: string; role: string }> = usersRes.data?.data?.data || usersRes.data?.data || [];
        setUsers(usersData.map(u => ({ value: u.id.toString(), label: `${u.name} (${u.role})` })));
      } catch {
        // Non-critical
      }
    };
    init();
    fetchLogs();
  }, []);

  useEffect(() => {
    fetchLogs(1);
  }, [filterAction, filterUser, dateFrom, dateTo]);

  const getActionInfo = (action: string) => {
    return actionLabels[action] || { label: action, color: 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400', icon: Eye };
  };

  const filteredLogs = searchQuery
    ? logs.filter(l =>
        l.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.user_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.action.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.warning('Tidak ada data untuk diekspor');
      return;
    }
    const headers = ['Waktu', 'User', 'Role', 'Aksi', 'Deskripsi', 'IP Address'];
    const rows = filteredLogs.map(l => [
      new Date(l.created_at).toLocaleString('id-ID'),
      l.user_name,
      l.user_role,
      getActionInfo(l.action).label,
      l.description.replace(/,/g, ';'),
      l.ip_address,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Audit log berhasil diekspor');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-800 via-slate-700 to-blue-800 dark:from-slate-900 dark:via-slate-800 dark:to-blue-900 p-5 sm:p-6 shadow-lg shadow-slate-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Shield className="w-7 h-7 text-orange-400" />
                Audit Log
              </h1>
              <p className="text-slate-300/80">Riwayat semua aktifitas dan perubahan di sistem</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => fetchLogs(currentPage)} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white">
                <RefreshCw className="w-4 h-4 mr-2" />Refresh
              </Button>
              <Button variant="outline" onClick={handleExportCSV} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white">
                <Download className="w-4 h-4 mr-2" />Export CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Cari…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                aria-label="Cari audit log"
                name="searchAudit"
              />
            </div>
            <Select
              label="Filter aksi"
              options={[
                { value: '', label: 'Semua Aksi' },
                ...actions.map(a => ({ value: a, label: getActionInfo(a).label })),
              ]}
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            />
            <Select
              label="Filter user"
              options={[{ value: '', label: 'Semua User' }, ...users]}
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
            />
            <div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                aria-label="Dari tanggal"
                name="dateFrom"
              />
            </div>
            <div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                aria-label="Sampai tanggal"
                name="dateTo"
              />
            </div>
          </div>
        </Card>

        {/* Log List */}
        <Card>
          <CardHeader
            title={`Log Aktifitas (${filteredLogs.length})`}
            subtitle="Klik baris untuk melihat detail perubahan"
          />
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada log aktifitas</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLogs.map(log => {
                const info = getActionInfo(log.action);
                const Icon = info.icon;
                const isExpanded = expandedLog === log.id;

                return (
                  <div key={log.id}>
                    <button
                      type="button"
                      className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors w-full text-left"
                      onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${info.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${info.color}`}>
                            {info.label}
                          </span>
                          <span className="text-sm text-slate-900 dark:text-white">{log.description}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.user_name}
                          </span>
                          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700/50 rounded text-[10px]">{log.user_role}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(log.created_at).toLocaleString('id-ID', { 
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          <span className="hidden sm:inline text-slate-600 dark:text-slate-400">{log.ip_address}</span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 ml-12 animate-fadeIn">
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 space-y-3 text-sm">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-slate-600 dark:text-slate-400">Email:</span> <span className="font-mono">{log.user_email}</span>
                            </div>
                            <div>
                              <span className="text-slate-600 dark:text-slate-400">IP:</span> <span className="font-mono">{log.ip_address}</span>
                            </div>
                            {log.target_type && (
                              <div>
                                <span className="text-slate-600 dark:text-slate-400">Target:</span> {log.target_type} #{log.target_id}
                              </div>
                            )}
                            <div>
                              <span className="text-slate-600 dark:text-slate-400">Waktu:</span> {new Date(log.created_at).toLocaleString('id-ID')}
                            </div>
                          </div>

                          {log.old_values && Object.keys(log.old_values).length > 0 && (
                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Nilai Sebelum:</p>
                              <pre className="bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 p-2 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.old_values, null, 2)}
                              </pre>
                            </div>
                          )}

                          {log.new_values && Object.keys(log.new_values).length > 0 && (
                            <div>
                              <p className="font-medium text-slate-700 dark:text-slate-300 mb-1">Nilai Sesudah:</p>
                              <pre className="bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400 p-2 rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.new_values, null, 2)}
                              </pre>
                            </div>
                          )}

                          {log.user_agent && (
                            <div>
                              <span className="text-slate-600 dark:text-slate-400">Browser:</span>
                              <span className="text-xs text-slate-600 dark:text-slate-400 ml-1">{log.user_agent.substring(0, 100)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => fetchLogs(page)}
              />
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
