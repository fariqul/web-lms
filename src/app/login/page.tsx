'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
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
    <div className="min-h-screen flex">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-[55%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden items-center justify-center p-12">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-md text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 mb-8 overflow-hidden">
            <Image src="/logo_sma15.png" alt="Logo SMA 15 Makassar" width={96} height={96} className="object-contain drop-shadow-lg" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">SMA 15 Makassar</h1>
          <p className="text-lg text-slate-400 font-medium">Learning Management System</p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-white/10">
              <p className="text-2xl font-bold text-teal-400">QR</p>
              <p className="text-xs text-slate-400 mt-1">Absensi Digital</p>
            </div>
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 ring-1 ring-white/10">
              <p className="text-2xl font-bold text-emerald-400">CBT</p>
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
      <div className="flex-1 flex items-center justify-center p-6 bg-[#f8f9fb]">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 overflow-hidden">
              <Image src="/logo_sma15.png" alt="Logo SMA 15 Makassar" width={64} height={64} className="object-contain drop-shadow-md" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">SMA 15 Makassar</h1>
            <p className="text-slate-500 text-sm mt-1">Learning Management System</p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-slate-100 p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Masuk</h2>
              <p className="text-slate-500 text-sm mt-1">Selamat datang kembali</p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium">
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
                  className="absolute right-3 top-[34px] text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" name="rememberMe" />
                  <span className="text-sm text-slate-600">Ingat saya</span>
                </label>
                <Link href="/lupa-password" className="text-sm text-teal-600 hover:text-teal-700 font-medium">
                  Lupa password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Memproses…</span>
                  </>
                ) : (
                  'Masuk'
                )}
              </button>
            </form>

            {/* Demo Login Buttons - ONLY IN DEVELOPMENT */}
            {isDevelopment && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-sm text-slate-500 text-center mb-3">
                  <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-xs font-semibold border border-amber-100">DEV</span>
                  {' '}Demo Login
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('admin')}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors border border-amber-100"
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('guru')}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-teal-50 text-teal-700 rounded-xl hover:bg-teal-100 transition-colors border border-teal-100"
                  >
                    Guru
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDemoLogin('siswa')}
                    className="flex-1 py-2 px-3 text-xs font-semibold bg-sky-50 text-sky-700 rounded-xl hover:bg-sky-100 transition-colors border border-sky-100"
                  >
                    Siswa
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-slate-400 text-xs mt-6">
            © 2026 SMA 15 Makassar. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
