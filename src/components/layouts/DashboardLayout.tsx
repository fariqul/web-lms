'use client';

import React, { ReactNode } from 'react';
import Link from 'next/link';
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

  const getRoleColor = () => {
    switch (user?.role) {
      case 'admin':
        return 'bg-orange-500';
      case 'guru':
        return 'bg-teal-500';
      case 'siswa':
        return 'bg-blue-600';
      default:
        return 'bg-blue-600';
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-64 transform transition-transform duration-300 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          getRoleColor()
        )}
      >
        {/* Logo & Header */}
        <div className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-white">
              <h1 className="font-bold text-lg leading-tight">SMA 15 Makassar LMS</h1>
              <p className="text-xs opacity-80">{getRoleLabel()}</p>
            </div>
          </div>

          {/* Mobile close button */}
          <button
            className="absolute top-4 right-4 lg:hidden text-white"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-3 flex-1 overflow-y-auto">
          {filteredNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-all duration-200',
                  isActive
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-3 border-t border-white/20">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-white/80 hover:bg-white/10 hover:text-white transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Log Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Header */}
        <header className={clsx('sticky top-0 z-30 shadow-sm', getRoleColor())}>
          <div className="flex items-center justify-between px-4 py-3">
            {/* Mobile menu button */}
            <button
              className="lg:hidden text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Page title - hidden on mobile */}
            <div className="hidden lg:block" />

            {/* User info */}
            <div className="flex items-center gap-3">
              <ThemeToggleSimple />
              <NotificationDropdown />
              <span className="text-white text-sm hidden sm:block">
                Hai, {user?.name?.split(' ')[0]}
              </span>
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-medium">
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                )}
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
