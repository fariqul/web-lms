'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  Home,
  BookOpen,
  FileText,
  Users,
  Calendar,
  ClipboardList,
  Settings,
  LogOut,
  Bell,
  QrCode,
  GraduationCap,
  BarChart3,
  Menu,
  X,
  Wifi,
  Download,
  Shield,
  TrendingUp,
} from 'lucide-react';
import clsx from 'clsx';
import { NotificationDropdown } from '@/components/ui/NotificationDropdown';
import { ThemeToggleSimple } from '@/components/ui/ThemeToggle';

interface SidebarProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  roles: string[];
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: Home, roles: ['admin', 'guru', 'siswa'] },
  // Guru only
  { name: 'Sesi Absensi', href: '/absensi', icon: ClipboardList, roles: ['guru'] },
  { name: 'Ujian / CBT', href: '/ujian', icon: GraduationCap, roles: ['guru'] },
  { name: 'Bank Soal', href: '/bank-soal', icon: FileText, roles: ['guru'] },
  { name: 'Tugas', href: '/tugas', icon: FileText, roles: ['guru'] },
  { name: 'Materi Pelajaran', href: '/materi', icon: BookOpen, roles: ['guru'] },
  { name: 'Nilai Siswa', href: '/nilai', icon: BarChart3, roles: ['guru'] },
  { name: 'Progress Siswa', href: '/progress', icon: TrendingUp, roles: ['guru'] },
  // Siswa only
  { name: 'Scan QR Absensi', href: '/scan-qr', icon: QrCode, roles: ['siswa'] },
  { name: 'Ujian Saya', href: '/ujian-siswa', icon: GraduationCap, roles: ['siswa'] },
  { name: 'Bank Soal', href: '/dashboard/siswa/bank-soal', icon: FileText, roles: ['siswa'] },
  { name: 'Tugas Saya', href: '/tugas-siswa', icon: FileText, roles: ['siswa'] },
  { name: 'Riwayat Absensi', href: '/riwayat-absensi', icon: ClipboardList, roles: ['siswa'] },
  { name: 'Materi Pelajaran', href: '/materi-siswa', icon: BookOpen, roles: ['siswa'] },
  { name: 'Nilai Saya', href: '/nilai-siswa', icon: BarChart3, roles: ['siswa'] },
  // Shared
  { name: 'Jadwal', href: '/jadwal', icon: Calendar, roles: ['guru', 'siswa'] },
  // Admin only
  { name: 'Kelola Pengguna', href: '/admin/users', icon: Users, roles: ['admin'] },
  { name: 'Kelola Kelas', href: '/admin/kelas', icon: GraduationCap, roles: ['admin'] },
  { name: 'Manajemen Jadwal', href: '/admin/jadwal', icon: Calendar, roles: ['admin'] },
  { name: 'Jaringan Sekolah', href: '/admin/jaringan', icon: Wifi, roles: ['admin'] },
  { name: 'Statistik', href: '/admin/statistik', icon: BarChart3, roles: ['admin'] },
  { name: 'Export Data', href: '/admin/export', icon: Download, roles: ['admin'] },
  { name: 'Audit Log', href: '/admin/audit-log', icon: Shield, roles: ['admin'] },
  // Common
  { name: 'Pengumuman', href: '/pengumuman', icon: Bell, roles: ['admin', 'guru', 'siswa'] },
  { name: 'Akun Saya', href: '/akun', icon: Settings, roles: ['admin', 'guru', 'siswa'] },
];

export default function DashboardLayout({ children }: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const filteredNavigation = navigation.filter(
    (item) => user && item.roles.includes(user.role)
  );

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'admin':
        return 'Administrator';
      case 'guru':
        return 'Dashboard Guru';
      case 'siswa':
        return 'E-Learning Portal';
      default:
        return '';
    }
  };

  const getRoleAccent = () => {
    switch (user?.role) {
      case 'admin':
        return 'bg-orange-400';
      case 'guru':
        return 'bg-cyan-500';
      case 'siswa':
        return 'bg-sky-500';
      default:
        return 'bg-blue-800';
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden cursor-pointer"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-[260px] transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:translate-x-0',
          'bg-[#0f172a] border-r border-white/[0.06] shadow-xl shadow-black/20',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo & Header */}
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <Image src="/logo_sma15.png" alt="Logo SMA 15" width={40} height={40} className="object-contain w-full h-full" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-[15px] text-white leading-tight tracking-tight">SMA 15 Makassar</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${getRoleAccent()}`} />
                <p className="text-[11px] text-slate-400 font-medium">{getRoleLabel()}</p>
              </div>
            </div>
          </div>

          {/* Mobile close button */}
          <button
            className="absolute top-5 right-4 lg:hidden text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            onClick={() => setSidebarOpen(false)}
            aria-label="Tutup menu navigasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-2 px-3 flex-1 overflow-y-auto pb-4" aria-label="Menu utama" style={{ maxHeight: 'calc(100vh - 145px)' }}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">Menu</p>
          {filteredNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset',
                  isActive
                    ? 'bg-gradient-to-r from-blue-800/25 to-cyan-800/15 text-sky-400 border-l-2 border-sky-500 -ml-px pl-[11px] shadow-sm shadow-sky-500/10'
                    : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className={clsx('w-[18px] h-[18px] flex-shrink-0 transition-colors', isActive ? 'text-sky-400' : 'text-slate-500 group-hover:text-slate-300')} />
                <span className="text-[13px] font-medium">{item.name}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-sky-400 shadow-sm shadow-sky-400/50" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-inset"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span className="text-[13px] font-medium">Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-[260px]">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center justify-between px-4 lg:px-6 h-[60px]">
            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
              onClick={() => setSidebarOpen(true)}
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Spacer */}
            <div className="hidden lg:block" />

            {/* User info */}
            <div className="flex items-center gap-2">
              <ThemeToggleSimple />
              <NotificationDropdown />
              <div className="hidden sm:flex items-center gap-3 ml-2 pl-3 border-l border-border">
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground leading-tight">{user?.name?.split(' ')[0]}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{user?.role}</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-700 to-cyan-500 flex items-center justify-center overflow-hidden ring-2 ring-white dark:ring-slate-700 shadow-sm">
                  {(user?.photo || user?.avatar) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photo || user.avatar}
                      alt={user?.name || ''}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-sm font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
