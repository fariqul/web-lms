'use client';

import React, { useState, useEffect, useRef } from 'react';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { 
  ClipboardList, 
  Search, 
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  X,
  Loader2,
  Upload,
  FileText,
  AlertCircle,
  Download,
  Send,
  Eye
} from 'lucide-react';
import { assignmentAPI, getSecureFileUrl } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

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
  teacher?: { id: number; name: string };
  class_room?: { id: number; name: string };
  has_submitted?: boolean;
  my_submission?: {
    id: number;
    content?: string;
    file_url?: string;
    score?: number;
    feedback?: string;
    status: 'submitted' | 'graded' | 'late';
    submitted_at: string;
  };
}

type TabType = 'pending' | 'submitted' | 'graded';

export default function TugasSiswaPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Submit form
  const [submitContent, setSubmitContent] = useState('');
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await assignmentAPI.getAll();
      setAssignments(res.data?.data || []);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
      setError('Gagal memuat data tugas');
    } finally {
      setLoading(false);
    }
  };

  // Filter assignments by tab
  const filteredAssignments = assignments.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          a.subject.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    switch (activeTab) {
      case 'pending':
        return !a.has_submitted;
      case 'submitted':
        return a.has_submitted && a.my_submission?.status !== 'graded';
      case 'graded':
        return a.my_submission?.status === 'graded';
      default:
        return true;
    }
  });

  const pendingCount = assignments.filter(a => !a.has_submitted).length;
  const submittedCount = assignments.filter(a => a.has_submitted && a.my_submission?.status !== 'graded').length;
  const gradedCount = assignments.filter(a => a.my_submission?.status === 'graded').length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError('Ukuran file maksimal 50MB');
        return;
      }
      setSubmitFile(file);
      setError('');
    }
  };

  const handleOpenSubmit = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setSubmitContent('');
    setSubmitFile(null);
    setShowSubmitModal(true);
  };

  const handleViewDetail = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    setShowDetailModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;

    if (!submitContent && !submitFile) {
      setError('Isi jawaban atau upload file');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      if (submitContent) {
        formData.append('content', submitContent);
      }
      if (submitFile) {
        formData.append('file', submitFile);
      }

      await assignmentAPI.submit(selectedAssignment.id, formData);
      
      setSuccess('Tugas berhasil dikumpulkan!');
      setShowSubmitModal(false);
      setSelectedAssignment(null);
      fetchData();
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Failed to submit:', error);
      setError(error.response?.data?.message || 'Gagal mengumpulkan tugas');
    } finally {
      setSubmitting(false);
    }
  };

  const isOverdue = (deadline: string) => new Date(deadline) < new Date();

  const getTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();
    
    if (diff < 0) return 'Sudah lewat deadline';
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days} hari ${hours} jam lagi`;
    if (hours > 0) return `${hours} jam lagi`;
    
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${minutes} menit lagi`;
  };

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
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto" aria-label="Tutup pesan error">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tugas Saya</h1>
          <p className="text-slate-600">Lihat dan kumpulkan tugas dari guru</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Cari tugas…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            aria-label="Cari tugas"
            name="searchTugas"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pending'
                ? 'border-blue-500 text-sky-500'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Belum Dikerjakan
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                  {pendingCount}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('submitted')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'submitted'
                ? 'border-blue-500 text-sky-500'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4" />
              Menunggu Nilai
              {submittedCount > 0 && (
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full text-xs">
                  {submittedCount}
                </span>
              )}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('graded')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'graded'
                ? 'border-blue-500 text-sky-500'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Sudah Dinilai
              {gradedCount > 0 && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                  {gradedCount}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Assignments List */}
        <div className="space-y-4">
          {filteredAssignments.length === 0 ? (
            <Card className="p-8 text-center">
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">
                {activeTab === 'pending' && 'Tidak ada tugas yang perlu dikerjakan'}
                {activeTab === 'submitted' && 'Tidak ada tugas yang menunggu nilai'}
                {activeTab === 'graded' && 'Belum ada tugas yang dinilai'}
              </p>
            </Card>
          ) : (
            filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    assignment.my_submission?.status === 'graded' ? 'bg-green-100' :
                    assignment.has_submitted ? 'bg-sky-50' :
                    isOverdue(assignment.deadline) ? 'bg-red-100' : 'bg-orange-100'
                  }`}>
                    {assignment.my_submission?.status === 'graded' ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : assignment.has_submitted ? (
                      <Send className="w-5 h-5 text-sky-500" />
                    ) : isOverdue(assignment.deadline) ? (
                      <AlertTriangle className="w-5 h-5 text-red-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-semibold text-slate-900">{assignment.title}</h3>
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{assignment.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="px-2 py-1 bg-sky-100 text-sky-700 text-xs rounded-full">
                            {assignment.subject}
                          </span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                            {assignment.teacher?.name || 'Guru'}
                          </span>
                          {assignment.my_submission?.status === 'late' && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">
                              Terlambat
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {assignment.my_submission?.status === 'graded' ? (
                          <div className="text-center">
                            <p className="text-2xl font-bold text-sky-500">
                              {assignment.my_submission.score}
                            </p>
                            <p className="text-xs text-slate-500">
                              / {assignment.max_score}
                            </p>
                          </div>
                        ) : assignment.has_submitted ? (
                          <button
                            onClick={() => handleViewDetail(assignment)}
                            className="p-2 text-slate-500 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                            aria-label="Lihat detail tugas"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                        ) : (
                          <Button 
                            size="sm"
                            onClick={() => handleOpenSubmit(assignment)}
                            disabled={assignment.status === 'closed'}
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Kumpulkan
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Deadline: {formatDate(assignment.deadline)}
                      </span>
                      {!assignment.has_submitted && !isOverdue(assignment.deadline) && (
                        <>
                          <span>•</span>
                          <span className={`font-medium ${
                            new Date(assignment.deadline).getTime() - new Date().getTime() < 24 * 60 * 60 * 1000
                              ? 'text-red-500'
                              : 'text-orange-500'
                          }`}>
                            {getTimeRemaining(assignment.deadline)}
                          </span>
                        </>
                      )}
                      {assignment.my_submission && (
                        <>
                          <span>•</span>
                          <span>Dikumpulkan: {formatDate(assignment.my_submission.submitted_at)}</span>
                        </>
                      )}
                    </div>
                    {assignment.my_submission?.feedback && (
                      <div className="mt-3 p-2 bg-slate-50 rounded text-sm">
                        <p className="text-slate-500 text-xs mb-1">Feedback Guru:</p>
                        <p className="text-slate-700">{assignment.my_submission.feedback}</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Submit Modal */}
        {showSubmitModal && selectedAssignment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-lg font-semibold">Kumpulkan Tugas</h2>
                <button 
                  onClick={() => { setShowSubmitModal(false); setSelectedAssignment(null); }} 
                  className="p-1 hover:bg-slate-100 rounded"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4">
                {/* Assignment Info */}
                <div className="mb-4 p-3 bg-slate-50 rounded-lg">
                  <h3 className="font-medium text-slate-900">{selectedAssignment.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedAssignment.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                    <span>{selectedAssignment.subject}</span>
                    <span>•</span>
                    <span>Deadline: {formatDate(selectedAssignment.deadline)}</span>
                  </div>
                  {selectedAssignment.attachment_url && (
                    <a 
                      href={getSecureFileUrl(selectedAssignment.attachment_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-sky-500 hover:underline mt-2"
                    >
                      <Download className="w-4 h-4" />
                      Download Lampiran Tugas
                    </a>
                  )}
                </div>

                {isOverdue(selectedAssignment.deadline) && (
                  <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2 text-orange-700">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm">Deadline sudah lewat. Tugas akan ditandai terlambat.</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <div>
                    <label htmlFor="jawaban" className="block text-sm font-medium text-slate-700 mb-1">
                      Jawaban
                    </label>
                    <textarea
                      id="jawaban"
                      name="jawaban"
                      value={submitContent}
                      onChange={(e) => setSubmitContent(e.target.value)}
                      placeholder="Tulis jawaban atau penjelasan di sini…"
                      rows={5}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Upload File
                    </label>
                    <div 
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
                        ${submitFile ? 'border-blue-500 bg-sky-50' : 'border-slate-300 hover:border-blue-500'}`}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      {submitFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <FileText className="w-5 h-5 text-sky-500" />
                          <span className="text-sm text-slate-700">{submitFile.name}</span>
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubmitFile(null);
                            }}
                            className="p-1 hover:bg-slate-200 rounded"
                            aria-label="Hapus file"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                          <p className="text-sm text-slate-500">Klik untuk upload file</p>
                          <p className="text-xs text-slate-400">PDF, DOC, DOCX, dll (Max. 50MB)</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setShowSubmitModal(false)}
                      disabled={submitting}
                    >
                      Batal
                    </Button>
                    <Button type="submit" className="flex-1" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Mengirim…
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Kumpulkan
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </Card>
          </div>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedAssignment && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Detail Tugas</h2>
                <button 
                  onClick={() => { setShowDetailModal(false); setSelectedAssignment(null); }} 
                  className="p-1 hover:bg-slate-100 rounded"
                  aria-label="Tutup"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="font-semibold text-slate-900">{selectedAssignment.title}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedAssignment.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Mata Pelajaran</p>
                    <p className="font-medium">{selectedAssignment.subject}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Guru</p>
                    <p className="font-medium">{selectedAssignment.teacher?.name}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Deadline</p>
                    <p className="font-medium">{formatDate(selectedAssignment.deadline)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Nilai Maksimal</p>
                    <p className="font-medium">{selectedAssignment.max_score}</p>
                  </div>
                </div>

                {selectedAssignment.my_submission && (
                  <div className="border-t pt-4">
                    <p className="text-sm font-medium text-slate-700 mb-2">Jawaban Saya:</p>
                    {selectedAssignment.my_submission.content && (
                      <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
                        {selectedAssignment.my_submission.content}
                      </p>
                    )}
                    {selectedAssignment.my_submission.file_url && (
                      <a 
                        href={getSecureFileUrl(selectedAssignment.my_submission.file_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-sky-500 hover:underline mt-2"
                      >
                        <Download className="w-4 h-4" />
                        Download File Jawaban
                      </a>
                    )}
                    <p className="text-xs text-slate-500 mt-2">
                      Dikumpulkan: {formatDate(selectedAssignment.my_submission.submitted_at)}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setShowDetailModal(false)}
                  >
                    Tutup
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
