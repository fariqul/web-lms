'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
/* eslint-disable @next/next/no-img-element */
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Textarea, Checkbox, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, Loader2, Star } from 'lucide-react';
import { getSecureFileUrl, newsAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/api-error';
import type { NewsCategory, NewsItem, NewsPayload } from '@/types/news';

type StatusFilter = 'all' | 'published' | 'draft';

type FormState = {
  title: string;
  category: NewsCategory;
  excerpt: string;
  content: string;
  is_featured: boolean;
  is_published: boolean;
};

const categoryOptions: Array<{ value: NewsCategory; label: string }> = [
  { value: 'prestasi', label: 'Prestasi' },
  { value: 'kegiatan', label: 'Kegiatan' },
  { value: 'akademik', label: 'Akademik' },
  { value: 'pendaftaran', label: 'Pendaftaran' },
  { value: 'umum', label: 'Umum' },
];

const categoryFilterOptions = [
  { value: 'all', label: 'Semua Kategori' },
  ...categoryOptions,
];

const statusOptions = [
  { value: 'all', label: 'Semua Status' },
  { value: 'published', label: 'Terbit' },
  { value: 'draft', label: 'Draft' },
];

const emptyForm: FormState = {
  title: '',
  category: 'umum',
  excerpt: '',
  content: '',
  is_featured: false,
  is_published: false,
};

const MAX_INLINE_IMAGE_SIZE = 5 * 1024 * 1024;

const getCategoryLabel = (category: string) => {
  const match = categoryOptions.find((item) => item.value === category);
  return match?.label || category;
};

const formatNewsDate = (item: NewsItem) => {
  if (item.published_at_human) return item.published_at_human;
  if (!item.published_at) return '-';
  const date = new Date(item.published_at);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function AdminBeritaPage() {
  const toast = useToast();
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | NewsCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imagePreviewRef = useRef<string | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement | null>(null);
  const [inlineUploading, setInlineUploading] = useState(false);

  const fetchNews = useCallback(async (search?: string, category?: 'all' | NewsCategory, status?: StatusFilter) => {
    setLoading(true);
    try {
      const params: {
        per_page: number;
        search?: string;
        category?: string;
        status?: 'draft' | 'published';
      } = { per_page: 50 };
      if (search?.trim()) params.search = search.trim();
      if (category && category !== 'all') params.category = category;
      if (status && status !== 'all') params.status = status;

      const response = await newsAPI.getAll(params);
      const payload = response.data?.data;
      const list = Array.isArray(payload) ? payload : (payload?.data || []);
      setNewsList(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal memuat data berita'));
      setNewsList([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchNews(searchQuery, categoryFilter, statusFilter);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [fetchNews, searchQuery, categoryFilter, statusFilter]);

  const totalPublished = useMemo(
    () => newsList.filter((item) => item.is_published).length,
    [newsList]
  );
  const totalDraft = Math.max(0, newsList.length - totalPublished);

  const resetImagePreview = () => {
    if (imagePreviewRef.current) {
      URL.revokeObjectURL(imagePreviewRef.current);
      imagePreviewRef.current = null;
    }
    setImagePreview(null);
    setImageFile(null);
  };

  const resetForm = () => {
    setSelectedNews(null);
    setFormData(emptyForm);
    resetImagePreview();
  };

  const insertContentSnippet = useCallback((snippet: string) => {
    const target = contentRef.current;
    const selectionStart = target?.selectionStart ?? null;
    const selectionEnd = target?.selectionEnd ?? null;

    setFormData((prev) => {
      const current = prev.content || '';
      const start = selectionStart ?? current.length;
      const end = selectionEnd ?? current.length;
      const insert = `\n\n${snippet}\n\n`;
      const nextValue = `${current.slice(0, start)}${insert}${current.slice(end)}`;

      requestAnimationFrame(() => {
        if (!contentRef.current) return;
        const cursor = start + insert.length;
        contentRef.current.focus();
        contentRef.current.selectionStart = cursor;
        contentRef.current.selectionEnd = cursor;
      });

      return { ...prev, content: nextValue };
    });
  }, []);

  const renderContentPreview = useCallback((content: string) => {
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
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    const output: React.ReactNode[] = [];
    const total = Math.max(paragraphs.length, tokens.length);

    for (let index = 0; index < total; index += 1) {
      const paragraph = paragraphs[index];
      if (paragraph) {
        output.push(
          <p key={`preview-paragraph-${index}`} className="whitespace-pre-line" style={{ textAlign: 'justify' }}>
            {paragraph}
          </p>
        );
      }

      const token = tokens[index];
      if (token) {
        const url = getSecureFileUrl(token.url);
        if (url) {
          output.push(
            <figure key={`preview-image-${index}`} className="space-y-2">
              <img
                src={url}
                alt={token.caption || formData.title || 'Foto berita'}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 object-cover"
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
  }, [formData.title]);

  const contentPreview = useMemo(
    () => renderContentPreview(formData.content || ''),
    [formData.content, renderContentPreview]
  );

  const previewDate = useMemo(
    () => new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
    []
  );
  const previewCoverUrl = useMemo(() => {
    if (imagePreview) return imagePreview;
    if (selectedNews?.image) return getSecureFileUrl(selectedNews.image);
    return '';
  }, [imagePreview, selectedNews?.image]);
  const previewTitle = formData.title.trim() || 'Judul berita';
  const previewExcerpt = formData.excerpt.trim();
  const previewCategoryLabel = getCategoryLabel(formData.category);
  const previewDateLabel = formData.is_published ? previewDate : 'Draft';

  const handleOpenModal = (item?: NewsItem) => {
    if (item) {
      setSelectedNews(item);
      setFormData({
        title: item.title,
        category: item.category,
        excerpt: item.excerpt || '',
        content: item.content || '',
        is_featured: Boolean(item.is_featured),
        is_published: Boolean(item.is_published),
      });
      resetImagePreview();
      if (item.image) {
        setImagePreview(getSecureFileUrl(item.image));
      }
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleDeleteClick = (item: NewsItem) => {
    setSelectedNews(item);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedNews) return;
    setSubmitting(true);
    try {
      await newsAPI.delete(selectedNews.id);
      toast.success('Berita berhasil dihapus');
      setIsDeleteDialogOpen(false);
      setSelectedNews(null);
      fetchNews(searchQuery, categoryFilter, statusFilter);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menghapus berita'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    resetImagePreview();
    const previewUrl = URL.createObjectURL(file);
    imagePreviewRef.current = previewUrl;
    setImageFile(file);
    setImagePreview(previewUrl);
    event.target.value = '';
  };

  const handleInlineImagesChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    event.target.value = '';

    const invalidType = files.find((file) => !file.type.startsWith('image/'));
    if (invalidType) {
      toast.warning('File harus berupa gambar.');
      return;
    }

    const oversize = files.find((file) => file.size > MAX_INLINE_IMAGE_SIZE);
    if (oversize) {
      toast.warning('Ukuran foto maksimal 5MB per file.');
      return;
    }

    setInlineUploading(true);
    try {
      const results = await Promise.allSettled(
        files.map((file) => newsAPI.uploadContentImage(file))
      );

      const tokens: string[] = [];
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const path = result.value.data?.data?.path as string | undefined;
          if (path) {
            tokens.push(`[[img:${path}]]`);
          } else {
            failedCount += 1;
          }
        } else {
          failedCount += 1;
        }
      });

      if (tokens.length > 0) {
        insertContentSnippet(tokens.join('\n\n'));
        toast.success('Foto konten berhasil disisipkan.');
      }

      if (failedCount > 0) {
        toast.error(`${failedCount} foto gagal diunggah.`);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal mengunggah foto konten'));
    } finally {
      setInlineUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.title.trim()) {
      toast.warning('Judul berita wajib diisi');
      return;
    }

    if (!formData.category) {
      toast.warning('Kategori berita wajib dipilih');
      return;
    }

    const payload: NewsPayload = {
      title: formData.title.trim(),
      category: formData.category,
      excerpt: formData.excerpt.trim() || undefined,
      content: formData.content.trim() || undefined,
      is_featured: formData.is_featured,
      is_published: formData.is_published,
    };

    setSubmitting(true);
    try {
      if (selectedNews) {
        await newsAPI.update(selectedNews.id, payload, imageFile || undefined);
        toast.success('Berita berhasil diperbarui');
      } else {
        await newsAPI.create(payload, imageFile || undefined);
        toast.success('Berita berhasil ditambahkan');
      }
      handleCloseModal();
      fetchNews(searchQuery, categoryFilter, statusFilter);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menyimpan berita'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Judul',
      render: (item: NewsItem) => {
        const authorName = typeof item.author === 'string' ? item.author : item.author?.name;
        return (
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[320px] truncate">
              {item.excerpt || 'Tanpa ringkasan'}
            </p>
            {authorName && (
              <p className="text-[11px] text-slate-400">Oleh {authorName}</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'category',
      header: 'Kategori',
      render: (item: NewsItem) => (
        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          {getCategoryLabel(item.category)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: NewsItem) => (
        <span
          className={
            item.is_published
              ? 'inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 text-xs font-semibold'
              : 'inline-flex items-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 text-xs font-semibold'
          }
        >
          {item.is_published ? 'Terbit' : 'Draft'}
        </span>
      ),
    },
    {
      key: 'featured',
      header: 'Sorotan',
      className: 'text-center',
      render: (item: NewsItem) => (
        <div className="inline-flex items-center justify-center text-amber-500">
          {item.is_featured ? <Star className="w-4 h-4 fill-amber-400" /> : '-'}
        </div>
      ),
    },
    {
      key: 'published_at',
      header: 'Tanggal',
      render: (item: NewsItem) => (
        <span className="text-xs text-slate-600 dark:text-slate-300">{formatNewsDate(item)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-center',
      render: (item: NewsItem) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
            aria-label="Edit berita"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            aria-label="Hapus berita"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{newsList.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Berita</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{totalPublished}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Berita Terbit</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-slate-600 dark:text-slate-300">{totalDraft}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Draft</p>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Kelola Berita"
            subtitle={`${newsList.length} berita terdaftar`}
            action={(
              <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => handleOpenModal()}>
                Tambah Berita
              </Button>
            )}
          />

          <div className="flex flex-col md:flex-row gap-4 mb-5">
            <div className="flex-1">
              <Input
                placeholder="Cari berita..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="w-full md:w-56">
              <Select
                options={categoryFilterOptions}
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | NewsCategory)}
              />
            </div>
            <div className="w-full md:w-48">
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              />
            </div>
          </div>

          <Table
            columns={columns}
            data={newsList}
            keyExtractor={(item) => item.id}
            isLoading={loading}
            emptyMessage="Belum ada berita"
          />
        </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedNews ? 'Edit Berita' : 'Tambah Berita'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Judul Berita"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Contoh: Tim Olimpiade SMA 15 Raih Emas"
            required
          />
          <Select
            label="Kategori"
            options={categoryOptions}
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as NewsCategory })}
          />
          <Textarea
            label="Ringkasan (Opsional)"
            value={formData.excerpt}
            onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
            placeholder="Ringkasan singkat berita"
            rows={3}
          />
          <Textarea
            label="Konten Berita (Opsional)"
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            placeholder="Isi berita lengkap"
            rows={6}
            helperText="Gunakan tombol sisipkan foto untuk menambah gambar di konten."
            ref={contentRef}
          />
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Sisipkan Foto di Konten</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inlineImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={handleInlineImagesChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={inlineUploading}
                loadingText="Mengunggah..."
                leftIcon={!inlineUploading ? <Plus className="w-4 h-4" /> : undefined}
                onClick={() => inlineImageInputRef.current?.click()}
              >
                Unggah Foto Konten
              </Button>
              <span className="text-xs text-slate-500">PNG/JPG/WEBP, max 5MB per foto.</span>
            </div>
            <p className="text-xs text-slate-500">Foto akan ditambahkan sebagai token [[img:...]] di konten.</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Preview Konten</p>
              <span className="text-xs text-slate-500">Tampilan mendekati halaman berita.</span>
            </div>
            <div className="space-y-4 text-sm text-slate-700 dark:text-slate-200">
              {previewCoverUrl ? (
                <img
                  src={previewCoverUrl}
                  alt={previewTitle}
                  className="w-full h-48 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                />
              ) : (
                <div className="h-48 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 flex items-center justify-center text-xs text-slate-400">
                  Sampul belum dipilih
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {previewCategoryLabel}
                </span>
                <span>{previewDateLabel}</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{previewTitle}</h3>
              {previewExcerpt && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{previewExcerpt}</p>
              )}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-4">
                {formData.content?.trim() ? (
                  contentPreview
                ) : (
                  <p className="text-xs text-slate-500">Konten belum diisi.</p>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Gambar Sampul</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImageChange}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
            />
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview berita"
                className="mt-2 h-40 w-full rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
            )}
            {!imagePreview && selectedNews?.image && (
              <img
                src={getSecureFileUrl(selectedNews.image)}
                alt={selectedNews.title}
                className="mt-2 h-40 w-full rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
            )}
            <p className="text-xs text-slate-500">Kosongkan jika tidak ingin mengganti gambar.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Checkbox
              label="Jadikan berita sorotan"
              checked={formData.is_featured}
              onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
            />
            <Checkbox
              label="Terbitkan sekarang"
              checked={formData.is_published}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : (
                'Simpan'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Berita"
        message={`Apakah Anda yakin ingin menghapus berita "${selectedNews?.title || ''}"?`}
        confirmText="Hapus"
        variant="danger"
      />
    </DashboardLayout>
  );
}
