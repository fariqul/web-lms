'use client';

import React, { useState, useCallback } from 'react';
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
  ClipboardPaste,
} from 'lucide-react';

interface ParsedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  options: { text: string; is_correct: boolean }[];
  valid: boolean;
  error?: string;
}

interface ImportTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: ParsedQuestion[]) => Promise<void>;
  existingCount: number;
}

const EXAMPLE_TEXT = `1. Apa ibu kota Indonesia?
a. Surabaya
b. Bandung
*c. Jakarta
d. Medan

2. Siapa presiden pertama Indonesia?
a. Soeharto
*b. Soekarno
c. Habibie
d. Megawati

3. Jelaskan proses fotosintesis! (essay)`;

export function ImportTextModal({
  isOpen,
  onClose,
  onImport,
  existingCount,
}: ImportTextModalProps) {
  const [rawText, setRawText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [importing, setImporting] = useState(false);
  const [defaultPoints, setDefaultPoints] = useState(10);

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

  const handleParse = () => {
    if (!rawText.trim()) return;
    const parsed = parseText(rawText);
    setParsedQuestions(parsed);
    setStep('preview');
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
    setRawText('');
    setParsedQuestions([]);
    setStep('input');
    setImporting(false);
    onClose();
  };

  const handleLoadExample = () => {
    setRawText(EXAMPLE_TEXT);
  };

  const validCount = parsedQuestions.filter(q => q.valid).length;
  const invalidCount = parsedQuestions.filter(q => !q.valid).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
            <ClipboardPaste className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Import dari Teks
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Tempel soal dalam format teks terstruktur
            </p>
          </div>
        </div>

        {step === 'input' ? (
          <>
            {/* Format Guide */}
            <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 p-4">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
                <div className="text-sm text-violet-800 dark:text-violet-200 space-y-1">
                  <p className="font-semibold">Format penulisan:</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-violet-700 dark:text-violet-300">
                    <li>Nomor soal diawali angka: <code className="bg-violet-100 dark:bg-violet-800/50 px-1 rounded text-xs">1. Teks soal</code></li>
                    <li>Opsi huruf kecil: <code className="bg-violet-100 dark:bg-violet-800/50 px-1 rounded text-xs">a. Teks opsi</code></li>
                    <li>Tandai jawaban benar: <code className="bg-violet-100 dark:bg-violet-800/50 px-1 rounded text-xs">*c. Jawaban benar</code></li>
                    <li>Soal essay: tambahkan <code className="bg-violet-100 dark:bg-violet-800/50 px-1 rounded text-xs">(essay)</code> di akhir soal</li>
                  </ul>
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
                className="w-20 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>

            {/* Text Area */}
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={14}
              className="w-full px-4 py-3 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent font-mono leading-relaxed resize-none"
              placeholder="Tempel soal Anda di sini..."
            />

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleLoadExample}
                className="text-sm text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 underline underline-offset-2"
              >
                Muat contoh format
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleParse}
                  disabled={!rawText.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-40 rounded-lg shadow-md shadow-violet-500/20 transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Preview Soal
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
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
                <p className="text-sm mt-1">Periksa format teks Anda</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setStep('input')}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Kembali Edit
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
