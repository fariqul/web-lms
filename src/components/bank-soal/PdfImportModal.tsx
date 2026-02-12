'use client';

import React, { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { X, Loader2, CheckCircle, Download, FileText, Upload, AlertCircle, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { pdfImportAPI } from '@/services/api';
import { SUBJECT_LIST } from '@/constants/subjects';

interface PdfImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

interface ParseResult {
  questions: Array<{
    number: number;
    question: string;
    options: string[];
    correct_answer: string | null;
  }>;
  detected_subject: string | null;
  metadata: Record<string, string>;
}

export function PdfImportModal({ isOpen, onClose, onImportSuccess }: PdfImportModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [formData, setFormData] = useState({
    file: null as File | null,
    answerKeyFile: null as File | null,
    format: 'general',
    subject: '',
    grade_level: '10' as '10' | '11' | '12',
    difficulty: 'sedang' as 'mudah' | 'sedang' | 'sulit',
    source: '',
  });

  if (!isOpen) return null;

  const reset = () => {
    setFormData({ file: null, answerKeyFile: null, format: 'general', subject: '', grade_level: '10', difficulty: 'sedang', source: '' });
    setParseResult(null);
    setStep('upload');
  };

  const handleClose = () => { onClose(); reset(); };

  const handleParse = async () => {
    if (!formData.file) { toast.warning('Pilih file PDF terlebih dahulu'); return; }
    setLoading(true);
    try {
      const response = await pdfImportAPI.parsePdf(formData.file, formData.format, formData.answerKeyFile || undefined);
      if (response.data?.success && response.data?.data) {
        setParseResult(response.data.data);
        setStep('preview');
        if (response.data.data.detected_subject) {
          setFormData(prev => ({ ...prev, subject: response.data.data.detected_subject }));
        }
      } else {
        toast.error(response.data?.message || 'Gagal memproses PDF');
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || 'Terjadi kesalahan saat memproses PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.questions.length === 0) { toast.warning('Tidak ada soal untuk diimpor'); return; }
    if (!formData.subject) { toast.warning('Pilih mata pelajaran terlebih dahulu'); return; }
    const withAnswers = parseResult.questions.filter(q => q.correct_answer);
    if (withAnswers.length === 0) { toast.warning('Tidak ada soal dengan kunci jawaban.'); return; }

    setStep('importing');
    setLoading(true);
    try {
      const response = await pdfImportAPI.importQuestions({
        questions: withAnswers.map(q => ({
          number: q.number, question: q.question, options: q.options,
          correct_answer: q.correct_answer!, difficulty: formData.difficulty,
        })),
        subject: formData.subject, grade_level: formData.grade_level,
        difficulty: formData.difficulty, source: formData.source || 'PDF Import',
      });
      if (response.data?.success) {
        onImportSuccess();
        handleClose();
        toast.success(`Berhasil mengimpor ${response.data.data.imported} soal!`);
      } else {
        toast.error(response.data?.message || 'Gagal mengimpor soal');
      }
    } catch {
      toast.error('Terjadi kesalahan saat mengimpor soal');
    } finally {
      setLoading(false);
    }
  };

  const updateAnswer = (index: number, answer: string) => {
    if (parseResult) {
      const newQ = [...parseResult.questions];
      newQ[index] = { ...newQ[index], correct_answer: answer };
      setParseResult({ ...parseResult, questions: newQ });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Import Soal dari PDF</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Upload file PDF soal UTBK/UN/SNBT untuk diekstrak otomatis</p>
          </div>
          <button onClick={handleClose}><X className="w-5 h-5 text-slate-600 dark:text-slate-400 hover:text-slate-700" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-4 mb-6">
            {(['upload', 'preview', 'importing'] as const).map((s, i) => (
              <React.Fragment key={s}>
                {i > 0 && <div className="w-8 h-0.5 bg-slate-200" />}
                <div className={`flex items-center gap-2 ${step === s ? 'text-sky-500' : 'text-slate-500 dark:text-slate-500'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === s ? 'bg-sky-100 text-sky-500' : 'bg-slate-100'}`}>{i + 1}</div>
                  <span className="text-sm font-medium">{s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview' : 'Import'}</span>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">File PDF Soal <span className="text-red-500">*</span></label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFormData(prev => ({ ...prev, file: f })); }} className="hidden" id="pdf-file-input" />
                  <label htmlFor="pdf-file-input" className="cursor-pointer">
                    {formData.file ? (
                      <div className="flex items-center justify-center gap-2 text-sky-500"><FileText className="w-8 h-8" /><span className="font-medium">{formData.file.name}</span></div>
                    ) : (
                      <><Upload className="w-10 h-10 text-slate-500 dark:text-slate-500 mx-auto mb-2" /><p className="text-slate-600">Klik untuk upload atau drag & drop</p><p className="text-sm text-slate-500 dark:text-slate-500">PDF maksimal 10MB</p></>
                    )}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">File Kunci Jawaban (Opsional)</label>
                <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-4 text-center hover:border-slate-300 transition-colors">
                  <input type="file" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFormData(prev => ({ ...prev, answerKeyFile: f })); }} className="hidden" id="answer-key-input" />
                  <label htmlFor="answer-key-input" className="cursor-pointer">
                    {formData.answerKeyFile ? (
                      <div className="flex items-center justify-center gap-2 text-green-600"><CheckCircle className="w-5 h-5" /><span className="text-sm">{formData.answerKeyFile.name}</span></div>
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-400">Upload PDF kunci jawaban jika ada</p>
                    )}
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Format Soal</label>
                <select value={formData.format} onChange={(e) => setFormData({ ...formData, format: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                  <option value="general">Otomatis (Auto-detect)</option>
                  <option value="utbk">UTBK/SBMPTN (5 opsi A-E)</option>
                  <option value="snbt">SNBT (5 opsi A-E)</option>
                  <option value="un">Ujian Nasional (4 opsi A-D)</option>
                </select>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg flex gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-700">
                  <p className="font-medium">Tips untuk hasil terbaik:</p>
                  <ul className="list-disc ml-4 mt-1 space-y-1">
                    <li>Gunakan PDF yang jelas dan tidak ter-scan miring</li>
                    <li>Format soal standar: nomor, pertanyaan, lalu opsi A-D/E</li>
                    <li>Upload kunci jawaban terpisah jika tersedia</li>
                  </ul>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Batal</Button>
                <Button type="button" className="flex-1" onClick={handleParse} disabled={!formData.file || loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Memproses…</> : <><Eye className="w-4 h-4 mr-2" />Ekstrak Soal</>}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && parseResult && (
            <div className="space-y-4">
              <div className="bg-green-50 p-3 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm text-green-700">
                  Berhasil mengekstrak <strong>{parseResult.questions.length}</strong> soal
                  {parseResult.detected_subject && ` - Terdeteksi: ${parseResult.detected_subject}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mata Pelajaran <span className="text-red-500">*</span></label>
                  <select value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="">Pilih Mapel</option>
                    {SUBJECT_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tingkat Kelas</label>
                  <select value={formData.grade_level} onChange={(e) => setFormData({ ...formData, grade_level: e.target.value as '10' | '11' | '12' })} className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="10">Kelas 10</option><option value="11">Kelas 11</option><option value="12">Kelas 12</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tingkat Kesulitan</label>
                  <select value={formData.difficulty} onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as 'mudah' | 'sedang' | 'sulit' })} className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500">
                    <option value="mudah">Mudah</option><option value="sedang">Sedang</option><option value="sulit">Sulit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Sumber</label>
                  <input type="text" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} placeholder="Contoh: UTBK 2024" className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                </div>
              </div>
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white mb-2">Preview Soal</h3>
                <div className="max-h-64 overflow-y-auto space-y-3 border rounded-lg p-3">
                  {parseResult.questions.map((q, idx) => (
                    <div key={idx} className={`p-3 rounded-lg ${q.correct_answer ? 'bg-green-50' : 'bg-amber-50'}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{q.number}. {q.question.substring(0, 100)}{q.question.length > 100 ? '…' : ''}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {q.options.map((opt, optIdx) => (
                              <span key={optIdx} className="text-xs bg-white dark:bg-slate-900 px-2 py-0.5 rounded">{String.fromCharCode(65 + optIdx)}. {opt.substring(0, 30)}{opt.length > 30 ? '…' : ''}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {q.correct_answer ? (
                            <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">Jawaban: {q.correct_answer.substring(0, 15)}</span>
                          ) : (
                            <select value="" onChange={(e) => updateAnswer(idx, e.target.value)} className="text-xs px-2 py-1 border rounded">
                              <option value="">Pilih Jawaban</option>
                              {q.options.map((opt, optIdx) => <option key={optIdx} value={opt}>{String.fromCharCode(65 + optIdx)}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{parseResult.questions.filter(q => q.correct_answer).length} dari {parseResult.questions.length} soal memiliki kunci jawaban</p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setStep('upload'); setParseResult(null); }}>Kembali</Button>
                <Button type="button" className="flex-1" onClick={handleImport} disabled={!formData.subject || loading || parseResult.questions.filter(q => q.correct_answer).length === 0}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengimpor…</> : <><Download className="w-4 h-4 mr-2" />Import {parseResult.questions.filter(q => q.correct_answer).length} Soal</>}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 animate-spin text-sky-500 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">Mengimpor soal ke database…</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
