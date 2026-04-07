'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { examAPI } from '@/services/api';
import { Exam } from '@/types';
import { GraduationCap, Clock, Calendar, PlayCircle, CheckCircle, AlertCircle, Timer, Shield, Download } from 'lucide-react';
import { downloadSEBConfig } from '@/utils/seb';
import { useExamsListSocket } from '@/hooks/useSocket';

// Live countdown hook
function useCountdown(targetDate: string) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const diff = new Date(targetDate).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      const diff = new Date(targetDate).getTime() - Date.now();
      const seconds = Math.max(0, Math.floor(diff / 1000));
      setTimeLeft(seconds);
      if (seconds <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [targetDate, timeLeft > 0]);

  const days = Math.floor(timeLeft / 86400);
  const hours = Math.floor((timeLeft % 86400) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  return { days, hours, minutes, seconds, totalSeconds: timeLeft, isExpired: timeLeft <= 0 };
}

function CountdownDisplay({ startTime }: { startTime: string }) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(startTime);

  if (isExpired) return null;

  return (
    <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/50 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Timer className="w-4 h-4 text-sky-500" />
        <span className="text-xs font-medium text-sky-700 dark:text-sky-400">Dimulai dalam</span>
      </div>
      <div className="flex gap-2 justify-center">
        {days > 0 && (
          <div className="bg-blue-800 text-white rounded-lg px-2 py-1 text-center min-w-[44px]">
            <div className="text-lg font-bold leading-tight">{days}</div>
            <div className="text-[10px] opacity-80">hari</div>
          </div>
        )}
        <div className="bg-blue-800 text-white rounded-lg px-2 py-1 text-center min-w-[44px]">
          <div className="text-lg font-bold leading-tight">{String(hours).padStart(2, '0')}</div>
          <div className="text-[10px] opacity-80">jam</div>
        </div>
        <div className="bg-blue-800 text-white rounded-lg px-2 py-1 text-center min-w-[44px]">
          <div className="text-lg font-bold leading-tight">{String(minutes).padStart(2, '0')}</div>
          <div className="text-[10px] opacity-80">menit</div>
        </div>
        <div className="bg-blue-800 text-white rounded-lg px-2 py-1 text-center min-w-[44px]">
          <div className="text-lg font-bold leading-tight">{String(seconds).padStart(2, '0')}</div>
          <div className="text-[10px] opacity-80">detik</div>
        </div>
      </div>
    </div>
  );
}

export default function UjianSiswaPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);

  const getCompletionInfo = (exam: Exam) => {
    const reason = exam.my_result?.completion_reason;

    if (reason === 'violation') {
      return {
        title: 'Terkumpul karena pelanggaran',
        subtitle: 'Ujian dihentikan otomatis karena batas pelanggaran tercapai',
        containerClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50',
        titleClass: 'text-red-700 dark:text-red-400',
        subtitleClass: 'text-red-600/80 dark:text-red-400/80',
        iconClass: 'text-red-600 dark:text-red-400',
      };
    }

    if (reason === 'time_up') {
      return {
        title: 'Terkumpul karena ujian telah selesai/waktu habis',
        subtitle: 'Jawaban dikumpulkan otomatis oleh sistem',
        containerClass: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50',
        titleClass: 'text-amber-700 dark:text-amber-400',
        subtitleClass: 'text-amber-700/80 dark:text-amber-400/80',
        iconClass: 'text-amber-600 dark:text-amber-400',
      };
    }

    return {
      title: 'Telah selesai dikerjakan',
      subtitle: 'Ujian telah berhasil diselesaikan',
      containerClass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50',
      titleClass: 'text-green-700 dark:text-green-400',
      subtitleClass: 'text-green-600/70 dark:text-green-400/70',
      iconClass: 'text-green-600 dark:text-green-400',
    };
  };

  // Real-time updates via WebSocket
  const examIds = useMemo(() => exams.map(e => e.id), [exams]);
  const listSocket = useExamsListSocket(examIds);

  useEffect(() => {
    if (!listSocket.isConnected || examIds.length === 0) return;

    const handleUpdated = (data: unknown) => {
      const d = data as { exam_id: number; title?: string; status?: string; duration?: number; start_time?: string; end_time?: string };
      setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, title: d.title ?? e.title, duration: d.duration ?? e.duration, start_time: d.start_time ?? e.start_time, end_time: d.end_time ?? e.end_time, status: (d.status as Exam['status']) ?? e.status } : e));
    };
    const handleDeleted = (data: unknown) => {
      const d = data as { exam_id: number };
      setExams(prev => prev.filter(e => e.id !== d.exam_id));
    };
    const handleEnded = (data: unknown) => {
      const d = data as { exam_id?: number };
      if (d.exam_id) setExams(prev => prev.map(e => e.id === d.exam_id ? { ...e, status: 'completed' } : e));
    };

    const cleanups = [
      listSocket.onAnyExamUpdated(handleUpdated),
      listSocket.onAnyExamDeleted(handleDeleted),
      listSocket.onAnyExamEnded(handleEnded),
    ];
    return () => { cleanups.forEach(c => c && c()); };
  }, [listSocket, examIds]);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const response = await examAPI.getAll();
      setExams(response.data.data.data || response.data.data);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  };

  const getExamStatus = (exam: Exam) => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);
    const resultStatus = exam.my_result?.status;

    if (resultStatus === 'completed' || resultStatus === 'graded' || resultStatus === 'submitted') {
      return { label: 'Selesai', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: CheckCircle };
    }
    if (now < startTime) {
      return { label: 'Belum Mulai', color: 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300', icon: Clock };
    }
    if (now > endTime) {
      return { label: 'Berakhir', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', icon: AlertCircle };
    }
    if (resultStatus === 'in_progress') {
      return { label: 'Sedang Dikerjakan', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400', icon: PlayCircle };
    }
    return { label: 'Tersedia', color: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400', icon: PlayCircle };
  };

  const canStartExam = (exam: Exam) => {
    const now = new Date();
    const startTime = new Date(exam.start_time);
    const endTime = new Date(exam.end_time);
    const resultStatus = exam.my_result?.status;
    
    // Block if already completed/graded/submitted
    if (resultStatus === 'completed' || resultStatus === 'graded' || resultStatus === 'submitted') {
      return false;
    }
    
    return now >= startTime && now <= endTime;
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-800 via-blue-700 to-cyan-600 dark:from-blue-900 dark:via-blue-800 dark:to-cyan-700 p-5 sm:p-6 shadow-lg shadow-blue-900/20">
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-white/10 rounded-full blur-sm" />
          <div className="absolute -bottom-8 -left-8 w-36 h-36 bg-white/[0.07] rounded-full blur-sm" />
          <div className="relative">
            <h1 className="text-2xl font-bold text-white">Ujian Saya</h1>
            <p className="text-blue-100/80">Daftar ujian yang tersedia untuk Anda</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
          </div>
        ) : exams.length === 0 ? (
          <Card className="p-12 text-center">
            <GraduationCap className="w-16 h-16 text-slate-400 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Belum Ada Ujian</h3>
            <p className="text-slate-600 dark:text-slate-400">Saat ini belum ada ujian yang tersedia untuk Anda</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {exams.map((exam) => {
              const status = getExamStatus(exam);
              const StatusIcon = status.icon;
              const completionInfo = getCompletionInfo(exam);
              
              return (
                <Card key={exam.id} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-sky-50 dark:bg-sky-900/20 rounded-lg flex items-center justify-center">
                      <GraduationCap className="w-6 h-6 text-sky-500" />
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>

                  <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{exam.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{exam.subject}</p>

                  <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDateTime(exam.start_time)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{exam.duration || exam.duration_minutes} menit</span>
                    </div>
                    {exam.seb_required && (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                          <Shield className="w-4 h-4" />
                          <span className="font-medium">Wajib SEB</span>
                        </div>
                        <button
                          onClick={() => downloadSEBConfig(exam.title, exam.id, {
                            sebRequired: true,
                            sebAllowQuit: exam.seb_allow_quit ?? false,
                            sebQuitPassword: exam.seb_quit_password || '',
                            sebBlockScreenCapture: exam.seb_block_screen_capture ?? true,
                            sebAllowVirtualMachine: exam.seb_allow_virtual_machine ?? false,
                            sebShowTaskbar: exam.seb_show_taskbar ?? true,
                          })}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md transition-colors"
                          title="Download file konfigurasi SEB"
                        >
                          <Download className="w-3 h-3" />
                          Download SEB
                        </button>
                      </div>
                    )}
                  </div>

                  {['completed', 'graded', 'submitted'].includes(exam.my_result?.status || '') ? (
                    <div className={`border rounded-lg p-3 flex items-center gap-3 ${completionInfo.containerClass}`}>
                      <CheckCircle className={`w-5 h-5 flex-shrink-0 ${completionInfo.iconClass}`} />
                      <div>
                        <p className={`text-sm font-medium ${completionInfo.titleClass}`}>{completionInfo.title}</p>
                        <p className={`text-xs ${completionInfo.subtitleClass}`}>{completionInfo.subtitle}</p>
                      </div>
                    </div>
                  ) : canStartExam(exam) ? (
                    <Button
                      className="w-full"
                      onClick={() => router.push(`/ujian/${exam.id}`)}
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {exam.my_result?.status === 'in_progress' ? 'Lanjutkan Ujian' : 'Mulai Ujian'}
                    </Button>
                  ) : new Date() < new Date(exam.start_time) ? (
                    <>
                      <CountdownDisplay startTime={exam.start_time} />
                      <Button className="w-full" variant="outline" disabled>
                        Belum Dimulai
                      </Button>
                    </>
                  ) : (
                    <Button className="w-full" variant="outline" disabled>
                      Waktu Habis
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
