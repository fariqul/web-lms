'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layouts';
import { staffAttendanceAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { ArrowLeft, MapPin, Save, Loader2, Info } from 'lucide-react';

interface Settings {
  school_latitude: number | null;
  school_longitude: number | null;
  radius_meters: number;
  check_in_start: string;
  check_in_end: string;
}

export default function AbsenMasukSettingsPage() {
  const toast = useToast();

  const [form, setForm] = useState<Settings>({
    school_latitude:  null,
    school_longitude: null,
    radius_meters:    200,
    check_in_start:   '06:00',
    check_in_end:     '09:00',
  });
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Load current settings
  useEffect(() => {
    staffAttendanceAPI.getSettings()
      .then(res => {
        const d = res.data?.data;
        if (d) {
          setForm({
            school_latitude:  d.school_latitude,
            school_longitude: d.school_longitude,
            radius_meters:    d.radius_meters ?? 200,
            check_in_start:   d.check_in_start ?? '06:00',
            check_in_end:     d.check_in_end ?? '09:00',
          });
        }
      })
      .catch(() => toast.error('Gagal memuat pengaturan'))
      .finally(() => setFetching(false));
  }, [toast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await staffAttendanceAPI.updateSettings({
        school_latitude:  form.school_latitude,
        school_longitude: form.school_longitude,
        radius_meters:    form.radius_meters,
        check_in_start:   form.check_in_start,
        check_in_end:     form.check_in_end,
      });
      toast.success('Pengaturan berhasil disimpan!');
    } catch {
      toast.error('Gagal menyimpan pengaturan');
    } finally {
      setSaving(false);
    }
  };

  const mapsUrl = form.school_latitude && form.school_longitude
    ? `https://www.google.com/maps?q=${form.school_latitude},${form.school_longitude}`
    : null;

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-5">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Link
            href="/admin/absen-masuk"
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-500" />
              Pengaturan Absen Masuk
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Koordinat sekolah, radius, dan jam absen</p>
          </div>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
          </div>
        ) : (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">

            {/* Koordinat */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Koordinat Sekolah</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="-5.123456"
                    value={form.school_latitude ?? ''}
                    onChange={e => setForm(f => ({ ...f, school_latitude: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="0.000001"
                    placeholder="119.123456"
                    value={form.school_longitude ?? ''}
                    onChange={e => setForm(f => ({ ...f, school_longitude: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>

              {/* Radius */}
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Radius (meter) — GPS diterima jika ≤ radius dari koordinat di atas
                </label>
                <input
                  type="number"
                  min={50}
                  max={5000}
                  value={form.radius_meters}
                  onChange={e => setForm(f => ({ ...f, radius_meters: parseInt(e.target.value) || 200 }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                />
              </div>

              {/* Info cara cari koordinat */}
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Cara mendapatkan koordinat:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-blue-600 dark:text-blue-500">
                    <li>Buka Google Maps di komputer</li>
                    <li>Klik kanan pada lokasi sekolah</li>
                    <li>Angka pertama = Latitude, kedua = Longitude</li>
                  </ol>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline mt-1 inline-block">
                      Lihat koordinat saat ini di Maps →
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Jam absen */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Jam Absen Masuk</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Jam Mulai</label>
                  <input
                    type="time"
                    value={form.check_in_start}
                    onChange={e => setForm(f => ({ ...f, check_in_start: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Jam Akhir</label>
                  <input
                    type="time"
                    value={form.check_in_end}
                    onChange={e => setForm(f => ({ ...f, check_in_end: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Di luar rentang jam ini, absen masuk akan ditolak. Kosongkan/tidak diset = tidak ada batasan jam.
              </p>
            </div>

            {/* Save button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Simpan Pengaturan
            </button>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
