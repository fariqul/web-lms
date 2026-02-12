'use client';

import React from 'react';
import { Card } from '@/components/ui';
import { Copy, Edit, Trash2 } from 'lucide-react';

interface Question {
  id: number;
  question: string;
  type: 'pilihan_ganda' | 'essay';
  subject: string;
  class_name?: string;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  options?: string[];
  correct_answer?: string;
}

interface QuestionCardProps {
  question: Question;
  index: number;
  onEdit: (question: Question) => void;
  onDelete: (id: number) => void;
  onDuplicate: (question: Question) => void;
}

const difficultyStyles: Record<string, { color: string; label: string }> = {
  mudah: { color: 'bg-green-100 text-green-700', label: 'Mudah' },
  sedang: { color: 'bg-yellow-100 text-yellow-700', label: 'Sedang' },
  sulit: { color: 'bg-red-100 text-red-700', label: 'Sulit' },
};

export function QuestionCard({ question, index, onEdit, onDelete, onDuplicate }: QuestionCardProps) {
  const diff = difficultyStyles[question.difficulty] || { color: 'bg-slate-100 text-slate-700', label: question.difficulty };

  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 font-semibold text-slate-600">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-slate-900 font-medium">{question.question}</p>
              {question.type === 'pilihan_ganda' && question.options && (
                <div className="mt-2 space-y-1">
                  {question.options.map((opt, i) => (
                    <p key={i} className={`text-sm ${opt === question.correct_answer ? 'text-green-600 font-medium' : 'text-slate-500'}`}>
                      {String.fromCharCode(65 + i)}. {opt} {opt === question.correct_answer && '✓'}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-2 py-1 bg-sky-100 text-sky-700 text-xs rounded-full">
                  {question.subject}
                </span>
                {question.class_name && (
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                    {question.class_name}
                  </span>
                )}
                <span className={`px-2 py-1 text-xs rounded-full ${diff.color}`}>
                  {diff.label}
                </span>
                <span className="px-2 py-1 bg-sky-50 text-sky-500 text-xs rounded-full">
                  {question.type === 'pilihan_ganda' ? 'Pilihan Ganda' : 'Essay'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onDuplicate(question)}
                className="p-2 text-slate-500 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                title="Duplikat"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => onEdit(question)}
                className="p-2 text-slate-500 hover:text-sky-500 hover:bg-sky-50 rounded-lg"
                title="Edit"
              >
                <Edit className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(question.id)}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                title="Hapus"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
