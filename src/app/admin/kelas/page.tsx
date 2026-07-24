'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { DashboardLayout } from '@/components/layouts';
import { Card, CardHeader, Button, Input, Select, Table, Modal, ConfirmDialog, Checkbox } from '@/components/ui';
import { Plus, Search, Edit2, Trash2, Users, Download, Loader2, Eye, Upload, RefreshCw, AlertTriangle, Sparkles, Zap, FileSpreadsheet, CheckSquare, Square, Filter, FileText, CheckCircle2, XCircle } from 'lucide-react';
import { classAPI, getSecureFileUrl, userAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/api-error';

interface Student {
  id: number;
  name: string;
  nisn: string;
  email: string;
  photo?: string | null;
  avatar?: string | null;
}

interface ClassRoom {
  id: number;
  name: string;
  grade_level: string;
  academic_year: string;
  is_active?: boolean;
  wali_kelas_id?: number | null;
  wali_kelas?: { id: number; name: string; nip?: string };
  students_count?: number;
  students?: Student[];
}

interface TeacherOption {
  id: number;
  name: string;
  nip?: string;
}

interface ClassImportPreviewRow {
  row: number;
  action: 'create' | 'update';
  name: string;
}

interface ClassImportPreviewError {
  row?: number;
  message: string;
}

const gradeOptions = [
  { value: '', label: 'Semua Kelas' },
  { value: 'X', label: 'Kelas X' },
  { value: 'XI', label: 'Kelas XI' },
  { value: 'XII', label: 'Kelas XII' },
];

const statusOptions = [
  { value: 'active', label: 'Aktif' },
  { value: 'archived', label: 'Arsip' },
  { value: 'all', label: 'Semua' },
];

export default function AdminKelasPage() {
  const toast = useToast();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassRoom | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Detail modal state
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailClass, setDetailClass] = useState<ClassRoom | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreviewToken, setImportPreviewToken] = useState('');
  const [importSummary, setImportSummary] = useState<{ total_rows: number; to_create: number; to_update: number; to_skip: number } | null>(null);
  const [importPreviewRows, setImportPreviewRows] = useState<ClassImportPreviewRow[]>([]);
  const [importPreviewErrors, setImportPreviewErrors] = useState<ClassImportPreviewError[]>([]);
  const [isImportProcessing, setIsImportProcessing] = useState(false);
  const [brokenStudentPhotoIds, setBrokenStudentPhotoIds] = useState<Record<number, boolean>>({});
  const [profilePreview, setProfilePreview] = useState<{ src: string; name: string } | null>(null);
  const [isProfilePreviewBroken, setIsProfilePreviewBroken] = useState(false);
  const [isProfilePreviewClosing, setIsProfilePreviewClosing] = useState(false);
  const [profilePreviewFitMode, setProfilePreviewFitMode] = useState<'contain' | 'cover'>('contain');
  const profilePreviewCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);
  const [promoteMode, setPromoteMode] = useState<'bulk' | 'excel' | 'manual'>('bulk');
  const [promoteFromYear, setPromoteFromYear] = useState('');
  const [promoteToYear, setPromoteToYear] = useState('');
  const [promoteEffectiveDate, setPromoteEffectiveDate] = useState('');
  const [promoteMappings, setPromoteMappings] = useState<Record<number, string>>({});
  const [isPromoting, setIsPromoting] = useState(false);
  const [archiveFromClasses, setArchiveFromClasses] = useState(true);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);

  // Excel Rolling state
  const [excelRollingFile, setExcelRollingFile] = useState<File | null>(null);
  const [excelRollingToken, setExcelRollingToken] = useState('');
  const [excelRollingSummary, setExcelRollingSummary] = useState<{ total_rows: number; valid_count: number; error_count: number; graduate_count: number } | null>(null);
  const [excelRollingPreviewRows, setExcelRollingPreviewRows] = useState<Array<{ row: number; student_name: string; nisn: string; from_class_name: string; to_class_name: string; is_graduate: boolean; status: string }>>([]);
  const [excelRollingErrors, setExcelRollingErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [isExcelPreviewing, setIsExcelPreviewing] = useState(false);
  const [isExcelConfirming, setIsExcelConfirming] = useState(false);

  // Manual Rolling state
  const [manualStudents, setManualStudents] = useState<Array<{ id: number; name: string; nisn: string; email: string; current_class_id: number; current_class_name: string; grade_level: string }>>([]);
  const [manualAssignments, setManualAssignments] = useState<Record<number, string>>({});
  const [manualSelectedIds, setManualSelectedIds] = useState<Set<number>>(new Set());
  const [manualSearch, setManualSearch] = useState('');
  const [manualClassFilter, setManualClassFilter] = useState('');
  const [manualBulkTargetClass, setManualBulkTargetClass] = useState('');
  const [isManualLoading, setIsManualLoading] = useState(false);
  const [isManualSubmitting, setIsManualSubmitting] = useState(false);
  const [showManualConfirmModal, setShowManualConfirmModal] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    grade_level: '',
    academic_year: '2025/2026',
    is_active: true,
    wali_kelas_id: '',
  });

  useEffect(() => {
    fetchClasses(statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    return () => {
      if (profilePreviewCloseTimerRef.current) {
        clearTimeout(profilePreviewCloseTimerRef.current);
        profilePreviewCloseTimerRef.current = null;
      }
    };
  }, []);

  const fetchClasses = async (status: 'active' | 'archived' | 'all') => {
    try {
      setLoading(true);
      const classParams =
        status === 'archived'
          ? { only_inactive: true }
          : status === 'all'
            ? { include_inactive: true }
            : undefined;
      const [classesRes, teachersRes] = await Promise.all([
        classAPI.getAll(classParams),
        userAPI.getAll({ role: 'guru', per_page: 1000 }),
      ]);
      setClasses(classesRes.data?.data || []);
      const teachersRaw = teachersRes.data?.data;
      const teachersData = Array.isArray(teachersRaw) ? teachersRaw : (teachersRaw?.data || []);
      setTeachers(teachersData.map((t: { id: number; name: string; nip?: string }) => ({
        id: t.id,
        name: t.name,
        nip: t.nip,
      })));
    } catch (error) {
      console.error('Failed to fetch classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredClasses = classes.filter((cls) => {
    const matchesSearch = cls.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGrade = !gradeFilter || cls.grade_level === gradeFilter;
    const isActive = cls.is_active !== false;
    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'archived'
        ? !isActive
        : isActive;
    return matchesSearch && matchesGrade && matchesStatus;
  });

  const parseAcademicYearStart = (value: string) => {
    const match = value.match(/(\d{4})/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const getNextAcademicYear = (value: string) => {
    const start = parseAcademicYearStart(value);
    return start ? `${start + 1}/${start + 2}` : '';
  };

  const getDefaultEffectiveDate = (value: string) => {
    const start = parseAcademicYearStart(value);
    if (!start) return new Date().toISOString().slice(0, 10);
    const nextStart = start + 1;
    return `${nextStart}-07-01`;
  };

  const academicYearOptions = Array.from(new Set(classes.map((c) => c.academic_year)))
    .filter(Boolean)
    .sort((a, b) => parseAcademicYearStart(a) - parseAcademicYearStart(b))
    .map((year) => ({ value: year, label: year }));

  const promoteFromClasses = classes.filter((cls) => cls.academic_year === promoteFromYear);
  const promoteTargetClasses = classes.filter((cls) => cls.academic_year === promoteToYear);

  const totalStudents = filteredClasses.reduce((sum, cls) => sum + (cls.students_count || 0), 0);

  const handleOpenModal = (cls?: ClassRoom) => {
    if (cls) {
      setSelectedClass(cls);
      setFormData({
        name: cls.name,
        grade_level: cls.grade_level,
        academic_year: cls.academic_year,
        is_active: cls.is_active ?? true,
        wali_kelas_id: cls.wali_kelas_id?.toString() || cls.wali_kelas?.id?.toString() || '',
      });
    } else {
      setSelectedClass(null);
      setFormData({
        name: '',
        grade_level: '',
        academic_year: '2025/2026',
        is_active: true,
        wali_kelas_id: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleDeleteClick = (cls: ClassRoom) => {
    setSelectedClass(cls);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        grade_level: formData.grade_level,
        academic_year: formData.academic_year,
        is_active: formData.is_active,
        wali_kelas_id: formData.wali_kelas_id ? parseInt(formData.wali_kelas_id) : null,
      };
      if (selectedClass) {
        await classAPI.update(selectedClass.id, payload);
      } else {
        await classAPI.create(payload);
      }
      setIsModalOpen(false);
      fetchClasses(statusFilter); // Refresh data
    } catch {
      toast.error('Gagal menyimpan data kelas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedClass) return;
    try {
      await classAPI.delete(selectedClass.id);
      setIsDeleteDialogOpen(false);
      fetchClasses(statusFilter); // Refresh data
    } catch {
      toast.error('Gagal menghapus kelas');
    }
  };

  const handleViewDetail = async (cls: ClassRoom) => {
    setIsDetailOpen(true);
    setDetailLoading(true);
    setStudentSearch('');
    try {
      const response = await classAPI.getById(cls.id);
      setDetailClass(response.data?.data || null);
    } catch {
      toast.error('Gagal memuat detail kelas');
      setDetailClass(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filteredStudents = detailClass?.students?.filter(s =>
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.nisn?.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.email?.toLowerCase().includes(studentSearch.toLowerCase())
  ) || [];

  const openProfilePreview = (name: string, rawUrl?: string | null) => {
    const safeUrl = getSecureFileUrl(rawUrl);
    if (!safeUrl) return;

    if (profilePreviewCloseTimerRef.current) {
      clearTimeout(profilePreviewCloseTimerRef.current);
      profilePreviewCloseTimerRef.current = null;
    }

    setIsProfilePreviewClosing(false);
    setIsProfilePreviewBroken(false);
    setProfilePreviewFitMode('contain');
    setProfilePreview({ src: safeUrl, name });
  };

  const toggleProfilePreviewFitMode = () => {
    if (isProfilePreviewBroken) return;
    setProfilePreviewFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'));
  };

  const closeProfilePreview = () => {
    if (!profilePreview || isProfilePreviewClosing) return;

    setIsProfilePreviewClosing(true);

    if (profilePreviewCloseTimerRef.current) {
      clearTimeout(profilePreviewCloseTimerRef.current);
    }

    profilePreviewCloseTimerRef.current = setTimeout(() => {
      setProfilePreview(null);
      setIsProfilePreviewBroken(false);
      setIsProfilePreviewClosing(false);
      setProfilePreviewFitMode('contain');
      profilePreviewCloseTimerRef.current = null;
    }, 180);
  };

  const resetImportState = () => {
    setImportFile(null);
    setImportPreviewToken('');
    setImportSummary(null);
    setImportPreviewRows([]);
    setImportPreviewErrors([]);
    setIsImportProcessing(false);
  };

  const handleExportClasses = async (format: 'xlsx' | 'csv') => {
    try {
      const statusParams =
        statusFilter === 'archived'
          ? { only_inactive: true }
          : statusFilter === 'all'
            ? { include_inactive: true }
            : {};
      const res = await classAPI.exportData({
        format,
        grade_level: gradeFilter || undefined,
        ...statusParams,
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `classes_export_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Export kelas ${format.toUpperCase()} berhasil`);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal export kelas'));
    }
  };

  const handlePreviewImport = async () => {
    if (!importFile) {
      toast.warning('Pilih file import terlebih dahulu');
      return;
    }
    try {
      setIsImportProcessing(true);
      const res = await classAPI.importPreview(importFile);
      const data = res.data?.data;
      setImportPreviewToken(data?.preview_token || '');
      setImportSummary(data?.summary || null);
      setImportPreviewRows(Array.isArray(data?.preview_rows) ? data.preview_rows : []);
      setImportPreviewErrors(Array.isArray(data?.errors) ? data.errors : []);
      toast.success('Preview import kelas berhasil dibuat');
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal membuat preview import kelas'));
    } finally {
      setIsImportProcessing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreviewToken) {
      toast.warning('Silakan lakukan preview sebelum konfirmasi import');
      return;
    }
    try {
      setIsImportProcessing(true);
      const res = await classAPI.importConfirm(importPreviewToken);
      toast.success(res.data?.message || 'Import kelas selesai');
      setIsImportModalOpen(false);
      resetImportState();
      fetchClasses(statusFilter);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal konfirmasi import kelas'));
    } finally {
      setIsImportProcessing(false);
    }
  };

  const openPromoteModal = () => {
    const latestYear = academicYearOptions.length > 0
      ? academicYearOptions[academicYearOptions.length - 1].value
      : '';
    const nextYear = latestYear ? getNextAcademicYear(latestYear) : '';
    setPromoteMode('bulk');
    setPromoteFromYear(latestYear);
    setPromoteToYear(nextYear);
    setPromoteEffectiveDate(latestYear ? getDefaultEffectiveDate(latestYear) : new Date().toISOString().slice(0, 10));
    setPromoteMappings({});
    setArchiveFromClasses(true);
    resetRollingExcelState();
    if (latestYear) {
      fetchManualStudents(latestYear);
    }
    setIsPromoteModalOpen(true);
  };

  const handlePromoteSubmit = async () => {
    if (!promoteFromYear || !promoteToYear) {
      toast.warning('Pilih tahun ajaran asal dan tujuan terlebih dahulu');
      return;
    }

    const mappings = Object.entries(promoteMappings)
      .filter(([, target]) => target)
      .map(([fromId, target]) => ({
        from_class_id: Number(fromId),
        to_class_id: target === '__graduate__' ? null : Number(target),
      }));

    if (mappings.length === 0) {
      toast.warning('Pilih minimal satu mapping kelas');
      return;
    }

    setIsPromoting(true);
    try {
      const response = await classAPI.promoteAcademicYear({
        from_academic_year: promoteFromYear,
        to_academic_year: promoteToYear,
        effective_date: promoteEffectiveDate || undefined,
        archive_from_classes: archiveFromClasses,
        mappings,
      });
      const moved = response.data?.data?.students_moved ?? 0;
      const graduated = response.data?.data?.students_graduated ?? 0;
      toast.success(`Promosi selesai: ${moved} siswa dipindah, ${graduated} lulus`);
      setIsPromoteModalOpen(false);
      fetchClasses(statusFilter);
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Gagal melakukan promosi kelas'));
    } finally {
      setIsPromoting(false);
    }
  };
  const getTargetNameAndGrade = (fromClass: ClassRoom) => {
    const name = fromClass.name.trim();
    const grade = (fromClass.grade_level || '').trim().toUpperCase();

    // Grade XII / 12 -> graduate
    if (grade === 'XII' || grade === '12' || /^XII[\.\s\-_]/i.test(name) || /^12[\.\s\-_]/i.test(name)) {
      return { targetName: '', targetGrade: '', isGraduate: true };
    }

    // Grade X / 10 -> XI / 11
    // IMPORTANT: Only replace the leading grade prefix ONCE to avoid corrupting the class number suffix.
    // e.g. "X.10" should become "XI.10", NOT "XI.11"
    if (grade === 'X' || grade === '10' || /^X[\.\s\-_]/i.test(name) || /^10[\.\s\-_]/i.test(name)) {
      let targetName = name;
      // Try replacing Roman numeral prefix first (must check XI won't match — it won't since we already excluded XII above and XI is handled below)
      if (/^X([\.\s\-_])/i.test(targetName)) {
        targetName = targetName.replace(/^X([\.\s\-_])/i, 'XI$1');
      } else if (/^10([\.\s\-_])/i.test(targetName)) {
        targetName = targetName.replace(/^10([\.\s\-_])/i, '11$1');
      }
      return { targetName, targetGrade: 'XI', isGraduate: false };
    }

    // Grade XI / 11 -> XII / 12
    if (grade === 'XI' || grade === '11' || /^XI[\.\s\-_]/i.test(name) || /^11[\.\s\-_]/i.test(name)) {
      let targetName = name;
      if (/^XI([\.\s\-_])/i.test(targetName)) {
        targetName = targetName.replace(/^XI([\.\s\-_])/i, 'XII$1');
      } else if (/^11([\.\s\-_])/i.test(targetName)) {
        targetName = targetName.replace(/^11([\.\s\-_])/i, '12$1');
      }
      return { targetName, targetGrade: 'XII', isGraduate: false };
    }

    return { targetName: `${name} (Lanjutan)`, targetGrade: grade || 'Lainnya', isGraduate: false };
  };

  const handleAutoMapOrGenerate = async () => {
    if (!promoteFromYear || !promoteToYear) {
      toast.warning('Pilih tahun ajaran asal dan tujuan terlebih dahulu');
      return;
    }

    setIsAutoGenerating(true);
    try {
      // Fetch latest classes from server to get accurate state
      const res = await classAPI.getAll({ include_inactive: true });
      const latestClasses: ClassRoom[] = res.data?.data || classes;

      let targetClassesInYear = latestClasses.filter((c) => c.academic_year === promoteToYear);
      const fromClasses = latestClasses.filter((c) => c.academic_year === promoteFromYear);

      if (fromClasses.length === 0) {
        toast.warning(`Tidak ada kelas pada Tahun Ajaran ${promoteFromYear}`);
        return;
      }

      const newMappings: Record<number, string> = {};
      let createdCount = 0;

      for (const fromCls of fromClasses) {
        const { targetName, targetGrade, isGraduate } = getTargetNameAndGrade(fromCls);

        if (isGraduate) {
          newMappings[fromCls.id] = '__graduate__';
          continue;
        }

        // Search for existing class with matching name in promoteToYear
        let existingTarget = targetClassesInYear.find(
          (t) => t.name.toLowerCase() === targetName.toLowerCase()
        );

        // Auto-create target class if missing in target academic year
        if (!existingTarget) {
          try {
            const createRes = await classAPI.create({
              name: targetName,
              grade_level: targetGrade,
              academic_year: promoteToYear,
              is_active: true,
              wali_kelas_id: null,
            });
            const createdClass: ClassRoom | undefined = createRes.data?.data;
            if (createdClass) {
              existingTarget = createdClass;
              targetClassesInYear.push(createdClass);
              createdCount++;
            }
          } catch (err: unknown) {
            const errMsg = getApiErrorMessage(err, '');
            toast.warning(`Gagal membuat kelas "${targetName}": ${errMsg || 'Nama kelas mungkin sudah ada'}`);
            console.error(`Gagal membuat kelas ${targetName}:`, err);
          }
        }

        if (existingTarget) {
          newMappings[fromCls.id] = existingTarget.id.toString();
        }
      }

      await fetchClasses(statusFilter);
      setPromoteMappings(newMappings);

      if (createdCount > 0) {
        toast.success(`Berhasil membuat ${createdCount} kelas baru & menyusun mapping otomatis untuk ${promoteToYear}`);
      } else {
        toast.success(`Mapping kelas otomatis berhasil dipasang untuk ${promoteToYear}`);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Gagal menyiapkan kelas tujuan otomatis'));
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const fetchManualStudents = async (fromYear: string) => {
    if (!fromYear) return;
    setIsManualLoading(true);
    try {
      const res = await classAPI.getRollingStudents(fromYear);
      const list = res.data?.data || [];
      setManualStudents(list);
      setManualAssignments({});
      setManualSelectedIds(new Set());
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal memuat daftar siswa untuk rolling manual'));
    } finally {
      setIsManualLoading(false);
    }
  };

  const resetRollingExcelState = () => {
    setExcelRollingFile(null);
    setExcelRollingToken('');
    setExcelRollingSummary(null);
    setExcelRollingPreviewRows([]);
    setExcelRollingErrors([]);
    setIsExcelPreviewing(false);
    setIsExcelConfirming(false);
  };

  const handleDownloadRollingTemplate = async () => {
    if (!promoteFromYear) {
      toast.warning('Pilih Tahun Ajaran Asal terlebih dahulu');
      return;
    }
    try {
      const res = await classAPI.getRollingTemplate(promoteFromYear);
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeYear = promoteFromYear.replace('/', '-');
      link.download = `template_rolling_siswa_${safeYear}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Template Excel Rolling berhasil diunduh');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal mendownload template Excel'));
    }
  };

  const handleExcelRollingPreview = async () => {
    if (!excelRollingFile) {
      toast.warning('Pilih file Excel rolling terlebih dahulu');
      return;
    }
    if (!promoteFromYear || !promoteToYear) {
      toast.warning('Pilih Tahun Ajaran Asal dan Tujuan terlebih dahulu');
      return;
    }
    setIsExcelPreviewing(true);
    try {
      const res = await classAPI.rollingPreview(excelRollingFile, promoteFromYear, promoteToYear);
      const data = res.data?.data;
      setExcelRollingToken(data?.preview_token || '');
      setExcelRollingSummary(data?.summary || null);
      setExcelRollingPreviewRows(Array.isArray(data?.preview_rows) ? data.preview_rows : []);
      setExcelRollingErrors(Array.isArray(data?.errors) ? data.errors : []);
      toast.success('Preview rolling Excel berhasil dibuat');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal memproses preview Excel rolling'));
    } finally {
      setIsExcelPreviewing(false);
    }
  };

  const handleExcelRollingConfirm = async () => {
    if (!excelRollingToken) {
      toast.warning('Silakan buat preview terlebih dahulu');
      return;
    }
    setIsExcelConfirming(true);
    try {
      const res = await classAPI.rollingConfirm(excelRollingToken, promoteEffectiveDate);
      const moved = res.data?.data?.students_moved ?? 0;
      const graduated = res.data?.data?.students_graduated ?? 0;
      toast.success(`Rolling Excel selesai: ${moved} siswa dipindah, ${graduated} lulus`);
      setIsPromoteModalOpen(false);
      resetRollingExcelState();
      fetchClasses(statusFilter);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal memproses konfirmasi rolling Excel'));
    } finally {
      setIsExcelConfirming(false);
    }
  };

  const handleManualRollingSubmit = async () => {
    if (!promoteFromYear || !promoteToYear) {
      toast.warning('Pilih Tahun Ajaran Asal dan Tujuan terlebih dahulu');
      return;
    }

    const assignments = Object.entries(manualAssignments)
      .filter(([, target]) => target !== '')
      .map(([sId, target]) => ({
        student_id: Number(sId),
        to_class_id: target === '__graduate__' ? null : Number(target),
      }));

    if (assignments.length === 0) {
      toast.warning('Pilih kelas tujuan minimal untuk satu siswa');
      return;
    }

    setIsManualSubmitting(true);
    try {
      const res = await classAPI.rollingManualSubmit({
        from_academic_year: promoteFromYear,
        to_academic_year: promoteToYear,
        effective_date: promoteEffectiveDate || undefined,
        assignments,
      });
      const moved = res.data?.data?.students_moved ?? 0;
      const graduated = res.data?.data?.students_graduated ?? 0;
      toast.success(`Rolling manual selesai: ${moved} siswa dipindah, ${graduated} lulus`);
      setShowManualConfirmModal(false);
      setIsPromoteModalOpen(false);
      fetchClasses(statusFilter);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Gagal memproses rolling manual'));
    } finally {
      setIsManualSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', header: 'Nama Kelas' },
    { key: 'grade_level', header: 'Tingkat' },
    { key: 'academic_year', header: 'Tahun Ajaran' },
    {
      key: 'status',
      header: 'Status',
      render: (item: ClassRoom) => (
        <span
          className={
            item.is_active === false
              ? 'inline-flex items-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-200 px-2 py-0.5 text-xs'
              : 'inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 px-2 py-0.5 text-xs'
          }
        >
          {item.is_active === false ? 'Arsip' : 'Aktif'}
        </span>
      ),
    },
    {
      key: 'students_count',
      header: 'Jumlah Siswa',
      render: (item: ClassRoom) => (
        <button
          onClick={() => handleViewDetail(item)}
          className="flex items-center gap-2 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
        >
          <Users className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <span className="underline underline-offset-2">{item.students_count || 0} siswa</span>
        </button>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (item: ClassRoom) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleViewDetail(item)}
            className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            aria-label="Lihat detail kelas"
            title="Lihat detail"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenModal(item)}
            className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
            aria-label="Edit kelas"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteClick(item)}
            className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            aria-label="Hapus kelas"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const teacherOptions = [
    { value: '', label: 'Belum ditentukan' },
    ...teachers.map((teacher) => ({
      value: teacher.id.toString(),
      label: teacher.nip ? `${teacher.name} (${teacher.nip})` : teacher.name,
    })),
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{classes.length}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Kelas</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-sky-500">{totalStudents}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total Siswa</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              {classes.filter((c) => c.grade_level === 'XII').length}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Kelas XII</p>
          </Card>
          <Card className="text-center">
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
              {classes.filter((c) => c.grade_level === 'XI').length}
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Kelas XI</p>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Kelola Kelas"
            subtitle={`${filteredClasses.length} kelas terdaftar`}
            action={
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Upload className="w-4 h-4" />}
                  onClick={() => {
                    resetImportState();
                    setIsImportModalOpen(true);
                  }}
                >
                  Import
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() => handleExportClasses('xlsx')}
                >
                  Export XLSX
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() => handleExportClasses('csv')}
                >
                  Export CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<RefreshCw className="w-4 h-4" />}
                  onClick={openPromoteModal}
                >
                  Promosi/Rolling
                </Button>
                <Button
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => handleOpenModal()}
                >
                  Tambah Kelas
                </Button>
              </div>
            }
          />

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <Input
                placeholder="Cari nama kelas…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="w-full md:w-48">
              <Select
                options={gradeOptions}
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
              />
            </div>
            <div className="w-full md:w-48">
              <Select
                options={statusOptions}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | 'all')}
              />
            </div>
          </div>

          {/* Table */}
          <Table
            columns={columns}
            data={filteredClasses}
            keyExtractor={(item) => item.id}
          />
        </Card>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedClass ? 'Edit Kelas' : 'Tambah Kelas'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nama Kelas"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Contoh: XII IPA 1"
            required
          />
          <Select
            label="Tingkat"
            options={[
              { value: '', label: 'Pilih Tingkat' },
              { value: 'X', label: 'Kelas X' },
              { value: 'XI', label: 'Kelas XI' },
              { value: 'XII', label: 'Kelas XII' },
            ]}
            value={formData.grade_level}
            onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
          />
          <Input
            label="Tahun Ajaran"
            value={formData.academic_year}
            onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
            placeholder="Contoh: 2025/2026"
            required
          />
          <Checkbox
            label="Kelas aktif (tampil di daftar)"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <Select
            label="Wali Kelas"
            options={teacherOptions}
            value={formData.wali_kelas_id}
            onChange={(e) => setFormData({ ...formData, wali_kelas_id: e.target.value })}
          />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Menyimpan…
                </>
              ) : selectedClass ? (
                'Simpan Perubahan'
              ) : (
                'Tambah Kelas'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Hapus Kelas"
        message={`Apakah Anda yakin ingin menghapus kelas ${selectedClass?.name}? Semua data siswa di kelas ini akan terpengaruh.`}
        confirmText="Hapus"
        variant="danger"
      />

      {/* Import Classes Modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          setIsImportModalOpen(false);
          resetImportState();
        }}
        title="Import Kelas (XLSX/CSV)"
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Upload file kelas dengan header: <code>name,grade_level,academic_year</code>.
            </p>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-sky-600 file:text-white hover:file:bg-sky-700"
            />
          </div>

          {importSummary && (
            <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4">
              <p className="text-sm font-semibold text-sky-800 dark:text-sky-300 mb-2">Ringkasan Preview</p>
              <p className="text-sm text-sky-700 dark:text-sky-300">
                Total {importSummary.total_rows} baris • Buat baru {importSummary.to_create} • Update {importSummary.to_update} • Skip {importSummary.to_skip}
              </p>
              <p className="text-xs mt-1 text-sky-600 dark:text-sky-400">
                {importSummary.to_update} data akan diupdate, lanjut?
              </p>
            </div>
          )}

          {importPreviewRows.length > 0 && (
            <div className="max-h-52 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="text-left px-3 py-2">Baris</th>
                    <th className="text-left px-3 py-2">Aksi</th>
                    <th className="text-left px-3 py-2">Nama Kelas</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreviewRows.map((item, idx) => (
                    <tr key={`${item.row}-${idx}`} className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-3 py-2">{item.row}</td>
                      <td className="px-3 py-2">{item.action === 'update' ? 'Update' : 'Create'}</td>
                      <td className="px-3 py-2">{item.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importPreviewErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 max-h-40 overflow-auto">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Baris Dilewati</p>
              <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
                {importPreviewErrors.slice(0, 20).map((err, idx) => (
                  <li key={`err-${idx}`}>Baris {err.row ?? '-'}: {err.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePreviewImport}
              disabled={isImportProcessing}
            >
              {isImportProcessing ? 'Memproses…' : 'Preview Import'}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmImport}
              disabled={!importPreviewToken || isImportProcessing}
            >
              {isImportProcessing ? 'Mengimport…' : 'Konfirmasi Import'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Promote/Rolling Modal */}
      <Modal
        isOpen={isPromoteModalOpen}
        onClose={() => setIsPromoteModalOpen(false)}
        title="Promosi / Rolling Siswa"
        size="lg"
      >
        <div className="space-y-4">
          {/* Sub-header Mode Tabs */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 -mt-2 mb-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setPromoteMode('bulk')}
              className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                promoteMode === 'bulk'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Bulk per Kelas
            </button>
            <button
              type="button"
              onClick={() => setPromoteMode('excel')}
              className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                promoteMode === 'excel'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Rolling per Siswa (Import Excel)
            </button>
            <button
              type="button"
              onClick={() => setPromoteMode('manual')}
              className={`py-2 px-3.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
                promoteMode === 'manual'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Rolling per Siswa (Manual UI)
            </button>
          </div>

          {/* Academic Year Selection (Shared across all modes) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select
              label="Tahun Ajaran Asal"
              options={academicYearOptions}
              value={promoteFromYear}
              onChange={(e) => {
                const nextValue = e.target.value;
                setPromoteFromYear(nextValue);
                setPromoteMappings({});
                setPromoteEffectiveDate(getDefaultEffectiveDate(nextValue));
                if (!promoteToYear) {
                  setPromoteToYear(getNextAcademicYear(nextValue));
                }
                if (nextValue) {
                  fetchManualStudents(nextValue);
                }
              }}
            />
            <Input
              label="Tahun Ajaran Tujuan"
              value={promoteToYear}
              onChange={(e) => setPromoteToYear(e.target.value)}
              placeholder="Contoh: 2026/2027"
            />
            <Input
              label="Tanggal Mulai"
              type="date"
              value={promoteEffectiveDate}
              onChange={(e) => setPromoteEffectiveDate(e.target.value)}
              required
            />
          </div>

          {/* MODE 1: BULK PER KELAS */}
          {promoteMode === 'bulk' && (
            <div className="space-y-4 pt-1">
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>
                    {promoteTargetClasses.length === 0 ? (
                      <span>
                        Belum ada kelas yang terdaftar untuk Tahun Ajaran <strong>{promoteToYear || 'tujuan'}</strong>.
                        Klik tombol di sebelah kanan untuk membuat kelas tujuan secara otomatis (X ➔ XI, XI ➔ XII).
                      </span>
                    ) : (
                      <span>
                        Ditemukan {promoteTargetClasses.length} kelas untuk Tahun Ajaran <strong>{promoteToYear}</strong>.
                        Pilih kelas tujuan atau gunakan tombol otomatis di sebelah kanan.
                      </span>
                    )}
                  </div>
                </div>
                {promoteToYear && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAutoMapOrGenerate}
                    disabled={isAutoGenerating}
                    className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium py-1 px-2.5 flex items-center gap-1.5 shadow-sm"
                  >
                    {isAutoGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {promoteTargetClasses.length === 0 ? 'Buat Otomatis Kelas Tujuan' : 'Auto-Mapping Pintar'}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Mapping Kelas</p>
                  {promoteFromClasses.length > 0 && promoteTargetClasses.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoMapOrGenerate}
                      disabled={isAutoGenerating}
                      className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Auto-Fit Mapping
                    </button>
                  )}
                </div>
                {promoteFromClasses.length === 0 ? (
                  <p className="text-sm text-slate-500">Tidak ada kelas pada tahun ajaran asal.</p>
                ) : (
                  <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800">
                        <tr>
                          <th className="text-left px-3 py-2">Kelas Asal</th>
                          <th className="text-left px-3 py-2">Siswa Aktif</th>
                          <th className="text-left px-3 py-2">Kelas Tujuan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {promoteFromClasses.map((cls) => (
                          <tr key={cls.id}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900 dark:text-white">{cls.name}</div>
                              <div className="text-xs text-slate-500">{cls.grade_level} • {cls.academic_year}</div>
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                              {cls.students_count || 0}
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                options={[
                                  { value: '', label: 'Lewati (tidak diproses)' },
                                  { value: '__graduate__', label: 'Lulus (keluar kelas)' },
                                  ...promoteTargetClasses.map((target) => ({
                                    value: target.id.toString(),
                                    label: `${target.name} (${target.grade_level})`,
                                  })),
                                ]}
                                value={promoteMappings[cls.id] || ''}
                                onChange={(e) =>
                                  setPromoteMappings((prev) => ({
                                    ...prev,
                                    [cls.id]: e.target.value,
                                  }))
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <Checkbox
                label="Arsipkan kelas asal setelah promosi"
                checked={archiveFromClasses}
                onChange={(e) => setArchiveFromClasses(e.target.checked)}
              />

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsPromoteModalOpen(false)}>
                  Batal
                </Button>
                <Button onClick={handlePromoteSubmit} disabled={isPromoting || isAutoGenerating}>
                  {isPromoting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                      Memproses Promosi...
                    </>
                  ) : (
                    'Proses Promosi Siswa'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* MODE 2: ROLLING PER SISWA (IMPORT EXCEL) */}
          {promoteMode === 'excel' && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between gap-3 p-3 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs">
                <div className="text-indigo-900 dark:text-indigo-200">
                  <p className="font-semibold">Unduh Template Rolling Excel:</p>
                  <p className="text-slate-600 dark:text-slate-400">File sudah berisi NISN, Nama, dan Kelas Asal seluruh siswa aktif pada Tahun Ajaran {promoteFromYear || 'asal'}.</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadRollingTemplate}
                  disabled={!promoteFromYear}
                  className="shrink-0 flex items-center gap-1 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Template
                </Button>
              </div>

              <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center space-y-2">
                <FileSpreadsheet className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Isi kolom <strong>"Kelas Tujuan"</strong> di Excel dengan nama kelas tujuan (contoh: <code>XI-1</code>) atau ketik <code>LULUS</code> untuk kelulusan.
                </p>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={(e) => {
                    setExcelRollingFile(e.target.files?.[0] || null);
                    setExcelRollingToken('');
                    setExcelRollingSummary(null);
                  }}
                  className="block w-full text-xs text-slate-700 dark:text-slate-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                />
              </div>

              {excelRollingSummary && (
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <p className="text-slate-500">Total Baris</p>
                    <p className="text-base font-bold text-slate-800 dark:text-slate-200">{excelRollingSummary.total_rows}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-emerald-600 dark:text-emerald-400">Dipindah</p>
                    <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">{excelRollingSummary.valid_count - excelRollingSummary.graduate_count}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800">
                    <p className="text-sky-600 dark:text-sky-400">Lulus</p>
                    <p className="text-base font-bold text-sky-700 dark:text-sky-300">{excelRollingSummary.graduate_count}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                    <p className="text-rose-600 dark:text-rose-400">Error</p>
                    <p className="text-base font-bold text-rose-700 dark:text-rose-300">{excelRollingSummary.error_count}</p>
                  </div>
                </div>
              )}

              {excelRollingPreviewRows.length > 0 && (
                <div className="max-h-60 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                      <tr>
                        <th className="px-2.5 py-2 text-left">Baris</th>
                        <th className="px-2.5 py-2 text-left">Nama Siswa</th>
                        <th className="px-2.5 py-2 text-left">NISN</th>
                        <th className="px-2.5 py-2 text-left">Kelas Asal</th>
                        <th className="px-2.5 py-2 text-left">Kelas Tujuan</th>
                        <th className="px-2.5 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {excelRollingPreviewRows.map((item, idx) => (
                        <tr key={`prev-${idx}`}>
                          <td className="px-2.5 py-1.5">{item.row}</td>
                          <td className="px-2.5 py-1.5 font-medium text-slate-900 dark:text-white">{item.student_name}</td>
                          <td className="px-2.5 py-1.5 text-slate-500">{item.nisn}</td>
                          <td className="px-2.5 py-1.5">{item.from_class_name}</td>
                          <td className="px-2.5 py-1.5 font-semibold text-indigo-600 dark:text-indigo-400">{item.to_class_name}</td>
                          <td className="px-2.5 py-1.5">
                            {item.is_graduate ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 font-medium">LULUS</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">VALID</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {excelRollingErrors.length > 0 && (
                <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 p-3 max-h-36 overflow-auto">
                  <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    Daftar Baris Error ({excelRollingErrors.length})
                  </p>
                  <ul className="space-y-1 text-xs text-rose-600 dark:text-rose-400">
                    {excelRollingErrors.map((err, idx) => (
                      <li key={`err-${idx}`}>Baris {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExcelRollingPreview}
                  disabled={!excelRollingFile || isExcelPreviewing}
                >
                  {isExcelPreviewing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Memproses Preview…
                    </>
                  ) : (
                    'Preview File Excel'
                  )}
                </Button>
                <Button
                  onClick={handleExcelRollingConfirm}
                  disabled={!excelRollingToken || isExcelConfirming}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isExcelConfirming ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Memproses Rolling…
                    </>
                  ) : (
                    'Konfirmasi Rolling Excel'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* MODE 3: ROLLING PER SISWA (MANUAL UI) */}
          {promoteMode === 'manual' && (
            <div className="space-y-3 pt-1">
              {/* Search & Class Filter */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Cari nama atau NISN siswa..."
                    value={manualSearch}
                    onChange={(e) => setManualSearch(e.target.value)}
                    className="w-full text-xs bg-transparent border-0 focus:outline-none text-slate-800 dark:text-slate-200 placeholder-slate-400"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={manualClassFilter}
                    onChange={(e) => setManualClassFilter(e.target.value)}
                    className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md py-1 px-2 text-slate-700 dark:text-slate-300"
                  >
                    <option value="">Semua Kelas Asal</option>
                    {promoteFromClasses.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checklist Action Bar */}
              {manualSelectedIds.size > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs shadow-sm">
                  <div className="flex items-center gap-2 font-medium text-indigo-900 dark:text-indigo-200">
                    <CheckSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>{manualSelectedIds.size} siswa terpilih</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600 dark:text-slate-400">Pindahkan ke:</span>
                    <select
                      value={manualBulkTargetClass}
                      onChange={(e) => setManualBulkTargetClass(e.target.value)}
                      className="text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded py-1 px-2 text-slate-800 dark:text-slate-200"
                    >
                      <option value="">-- Pilih Kelas Tujuan --</option>
                      <option value="__graduate__">🎓 LULUS (Keluar Kelas)</option>
                      {promoteTargetClasses.map((t) => (
                        <option key={t.id} value={t.id.toString()}>{t.name} ({t.grade_level})</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!manualBulkTargetClass) {
                          toast.warning('Pilih kelas tujuan terlebih dahulu');
                          return;
                        }
                        setManualAssignments((prev) => {
                          const next = { ...prev };
                          manualSelectedIds.forEach((id) => {
                            next[id] = manualBulkTargetClass;
                          });
                          return next;
                        });
                        toast.success(`Berhasil menerapkan kelas tujuan ke ${manualSelectedIds.size} siswa`);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-1 px-2.5"
                    >
                      Terapkan Massal
                    </Button>
                  </div>
                </div>
              )}

              {/* Student Table */}
              {isManualLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
              ) : (
                (() => {
                  const filtered = manualStudents.filter((s) => {
                    const matchSearch = s.name.toLowerCase().includes(manualSearch.toLowerCase()) ||
                      s.nisn.toLowerCase().includes(manualSearch.toLowerCase());
                    const matchClass = manualClassFilter ? s.current_class_name === manualClassFilter : true;
                    return matchSearch && matchClass;
                  });

                  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => manualSelectedIds.has(s.id));
                  const assignedCount = Object.keys(manualAssignments).filter((id) => manualAssignments[Number(id)] && manualAssignments[Number(id)] !== '').length;

                  return (
                    <div className="space-y-2">
                      <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                            <tr>
                              <th className="w-8 px-2.5 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={allFilteredSelected}
                                  onChange={(e) => {
                                    const next = new Set(manualSelectedIds);
                                    if (e.target.checked) {
                                      filtered.forEach((s) => next.add(s.id));
                                    } else {
                                      filtered.forEach((s) => next.delete(s.id));
                                    }
                                    setManualSelectedIds(next);
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                              </th>
                              <th className="px-2.5 py-2 text-left">Nama Siswa</th>
                              <th className="px-2.5 py-2 text-left">NISN</th>
                              <th className="px-2.5 py-2 text-left">Kelas Asal</th>
                              <th className="px-2.5 py-2 text-left">Kelas Tujuan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filtered.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                                  Tidak ada siswa yang ditemukan
                                </td>
                              </tr>
                            ) : (
                              filtered.map((student) => {
                                const isChecked = manualSelectedIds.has(student.id);
                                const selectedTarget = manualAssignments[student.id] || '';
                                return (
                                  <tr key={student.id} className={isChecked ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}>
                                    <td className="px-2.5 py-1.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          const next = new Set(manualSelectedIds);
                                          if (e.target.checked) {
                                            next.add(student.id);
                                          } else {
                                            next.delete(student.id);
                                          }
                                          setManualSelectedIds(next);
                                        }}
                                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                      />
                                    </td>
                                    <td className="px-2.5 py-1.5 font-medium text-slate-900 dark:text-white">{student.name}</td>
                                    <td className="px-2.5 py-1.5 text-slate-500">{student.nisn}</td>
                                    <td className="px-2.5 py-1.5">
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                        {student.current_class_name}
                                      </span>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <select
                                        value={selectedTarget}
                                        onChange={(e) =>
                                          setManualAssignments((prev) => ({
                                            ...prev,
                                            [student.id]: e.target.value,
                                          }))
                                        }
                                        className={`w-full text-xs rounded border py-1 px-2 ${
                                          selectedTarget === '__graduate__'
                                            ? 'bg-sky-50 text-sky-800 border-sky-300 font-semibold'
                                            : selectedTarget !== ''
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold'
                                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        <option value="">-- Pilih Kelas Tujuan --</option>
                                        <option value="__graduate__">🎓 LULUS (Keluar Kelas)</option>
                                        {promoteTargetClasses.map((t) => (
                                          <option key={t.id} value={t.id.toString()}>
                                            {t.name} ({t.grade_level})
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 px-1 pt-1">
                        <span>
                          Status: <strong>{assignedCount}</strong> dari <strong>{manualStudents.length}</strong> siswa sudah diberi kelas tujuan
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next = new Set<number>();
                              manualStudents.forEach((s) => next.add(s.id));
                              setManualSelectedIds(next);
                            }}
                            className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                          >
                            Pilih Semua ({manualStudents.length})
                          </button>
                          <span>•</span>
                          <button
                            type="button"
                            onClick={() => setManualSelectedIds(new Set())}
                            className="text-slate-500 hover:underline"
                          >
                            Batal Pilih
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsPromoteModalOpen(false)}>
                  Batal
                </Button>
                <Button
                  onClick={() => setShowManualConfirmModal(true)}
                  disabled={isManualSubmitting || manualStudents.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Proses Rolling Manual
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Manual Rolling Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showManualConfirmModal}
        onClose={() => setShowManualConfirmModal(false)}
        onConfirm={handleManualRollingSubmit}
        title="Konfirmasi Rolling Manual Siswa"
        message={`Anda akan memproses rolling manual untuk siswa pada Tahun Ajaran ${promoteFromYear} ke ${promoteToYear}. Data enrollment lama akan dinonaktifkan. Lanjutkan?`}
        confirmText="Ya, Jalankan Rolling"
        variant="warning"
      />

      {/* Detail Class Modal */}
      <Modal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        title={`Detail Kelas: ${detailClass?.name || ''}`}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : detailClass ? (
          <div className="space-y-4">
            {/* Class Info */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tingkat</p>
                <p className="font-medium text-slate-900 dark:text-white">Kelas {detailClass.grade_level}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Tahun Ajaran</p>
                <p className="font-medium text-slate-900 dark:text-white">{detailClass.academic_year}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">Total Siswa</p>
                <p className="font-medium text-slate-900 dark:text-white">{detailClass.students_count || detailClass.students?.length || 0} siswa</p>
              </div>
            </div>

            {/* Students List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-slate-900 dark:text-white">Daftar Siswa</h4>
                <div className="w-48">
                  <Input
                    placeholder="Cari siswa..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    leftIcon={<Search className="w-4 h-4" />}
                  />
                </div>
              </div>
              
              {filteredStudents.length > 0 ? (
                <div className="max-h-80 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">No</th>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">Nama</th>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">NISN</th>
                        <th className="text-left px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {filteredStudents.map((student, idx) => (
                        <tr key={student.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {(student.photo || student.avatar) && !brokenStudentPhotoIds[student.id] ? (
                                <button
                                  type="button"
                                  onClick={() => openProfilePreview(student.name, student.photo || student.avatar)}
                                  title="Klik untuk perbesar foto profil"
                                  className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700 shrink-0 cursor-zoom-in"
                                >
                                  <Image
                                    src={getSecureFileUrl(student.photo || student.avatar)}
                                    alt={`Foto profil ${student.name}`}
                                    width={28}
                                    height={28}
                                    className="w-full h-full object-cover"
                                    onError={() => {
                                      setBrokenStudentPhotoIds((prev) => ({ ...prev, [student.id]: true }));
                                    }}
                                  />
                                </button>
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center shrink-0">
                                  <span className="text-white text-[11px] font-semibold">
                                    {student.name?.charAt(0)?.toUpperCase() || '?'}
                                  </span>
                                </div>
                              )}
                              <span className="font-medium text-slate-900 dark:text-white">{student.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{student.nisn || '-'}</td>
                          <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{student.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{studentSearch ? 'Tidak ada siswa yang cocok' : 'Belum ada siswa di kelas ini'}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>Gagal memuat data kelas</p>
          </div>
        )}
      </Modal>

      {/* Profile Photo Preview Modal */}
      <Modal
        isOpen={!!profilePreview}
        onClose={closeProfilePreview}
        title={`Foto Profil${profilePreview?.name ? `: ${profilePreview.name}` : ''}`}
        size="md"
        overlayClassName={isProfilePreviewClosing ? 'animate-backdropFadeOut' : 'animate-backdropFadeIn'}
      >
        {profilePreview && (
          <div className={`space-y-3 ${isProfilePreviewClosing ? 'animate-zoomOutSoft' : 'animate-zoomInSoft'}`}>
            <div className="w-full max-w-md mx-auto aspect-square rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
              {isProfilePreviewBroken ? (
                <div className="text-center text-slate-500 dark:text-slate-400 px-4">
                  <p className="text-sm">Foto profil tidak dapat dimuat.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={toggleProfilePreviewFitMode}
                  title="Klik untuk ubah mode tampilan foto"
                  className="w-full h-full relative cursor-zoom-in"
                >
                  <Image
                    src={profilePreview.src}
                    alt={`Foto profil ${profilePreview.name}`}
                    width={640}
                    height={640}
                    className={`w-full h-full transition-all duration-200 ${profilePreviewFitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
                    onError={() => setIsProfilePreviewBroken(true)}
                  />
                  <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/60 text-white text-[10px] font-medium">
                    {profilePreviewFitMode === 'contain' ? 'Mode: Fit' : 'Mode: Fill'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-center text-sm text-slate-600 dark:text-slate-300">{profilePreview.name}</p>
            {!isProfilePreviewBroken && (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Klik foto untuk ubah mode tampilan.
              </p>
            )}
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
