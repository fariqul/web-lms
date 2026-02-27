'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui';
import {
  Search,
  CheckCircle,
  Loader2,
  Copy,
  FileText,
  Clock,
  Users,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import api from '@/services/api';

interface ExamItem {
  id: number;
  title: string;
  subject: string;
  status: string;
  class_name?: string;
  class?: { id: number; name: string };
  duration: number;
  questions_count?: number;
  created_at: string;
}

interface ParsedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  passage?: string | null;
  image?: string | null;
  options: { text: string; is_correct: boolean; image?: string | null }[];
  valid: boolean;
}

interface DuplicateExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: ParsedQuestion[]) => Promise<void>;
  currentExamId: number;
  existingCount: number;
}

export function DuplicateExamModal({
  isOpen,
  onClose,
  onImport,
  currentExamId,
  existingCount,
}: DuplicateExamModalProps) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExam, setSelectedExam] = useState<ExamItem | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<ParsedQuestion[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchExams();
    }
  }, [isOpen]);

  const fetchExams = async () => {
    setLoading(true);
    try {
      const res = await api.get('/exams');
      const data = res.data?.data || res.data || [];
      // Filter out the current exam
      const examList = (Array.isArray(data) ? data : data.data || [])
        .filter((e: ExamItem) => e.id !== currentExamId)
        .map((e: ExamItem) => ({
          ...e,
          class_name: e.class?.name || e.class_name || '',
        }));
      setExams(examList);
    } catch {
      console.error('Failed to fetch exams');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExam = async (exam: ExamItem) => {
    setSelectedExam(exam);
    setLoadingQuestions(true);
    try {
      const res = await api.get(`/exams/${exam.id}`);
      const data = res.data?.data;
      if (data?.questions) {
        const mapped: ParsedQuestion[] = data.questions.map((q: {
          question_text: string;
          question_type: string;
          points: number;
          passage?: string | null;
          image?: string | null;
          options?: { option_text: string; is_correct: boolean; image?: string | null }[];
        }) => ({
          question_text: q.question_text,
          question_type: q.question_type === 'essay' ? 'essay' : 'multiple_choice',
          points: q.points || 10,
          passage: q.passage || null,
          image: q.image || null,
          options: q.options?.map((opt: { option_text: string; is_correct: boolean; image?: string | null }) => ({
            text: opt.option_text,
            is_correct: opt.is_correct,
            image: opt.image || null,
          })) || [],
          valid: true,
        }));
        setPreviewQuestions(mapped);
      } else {
        setPreviewQuestions([]);
      }
    } catch {
      console.error('Failed to fetch exam questions');
      setPreviewQuestions([]);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleImport = async () => {
    if (previewQuestions.length === 0) return;
    setImporting(true);
    try {
      await onImport(previewQuestions);
      handleClose();
    } catch {
      // Error handled by parent
    } finally {
      setImporting(false);
    }
  };

  const handleBack = () => {
    setSelectedExam(null);
    setPreviewQuestions([]);
  };

  const handleClose = () => {
    setSelectedExam(null);
    setPreviewQuestions([]);
    setSearchQuery('');
    onClose();
  };

  const filteredExams = exams.filter(e =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
      case 'active':
      case 'published':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'scheduled':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'completed':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/25">
            <Copy className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {selectedExam ? 'Preview Soal' : 'Duplikat dari Ujian Lain'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {selectedExam
                ? `${selectedExam.title} — ${previewQuestions.length} soal`
                : 'Salin semua soal dari ujian yang sudah ada'}
            </p>
          </div>
        </div>

        {!selectedExam ? (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ujian berdasarkan judul atau mata pelajaran..."
                className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* Exam List */}
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
                </div>
              ) : filteredExams.length === 0 ? (
                <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">
                    {exams.length === 0 ? 'Belum ada ujian lain' : 'Tidak ditemukan'}
                  </p>
                </div>
              ) : (
                filteredExams.map(exam => (
                  <button
                    key={exam.id}
                    onClick={() => handleSelectExam(exam)}
                    className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 p-4 transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                          {exam.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span>{exam.subject}</span>
                          {exam.class_name && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {exam.class_name}
                              </span>
                            </>
                          )}
                          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {exam.duration} menit
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getStatusBadge(exam.status)}`}>
                            {exam.status}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-amber-500 transition-colors" />
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Batal
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Preview Questions */}
            {loadingQuestions ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Ujian ini tidak memiliki soal</p>
              </div>
            ) : (
              <>
                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{previewQuestions.length}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">Soal akan disalin</p>
                  </div>
                  <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-center">
                    <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{existingCount}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Soal existing</p>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                  {previewQuestions.map((q, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-3.5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-sm font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 dark:text-white line-clamp-2">
                            {q.question_text}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">
                              {q.question_type === 'multiple_choice' ? 'PG' : 'Essay'}
                            </span>
                            <span className="text-xs text-slate-400">{q.points} poin</span>
                            {q.question_type === 'multiple_choice' && (
                              <span className="text-xs text-slate-400">{q.options.length} opsi</span>
                            )}
                            {q.passage && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-md">Bacaan</span>
                            )}
                            {q.image && (
                              <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 rounded-md">Gambar</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Kembali
              </button>
              <button
                onClick={handleImport}
                disabled={importing || previewQuestions.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:opacity-40 rounded-lg shadow-md shadow-amber-500/20 transition-all"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyalin...
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Salin {previewQuestions.length} Soal
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
