'use client';

import React, { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { X, Loader2, CheckCircle, Download, AlertCircle, Eye } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { urlImportAPI } from '@/services/api';
import { SUBJECT_LIST } from '@/constants/subjects';

interface UrlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

interface PreviewResult {
  topic: string;
  url: string;
  total_questions: number;
  questions: Array<{
    number: number;
    question: string;
    options: Record<string, string>;
    answer: string | null;
    explanation: string | null;
  }>;
}

export function UrlImportModal({ isOpen, onClose, onImportSuccess }: UrlImportModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'input' | 'preview' | 'importing'>('input');
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<number[]>([]);
  const [formData, setFormData] = useState({
    url: '',
    subject: '',
    grade_level: '10' as '10' | '11' | '12',
    difficulty: 'sedang' as 'mudah' | 'sedang' | 'sulit',
  });

  if (!isOpen) return null;

  const reset = () => {
    setFormData({ url: '', subject: '', grade_level: '10', difficulty: 'sedang' });
    setPreviewResult(null);
    setStep('input');
    setSelectedQuestions([]);
  };

  const handleClose = () => { onClose(); reset(); };

  const handlePreview = async () => {
    if (!formData.url) { toast.warning('Masukkan URL terlebih dahulu'); return; }
    try {
      const parsedUrl = new URL(formData.url);
      if (!parsedUrl.hostname.includes('utbk.or.id')) { toast.warning('Hanya URL dari utbk.or.id yang diizinkan'); return; }
    } catch { toast.warning('URL tidak valid'); return; }

    setLoading(true);
    try {
      const response = await urlImportAPI.preview(formData.url);
      if (response.data?.success && response.data?.data) {
        setPreviewResult(response.data.data);
        setStep('preview');
        setSelectedQuestions(response.data.data.questions.map((q: { number: number }) => q.number));
      } else {
        toast.error(response.data?.message || 'Gagal memproses URL');
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(axiosError?.response?.data?.message || axiosError?.message || 'Terjadi kesalahan saat memproses URL');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!previewResult || selectedQuestions.length === 0) { toast.warning('Pilih minimal satu soal untuk diimpor'); return; }
    if (!formData.subject) { toast.warning('Pilih mata pelajaran terlebih dahulu'); return; }

    setStep('importing');
    setLoading(true);
    try {
      const response = await urlImportAPI.import({
        url: formData.url, subject: formData.subject,
        difficulty: formData.difficulty, grade_level: formData.grade_level,
        selected_questions: selectedQuestions,
      });
      if (response.data?.success) {
        onImportSuccess();
        handleClose();
        toast.success(`Berhasil mengimpor ${response.data.data.imported} soal dari "${response.data.data.topic}"!`);
      } else {
        toast.error(response.data?.message || 'Gagal mengimpor soal');
      }
    } catch {
      toast.error('Terjadi kesalahan saat mengimpor soal');
    } finally {
      setLoading(false);
    }
  };

  const toggleQuestion = (n: number) => setSelectedQuestions(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  const toggleAll = () => {
    if (previewResult) {
      setSelectedQuestions(selectedQuestions.length === previewResult.questions.length ? [] : previewResult.questions.map(q => q.number));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Import dari URL</h2>
              <p className="text-sm text-slate-500">Import soal dari utbk.or.id</p>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
          </div>

          {/* Step 1: Input URL */}
          {step === 'input' && (
            <div className="space-y-4">
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-teal-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-teal-700">
                    <p className="font-medium">Cara Penggunaan:</p>
                    <ol className="list-decimal ml-4 mt-1 space-y-1">
                      <li>Buka <a href="https://utbk.or.id" target="_blank" rel="noopener noreferrer" className="underline">utbk.or.id</a></li>
                      <li>Pilih artikel soal yang ingin diimport</li>
                      <li>Copy URL dari browser dan paste di bawah ini</li>
                    </ol>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">URL Artikel Soal</label>
                <input type="url" value={formData.url} onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))} placeholder="https://utbk.or.id/soal-…" className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>Batal</Button>
                <Button type="button" className="flex-1" onClick={handlePreview} disabled={!formData.url || loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Memproses…</> : <><Eye className="w-4 h-4 mr-2" />Preview Soal</>}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && previewResult && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-green-700">Ditemukan {previewResult.total_questions} soal dari &quot;{previewResult.topic}&quot;</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Mata Pelajaran <span className="text-red-500">*</span></label>
                  <select value={formData.subject} onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))} className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" required>
                    <option value="">Pilih Mata Pelajaran</option>
                    {SUBJECT_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Tingkat Kesulitan</label>
                  <select value={formData.difficulty} onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value as 'mudah' | 'sedang' | 'sulit' }))} className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
                    <option value="mudah">Mudah</option><option value="sedang">Sedang</option><option value="sulit">Sulit</option>
                  </select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">Pilih Soal untuk Diimport</label>
                  <button type="button" onClick={toggleAll} className="text-sm text-teal-600 hover:text-teal-700">
                    {selectedQuestions.length === previewResult.questions.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                </div>
                <div className="border rounded-lg max-h-64 overflow-y-auto divide-y">
                  {previewResult.questions.map((q) => (
                    <div key={q.number} className={`p-3 cursor-pointer hover:bg-slate-50 ${selectedQuestions.includes(q.number) ? 'bg-teal-50' : ''}`} onClick={() => toggleQuestion(q.number)}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" checked={selectedQuestions.includes(q.number)} onChange={() => toggleQuestion(q.number)} className="mt-1 w-4 h-4 text-teal-600 rounded focus:ring-teal-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 line-clamp-2"><span className="font-medium">#{q.number}.</span> {q.question}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(q.options).map(([key, value]) => (
                              <span key={key} className={`text-xs px-2 py-0.5 rounded ${q.answer === key ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                                {key}. {String(value).substring(0, 25)}{String(value).length > 25 ? '…' : ''}
                              </span>
                            ))}
                          </div>
                          {q.answer && <p className="text-xs text-green-600 mt-1">✓ Jawaban: {q.answer}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {selectedQuestions.length} dari {previewResult.questions.length} soal dipilih
                  {' • '}
                  {previewResult.questions.filter(q => q.answer).length} soal memiliki kunci jawaban
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setStep('input'); setPreviewResult(null); }}>Kembali</Button>
                <Button type="button" className="flex-1" onClick={handleImport} disabled={!formData.subject || selectedQuestions.length === 0 || loading}>
                  {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengimpor…</> : <><Download className="w-4 h-4 mr-2" />Import {selectedQuestions.length} Soal</>}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
              <p className="text-slate-600">Mengimpor soal ke database…</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
