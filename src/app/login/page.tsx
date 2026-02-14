'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { Eye, EyeOff } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

// Demo login only available in development mode
const isDevelopment = process.env.NODE_ENV === 'development';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Client-side validation
    if (!loginId || !password) {
      setError('Email/NIS dan password harus diisi');
      return;
    }
    
    if (password.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    
    setIsLoading(true);

    try {
      await login(loginId, password);
      router.push('/dashboard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Email/NIS atau password salah';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Demo login for testing - ONLY in development
  const handleDemoLogin = (role: 'admin' | 'guru' | 'siswa') => {
    if (!isDevelopment) return;
    
    const demoCredentials = {
      admin: { login: 'admin@sma15mks.sch.id', password: 'Password123' },
      guru: { login: 'guru@sma15mks.sch.id', password: 'Password123' },
      siswa: { login: 'siswa@sma15mks.sch.id', password: 'Password123' },
    };
    setLoginId(demoCredentials[role].login);
    setPassword(demoCredentials[role].password);
  };

  return (
    <div className="min-h-screen flex bg-[#f8f9fb] dark:bg-slate-950">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden items-center justify-center p-12">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-28 h-28 mb-8">
            <Image src="/logo_sma15.png" alt="Logo SMA 15 Makassar" width={112} height={112} className="object-contain w-full h-full drop-shadow-lg" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">SMA 15 Makassar</h1>
          <p className="text-lg text-slate-400 font-medium">Learning Management System</p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-white/10">
              <p className="text-2xl font-bold text-cyan-400">QR</p>
              <p className="text-xs text-slate-400 mt-1">Absensi Digital</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-white/10">
              <p className="text-2xl font-bold text-blue-400">CBT</p>
              <p className="text-xs text-slate-400 mt-1">Ujian Online</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-white/10">
              <p className="text-2xl font-bold text-sky-400">LMS</p>
              <p className="text-xs text-slate-400 mt-1">E-Learning</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <Image src="/logo_sma15.png" alt="Logo SMA 15 Makassar" width={80} height={80} className="object-contain w-full h-full drop-shadow-md" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">SMA 15 Makassar</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Learning Management System</p>
          </div>

          {/* Login Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-[var(--shadow-card)] border border-slate-100 dark:border-slate-700 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Masuk</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Selamat datang kembali</p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                type="text"
                label="Email / NIS"
                placeholder="Masukkan email atau NIS"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />

              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded-lg transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" name="rememberMe" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Ingat saya</span>
                </label>
                <Link href="/lupa-password" className="text-sm text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 font-medium transition-colors">
                  Lupa password?
                </Link>
              </div>

              <Button
                type="submit"
                isLoading={isLoading}
                loadingText="Memproses…"
                fullWidth
                size="lg"
                className="shadow-sm"
              >
                Masuk
              </Button>
            </form>

            {/* Demo Login Buttons - ONLY IN DEVELOPMENT */}
            {isDevelopment && (
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-700">
                <p className="text-sm text-slate-600 dark:text-slate-400 text-center mb-3">
                  <span className="bg-orange-50 text-orange-600 px-2 py-1 rounded-lg text-xs font-semibold border border-orange-100">DEV</span>
                  {' '}Demo Login
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('admin')}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors border border-orange-100 cursor-pointer active:scale-[0.97]"
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('guru')}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-cyan-50 text-cyan-700 rounded-xl hover:bg-cyan-100 transition-colors border border-cyan-100 cursor-pointer active:scale-[0.97]"
                  >
                    Guru
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('siswa')}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-sky-50 text-sky-700 rounded-xl hover:bg-sky-100 transition-colors border border-sky-100 cursor-pointer active:scale-[0.97]"
                  >
                    Siswa
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-500 dark:text-slate-400 text-xs mt-6">
            © 2026 SMA 15 Makassar. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
