'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Modal } from '@/components/ui';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Download,
  Info,
  X,
  File,
} from 'lucide-react';

interface ParsedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  options: { text: string; is_correct: boolean }[];
  valid: boolean;
  error?: string;
}

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: ParsedQuestion[]) => Promise<void>;
  existingCount: number;
}

const CSV_TEMPLATE = `Soal,Opsi A,Opsi B,Opsi C,Opsi D,Jawaban Benar,Poin,Tipe
Apa ibu kota Indonesia?,Surabaya,Bandung,Jakarta,Medan,C,10,PG
Siapa penemu telepon?,Graham Bell,Thomas Edison,Nikola Tesla,Albert Einstein,A,10,PG
Jelaskan proses fotosintesis!,,,,,,,Essay`;

export function ImportExcelModal({
  isOpen,
  onClose,
  onImport,
  existingCount,
}: ImportExcelModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = useCallback((text: string): ParsedQuestion[] => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return [];

    // Skip header
    const dataLines = lines.slice(1);
    const results: ParsedQuestion[] = [];

    for (const line of dataLines) {
      // Parse CSV properly handling quoted fields
      const fields = parseCSVLine(line);
      if (fields.length < 1) continue;

      const questionText = fields[0]?.trim();
      if (!questionText) continue;

      const optA = fields[1]?.trim() || '';
      const optB = fields[2]?.trim() || '';
      const optC = fields[3]?.trim() || '';
      const optD = fields[4]?.trim() || '';
      const correctAnswer = fields[5]?.trim().toUpperCase() || '';
      const points = parseInt(fields[6]?.trim()) || 10;
      const type = fields[7]?.trim().toLowerCase() || '';

      const isEssay = type === 'essay' || (!optA && !optB && !optC && !optD);

      if (isEssay) {
        results.push({
          question_text: questionText,
          question_type: 'essay',
          points,
          options: [],
          valid: true,
        });
      } else {
        const allOptions = [optA, optB, optC, optD].filter(o => o);
        const correctIdx = correctAnswer.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3

        const options = allOptions.map((text, idx) => ({
          text,
          is_correct: idx === correctIdx,
        }));

        const hasCorrect = correctIdx >= 0 && correctIdx < allOptions.length;

        results.push({
          question_text: questionText,
          question_type: 'multiple_choice',
          points,
          options,
          valid: hasCorrect && allOptions.length >= 2,
          error: !hasCorrect
            ? `Jawaban benar "${correctAnswer}" tidak valid (gunakan A-${String.fromCharCode(64 + allOptions.length)})`
            : allOptions.length < 2
              ? 'Minimal 2 opsi jawaban'
              : undefined,
        });
      }
    }

    return results;
  }, []);

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseError('');
    setParsing(true);

    try {
      const ext = selectedFile.name.split('.').pop()?.toLowerCase();

      if (ext === 'csv' || ext === 'txt') {
        const text = await selectedFile.text();
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          setParseError('Tidak ada soal terdeteksi. Pastikan format CSV sesuai template.');
          setParsing(false);
          return;
        }
        setParsedQuestions(parsed);
        setStep('preview');
      } else if (ext === 'xlsx' || ext === 'xls') {
        // Try dynamic import of xlsx library
        try {
          const XLSX = await import('xlsx');
          const data = await selectedFile.arrayBuffer();
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(firstSheet);
          const parsed = parseCSV(csv);
          if (parsed.length === 0) {
            setParseError('Tidak ada soal terdeteksi di file Excel.');
            setParsing(false);
            return;
          }
          setParsedQuestions(parsed);
          setStep('preview');
        } catch {
          setParseError(
            'Gagal membaca file Excel. Pastikan library xlsx terinstall, atau gunakan format CSV.'
          );
        }
      } else {
        setParseError('Format file tidak didukung. Gunakan .csv atau .xlsx');
      }
    } catch {
      setParseError('Gagal membaca file');
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
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

  const handleDownloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_soal_ujian.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setFile(null);
    setParsedQuestions([]);
    setStep('upload');
    setParseError('');
    setImporting(false);
    setParsing(false);
    onClose();
  };

  const validCount = parsedQuestions.filter(q => q.valid).length;
  const invalidCount = parsedQuestions.filter(q => !q.valid).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Import dari Excel/CSV
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload file spreadsheet berisi soal ujian
            </p>
          </div>
        </div>

        {step === 'upload' ? (
          <>
            {/* Template Info */}
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
                  <p className="font-semibold mb-1">Format kolom yang diharapkan:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs mt-1">
                      <thead>
                        <tr className="text-left">
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Soal</th>
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Opsi A</th>
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Opsi B</th>
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Opsi C</th>
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Opsi D</th>
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Jawaban</th>
                          <th className="pr-3 py-0.5 text-emerald-700 dark:text-emerald-300">Poin</th>
                          <th className="py-0.5 text-emerald-700 dark:text-emerald-300">Tipe</th>
                        </tr>
                      </thead>
                      <tbody className="text-emerald-600 dark:text-emerald-400">
                        <tr>
                          <td className="pr-3 py-0.5">Teks soal...</td>
                          <td className="pr-3 py-0.5">Opsi 1</td>
                          <td className="pr-3 py-0.5">Opsi 2</td>
                          <td className="pr-3 py-0.5">Opsi 3</td>
                          <td className="pr-3 py-0.5">Opsi 4</td>
                          <td className="pr-3 py-0.5">A/B/C/D</td>
                          <td className="pr-3 py-0.5">10</td>
                          <td className="py-0.5">PG/Essay</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Download Template */}
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Template CSV
            </button>

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                parseError
                  ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
                  : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'
              }`}
            >
              {parsing ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 mx-auto text-emerald-500 animate-spin" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">Membaca file...</p>
                </div>
              ) : file && !parseError ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <File className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                    <Upload className="w-7 h-7 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      Drag & drop file atau klik untuk upload
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Format: .csv, .xlsx (max 5MB)
                    </p>
                  </div>
                </div>
              )}

              {parseError && (
                <div className="flex items-center gap-2 mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {parseError}
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 5 * 1024 * 1024) {
                    setParseError('Ukuran file maksimal 5MB');
                    return;
                  }
                  handleFileSelect(f);
                }
              }}
            />

            {/* Actions */}
            <div className="flex justify-end pt-2">
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

            {/* File info */}
            {file && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <File className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{file.name}</span>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsedQuestions([]);
                    setStep('upload');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Parsed Questions */}
            <div className="max-h-[350px] overflow-y-auto space-y-2 pr-1">
              {parsedQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-3.5 transition-colors ${
                    q.valid
                      ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-white font-medium line-clamp-2">
                        {q.question_text}
                      </p>
                      {q.question_type === 'multiple_choice' && q.options.length > 0 && (
                        <div className="space-y-0.5 mt-2">
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className={`flex items-center gap-1.5 text-xs ${
                                opt.is_correct
                                  ? 'text-green-600 dark:text-green-400 font-semibold'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                opt.is_correct
                                  ? 'bg-green-100 dark:bg-green-900/40'
                                  : 'bg-slate-100 dark:bg-slate-700'
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                              {opt.text}
                              {opt.is_correct && <CheckCircle className="w-3 h-3" />}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.question_type === 'essay' && (
                        <span className="inline-block mt-1.5 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">
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
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  setStep('upload');
                  setParsedQuestions([]);
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Upload File Lain
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 rounded-lg shadow-md shadow-emerald-500/20 transition-all"
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
