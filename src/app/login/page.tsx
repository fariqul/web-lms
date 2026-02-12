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
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl shadow-lg mb-4 overflow-hidden">
            <Image src="/logo_sma15.png" alt="Logo SMA 15 Makassar" width={56} height={56} className="object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">SMA 15 Makassar</h1>
          <p className="text-blue-200">Learning Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">Masuk</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">Ingat saya</span>
              </label>
              <Link href="/lupa-password" className="text-sm text-blue-600 hover:underline">
                Lupa password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          {/* Demo Login Buttons - ONLY IN DEVELOPMENT */}
          {isDevelopment && (
            <div className="mt-6 pt-6 border-t">
              <p className="text-sm text-gray-500 text-center mb-3">
                <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">DEV MODE</span>
                {' '}Demo Login (Klik untuk mengisi)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDemoLogin('admin')}
                  className="flex-1 py-2 px-3 text-xs font-medium bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition-colors"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('guru')}
                  className="flex-1 py-2 px-3 text-xs font-medium bg-teal-100 text-teal-600 rounded-lg hover:bg-teal-200 transition-colors"
                >
                  Guru
                </button>
                <button
                  type="button"
                  onClick={() => handleDemoLogin('siswa')}
                  className="flex-1 py-2 px-3 text-xs font-medium bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  Siswa
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-blue-200 text-sm mt-6">
          © 2026 SMA 15 Makassar. All rights reserved.
        </p>
      </div>
    </div>
  );
}
