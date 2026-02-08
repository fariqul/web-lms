'use client';

import React, { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { Globe, Download, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { bankQuestionAPI } from '@/services/api';

const TRIVIA_CATEGORIES = [
  { id: 9, name: 'Pengetahuan Umum', subject: 'Pengetahuan Umum' },
  { id: 17, name: 'Sains & Alam', subject: 'IPA' },
  { id: 18, name: 'Komputer', subject: 'Informatika' },
  { id: 19, name: 'Matematika', subject: 'Matematika' },
  { id: 22, name: 'Geografi', subject: 'Geografi' },
  { id: 23, name: 'Sejarah', subject: 'Sejarah' },
  { id: 24, name: 'Politik', subject: 'PKN' },
  { id: 25, name: 'Seni', subject: 'Seni Budaya' },
  { id: 27, name: 'Hewan', subject: 'Biologi' },
];

interface TriviaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

function decodeHtmlEntities(text: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}

function mapDifficulty(apiDifficulty: string): 'mudah' | 'sedang' | 'sulit' {
  switch (apiDifficulty) {
    case 'easy': return 'mudah';
    case 'medium': return 'sedang';
    case 'hard': return 'sulit';
    default: return 'sedang';
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function TriviaImportModal({ isOpen, onClose, onImportSuccess }: TriviaImportModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [importData, setImportData] = useState({
    category: 18,
    amount: 10,
    difficulty: '',
    grade_level: '10' as '10' | '11' | '12',
  });

  if (!isOpen) return null;

  const handleImport = async () => {
    setLoading(true);
    try {
      let url = `https://opentdb.com/api.php?amount=${importData.amount}&category=${importData.category}&type=multiple`;
      if (importData.difficulty) url += `&difficulty=${importData.difficulty}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.response_code !== 0) {
        const msgs: Record<number, string> = {
          1: 'Tidak cukup soal tersedia untuk kategori ini. Coba kurangi jumlah soal.',
          2: 'Parameter tidak valid.',
        };
        toast.error(msgs[data.response_code] || 'Gagal mengambil soal dari Open Trivia Database.');
        return;
      }

      const categoryInfo = TRIVIA_CATEGORIES.find(c => c.id === importData.category);

      interface TriviaQuestion {
        question: string;
        correct_answer: string;
        incorrect_answers: string[];
        difficulty: string;
        category: string;
      }

      const questionsToImport = data.results.map((item: TriviaQuestion) => {
        const allOptions = shuffleArray([
          decodeHtmlEntities(item.correct_answer),
          ...item.incorrect_answers.map(decodeHtmlEntities),
        ]);
        const correctAnswer = decodeHtmlEntities(item.correct_answer);

        return {
          question: decodeHtmlEntities(item.question),
          type: 'pilihan_ganda' as const,
          subject: categoryInfo?.subject || 'Umum',
          difficulty: mapDifficulty(item.difficulty),
          grade_level: importData.grade_level,
          options: allOptions,
          correct_answer: correctAnswer,
          explanation: `Jawaban yang benar adalah "${correctAnswer}". (Sumber: Open Trivia Database - ${item.category})`,
        };
      });

      await bankQuestionAPI.bulkCreate(questionsToImport);
      onImportSuccess();
      onClose();
      toast.success(`Berhasil mengimpor ${questionsToImport.length} soal!`);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Terjadi kesalahan saat mengimpor soal. Pastikan koneksi internet Anda stabil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
            <Globe className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Import Soal</h3>
            <p className="text-sm text-gray-500">Dari Open Trivia Database</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select
              value={importData.category}
              onChange={(e) => setImportData({ ...importData, category: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {TRIVIA_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name} ({cat.subject})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kesulitan</label>
            <select
              value={importData.difficulty}
              onChange={(e) => setImportData({ ...importData, difficulty: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Semua Tingkat</option>
              <option value="easy">Mudah (Easy)</option>
              <option value="medium">Sedang (Medium)</option>
              <option value="hard">Sulit (Hard)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Soal</label>
            <input
              type="number"
              min="1"
              max="50"
              value={importData.amount}
              onChange={(e) => setImportData({ ...importData, amount: Math.min(50, Math.max(1, parseInt(e.target.value) || 1)) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
            <p className="text-xs text-gray-500 mt-1">Maksimal 50 soal per import</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kelas</label>
            <select
              value={importData.grade_level}
              onChange={(e) => setImportData({ ...importData, grade_level: e.target.value as '10' | '11' | '12' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="10">Kelas 10</option>
              <option value="11">Kelas 11</option>
              <option value="12">Kelas 12</option>
            </select>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Catatan:</strong> Soal diambil dari Open Trivia Database (opentdb.com) dalam bahasa Inggris.
              Semua soal berbentuk pilihan ganda dengan 4 opsi jawaban.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              Batal
            </Button>
            <Button type="button" className="flex-1" onClick={handleImport} disabled={loading}>
              {loading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Mengimpor...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Import Soal</>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
