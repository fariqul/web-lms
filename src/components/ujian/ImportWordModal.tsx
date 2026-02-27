'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Eye,
  ArrowRight,
  Info,
  Upload,
  FileUp,
  RefreshCw,
} from 'lucide-react';

interface ParsedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  options: { text: string; is_correct: boolean }[];
  valid: boolean;
  error?: string;
}

interface ImportWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: ParsedQuestion[]) => Promise<void>;
  existingCount: number;
}

export function ImportWordModal({
  isOpen,
  onClose,
  onImport,
  existingCount,
}: ImportWordModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [step, setStep] = useState<'upload' | 'preview-text' | 'preview-questions'>('upload');
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [defaultPoints, setDefaultPoints] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Same parsing logic as ImportTextModal
  const parseText = useCallback((text: string): ParsedQuestion[] => {
    const results: ParsedQuestion[] = [];
    const lines = text.split('\n').map(l => l.trimEnd());

    let currentQuestion: string | null = null;
    let currentOptions: { text: string; is_correct: boolean }[] = [];
    let isEssay = false;

    const flushQuestion = () => {
      if (!currentQuestion) return;
      const qText = currentQuestion.trim();
      if (!qText) return;

      if (isEssay || currentOptions.length === 0) {
        results.push({
          question_text: qText,
          question_type: 'essay',
          points: defaultPoints,
          options: [],
          valid: true,
        });
      } else {
        const hasCorrect = currentOptions.some(o => o.is_correct);
        results.push({
          question_text: qText,
          question_type: 'multiple_choice',
          points: defaultPoints,
          options: currentOptions,
          valid: hasCorrect && currentOptions.length >= 2,
          error: !hasCorrect
            ? 'Tidak ada jawaban benar (tandai dengan * di depan opsi)'
            : currentOptions.length < 2
              ? 'Minimal 2 pilihan jawaban'
              : undefined,
        });
      }

      currentQuestion = null;
      currentOptions = [];
      isEssay = false;
    };

    for (const line of lines) {
      if (!line.trim()) continue;

      // Match question start: "1." or "1)" or just a number at start
      const questionMatch = line.match(/^\s*(\d+)\s*[.)]\s*(.+)/);
      // Match option: "a." "a)" "*a." "*a)" or just "a " with letter
      const optionMatch = line.match(/^\s*(\*?)\s*([a-eA-E])\s*[.)]\s*(.+)/);

      if (questionMatch && !optionMatch) {
        flushQuestion();
        const qText = questionMatch[2].trim();
        // Check if explicitly marked as essay
        if (/\(essay\)\s*$/i.test(qText)) {
          isEssay = true;
          currentQuestion = qText.replace(/\s*\(essay\)\s*$/i, '').trim();
        } else {
          currentQuestion = qText;
        }
      } else if (optionMatch && currentQuestion) {
        const isCorrect = optionMatch[1] === '*';
        const optText = optionMatch[3].trim();
        currentOptions.push({ text: optText, is_correct: isCorrect });
      } else if (currentQuestion) {
        // Continuation of question text
        currentQuestion += ' ' + line.trim();
      }
    }

    flushQuestion();
    return results;
  }, [defaultPoints]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    const isDocx = selectedFile.name.toLowerCase().endsWith('.docx');
    const isDoc = selectedFile.name.toLowerCase().endsWith('.doc');

    if (!validTypes.includes(selectedFile.type) && !isDocx && !isDoc) {
      setError('Format file tidak didukung. Gunakan file .docx');
      return;
    }

    if (isDoc && !isDocx) {
      setError('Format .doc (Word 97-2003) tidak didukung. Simpan ulang file sebagai .docx');
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Ukuran file terlalu besar. Maksimal 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setParsing(true);

    try {
      // Dynamic import mammoth to avoid SSR issues
      const mammoth = await import('mammoth');
      const arrayBuffer = await selectedFile.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      
      const text = result.value.trim();
      if (!text) {
        setError('File Word kosong atau tidak mengandung teks yang dapat dibaca');
        setParsing(false);
        return;
      }

      setExtractedText(text);
      setStep('preview-text');
    } catch (err) {
      console.error('Failed to parse Word file:', err);
      setError('Gagal membaca file Word. Pastikan file tidak rusak dan berformat .docx');
    } finally {
      setParsing(false);
    }
  };

  const handleParseQuestions = () => {
    const parsed = parseText(extractedText);
    setParsedQuestions(parsed);
    setStep('preview-questions');
  };

  const handleRemoveQuestion = (index: number) => {
    setParsedQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const validQuestions = parsedQuestions.filter(q => q.valid);
    if (validQuestions.length === 0) return;

    setImporting(true);
    try {
      await onImport(validQuestions);
      handleClose();
    } catch {
      // Error handled by parent
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setExtractedText('');
    setParsedQuestions([]);
    setStep('upload');
    setImporting(false);
    setParsing(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Simulate file input change
      const dt = new DataTransfer();
      dt.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Manually trigger
      handleFileChange({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const validCount = parsedQuestions.filter(q => q.valid).length;
  const invalidCount = parsedQuestions.filter(q => !q.valid).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Import dari Word
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload file .docx dengan format yang sama seperti import teks
            </p>
          </div>
        </div>

        {step === 'upload' && (
          <>
            {/* Format Guide */}
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-semibold">Format penulisan di Word:</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-blue-700 dark:text-blue-300">
                    <li>Nomor soal diawali angka: <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">1. Teks soal</code></li>
                    <li>Opsi huruf kecil: <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">a. Teks opsi</code></li>
                    <li>Tandai jawaban benar: <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">*c. Jawaban benar</code></li>
                    <li>Soal essay: tambahkan <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">(essay)</code> di akhir soal</li>
                  </ul>
                  <p className="text-blue-600 dark:text-blue-400 mt-2 text-xs">
                    Format sama persis dengan Import Teks. Tulis soal di Word lalu upload.
                  </p>
                </div>
              </div>
            </div>

            {/* Default Points */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Poin per soal:
              </label>
              <input
                type="number"
                value={defaultPoints}
                onChange={(e) => setDefaultPoints(parseInt(e.target.value) || 10)}
                min={1}
                max={100}
                className="w-20 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* File Upload Area */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                error
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                  : file
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {parsing ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 mx-auto text-blue-500 animate-spin" />
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Membaca file Word...</p>
                </div>
              ) : file && !error ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Drag & drop file Word atau <span className="text-blue-600 dark:text-blue-400 underline underline-offset-2">klik untuk pilih</span>
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Format: .docx (maks 10MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Batal
              </button>
            </div>
          </>
        )}

        {step === 'preview-text' && (
          <>
            {/* Extracted Text Preview */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Teks dari: <span className="text-blue-600 dark:text-blue-400">{file?.name}</span>
                </span>
              </div>
              <span className="text-xs text-slate-400">{extractedText.split('\n').filter(l => l.trim()).length} baris</span>
            </div>

            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              rows={14}
              className="w-full px-4 py-3 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono leading-relaxed resize-none"
              placeholder="Teks dari file Word..."
            />

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Anda bisa mengedit teks di atas sebelum melanjutkan ke preview soal.
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setExtractedText('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Ganti File
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleParseQuestions}
                  disabled={!extractedText.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 rounded-lg shadow-md shadow-blue-500/20 transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Preview Soal
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'preview-questions' && (
          <>
            {/* Preview Stats */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{validCount}</p>
                <p className="text-xs text-green-700 dark:text-green-300">Soal Valid</p>
              </div>
              {invalidCount > 0 && (
                <div className="flex-1 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{invalidCount}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">Perlu Perbaikan</p>
                </div>
              )}
              <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-center">
                <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{existingCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Soal Existing</p>
              </div>
            </div>

            {/* Parsed Questions List */}
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-1">
              {parsedQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 transition-colors ${
                    q.valid
                      ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-white font-medium mb-1">
                        {q.question_text}
                      </p>

                      {q.question_type === 'multiple_choice' && q.options.length > 0 && (
                        <div className="space-y-1 ml-1 mt-2">
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className={`flex items-center gap-2 text-xs ${
                                opt.is_correct
                                  ? 'text-green-600 dark:text-green-400 font-semibold'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                opt.is_correct
                                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                              {opt.text}
                              {opt.is_correct && <CheckCircle className="w-3.5 h-3.5" />}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.question_type === 'essay' && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">
                          Essay
                        </span>
                      )}

                      {!q.valid && q.error && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {q.error}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveQuestion(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                      title="Hapus soal ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {parsedQuestions.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Tidak ada soal terdeteksi</p>
                <p className="text-sm mt-1">Periksa format teks di file Word Anda</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setStep('preview-text')}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Kembali Edit Teks
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-40 rounded-lg shadow-md shadow-green-500/20 transition-all"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengimpor...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Import {validCount} Soal
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
