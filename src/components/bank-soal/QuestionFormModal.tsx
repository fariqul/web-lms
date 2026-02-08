'use client';

import React from 'react';
import { Card, Button } from '@/components/ui';
import { X, Loader2 } from 'lucide-react';

const SUBJECTS = [
  'Bahasa Indonesia', 'Matematika', 'Biologi', 'Kimia', 'Fisika',
  'Sejarah', 'Sosiologi', 'Ekonomi', 'Geografi', 'PKN',
  'Bahasa Inggris', 'Informatika', 'Seni Budaya', 'Pengetahuan Umum', 'IPA',
];

export interface QuestionFormData {
  question: string;
  type: 'pilihan_ganda' | 'essay';
  subject: string;
  class_id: string;
  grade_level: '10' | '11' | '12';
  difficulty: 'mudah' | 'sedang' | 'sulit';
  options: string[];
  correct_answer: string;
  explanation: string;
}

interface QuestionFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  formData: QuestionFormData;
  saving: boolean;
  classes: { value: string; label: string }[];
  onFormChange: (data: QuestionFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export function QuestionFormModal({
  isOpen,
  isEditing,
  formData,
  saving,
  classes,
  onFormChange,
  onSubmit,
  onClose,
}: QuestionFormModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">
            {isEditing ? 'Edit Soal' : 'Tambah Soal Baru'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pertanyaan</label>
            <textarea
              value={formData.question}
              onChange={(e) => onFormChange({ ...formData, question: e.target.value })}
              placeholder="Tuliskan pertanyaan..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Soal</label>
              <select
                value={formData.type}
                onChange={(e) => onFormChange({ ...formData, type: e.target.value as 'pilihan_ganda' | 'essay' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="pilihan_ganda">Pilihan Ganda</option>
                <option value="essay">Essay</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kesulitan</label>
              <select
                value={formData.difficulty}
                onChange={(e) => onFormChange({ ...formData, difficulty: e.target.value as 'mudah' | 'sedang' | 'sulit' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="mudah">Mudah</option>
                <option value="sedang">Sedang</option>
                <option value="sulit">Sulit</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mata Pelajaran</label>
              <select
                value={formData.subject}
                onChange={(e) => onFormChange({ ...formData, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              >
                <option value="">Pilih Mata Pelajaran</option>
                {SUBJECTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tingkat Kelas</label>
              <select
                value={formData.grade_level}
                onChange={(e) => onFormChange({ ...formData, grade_level: e.target.value as '10' | '11' | '12' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                required
              >
                <option value="10">Kelas 10</option>
                <option value="11">Kelas 11</option>
                <option value="12">Kelas 12</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kelas Spesifik (Opsional)</label>
            <select
              value={formData.class_id}
              onChange={(e) => onFormChange({ ...formData, class_id: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Semua Kelas</option>
              {classes.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {formData.type === 'pilihan_ganda' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pilihan Jawaban</label>
                <div className="space-y-2">
                  {formData.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOptions = [...formData.options];
                          newOptions[i] = e.target.value;
                          onFormChange({ ...formData, options: newOptions });
                        }}
                        placeholder={`Pilihan ${String.fromCharCode(65 + i)}`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jawaban Benar</label>
                <select
                  value={formData.correct_answer}
                  onChange={(e) => onFormChange({ ...formData, correct_answer: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  required
                >
                  <option value="">Pilih jawaban benar</option>
                  {formData.options.map((opt, i) => opt && (
                    <option key={i} value={opt}>
                      {String.fromCharCode(65 + i)}. {opt}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {formData.type === 'essay' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kunci Jawaban (opsional)</label>
              <textarea
                value={formData.correct_answer}
                onChange={(e) => onFormChange({ ...formData, correct_answer: e.target.value })}
                placeholder="Tuliskan kunci jawaban atau pedoman penilaian..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pembahasan (Opsional)</label>
            <textarea
              value={formData.explanation}
              onChange={(e) => onFormChange({ ...formData, explanation: e.target.value })}
              placeholder="Tuliskan pembahasan untuk soal ini..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                isEditing ? 'Simpan Perubahan' : 'Simpan Soal'
              )}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
