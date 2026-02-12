'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Phone, ArrowLeft, Loader2, CheckCircle, User } from 'lucide-react';
import { authAPI } from '@/services/api';

export default function LupaPasswordPage() {
  const [email, setEmail] = useState('');
  const [contactType, setContactType] = useState<'whatsapp' | 'email'>('whatsapp');
  const [contactValue, setContactValue] = useState('');
  const [nama, setNama] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email akun harus diisi');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Format email tidak valid');
      return;
    }

    setIsLoading(true);
    try {
      await authAPI.forgotPassword(email, {
        contact_type: contactType,
        contact_value: contactValue || undefined,
        nama: nama || undefined,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr?.response?.data?.message || 'Gagal mengirim permintaan. Coba lagi nanti.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
            <Image src="/logo_sma15.png" alt="Logo SMA 15 Makassar" width={80} height={80} className="object-contain w-full h-full drop-shadow-md" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Lupa Password</h1>
          <p className="text-slate-500 text-sm">SMA 15 Makassar LMS</p>
        </div>

        <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-slate-100 p-8">
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Permintaan Terkirim!</h2>
              <p className="text-slate-600 mb-4">
                Permintaan reset password untuk <strong>{email}</strong> telah dikirim ke admin.
              </p>
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6 text-left">
                <p className="text-sm text-teal-800 font-medium mb-1">Langkah selanjutnya:</p>
                <ul className="text-sm text-teal-700 space-y-1 list-disc list-inside">
                  <li>Admin akan mereset password Anda</li>
                  {contactValue && (
                    <li>
                      Admin akan menghubungi Anda via{' '}
                      {contactType === 'whatsapp' ? 'WhatsApp' : 'Email'} di{' '}
                      <strong>{contactValue}</strong>
                    </li>
                  )}
                  <li>Password baru akan diinformasikan oleh admin</li>
                </ul>
              </div>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-teal-600 hover:text-teal-700 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Kembali ke halaman login
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-slate-800 text-center mb-2">Lupa Password</h2>
              <p className="text-slate-500 text-center mb-6 text-sm">
                Masukkan email akun Anda. Admin akan mereset password dan menghubungi Anda.
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Akun */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email Akun <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      placeholder="Email yang digunakan untuk login"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      required
                    />
                  </div>
                </div>

                {/* Nama Lengkap (optional) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nama Lengkap <span className="text-slate-400 text-xs">(opsional)</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Nama lengkap Anda"
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* Contact Type */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Hubungi saya via <span className="text-slate-400 text-xs">(opsional)</span>
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setContactType('whatsapp')}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        contactType === 'whatsapp'
                          ? 'border-green-500 bg-green-50 text-green-700'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      📱 WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactType('email')}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        contactType === 'email'
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      ✉️ Email
                    </button>
                  </div>
                  <div className="relative">
                    {contactType === 'whatsapp' ? (
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    ) : (
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    )}
                    <input
                      type={contactType === 'email' ? 'email' : 'tel'}
                      placeholder={
                        contactType === 'whatsapp'
                          ? 'Contoh: 08123456789'
                          : 'Email aktif Anda'
                      }
                      value={contactValue}
                      onChange={(e) => setContactValue(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Admin akan menghubungi Anda untuk memberitahu password baru
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Mengirim…
                    </>
                  ) : (
                    'Kirim Permintaan Reset'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Kembali ke halaman login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
