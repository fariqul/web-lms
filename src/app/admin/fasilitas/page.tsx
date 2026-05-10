'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Textarea, Select, Checkbox, Table, Modal, ConfirmDialog } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, ImagePlus, Loader2, X } from 'lucide-react';
import { facilityAPI, getSecureFileUrl } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/api-error';
import type { Facility, FacilityPayload } from '@/types/facility';

const MAX_PHOTOS = 8;

type StatusFilter = 'all' | 'active' | 'inactive';

type FormState = {
  name: string;
  description: string;
  display_order: string;
  is_active: boolean;
};

const statusOptions = [
  { value: 'all', label: 'Semua Status' },
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];

export default function AdminFasilitasPage() {
  const toast = useToast();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPhotoDeleteDialogOpen, setIsPhotoDeleteDialogOpen] = useState(false);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{ facilityId: number; photoId: number } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoDeleting, setPhotoDeleting] = useState(false);

  const [formData, setFormData] = useState<FormState>({
    name: '',
    description: '',
    display_order: '',
    is_active: true,
  });

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    previewUrlsRef.current = photoPreviews;
  }, [photoPreviews]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
    };
  }, []);

  const fetchFacilities = useCallback(async (search?: string, status?: StatusFilter) => {
    setLoading(true);
    try {
      const params: { search?: string; is_active?: boolean } = {};
      const trimmedSearch = search?.trim();
      if (trimmedSearch) params.search = trimmedSearch;
      if (status === 'active') params.is_active = true;
      if (status === 'inactive') params.is_active = false;

      const response = await facilityAPI.getAll(params);
      const rows = response.data?.data;
      const list = Array.isArray(rows) ? rows : (rows?.data || []);
      setFacilities(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal memuat data fasilitas'));
      setFacilities([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      fetchFacilities(searchQuery, statusFilter);
      return;
    }

    const timer = window.setTimeout(() => {
      fetchFacilities(searchQuery, statusFilter);
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [fetchFacilities, searchQuery, statusFilter]);

  const totalPhotos = useMemo(
    () => facilities.reduce((acc, facility) => acc + (facility.photos?.length || 0), 0),
    [facilities]
  );

  const activeCount = useMemo(
    () => facilities.filter((facility) => facility.is_active).length,
    [facilities]
  );

  const selectedExistingPhotos = selectedFacility?.photos || [];
  const totalSelectedPhotos = selectedExistingPhotos.length + photoFiles.length;
  const remainingSlots = Math.max(0, MAX_PHOTOS - totalSelectedPhotos);

  const resetPhotoSelections = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setPhotoPreviews([]);
    setPhotoFiles([]);
  };

  const resetForm = () => {
    setSelectedFacility(null);
    setFormData({
      name: '',
      description: '',
      display_order: '',
      is_active: true,
    });
    resetPhotoSelections();
  };

  const handleOpenModal = (facility?: Facility) => {
    if (facility) {
      setSelectedFacility(facility);
      setFormData({
        name: facility.name,
        description: facility.description || '',
        display_order: Number.isFinite(facility.display_order)
          ? String(facility.display_order)
          : '',
        is_active: facility.is_active,
      });
    } else {
      setSelectedFacility(null);
      setFormData({
        name: '',
        description: '',
        display_order: '',
        is_active: true,
      });
    }
    resetPhotoSelections();
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  const handleDeleteClick = (facility: Facility) => {
    setSelectedFacility(facility);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedFacility) return;
    setDeleting(true);
    try {
      await facilityAPI.delete(selectedFacility.id);
      toast.success('Fasilitas berhasil dihapus');
      setIsDeleteDialogOpen(false);
      setSelectedFacility(null);
      fetchFacilities(searchQuery, statusFilter);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menghapus fasilitas'));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeletePhotoClick = (facilityId: number, photoId: number) => {
    setSelectedPhoto({
      facilityId,
      photoId,
    });
    setIsPhotoDeleteDialogOpen(true);
  };

  const handleDeletePhoto = async () => {
    if (!selectedPhoto) return;
    setPhotoDeleting(true);
    try {
      await facilityAPI.deletePhoto(selectedPhoto.facilityId, selectedPhoto.photoId);
      toast.success('Foto fasilitas berhasil dihapus');
      setFacilities((prev) =>
        prev.map((facility) =>
          facility.id === selectedPhoto.facilityId
            ? {
                ...facility,
                photos: facility.photos.filter((photo) => photo.id !== selectedPhoto.photoId),
              }
            : facility
        )
      );
      setSelectedFacility((prev) =>
        prev && prev.id === selectedPhoto.facilityId
          ? {
              ...prev,
              photos: prev.photos.filter((photo) => photo.id !== selectedPhoto.photoId),
            }
          : prev
      );
      setIsPhotoDeleteDialogOpen(false);
      setSelectedPhoto(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menghapus foto fasilitas'));
    } finally {
      setPhotoDeleting(false);
    }
  };

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (remainingSlots <= 0) {
      toast.warning(`Maksimal ${MAX_PHOTOS} foto per fasilitas.`);
      event.target.value = '';
      return;
    }

    if (files.length > remainingSlots) {
      toast.warning(`Sisa slot foto hanya ${remainingSlots}.`);
      event.target.value = '';
      return;
    }

    const previews = files.map((file) => URL.createObjectURL(file));
    setPhotoFiles((prev) => [...prev, ...files]);
    setPhotoPreviews((prev) => [...prev, ...previews]);
    event.target.value = '';
  };

  const handleRemoveNewPhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed);
      return next;
    });
    setPhotoFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const parseDisplayOrder = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return parsed;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      toast.warning('Nama fasilitas wajib diisi.');
      return;
    }

    const displayOrder = parseDisplayOrder(formData.display_order);
    if (formData.display_order.trim() && displayOrder === undefined) {
      toast.warning('Urutan tampil harus berupa angka.');
      return;
    }

    if (totalSelectedPhotos > MAX_PHOTOS) {
      toast.warning(`Maksimal ${MAX_PHOTOS} foto per fasilitas.`);
      return;
    }

    const payload: FacilityPayload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      display_order: displayOrder,
      is_active: formData.is_active,
    };

    setSubmitting(true);
    try {
      if (selectedFacility) {
        await facilityAPI.update(selectedFacility.id, payload, photoFiles);
        toast.success('Fasilitas berhasil diperbarui');
      } else {
        await facilityAPI.create(payload, photoFiles);
        toast.success('Fasilitas berhasil ditambahkan');
      }

      handleCloseModal();
      fetchFacilities(searchQuery, statusFilter);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menyimpan fasilitas'));
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Nama Fasilitas',
      render: (item: Facility) => (
        <div>
          <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
          {item.description ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] truncate">
              {item.description}
            </p>
          ) : (
            <p className="text-xs text-slate-400">Tanpa deskripsi</p>
          )}
        </div>
      ),
    },
    {
      key: 'display_order',
      header: 'Urutan',
      className: 'text-center',
      render: (item: Facility) => (
        <span className="text-sm font-mono text-slate-700 dark:text-slate-300">
          {Number.isFinite(item.display_order) ? item.display_order : '-'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item: Facility) => (
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            item.is_active
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}
        >
          {item.is_active ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'photos',
      header: 'Foto',
      className: 'text-center',
      render: (item: Facility) => (
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <ImagePlus className="w-4 h-4" />
          <span>{item.photos?.length || 0}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-center',
      render: (item: Facility) => (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
            aria-label="Edit fasilitas"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            aria-label="Hapus fasilitas"
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
        <Card>
          <CardHeader
            title="Kelola Fasilitas"
            subtitle={`${facilities.length} fasilitas • ${activeCount} aktif • ${totalPhotos} foto`}
            action={(
              <Button size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => handleOpenModal()}>
                Tambah Fasilitas
              </Button>
            )}
          />

          <div className="flex flex-col md:flex-row gap-4 mb-5">
            <div className="flex-1">
              <Input
                placeholder="Cari fasilitas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="w-full md:w-56">
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              />
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3 text-xs text-slate-600 dark:text-slate-300">
            Fasilitas yang <span className="font-semibold">aktif</span> akan tampil di landing page sesuai urutan
            <span className="font-semibold"> display order</span>. Maksimal {MAX_PHOTOS} foto per fasilitas.
          </div>

          <Table
            columns={columns}
            data={facilities}
            keyExtractor={(item) => item.id}
            isLoading={loading}
            emptyMessage="Belum ada fasilitas"
          />
        </Card>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedFacility ? 'Edit Fasilitas' : 'Tambah Fasilitas'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nama Fasilitas"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Contoh: Laboratorium Komputer"
            required
          />
          <Textarea
            label="Deskripsi"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Tambahkan deskripsi singkat untuk fasilitas"
            rows={3}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Display Order"
              type="number"
              value={formData.display_order}
              onChange={(e) => setFormData({ ...formData, display_order: e.target.value })}
              placeholder="Contoh: 1"
              helperText="Urutan tampil di landing page (angka kecil tampil dulu)"
            />
            <div className="flex items-end">
              <Checkbox
                label="Aktif tampil di landing"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
            </div>
          </div>

          {selectedExistingPhotos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Foto Tersimpan</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {selectedExistingPhotos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <img
                      src={getSecureFileUrl(photo.path)}
                      alt="Foto fasilitas"
                      className="w-full h-28 object-cover"
                      loading="lazy"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedFacility?.id) return;
                        handleDeletePhotoClick(selectedFacility.id, photo.id);
                      }}
                      className="absolute top-2 right-2 bg-white/90 text-red-600 hover:bg-white rounded-full p-1.5 shadow-sm"
                      aria-label="Hapus foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Upload Foto Baru</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Format JPEG/PNG/WebP, maks 5MB per foto. Sisa slot: {remainingSlots}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4">
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                multiple
                onChange={handlePhotoChange}
                disabled={remainingSlots <= 0}
                className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white hover:file:bg-sky-700 disabled:opacity-60"
              />
            </div>

            {photoPreviews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {photoPreviews.map((preview, idx) => (
                  <div
                    key={`${preview}-${idx}`}
                    className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  >
                    <img src={preview} alt={`Preview foto ${idx + 1}`} className="w-full h-28 object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveNewPhoto(idx)}
                      className="absolute top-2 right-2 bg-white/90 text-slate-600 hover:text-slate-900 hover:bg-white rounded-full p-1"
                      aria-label="Hapus foto baru"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleCloseModal}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan...
                </>
              ) : selectedFacility ? (
                'Simpan Perubahan'
              ) : (
                'Tambah Fasilitas'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Fasilitas"
        message={`Apakah Anda yakin ingin menghapus fasilitas ${selectedFacility?.name}? Semua foto yang terkait akan ikut terhapus.`}
        confirmText="Hapus"
        variant="danger"
        isLoading={deleting}
      />

      <ConfirmDialog
        isOpen={isPhotoDeleteDialogOpen}
        onClose={() => setIsPhotoDeleteDialogOpen(false)}
        onConfirm={handleDeletePhoto}
        title="Hapus Foto Fasilitas"
        message="Apakah Anda yakin ingin menghapus foto ini?"
        confirmText="Hapus"
        variant="danger"
        isLoading={photoDeleting}
      />
    </DashboardLayout>
  );
}
