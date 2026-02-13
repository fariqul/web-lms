'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui';
import {
  Search,
  CheckCircle,
  Loader2,
  Filter,
  BookOpen,
  ChevronDown,
  Library,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react';
import { bankQuestionAPI } from '@/services/api';
import { SUBJECT_LIST } from '@/constants/subjects';

interface BankQuestion {
  id: number;
  question: string;
  type: 'pilihan_ganda' | 'essay';
  subject: string;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  grade_level: string;
  options?: string[];
  correct_answer?: string;
}

interface ParsedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  options: { text: string; is_correct: boolean }[];
  valid: boolean;
}

interface ImportBankSoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: ParsedQuestion[]) => Promise<void>;
  existingCount: number;
}

export function ImportBankSoalModal({
  isOpen,
  onClose,
  onImport,
  existingCount,
}: ImportBankSoalModalProps) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [defaultPoints, setDefaultPoints] = useState(10);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchQuery) params.search = searchQuery;
      if (filterSubject) params.subject = filterSubject;
      if (filterDifficulty) params.difficulty = filterDifficulty;

      const res = await bankQuestionAPI.getAll(params);
      const data = res.data?.data || [];
      setQuestions(data);
    } catch {
      console.error('Failed to fetch bank soal');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterSubject, filterDifficulty]);

  useEffect(() => {
    if (isOpen) {
      fetchQuestions();
    }
  }, [isOpen, fetchQuestions]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredQuestions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredQuestions.map(q => q.id)));
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchSearch = !searchQuery || q.question.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  const handleImport = async () => {
    const selected = questions.filter(q => selectedIds.has(q.id));
    if (selected.length === 0) return;

    const mapped: ParsedQuestion[] = selected.map(q => {
      if (q.type === 'pilihan_ganda' && q.options && q.correct_answer) {
        return {
          question_text: q.question,
          question_type: 'multiple_choice' as const,
          points: defaultPoints,
          options: q.options.map((opt: string) => ({
            text: opt,
            is_correct: opt === q.correct_answer,
          })),
          valid: true,
        };
      }
      return {
        question_text: q.question,
        question_type: 'essay' as const,
        points: defaultPoints,
        options: [],
        valid: true,
      };
    });

    setImporting(true);
    try {
      await onImport(mapped);
      handleClose();
    } catch {
      // Error handled by parent
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedIds(new Set());
    setSearchQuery('');
    setFilterSubject('');
    setFilterDifficulty('');
    onClose();
  };

  const getDifficultyBadge = (d: string) => {
    switch (d) {
      case 'mudah':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'sedang':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'sulit':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
    }
  };

  const getDifficultyLabel = (d: string) => {
    switch (d) {
      case 'mudah': return 'Mudah';
      case 'sedang': return 'Sedang';
      case 'sulit': return 'Sulit';
      default: return d;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Library className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Import dari Bank Soal
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pilih soal dari koleksi Bank Soal untuk ditambahkan ke ujian
            </p>
          </div>
          {selectedIds.size > 0 && (
            <span className="px-3 py-1 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              {selectedIds.size} dipilih
            </span>
          )}
        </div>

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari soal..."
                className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border rounded-xl transition-colors ${
                showFilters || filterSubject || filterDifficulty
                  ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              Filter
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showFilters && (
            <div className="flex gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mata Pelajaran</label>
                <select
                  value={filterSubject}
                  onChange={(e) => setFilterSubject(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">Semua</option>
                  {SUBJECT_LIST.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Kesulitan</label>
                <select
                  value={filterDifficulty}
                  onChange={(e) => setFilterDifficulty(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">Semua</option>
                  <option value="mudah">Mudah</option>
                  <option value="sedang">Sedang</option>
                  <option value="sulit">Sulit</option>
                </select>
              </div>
              <div className="w-24">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Poin</label>
                <input
                  type="number"
                  value={defaultPoints}
                  onChange={(e) => setDefaultPoints(parseInt(e.target.value) || 10)}
                  min={1}
                  max={100}
                  className="w-full px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Select All */}
        {filteredQuestions.length > 0 && (
          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              {selectedIds.size === filteredQuestions.length ? (
                <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              {selectedIds.size === filteredQuestions.length ? 'Batal pilih semua' : 'Pilih semua'}
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {filteredQuestions.length} soal tersedia
            </span>
          </div>
        )}

        {/* Questions List */}
        <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">
                {questions.length === 0 ? 'Bank soal kosong' : 'Tidak ada soal ditemukan'}
              </p>
              <p className="text-sm mt-1">
                {questions.length === 0
                  ? 'Tambahkan soal ke Bank Soal terlebih dahulu'
                  : 'Coba ubah filter pencarian'}
              </p>
            </div>
          ) : (
            filteredQuestions.map(q => {
              const isSelected = selectedIds.has(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => toggleSelect(q.id)}
                  className={`w-full text-left rounded-xl border p-3.5 transition-all ${
                    isSelected
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-400/30'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-white leading-relaxed line-clamp-2">
                        {q.question}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-md ${getDifficultyBadge(q.difficulty)}`}>
                          {getDifficultyLabel(q.difficulty)}
                        </span>
                        <span className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-md">
                          {q.type === 'pilihan_ganda' ? 'PG' : 'Essay'}
                        </span>
                        <span className="text-xs text-slate-400">{q.subject}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleImport}
            disabled={importing || selectedIds.size === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 disabled:opacity-40 rounded-lg shadow-md shadow-blue-500/20 transition-all"
          >
            {importing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Mengimpor...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Import {selectedIds.size} Soal
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
