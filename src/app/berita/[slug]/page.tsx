'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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

const getAuthorName = (author?: NewsItem['author']) => {
  if (!author) return null;
  if (typeof author === 'string') return author;
  return author.name;
};

const renderNewsContent = (content: string, fallbackAlt: string) => {
  const tokens: Array<{ url: string; caption?: string }> = [];
  const cleaned = content.replace(/\[\[img:([^\]]+)\]\]/g, (_match, rawToken: string) => {
    const [rawUrl, rawCaption] = rawToken.split('|');
    const url = rawUrl?.trim();
    if (url) {
      tokens.push({
        url,
        caption: rawCaption?.trim() || undefined,
      });
    }
    return '';
  });

  const paragraphs = cleaned
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const output: ReactNode[] = [];
  const total = Math.max(paragraphs.length, tokens.length);

  for (let index = 0; index < total; index += 1) {
    const paragraph = paragraphs[index];
    if (paragraph) {
      output.push(
        <p key={`news-paragraph-${index}`} className="whitespace-pre-line" style={{ textAlign: 'justify' }}>
          {paragraph}
        </p>
      );
    }

    const token = tokens[index];
    if (token) {
      const url = getSecureFileUrl(token.url);
      if (url) {
        output.push(
          <figure key={`news-image-${index}`} className="space-y-2">
            <img
              src={url}
              alt={token.caption || fallbackAlt}
              className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 object-cover"
              loading="lazy"
            />
            {token.caption && (
              <figcaption className="text-xs text-slate-500 dark:text-slate-400">{token.caption}</figcaption>
            )}
          </figure>
        );
      }
    }
  }

  return output;
};

export default function NewsDetailPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : params.slug?.[0];
  const [news, setNews] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let mounted = true;

    const loadNews = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await newsAPI.getPublicBySlug(slug);
        const data = response.data?.data as NewsItem | undefined;
        if (mounted) {
          setNews(data || null);
        }
      } catch {
        if (mounted) {
          setError('Berita tidak ditemukan atau sudah dihapus.');
          setNews(null);
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
  }, [slug]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Beranda
        </Link>

        {loading ? (
          <div className="mt-12 flex items-center gap-3 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Memuat berita...
          </div>
        ) : error ? (
          <div className="mt-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-600 dark:text-slate-300">
            {error}
          </div>
        ) : news ? (
          <article className="mt-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            {news.image && (
              <img
                src={getSecureFileUrl(news.image)}
                alt={news.title}
                className="w-full h-72 object-cover"
              />
            )}
            <div className="p-6 md:p-8 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {getCategoryLabel(news.category)}
                </span>
                <span>{formatNewsDate(news)}</span>
                {getAuthorName(news.author) && <span>- {getAuthorName(news.author)}</span>}
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">{news.title}</h1>
              {news.excerpt && (
                <p className="text-slate-600 dark:text-slate-300">{news.excerpt}</p>
              )}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 text-slate-700 dark:text-slate-200 leading-relaxed space-y-4">
                {news.content?.trim() ? renderNewsContent(news.content, news.title) : 'Konten berita belum tersedia.'}
              </div>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}
