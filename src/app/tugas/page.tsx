'use client';

import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button, Input, ConfirmDialog } from '@/components/ui';
import { 
  ClipboardList, 
  Plus, 
  Search, 
  Calendar,
  Users,
  CheckCircle,
  Clock,
  Trash2, 
  Edit, 
  Eye,
  X,
  Loader2,
  Upload,
  FileText,
  AlertCircle,
  Download,
  Star
} from 'lucide-react';
import { classAPI, assignmentAPI, getSecureFileUrl } from '@/services/api';
import { SUBJECT_LIST } from '@/constants/subjects';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/Toast';

interface Assignment {
  id: number;
  title: string;
  description: string;
  subject: string;
  teacher_id: number;
  class_id: number;
  deadline: string;
  max_score: number;
  attachment_url?: string;
  status: 'active' | 'closed';
  created_at: string;
  submissions_count: number;
  ungraded_count: number;
  teacher?: { id: number; name: string };
  class_room?: { id: number; name: string };
}

interface Submission {
  id: number;
  assignment_id: number;
  student_id: number;
  content?: string;
  file_url?: string;
  score?: number;
  feedback?: string;
  status: 'submitted' | 'graded' | 'late';
  submitted_at: string;
  graded_at?: string;
  student?: { id: number; name: string; nisn: string };
}

interface ClassOption {
  value: string;
  label: string;
}

export default function TugasGuruPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subject: '',
    class_id: '',
    deadline: '',
    max_score: '100',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Grade form
  const [gradeData, setGradeData] = useState({
    score: '',
    feedback: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [classesRes, assignmentsRes] = await Promise.all([
        classAPI.getAll(),
        assignmentAPI.getAll(),
      ]);
      
      setClasses(
        (classesRes.data?.data || []).map((c: { id: number; name: string }) => ({
          value: c.id.toString(),
          label: c.name,
        }))
      );
      
      setAssignments(assignmentsRes.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setError('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssignments = assignments.filter(a => 
    a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      subject: '',
      class_id: '',
      deadline: '',
      max_score: '100',
    });
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError('Ukuran file maksimal 50MB');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('subject', formData.subject);
      submitData.append('class_id', formData.class_id);
      submitData.append('deadline', formData.deadline);
      submitData.append('max_score', formData.max_score);
      
      if (selectedFile) {
        submitData.append('attachment', selectedFile);
      }

      await assignmentAPI.create(submitData);
      
      setSuccess('Tugas berhasil dibuat!');
      setShowAddModal(false);
      resetForm();
      fetchData();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Failed to create assignment:', error);
      setError(error.response?.data?.message || 'Gagal membuat tugas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    
    setError('');
    setSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append('_method', 'PUT');
      submitData.append('title', formData.title);
      submitData.append('description', formData.description);
      submitData.append('subject', formData.subject);
      submitData.append('class_id', formData.class_id);
      submitData.append('deadline', formData.deadline);
      submitData.append('max_score', formData.max_score);
      
      if (selectedFile) {
        submitData.append('attachment', selectedFile);
      }

      await assignmentAPI.update(selectedAssignment.id, submitData);
      
      setSuccess('Tugas berhasil diperbarui!');
      setShowEditModal(false);
      setSelectedAssignment(null);
      resetForm();
      fetchData();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Failed to update assignment:', error);
      setError(error.response?.data?.message || 'Gagal memperbarui tugas');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId === null) return;
    try {
      await assignmentAPI.delete(deleteId);
      setSuccess('Tugas berhasil dihapus!');
      fetchData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Gagal menghapus tugas');
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setFormData({
      title: assignment.title,
      description: assignment.description || '',
      subject: assignment.subject,
      class_id: assignment.class_id.toString(),
      deadline: assignment.deadline.slice(0, 16),
      max_score: assignment.max_score.toString(),
    });
    setSelectedFile(null);
    setShowEditModal(true);
  };

  const handleViewSubmissions = async (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    try {
      const res = await assignmentAPI.getSubmissions(assignment.id);
      setSubmissions(res.data?.data || []);
      setShowSubmissionsModal(true);
    } catch (error) {
      setError('Gagal memuat data pengumpulan');
    }
  };

  const handleOpenGrade = (submission: Submission) => {
    setSelectedSubmission(submission);
    setGradeData({
      score: submission.score?.toString() || '',
      feedback: submission.feedback || '',
    });
    setShowGradeModal(true);
  };

  const handleGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubmission) return;

    setSubmitting(true);
    try {
      await assignmentAPI.grade(selectedSubmission.id, {
        score: parseInt(gradeData.score),
        feedback: gradeData.feedback,
      });

      setSuccess('Nilai berhasil disimpan!');
      setShowGradeModal(false);
      
      // Refresh submissions
      if (selectedAssignment) {
        const res = await assignmentAPI.getSubmissions(selectedAssignment.id);
        setSubmissions(res.data?.data || []);
      }
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      setError(error.response?.data?.message || 'Gagal menyimpan nilai');
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = (deadline: string) => new Date(deadline) < new Date();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Success/Error Messages */}
        {success && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative flex flex-col sm:flex-row justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Tugas & Assignment</h1>
              <p className="text-blue-100/80">Kelola tugas untuk siswa</p>
            </div>
            <Button onClick={() => { resetForm(); setShowAddModal(true); }} className="bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/20 text-white">
              <Plus className="w-5 h-5 mr-2" />
              Buat Tugas
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 dark:text-slate-400" />
          <input
            type="text"
            placeholder="Cari tugas…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-sky-500" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total Tugas</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{assignments.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Aktif</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {assignments.filter(a => a.status === 'active').length}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Perlu Dinilai</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">
                  {assignments.reduce((sum, a) => sum + (a.ungraded_count || 0), 0)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Assignments List */}
        <div className="space-y-4">
          {filteredAssignments.length === 0 ? (
            <Card className="p-8 text-center">
              <ClipboardList className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Belum ada tugas</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Klik tombol "Buat Tugas" untuk membuat tugas baru</p>
            </Card>
          ) : (
            filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    assignment.status === 'closed' ? 'bg-slate-100 dark:bg-slate-700/50' :
                    isOverdue(assignment.deadline) ? 'bg-red-100 dark:bg-red-900/30' : 'bg-sky-100 dark:bg-sky-900/30'
                  }`}>
                    <ClipboardList className={`w-5 h-5 ${
                      assignment.status === 'closed' ? 'text-slate-600 dark:text-slate-400' :
                      isOverdue(assignment.deadline) ? 'text-red-500' : 'text-sky-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-slate-900 dark:text-white">{assignment.title}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{assignment.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 text-xs rounded-full">
                            {assignment.subject}
                          </span>
                          <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 text-xs rounded-full">
                            {assignment.class_room?.name || '-'}
                          </span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            assignment.status === 'closed' ? 'bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400' :
                            isOverdue(assignment.deadline) ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          }`}>
                            {assignment.status === 'closed' ? 'Ditutup' :
                             isOverdue(assignment.deadline) ? 'Lewat Deadline' : 'Aktif'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleViewSubmissions(assignment)}
                          className="p-2 text-slate-600 dark:text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                          title="Lihat Pengumpulan"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleEdit(assignment)}
                          className="p-2 text-slate-600 dark:text-slate-400 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(assignment.id)}
                          className="p-2 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-600 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Deadline: {formatDate(assignment.deadline)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {assignment.submissions_count || 0} pengumpulan
                      </span>
                      <span>•</span>
                      <span>Nilai maks: {assignment.max_score}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Add/Edit Modal */}
        {(showAddModal || showEditModal) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
                <h2 className="text-lg font-semibold">
                  {showEditModal ? 'Edit Tugas' : 'Buat Tugas Baru'}
                </h2>
                <button 
                  onClick={() => { 
                    setShowAddModal(false); 
                    setShowEditModal(false);
                    setSelectedAssignment(null);
                    resetForm(); 
                    setError(''); 
                  }} 
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={showEditModal ? handleUpdate : handleSubmit} className="p-4 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg text-red-700 dark:text-red-400 text-sm">
                    {error}
                  </div>
                )}
                
                <Input
                  label="Judul Tugas"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Masukkan judul tugas"
                  required
                />
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Deskripsi</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Instruksi atau deskripsi tugas"
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mata Pelajaran <span className="text-red-500">*</span></label>
                    <select
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    >
                      <option value="">Pilih Mata Pelajaran</option>
                      {SUBJECT_LIST.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Kelas</label>
                    <select
                      value={formData.class_id}
                      onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    >
                      <option value="">Pilih Kelas</option>
                      {classes.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Deadline</label>
                    <input
                      type="datetime-local"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      required
                    />
                  </div>
                  <Input
                    label="Nilai Maksimal"
                    type="number"
                    value={formData.max_score}
                    onChange={(e) => setFormData({ ...formData, max_score: e.target.value })}
                    min="1"
                    max="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Lampiran (Opsional)
                  </label>
                  <div 
                    className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                      ${selectedFile ? 'border-blue-500 bg-sky-50' : 'border-slate-300 hover:border-blue-500'}`}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="w-5 h-5 text-sky-500" />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{selectedFile.name}</span>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                          }}
                          className="p-1 hover:bg-slate-200 rounded"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-slate-600 dark:text-slate-400 mx-auto mb-1" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">Upload file lampiran</p>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => {
                      setShowAddModal(false);
                      setShowEditModal(false);
                      setSelectedAssignment(null);
                      resetForm();
                    }}
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Menyimpan…
                      </>
                    ) : (
                      showEditModal ? 'Perbarui Tugas' : 'Buat Tugas'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Submissions Modal */}
        {showSubmissionsModal && selectedAssignment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Pengumpulan Tugas</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{selectedAssignment.title}</p>
                </div>
                <button 
                  onClick={() => { setShowSubmissionsModal(false); setSelectedAssignment(null); }} 
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {submissions.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-600 dark:text-slate-400">Belum ada pengumpulan</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submissions.map((submission) => (
                      <div 
                        key={submission.id} 
                        className="p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {submission.student?.name}
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                              NISN: {submission.student?.nisn}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                submission.status === 'graded' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                submission.status === 'late' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                                'bg-sky-50 text-sky-700'
                              }`}>
                                {submission.status === 'graded' ? 'Sudah Dinilai' :
                                 submission.status === 'late' ? 'Terlambat' : 'Menunggu Penilaian'}
                              </span>
                              <span className="text-xs text-slate-600 dark:text-slate-400">
                                Dikumpulkan: {formatDate(submission.submitted_at)}
                              </span>
                            </div>
                            {submission.content && (
                              <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">
                                {submission.content}
                              </p>
                            )}
                            {submission.file_url && (
                              <a 
                                href={getSecureFileUrl(submission.file_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-sky-500 hover:underline mt-2"
                              >
                                <Download className="w-4 h-4" />
                                Download File
                              </a>
                            )}
                          </div>
                          <div className="text-right">
                            {submission.status === 'graded' ? (
                              <div>
                                <p className="text-2xl font-bold text-sky-500">
                                  {submission.score}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  / {selectedAssignment.max_score}
                                </p>
                              </div>
                            ) : (
                              <Button 
                                size="sm"
                                onClick={() => handleOpenGrade(submission)}
                              >
                                <Star className="w-4 h-4 mr-1" />
                                Nilai
                              </Button>
                            )}
                          </div>
                        </div>
                        {submission.feedback && (
                          <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm">
                            <p className="text-slate-600 dark:text-slate-400 text-xs mb-1">Feedback:</p>
                            <p className="text-slate-700 dark:text-slate-300">{submission.feedback}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Grade Modal */}
        {showGradeModal && selectedSubmission && selectedAssignment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <Card className="w-full max-w-md">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Beri Nilai</h2>
                <button 
                  onClick={() => { setShowGradeModal(false); setSelectedSubmission(null); }} 
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleGrade} className="p-4 space-y-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Siswa</p>
                  <p className="font-medium">{selectedSubmission.student?.name}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nilai (0 - {selectedAssignment.max_score})
                  </label>
                  <input
                    type="number"
                    value={gradeData.score}
                    onChange={(e) => setGradeData({ ...gradeData, score: e.target.value })}
                    min="0"
                    max={selectedAssignment.max_score}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Feedback (Opsional)
                  </label>
                  <textarea
                    value={gradeData.feedback}
                    onChange={(e) => setGradeData({ ...gradeData, feedback: e.target.value })}
                    placeholder="Berikan komentar atau feedback"
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setShowGradeModal(false)}
                    disabled={submitting}
                  >
                    Batal
                  </Button>
                  <Button type="submit" className="flex-1" disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Simpan Nilai'
                    )}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Hapus Tugas"
        message="Yakin ingin menghapus tugas ini?"
        confirmText="Hapus"
        variant="danger"
      />
    </DashboardLayout>
  );
}
