'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { 
  BookOpen, 
  Calculator, 
  Microscope, 
  FlaskConical, 
  Atom,
  Landmark,
  Users,
  Coins,
  Globe2,
  ScrollText,
  Languages,
  GraduationCap,
  Clock,
  Target,
  ChevronRight,
  Play,
  BookMarked,
  Loader2
} from 'lucide-react';
import { bankQuestionAPI } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { SUBJECT_LIST } from '@/constants/subjects';
import type { LucideIcon } from 'lucide-react';

// Icon & color mapping per subject
const SUBJECT_META: Record<string, { icon: LucideIcon; color: string; iconColor: string }> = {
  'Bahasa Indonesia': { icon: BookOpen, color: 'bg-red-100', iconColor: 'text-red-500' },
  'Bahasa Inggris': { icon: Languages, color: 'bg-purple-100', iconColor: 'text-purple-500' },
  'Matematika': { icon: Calculator, color: 'bg-sky-50', iconColor: 'text-sky-500' },
  'Fisika': { icon: Atom, color: 'bg-pink-100', iconColor: 'text-pink-500' },
  'Kimia': { icon: FlaskConical, color: 'bg-orange-100', iconColor: 'text-orange-500' },
  'Biologi': { icon: Microscope, color: 'bg-green-100', iconColor: 'text-green-500' },
  'Sejarah': { icon: Landmark, color: 'bg-amber-100', iconColor: 'text-orange-500' },
  'Sosiologi': { icon: Users, color: 'bg-yellow-100', iconColor: 'text-yellow-600' },
  'Ekonomi': { icon: Coins, color: 'bg-emerald-100', iconColor: 'text-emerald-500' },
  'Geografi': { icon: Globe2, color: 'bg-cyan-100', iconColor: 'text-cyan-500' },
  'PKN': { icon: ScrollText, color: 'bg-indigo-100', iconColor: 'text-indigo-500' },
  'Informatika': { icon: GraduationCap, color: 'bg-slate-100', iconColor: 'text-slate-600 dark:text-slate-400' },
  'Seni Budaya': { icon: BookMarked, color: 'bg-rose-100', iconColor: 'text-rose-500' },
  'Pendidikan Agama': { icon: BookOpen, color: 'bg-violet-100', iconColor: 'text-violet-500' },
  'PJOK': { icon: Target, color: 'bg-lime-100', iconColor: 'text-lime-600' },
  'IPA': { icon: Microscope, color: 'bg-sky-100', iconColor: 'text-sky-500' },
  'Pengetahuan Umum': { icon: BookOpen, color: 'bg-slate-100', iconColor: 'text-slate-600 dark:text-slate-400' },
};

const SUBJECTS = SUBJECT_LIST.map(name => ({
  id: name,
  name,
  icon: SUBJECT_META[name]?.icon || BookOpen,
  color: SUBJECT_META[name]?.color || 'bg-slate-100',
  iconColor: SUBJECT_META[name]?.iconColor || 'text-slate-600 dark:text-slate-400',
}));

const GRADES = [
  { value: '10', label: 'Kelas 10' },
  { value: '11', label: 'Kelas 11' },
  { value: '12', label: 'Kelas 12' },
];

interface SubjectWithCount {
  subject: string;
  total_questions: number;
}

export default function SiswaBankSoalPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedGrade, setSelectedGrade] = useState('10');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [showModeSelection, setShowModeSelection] = useState(false);
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});
  const [practiceStats, setPracticeStats] = useState({ total_practices: 0, total_time_spent: 0, average_score: 0 });

  useEffect(() => {
    fetchSubjectStats();
    fetchPracticeStats();
  }, [selectedGrade]);

  const fetchSubjectStats = async () => {
    try {
      setLoading(true);
      const response = await bankQuestionAPI.getSubjects(selectedGrade);
      const data: SubjectWithCount[] = response.data?.data || [];
      
      const counts: Record<string, number> = {};
      data.forEach(item => {
        counts[item.subject] = item.total_questions;
      });
      setSubjectCounts(counts);
    } catch (error) {
      console.error('Failed to fetch subject stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPracticeStats = async () => {
    try {
      const response = await bankQuestionAPI.getPracticeStats();
      const data = response.data?.data;
      if (data) {
        setPracticeStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch practice stats:', error);
    }
  };

  const formatStudyTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} detik`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} menit`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} jam`;
    return `${hours} jam ${remainingMinutes} menit`;
  };

  const handleSubjectClick = (subjectId: string) => {
    const count = subjectCounts[subjectId] || 0;
    if (count === 0) {
      toast.warning('Belum ada soal untuk mata pelajaran ini.');
      return;
    }
    setSelectedSubject(subjectId);
    setShowModeSelection(true);
  };

  const handleModeSelect = (mode: 'tryout' | 'belajar') => {
    if (selectedSubject) {
      router.push(`/dashboard/siswa/bank-soal/${encodeURIComponent(selectedSubject)}?mode=${mode}&grade=${selectedGrade}`);
    }
  };

  const selectedSubjectData = SUBJECTS.find(s => s.id === selectedSubject);

  // Filter subjects that have questions or show all with count
  const availableSubjects = SUBJECTS;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Pelajaran Banksoal</h1>
            <p className="text-slate-600 dark:text-slate-400">Pilih mata pelajaran untuk berlatih</p>
          </div>
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
          >
            {GRADES.map(grade => (
              <option key={grade.value} value={grade.value}>{grade.label}</option>
            ))}
          </select>
        </div>

        {/* Subject Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableSubjects.map((subject) => {
            const IconComponent = subject.icon;
            const questionCount = subjectCounts[subject.id] || 0;
            
            return (
              <Card
                key={subject.id}
                className={`p-4 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition duration-200 border-2 border-transparent hover:border-sky-200 ${questionCount === 0 ? 'opacity-60' : ''}`}
                onClick={() => handleSubjectClick(subject.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl ${subject.color} flex items-center justify-center flex-shrink-0`}>
                    <IconComponent className={`w-7 h-7 ${subject.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{subject.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {questionCount > 0 ? `${questionCount} soal tersedia` : 'Belum ada soal'}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Info if no questions at all */}
        {Object.values(subjectCounts).every(c => c === 0) && (
          <Card className="p-8 text-center">
            <BookOpen className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Belum ada soal untuk kelas {selectedGrade}.</p>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">Silakan hubungi guru untuk menambahkan soal.</p>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <Card className="p-4 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <p className="text-teal-100 text-sm">Total Latihan</p>
                <p className="text-2xl font-bold">{practiceStats.total_practices}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-teal-100 text-sm">Waktu Belajar</p>
                <p className="text-2xl font-bold">{formatStudyTime(practiceStats.total_time_spent)}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-purple-100 text-sm">Rata-rata Nilai</p>
                <p className="text-2xl font-bold">{practiceStats.average_score}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Mode Selection Modal */}
        {showModeSelection && selectedSubjectData && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md p-6 animate-in fade-in zoom-in duration-200">
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-2xl ${selectedSubjectData.color} flex items-center justify-center mx-auto mb-4`}>
                  <selectedSubjectData.icon className={`w-8 h-8 ${selectedSubjectData.iconColor}`} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{selectedSubjectData.name}</h3>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Pilih mode latihan</p>
              </div>

              <div className="space-y-3">
                {/* Tryout Mode */}
                <button
                  onClick={() => handleModeSelect('tryout')}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-orange-400 hover:bg-orange-50 transition-colors group text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                      <Clock className="w-6 h-6 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 dark:text-white">Mode Tryout</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Simulasi ujian dengan waktu terbatas</p>
                    </div>
                    <Play className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-orange-500" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">Timer</span>
                    <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">Skor Akhir</span>
                    <span className="px-2 py-1 bg-orange-100 text-orange-600 text-xs rounded-full">Ranking</span>
                  </div>
                </button>

                {/* Belajar Mode */}
                <button
                  onClick={() => handleModeSelect('belajar')}
                  className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-sky-50 transition-colors group text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center group-hover:bg-teal-200 transition-colors">
                      <BookMarked className="w-6 h-6 text-sky-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 dark:text-white">Mode Belajar</h4>
                      <p className="text-sm text-slate-600 dark:text-slate-400">Belajar santai dengan pembahasan</p>
                    </div>
                    <Play className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-sky-500" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <span className="px-2 py-1 bg-sky-100 text-sky-500 text-xs rounded-full">Tanpa Timer</span>
                    <span className="px-2 py-1 bg-sky-100 text-sky-500 text-xs rounded-full">Pembahasan</span>
                    <span className="px-2 py-1 bg-sky-100 text-sky-500 text-xs rounded-full">Bookmark</span>
                  </div>
                </button>
              </div>

              <Button 
                variant="outline" 
                className="w-full mt-4"
                onClick={() => setShowModeSelection(false)}
              >
                Batal
              </Button>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
