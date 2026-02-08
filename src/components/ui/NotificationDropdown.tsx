'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCheck, Trash2, Loader2, Info, AlertTriangle, BookOpen, GraduationCap, ClipboardList, KeyRound, X, ArrowLeft, User, Mail, Phone, Shield, Copy } from 'lucide-react';
import { notificationAPI } from '@/services/api';

interface Notification {
  id: number;
  type: 'info' | 'warning' | 'exam' | 'attendance' | 'assignment' | 'announcement' | 'system' | 'password_reset_request';
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  data?: Record<string, unknown>;
}

const typeIcons: Record<string, React.ElementType> = {
  info: Info,
  warning: AlertTriangle,
  exam: GraduationCap,
  attendance: ClipboardList,
  assignment: BookOpen,
  announcement: Bell,
  system: Info,
  password_reset_request: KeyRound,
};

const typeColors: Record<string, string> = {
  info: 'text-blue-500 bg-blue-50',
  warning: 'text-yellow-500 bg-yellow-50',
  exam: 'text-purple-500 bg-purple-50',
  attendance: 'text-teal-500 bg-teal-50',
  assignment: 'text-orange-500 bg-orange-50',
  announcement: 'text-indigo-500 bg-indigo-50',
  system: 'text-gray-500 bg-gray-50',
  password_reset_request: 'text-red-500 bg-red-50',
};

const typeLabels: Record<string, string> = {
  info: 'Informasi',
  warning: 'Peringatan',
  exam: 'Ujian',
  attendance: 'Absensi',
  assignment: 'Tugas',
  announcement: 'Pengumuman',
  system: 'Sistem',
  password_reset_request: 'Reset Password',
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Baru saja';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit lalu`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam lalu`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} hari lalu`;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await notificationAPI.getUnreadCount();
      setUnreadCount(res.data?.data?.count ?? res.data?.count ?? 0);
    } catch {
      // Silently fail - notifications are non-critical
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationAPI.getAll({ per_page: 20 });
      setNotifications(res.data?.data?.data || res.data?.data || []);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 60 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await notificationAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch {
      // Ignore
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await notificationAPI.delete(id);
      const removed = notifications.find(n => n.id === id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (removed && !removed.read_at) setUnreadCount(prev => Math.max(0, prev - 1));
      if (selectedNotif?.id === id) setSelectedNotif(null);
    } catch {
      // Ignore
    }
  };

  const handleViewDetail = (notif: Notification) => {
    setSelectedNotif(notif);
    if (!notif.read_at) handleMarkAsRead(notif.id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        aria-label={`Notifikasi${unreadCount > 0 ? ` (${unreadCount} belum dibaca)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-[100] animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Notifikasi</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* Content - Detail View or List */}
          {selectedNotif ? (
            <NotificationDetail
              notif={selectedNotif}
              onBack={() => setSelectedNotif(null)}
              onDelete={(id) => { handleDelete(id); setSelectedNotif(null); }}
              onCopy={copyToClipboard}
              copied={copied}
            />
          ) : (
            <>
              {/* List */}
              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Belum ada notifikasi</p>
                  </div>
                ) : (
                  notifications.map(notif => {
                    const Icon = typeIcons[notif.type] || Info;
                    const colorClass = typeColors[notif.type] || typeColors.info;

                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleViewDetail(notif)}
                        className={`flex gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${!notif.read_at ? 'bg-blue-50/40' : ''}`}
                      >
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!notif.read_at ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-[11px] text-gray-400 mt-1">{timeAgo(notif.created_at)}</p>
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {!notif.read_at && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notif.id); }}
                              className="p-1 text-gray-400 hover:text-teal-600 rounded"
                              title="Tandai dibaca"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(notif.id); }}
                            className="p-1 text-gray-400 hover:text-red-500 rounded"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="px-4 py-2 border-t border-gray-100 text-center">
                  <button
                    onClick={() => { setOpen(false); window.location.href = '/pengumuman'; }}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                  >
                    Lihat semua pengumuman →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Detail View Component ─── */
function NotificationDetail({
  notif,
  onBack,
  onDelete,
  onCopy,
  copied,
}: {
  notif: Notification;
  onBack: () => void;
  onDelete: (id: number) => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const Icon = typeIcons[notif.type] || Info;
  const colorClass = typeColors[notif.type] || typeColors.info;
  const label = typeLabels[notif.type] || notif.type;
  const data = (notif.data || {}) as Record<string, string>;

  const isPasswordReset = notif.type === 'password_reset_request';
  const roleLabel = data.user_role === 'guru' ? 'Guru' : data.user_role === 'siswa' ? 'Siswa' : data.user_role === 'admin' ? 'Admin' : (data.user_role || '-');

  return (
    <>
      {/* Detail Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <button onClick={onBack} className="p-1 hover:bg-gray-100 rounded-lg transition-colors" title="Kembali">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-gray-500">{label}</span>
        </div>
        <button
          onClick={() => onDelete(notif.id)}
          className="p-1 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
          title="Hapus notifikasi"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Detail Body */}
      <div className="px-4 py-4 max-h-96 overflow-y-auto">
        <h4 className="font-semibold text-gray-900 text-sm mb-1">{notif.title}</h4>
        <p className="text-[11px] text-gray-400 mb-4">{timeAgo(notif.created_at)}</p>

        {isPasswordReset ? (
          <div className="space-y-3">
            {/* User Info Card */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
              <DetailRow icon={User} label="Nama" value={String(data.user_name || '-')} onCopy={onCopy} copied={copied} />
              <DetailRow icon={Mail} label="Email Akun" value={String(data.user_email || '-')} onCopy={onCopy} copied={copied} />
              <DetailRow icon={Shield} label="Role" value={roleLabel} />
            </div>

            {/* Contact Info Card */}
            {data.contact_value && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-xs font-medium text-green-800 mb-2">📞 Info Kontak</p>
                <DetailRow
                  icon={data.contact_type === 'whatsapp' ? Phone : Mail}
                  label={data.contact_type === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  value={String(data.contact_value)}
                  onCopy={onCopy}
                  copied={copied}
                  highlight
                />
              </div>
            )}

            {/* Action Hint */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-700">
                <strong>Langkah:</strong> Buka menu <strong>Kelola Akun</strong> → cari user → klik <strong>Reset Password</strong> → hubungi user via kontak di atas.
              </p>
            </div>
          </div>
        ) : (
          /* Generic notification detail */
          <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
            {notif.message}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── Detail Row Helper ─── */
function DetailRow({
  icon: IconComp,
  label,
  value,
  onCopy,
  copied,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onCopy?: (text: string) => void;
  copied?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <IconComp className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-green-600' : 'text-gray-400'}`} />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-gray-500">{label}</span>
        <p className={`text-sm font-medium truncate ${highlight ? 'text-green-800' : 'text-gray-900'}`}>{value}</p>
      </div>
      {onCopy && value !== '-' && (
        <button
          onClick={() => onCopy(value)}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors flex-shrink-0"
          title={copied ? 'Tersalin!' : 'Salin'}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
}
