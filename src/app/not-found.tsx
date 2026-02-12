'use client';

import { FileQuestion, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-[var(--shadow-card)] border border-slate-100 dark:border-slate-700 p-8 text-center">
        <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <FileQuestion className="w-8 h-8 text-sky-500" />
        </div>
        <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">404</h2>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Halaman Tidak Ditemukan</h3>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          Halaman yang Anda cari tidak ada atau telah dipindahkan.
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-800 text-white rounded-xl hover:bg-teal-700 transition-colors font-medium text-sm"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </a>
          <button
            onClick={() => typeof window !== 'undefined' && window.history.back()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 transition-colors font-medium text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
        </div>
      </div>
    </div>
  );
}
