'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@/components/ui';
import { Download, Loader2, Lock, LockOpen, Save } from 'lucide-react';
import { classAPI, summativeAPI } from '@/services/api';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import { SUBJECT_LIST } from '@/constants/subjects';

type Semester = 'ganjil' | 'genap';

interface ClassOption {
  value: string;
  label: string;
  academic_year?: string;
}

interface SummativeRow {
  student_id: number;
  student_name: string;
  student_nis: string;
  sumatif_items: Array<number | null>;
  nilai_sumatif: number;
  sumatif_akhir: number;
  bobot_70: number;
  bobot_30: number;
  nilai_rapor: number;
}

interface LockMeta {
  locked: boolean;
  locked_at?: string;
  locked_by?: { id: number; name: string } | null;
  can_edit: boolean;
  can_lock: boolean;
  can_unlock: boolean;
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function computeFromItems(items: Array<number | null>, sumatifAkhir: number) {
  const valid = items.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const nilaiSumatif = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const bobot70 = nilaiSumatif * 0.7;
  const bobot30 = sumatifAkhir * 0.3;
  const nilaiRapor = bobot70 + bobot30;

  return {
    nilai_sumatif: Number(nilaiSumatif.toFixed(2)),
    bobot_70: Number(bobot70.toFixed(2)),
    bobot_30: Number(bobot30.toFixed(2)),
    nilai_rapor: Number(nilaiRapor.toFixed(2)),
  };
}

export function SummativeScorePanel() {
  const toast = useToast();
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [subjectOptions, setSubjectOptions] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [semester, setSemester] = useState<Semester>('ganjil');
  const [rows, setRows] = useState<SummativeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kkm, setKkm] = useState(75);
  const [lockMeta, setLockMeta] = useState<LockMeta>({
    locked: false,
    can_edit: true,
    can_lock: false,
    can_unlock: false,
    locked_by: null,
  });

  useEffect(() => {
    const loadClasses = async () => {
      try {
        let mapped: ClassOption[] = [];

        if (user?.role === 'guru') {
          const scheduleRes = await api.get('/teacher-schedule');
          const grouped = scheduleRes.data?.data || {};
          const flatSchedules = Object.values(grouped).flat() as Array<{
            classRoom?: { id: number; name: string };
            class_room?: { id: number; name: string };
          }>;

          const classMap = new Map<number, ClassOption>();
          for (const schedule of flatSchedules) {
            const cls = schedule.classRoom || schedule.class_room;
            if (!cls?.id) continue;
            if (!classMap.has(cls.id)) {
              classMap.set(cls.id, {
                value: String(cls.id),
                label: cls.name,
              });
            }
          }
          mapped = Array.from(classMap.values());
        }

        // Fallback jika guru belum punya jadwal (atau role selain guru)
        if (mapped.length === 0) {
          const res = await classAPI.getAll();
          const data = res.data?.data || [];
          mapped = data.map((c: { id: number; name: string; academic_year?: string }) => ({
            value: String(c.id),
            label: c.name,
            academic_year: c.academic_year,
          }));
        }

        setClasses(mapped);
        if (mapped.length > 0) {
          setSelectedClassId(mapped[0].value);
          if (mapped[0].academic_year) {
            setAcademicYear(mapped[0].academic_year);
          }
        }
      } catch {
        toast.error('Gagal memuat data kelas');
      }
    };

    loadClasses();
  }, [toast, user?.role]);

  const loadSubjects = useCallback(async (classId: string) => {
    if (!classId) {
      setSubjectOptions([]);
      setSubject('');
      return;
    }

    const subjects = [...SUBJECT_LIST];
    setSubjectOptions(subjects);
    setSubject((prev) => (prev && subjects.includes(prev as typeof SUBJECT_LIST[number]) ? prev : subjects[0] || ''));
  }, []);

  useEffect(() => {
    loadSubjects(selectedClassId);
  }, [selectedClassId, loadSubjects]);

  const loadScores = useCallback(async () => {
    if (!selectedClassId || !subject.trim()) {
      toast.warning('Pilih kelas dan mata pelajaran dulu');
      return;
    }

    setLoading(true);
    try {
      const res = await summativeAPI.getScores({
        class_id: Number(selectedClassId),
        subject: subject.trim(),
        academic_year: academicYear.trim(),
        semester,
      });

      const data = res.data?.data || [];
      const lock = res.data?.meta?.lock as LockMeta | undefined;
      if (lock) {
        setLockMeta({
          locked: !!lock.locked,
          locked_at: lock.locked_at,
          locked_by: lock.locked_by || null,
          can_edit: !!lock.can_edit,
          can_lock: !!lock.can_lock,
          can_unlock: !!lock.can_unlock,
        });
      } else {
        setLockMeta({
          locked: false,
          can_edit: true,
          can_lock: false,
          can_unlock: false,
          locked_by: null,
        });
      }

      const normalized: SummativeRow[] = data.map((row: SummativeRow) => {
        const items = Array.isArray(row.sumatif_items)
          ? [...row.sumatif_items].slice(0, 13)
          : [];
        while (items.length < 13) items.push(null);

        const parsedItems = items.map((v) => {
          if (v === null || v === undefined) return null;
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        });

        const sumatifAkhir = Number(row.sumatif_akhir) || 0;
        const computed = computeFromItems(parsedItems, sumatifAkhir);

        return {
          student_id: row.student_id,
          student_name: row.student_name,
          student_nis: row.student_nis,
          sumatif_items: parsedItems,
          sumatif_akhir: sumatifAkhir,
          ...computed,
        };
      });

      setRows(normalized);
      if (normalized.length === 0) {
        toast.warning('Belum ada siswa pada kelas ini');
      }
    } catch {
      toast.error('Gagal memuat nilai sumatif');
    } finally {
      setLoading(false);
    }
  }, [selectedClassId, subject, academicYear, semester, toast]);

  const updateItem = useCallback((studentId: number, index: number, raw: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.student_id !== studentId) return row;

      const items = [...row.sumatif_items];
      if (raw === '') {
        items[index] = null;
      } else {
        const next = Number(raw);
        items[index] = Number.isFinite(next) ? Math.max(0, Math.min(100, next)) : null;
      }

      return {
        ...row,
        sumatif_items: items,
        ...computeFromItems(items, row.sumatif_akhir),
      };
    }));
  }, []);

  const updateSumatifAkhir = useCallback((studentId: number, raw: string) => {
    setRows((prev) => prev.map((row) => {
      if (row.student_id !== studentId) return row;

      const sumatifAkhir = raw === '' ? 0 : Math.max(0, Math.min(100, Number(raw) || 0));
      return {
        ...row,
        sumatif_akhir: sumatifAkhir,
        ...computeFromItems(row.sumatif_items, sumatifAkhir),
      };
    }));
  }, []);

  const handleSave = async () => {
    if (!selectedClassId || !subject.trim()) {
      toast.warning('Pilih kelas dan mata pelajaran dulu');
      return;
    }

    if (!lockMeta.can_edit) {
      toast.warning('Data sudah terkunci. Hanya admin yang bisa mengubah.');
      return;
    }

    setSaving(true);
    try {
      await summativeAPI.bulkUpsert({
        class_id: Number(selectedClassId),
        subject: subject.trim(),
        academic_year: academicYear.trim(),
        semester,
        scores: rows.map((r) => ({
          student_id: r.student_id,
          sumatif_items: r.sumatif_items,
          sumatif_akhir: r.sumatif_akhir,
        })),
      });
      toast.success('Nilai sumatif berhasil disimpan');
      await loadScores();
    } catch {
      toast.error('Gagal menyimpan nilai sumatif');
    } finally {
      setSaving(false);
    }
  };

  const className = useMemo(() => {
    return classes.find((c) => c.value === selectedClassId)?.label || '-';
  }, [classes, selectedClassId]);

  const handleLock = async () => {
    if (!selectedClassId || !subject.trim()) {
      toast.warning('Pilih kelas dan mata pelajaran dulu');
      return;
    }

    try {
      await summativeAPI.lock({
        class_id: Number(selectedClassId),
        subject: subject.trim(),
        academic_year: academicYear.trim(),
        semester,
      });
      toast.success('Nilai berhasil difinalisasi dan dikunci');
      await loadScores();
    } catch {
      toast.error('Gagal mengunci nilai sumatif');
    }
  };

  const handleUnlock = async () => {
    if (!selectedClassId || !subject.trim()) {
      toast.warning('Pilih kelas dan mata pelajaran dulu');
      return;
    }

    try {
      await summativeAPI.unlock({
        class_id: Number(selectedClassId),
        subject: subject.trim(),
        academic_year: academicYear.trim(),
        semester,
      });
      toast.success('Kunci nilai berhasil dibuka');
      await loadScores();
    } catch {
      toast.error('Gagal membuka kunci nilai sumatif');
    }
  };

  const getStatus = useCallback((nilaiRapor: number) => {
    return nilaiRapor >= kkm ? 'Lulus' : 'Remedial';
  }, [kkm]);

  const handleExportExcel = async () => {
    if (rows.length === 0) {
      toast.warning('Belum ada data untuk diexport');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const fileSaver = await import('file-saver');

      const headers = [
        'No',
        'NIS',
        'Nama',
        ...Array.from({ length: 13 }).map((_, i) => `SM_${i + 1}`),
        'Nilai Sumatif',
        'Bobot 70%',
        'Sumatif Akhir',
        'Bobot 30%',
        'Nilai Rapor',
        'KKM',
        'Status',
      ];

      const aoa: Array<Array<string | number>> = [];
      aoa.push([
        `Rekap Nilai Sumatif - ${className}`,
        '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      ]);
      aoa.push([
        `Mapel: ${subject}`,
        `Semester: ${semester}`,
        `TP: ${academicYear}`,
        `KKM: ${kkm}`,
      ]);
      aoa.push([]);
      aoa.push(headers);

      rows.forEach((row, idx) => {
        aoa.push([
          idx + 1,
          row.student_nis,
          row.student_name,
          ...row.sumatif_items.map((v) => (v === null ? '' : v)),
          Number(row.nilai_sumatif.toFixed(2)),
          Number(row.bobot_70.toFixed(2)),
          Number(row.sumatif_akhir.toFixed(2)),
          Number(row.bobot_30.toFixed(2)),
          Number(row.nilai_rapor.toFixed(2)),
          kkm,
          getStatus(row.nilai_rapor),
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Nilai Sumatif');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
      });

      const safeSubject = subject.replace(/[^a-zA-Z0-9_-]/g, '_');
      const fileName = `nilai_sumatif_${className.replace(/\s+/g, '_')}_${safeSubject}_${semester}.xlsx`;
      fileSaver.saveAs(blob, fileName);
      toast.success('Export Excel berhasil');
    } catch {
      toast.error('Gagal export Excel');
    }
  };

  return (
    <div className="space-y-4">
      {lockMeta.locked && (
        <Card className="p-3 border-amber-300 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex flex-col gap-1 text-sm text-amber-800 dark:text-amber-300">
            <p className="font-semibold">Nilai sumatif sudah difinalisasi (LOCKED)</p>
            <p>
              Dikunci oleh {lockMeta.locked_by?.name || '-'}
              {lockMeta.locked_at ? ` pada ${new Date(lockMeta.locked_at).toLocaleString('id-ID')}` : ''}
            </p>
            {!lockMeta.can_edit && user?.role !== 'admin' && (
              <p>Mode baca saja. Hubungi admin jika perlu membuka kunci.</p>
            )}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Kelas</label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              {classes.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Mata Pelajaran</label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              {subjectOptions.length === 0 ? <option value="">Tidak ada mapel</option> : null}
              {subjectOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Semester</label>
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value as Semester)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="ganjil">Ganjil</option>
              <option value="genap">Genap</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Tahun Pelajaran</label>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              placeholder="2025/2026"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">KKM</label>
            <input
              type="number"
              min={0}
              max={100}
              value={kkm}
              onChange={(e) => setKkm(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex items-end gap-2 md:col-span-2">
            <Button onClick={loadScores} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Muat Data
            </Button>
            <Button onClick={handleExportExcel} disabled={rows.length === 0} className="w-full bg-indigo-600 hover:bg-indigo-700">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={handleSave} disabled={saving || rows.length === 0} className="w-full bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan
            </Button>
            {lockMeta.can_lock && (
              <Button onClick={handleLock} disabled={rows.length === 0} className="w-full bg-amber-600 hover:bg-amber-700">
                <Lock className="w-4 h-4 mr-2" />
                Finalisasi
              </Button>
            )}
            {lockMeta.can_unlock && (
              <Button onClick={handleUnlock} className="w-full bg-rose-600 hover:bg-rose-700">
                <LockOpen className="w-4 h-4 mr-2" />
                Buka Kunci
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-600 dark:text-slate-400">Pilih filter lalu klik Muat Data untuk input nilai sumatif.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1600px] w-full border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="sticky left-0 bg-slate-50 dark:bg-slate-800 px-2 py-2 border text-xs">No</th>
                  <th className="sticky left-10 bg-slate-50 dark:bg-slate-800 px-2 py-2 border text-xs">NIS</th>
                  <th className="sticky left-32 bg-slate-50 dark:bg-slate-800 px-2 py-2 border text-xs text-left">Nama ({className})</th>
                  {Array.from({ length: 13 }).map((_, i) => (
                    <th key={i} className="px-2 py-2 border text-xs">SM_{i + 1}</th>
                  ))}
                  <th className="px-2 py-2 border text-xs bg-orange-50 dark:bg-orange-900/20">Bobot 70% (Sumatif)</th>
                  <th className="px-2 py-2 border text-xs bg-blue-50 dark:bg-blue-900/20">Sumatif Akhir</th>
                  <th className="px-2 py-2 border text-xs bg-blue-50 dark:bg-blue-900/20">Bobot 30%</th>
                  <th className="px-2 py-2 border text-xs bg-green-50 dark:bg-green-900/20">Nilai Rapor</th>
                  <th className="px-2 py-2 border text-xs bg-emerald-50 dark:bg-emerald-900/20">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.student_id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${row.nilai_rapor < kkm ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}>
                    <td className="sticky left-0 bg-white dark:bg-slate-900 px-2 py-2 border text-center text-xs">{idx + 1}</td>
                    <td className="sticky left-10 bg-white dark:bg-slate-900 px-2 py-2 border text-xs">{row.student_nis}</td>
                    <td className="sticky left-32 bg-white dark:bg-slate-900 px-2 py-2 border text-xs min-w-[220px]">{row.student_name}</td>
                    {row.sumatif_items.map((v, i) => (
                      <td key={i} className="px-1 py-1 border">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={v ?? ''}
                          onChange={(e) => updateItem(row.student_id, i, e.target.value)}
                          disabled={!lockMeta.can_edit}
                          className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 border text-sm font-semibold text-orange-700 dark:text-orange-400 text-center">
                      {formatNumber(row.bobot_70)}
                    </td>
                    <td className="px-1 py-1 border">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={row.sumatif_akhir}
                        onChange={(e) => updateSumatifAkhir(row.student_id, e.target.value)}
                        disabled={!lockMeta.can_edit}
                        className="w-20 px-2 py-1 text-xs border border-slate-300 rounded"
                      />
                    </td>
                    <td className="px-2 py-2 border text-sm font-semibold text-blue-700 dark:text-blue-400 text-center">
                      {formatNumber(row.bobot_30)}
                    </td>
                    <td className="px-2 py-2 border text-sm font-bold text-green-700 dark:text-green-400 text-center">
                      {formatNumber(row.nilai_rapor)}
                    </td>
                    <td className="px-2 py-2 border text-center">
                      {getStatus(row.nilai_rapor) === 'Lulus' ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Lulus
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Remedial
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
