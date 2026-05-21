'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getSecureFileUrl, newsAPI } from '@/services/api';
import type { NewsItem } from '@/types/news';

const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'prestasi':
      return 'Prestasi';
    case 'kegiatan':
      return 'Kegiatan';
    case 'akademik':
      return 'Akademik';
    case 'pendaftaran':
      return 'Pendaftaran';
    default:
      return 'Umum';
  }
};

const formatNewsDate = (item: NewsItem) => {
  if (item.published_at_human) return item.published_at_human;
  if (!item.published_at) return '-';
  const date = new Date(item.published_at);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function NewsIndexPage() {
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadNews = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await newsAPI.getPublic({ limit: 20 });
        const rows = response.data?.data || [];
        if (mounted) {
          setNewsList(Array.isArray(rows) ? rows : []);
        }
      } catch {
        if (mounted) {
          setNewsList([]);
          setError('Gagal memuat berita.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadNews();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" />
              Kembali ke Beranda
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-white">Berita Sekolah</h1>
            <p className="text-slate-600 dark:text-slate-300">Informasi terbaru seputar kegiatan dan prestasi SMA Negeri 15 Makassar.</p>
          </div>
        </div>

        {loading ? (
          <div className="mt-10 flex items-center gap-3 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Memuat berita...
          </div>
        ) : error ? (
          <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-600 dark:text-slate-300">
            {error}
          </div>
        ) : newsList.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-600 dark:text-slate-300">
            Belum ada berita yang dipublikasikan.
          </div>
        ) : (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {newsList.map((item) => (
              <Link
                key={item.id}
                href={`/berita/${item.slug}`}
                className="group rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="h-44 bg-slate-200 dark:bg-slate-800">
                  {item.image && (
                    <img
                      src={getSecureFileUrl(item.image)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-5 space-y-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {getCategoryLabel(item.category)}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white line-clamp-2">
                    {item.title}
                  </h2>
                  {item.excerpt && (
                    <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-3">{item.excerpt}</p>
                  )}
                  <div className="text-xs text-slate-500">{formatNewsDate(item)}</div>
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Baca selengkapnya {'->'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
