'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useExamMode } from '@/hooks/useExamMode';
import { useProctoring, ProctoringDetection } from '@/hooks/useProctoring';
import { Button, Card, ConfirmDialog } from '@/components/ui';
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Camera,
  CameraOff,
  Video,
  VideoOff,
  Maximize,
  Flag,
  Loader2,
  ArrowLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Download,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { isSEBBrowser, downloadSEBConfig } from '@/utils/seb';
import { useExamSocket } from '@/hooks/useSocket';

interface QuestionOption {
  text: string;
  image?: string | null;
}

interface Question {
  id: number;
  number: number;
  type: 'multiple_choice' | 'essay';
  text: string;
  passage?: string | null;
  options?: QuestionOption[];
  image?: string | null;
}

interface ExamData {
  id: number;
  title: string;
  subject: string;
  duration: number;
  totalQuestions: number;
  questions: Question[];
  sebRequired: boolean;
  sebAllowQuit: boolean;
  sebQuitPassword: string;
  sebBlockScreenCapture: boolean;
  sebAllowVirtualMachine: boolean;
  sebShowTaskbar: boolean;
}

export default function ExamTakingPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const examId = Number(params.id) || 1;
  
  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [examNotFound, setExamNotFound] = useState(false);
  const [startingExam, setStartingExam] = useState(false);
  const autoSubmittedRef = React.useRef(false);
  const [usingSEB, setUsingSEB] = useState(false);
  const resumeAttemptedRef = React.useRef(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [showCameraBanner, setShowCameraBanner] = useState(false);
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false);
  const [cameraPreviewTested, setCameraPreviewTested] = useState(false);
  const [cameraPreviewError, setCameraPreviewError] = useState<string | null>(null);
  const previewVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = React.useRef<MediaStream | null>(null);

  // Clear exam session flags (call before navigating away after submit)
  const clearExamSession = () => {
    sessionStorage.removeItem(`exam_active_${examId}`);
    sessionStorage.removeItem(`exam_question_${examId}`);
  };

  // Force submit handler
  const handleForceSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/exams/${examId}/finish`, {
        answers,
        time_spent: (exam?.duration || 90) * 60 - timeRemaining,
      });
      clearExamSession();
      router.push('/ujian-siswa?reason=force_submit');
    } catch (error) {
      console.error('Failed to submit exam:', error);
      clearExamSession();
      router.push('/ujian-siswa');
    }
  };

  const {
    isFullscreen,
    isCameraActive,
    isMobile,
    violationCount,
    maxViolations,
    consecutiveSnapshotFails,
    enterFullscreen,
    startCamera,
    stopCamera,
    restartCamera,
    activateMonitoring,
    captureSnapshot,
    videoRef,
  } = useExamMode({
    examId,
    onViolation: () => {},
    onForceSubmit: handleForceSubmit,
  });
  const [snapshotStatus, setSnapshotStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle');
  const [lastSnapshotTime, setLastSnapshotTime] = useState<Date | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotSuccessCount, setSnapshotSuccessCount] = useState(0);
  const [snapshotFailCount, setSnapshotFailCount] = useState(0);
  const [proctoringWarning, setProctoringWarning] = useState<string | null>(null);

  // AI Proctoring — face detection, head pose, eye gaze, identity verification
  const proctoring = useProctoring({
    examId,
    videoRef,
    enabled: isStarted && isCameraActive,
    detectionInterval: 2000,
    onDetection: (detection: ProctoringDetection) => {
      // Show brief warning overlay for critical detections
      if (detection.type === 'no_face' || detection.type === 'multi_face' || detection.type === 'identity_mismatch') {
        setProctoringWarning(detection.description);
        setTimeout(() => setProctoringWarning(null), 3000);
      }
    },
  });

  // Capture reference face shortly after camera starts
  const referenceCapturedRef = React.useRef(false);
  useEffect(() => {
    if (isStarted && isCameraActive && proctoring.isModelLoaded && !referenceCapturedRef.current) {
      const timer = setTimeout(async () => {
        const success = await proctoring.captureReference();
        if (success) {
          referenceCapturedRef.current = true;
          console.log('[Proctoring] Reference face captured');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isStarted, isCameraActive, proctoring.isModelLoaded]);

  // Socket: listen for admin ending the exam
  const examSocket = useExamSocket(examId);
  
  useEffect(() => {
    if (!isStarted) return;
    
    const handleExamEnded = () => {
      // Admin ended the exam — auto-cleanup and redirect
      setSubmitting(true);
      stopCamera();
      clearExamSession();
      toast.warning('Ujian telah diselesaikan oleh admin. Jawaban Anda telah dikumpulkan otomatis.');
      setTimeout(() => {
        router.push('/ujian-siswa?reason=admin_ended');
      }, 1500);
    };

    examSocket.onExamEnded(handleExamEnded);
    return () => {
      examSocket.off(`exam.${examId}.ended`);
    };
  }, [isStarted, examId, examSocket, stopCamera, router, toast]);

  useEffect(() => {
    fetchExam();
  }, [examId]);

  // Check SEB browser on mount
  useEffect(() => {
    setUsingSEB(isSEBBrowser());
  }, []);

  // Auto-resume exam after page refresh (SEB or browser refresh)
  useEffect(() => {
    if (!exam || resumeAttemptedRef.current || isStarted) return;
    const sessionKey = `exam_active_${examId}`;
    const wasActive = sessionStorage.getItem(sessionKey);
    if (wasActive === 'true') {
      resumeAttemptedRef.current = true;
      // Exam was in progress — auto-resume by calling start again
      (async () => {
        setStartingExam(true);
        try {
          const response = await api.post(`/exams/${examId}/start`);
          const startData = response.data?.data;
          if (startData?.questions && startData.questions.length > 0) {
            const mappedQuestions = startData.questions.map((q: { id: number; order?: number; question_type?: string; type?: string; question_text: string; passage?: string; options?: (string | { text: string; image?: string | null })[]; image?: string }, idx: number) => ({
              id: q.id,
              number: q.order || idx + 1,
              type: (q.question_type || q.type) === 'multiple_choice' ? 'multiple_choice' : 'essay',
              text: q.question_text,
              passage: q.passage || null,
              options: (q.options || []).map((opt: string | { text: string; image?: string | null }) =>
                typeof opt === 'string' ? { text: opt, image: null } : { text: opt.text || '', image: opt.image || null }
              ),
              image: q.image || null,
            }));
            setQuestions(mappedQuestions);
            if (startData.existing_answers) {
              const restored: Record<number, string> = {};
              Object.entries(startData.existing_answers).forEach(([qId, ans]) => {
                const answer = ans as { answer?: string };
                if (answer?.answer) {
                  restored[Number(qId)] = answer.answer;
                }
              });
              setAnswers(restored);
            }
            if (startData.remaining_time !== undefined) {
              const remaining = Math.max(1, Math.floor(startData.remaining_time));
              setTimeRemaining(remaining);
            }
            // Restore current question from sessionStorage
            const savedQ = sessionStorage.getItem(`exam_question_${examId}`);
            if (savedQ) setCurrentQuestion(Number(savedQ) || 0);
            await enterFullscreen();
            setIsStarted(true);
            toast.info('Ujian dilanjutkan setelah refresh.');
          }
        } catch {
          // If start fails, the session was already finished or expired — clear flag
          sessionStorage.removeItem(sessionKey);
        } finally {
          setStartingExam(false);
        }
      })();
    }
  }, [exam]);

  // Persist exam-active flag and current question to sessionStorage
  useEffect(() => {
    if (isStarted) {
      sessionStorage.setItem(`exam_active_${examId}`, 'true');
    }
  }, [isStarted, examId]);

  useEffect(() => {
    if (isStarted) {
      sessionStorage.setItem(`exam_question_${examId}`, String(currentQuestion));
    }
  }, [currentQuestion, isStarted, examId]);

  // Prevent back navigation during exam (SEB + regular browser)
  useEffect(() => {
    if (!isStarted) return;

    // Push a dummy state so back button hits our handler instead of leaving
    window.history.pushState({ examLock: true }, '');

    const handlePopState = () => {
      // Re-push state to prevent actually navigating back
      window.history.pushState({ examLock: true }, '');
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers show a generic message; setting returnValue is required
      e.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isStarted]);

  // Auto-start camera after exam starts and video element is rendered
  useEffect(() => {
    if (isStarted && !isCameraActive) {
      // Shorter delay now since permission was already granted from camera preview
      const timer = setTimeout(() => {
        startCamera();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isStarted, isCameraActive, startCamera]);

  // Show camera banner if camera is not active after a reasonable delay
  useEffect(() => {
    if (!isStarted) return;
    const timer = setTimeout(() => {
      if (!isCameraActive) {
        setShowCameraBanner(true);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [isStarted]);

  // Hide banner when camera becomes active
  useEffect(() => {
    if (isCameraActive) {
      setShowCameraBanner(false);
    }
  }, [isCameraActive]);

  // Cleanup preview stream on unmount or when exam starts
  useEffect(() => {
    return () => {
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(track => track.stop());
        previewStreamRef.current = null;
      }
    };
  }, []);

  const startCameraPreview = async () => {
    setCameraPreviewError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
      previewStreamRef.current = stream;
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        await previewVideoRef.current.play();
      }
      setCameraPreviewActive(true);
      setCameraPreviewTested(true);
      setCameraPermissionDenied(false);
    } catch (err) {
      console.warn('[Camera Preview] Failed:', err);
      setCameraPreviewError('Kamera tidak dapat diakses. Pastikan izin kamera diaktifkan di pengaturan browser.');
      setCameraPreviewTested(true);
      setCameraPermissionDenied(true);
    }
  };

  const stopCameraPreview = () => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach(track => track.stop());
      previewStreamRef.current = null;
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setCameraPreviewActive(false);
  };

  // Track snapshot status for visual feedback
  useEffect(() => {
    if (!isStarted || !isCameraActive) return;

    const doSnapshot = async (): Promise<boolean> => {
      try {
        setSnapshotStatus('capturing');
        setSnapshotError(null);
        const result = await captureSnapshot();
        if (result) {
          setSnapshotStatus('success');
          setLastSnapshotTime(new Date());
          setSnapshotSuccessCount(c => c + 1);
          setSnapshotError(null);
          return true;
        } else {
          setSnapshotStatus('error');
          setSnapshotError('Gagal ambil gambar dari kamera');
          setSnapshotFailCount(c => c + 1);
          return false;
        }
      } catch (err) {
        setSnapshotStatus('error');
        const axiosErr = err as { response?: { status?: number; data?: { message?: string; errors?: Record<string, string[]> } }; message?: string; code?: string };
        if (axiosErr.code === 'ERR_NETWORK' || axiosErr.message?.includes('Network')) {
          setSnapshotError('Gagal koneksi ke server');
        } else if (axiosErr.response?.status === 422) {
          // Log detailed validation errors
          const valErrors = axiosErr.response?.data?.errors;
          if (valErrors) {
            const detail = Object.values(valErrors).flat().join('; ');
            console.warn('[Snapshot] Validation errors:', valErrors);
            setSnapshotError(`Validasi: ${detail}`);
          } else {
            setSnapshotError(`Validasi: ${axiosErr.response?.data?.message || 'File tidak valid'}`);
          }
        } else if (axiosErr.response?.status === 413) {
          setSnapshotError('File terlalu besar');
        } else if (axiosErr.response?.status) {
          setSnapshotError(`Server error ${axiosErr.response.status}`);
        } else {
          setSnapshotError(axiosErr.message || 'Upload gagal');
        }
        setSnapshotFailCount(c => c + 1);
        return false;
      }
    };

    // Snapshot every 5 seconds
    const snapshotCheck = setInterval(doSnapshot, 5000);

    // First snapshot after 3s — give camera time to initialize
    const firstTimer = setTimeout(doSnapshot, 3000);

    return () => {
      clearInterval(snapshotCheck);
      clearTimeout(firstTimer);
    };
  }, [isStarted, isCameraActive, captureSnapshot]);

  const fetchExam = async () => {
    try {
      const response = await api.get(`/exams/${examId}`);
      const examData = response.data?.data;
      
      if (examData) {
        const questionsList = examData.questions || [];
        // Check SEB requirement from API
        const sebRequired = examData.seb_required === true;
        
        setExam({
          id: examData.id,
          title: examData.title,
          subject: examData.subject || 'Ujian',
          duration: examData.duration_minutes || examData.duration || 90,
          totalQuestions: examData.total_questions || examData.questions_count || questionsList.length || 0,
          questions: questionsList,
          sebRequired,
          sebAllowQuit: examData.seb_allow_quit ?? false,
          sebQuitPassword: examData.seb_quit_password ?? '',
          sebBlockScreenCapture: examData.seb_block_screen_capture ?? true,
          sebAllowVirtualMachine: examData.seb_allow_virtual_machine ?? false,
          sebShowTaskbar: examData.seb_show_taskbar ?? true,
        });
        // Only set questions if they're actually returned (guru/admin)
        // For students, questions come from the /start endpoint
        if (questionsList.length > 0) {
          setQuestions(questionsList);
        }
        setTimeRemaining((examData.duration_minutes || examData.duration || 90) * 60);
        setExamNotFound(false);
      } else {
        setExamNotFound(true);
      }
    } catch (error) {
      console.error('Failed to fetch exam:', error);
      setExamNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isStarted) return;
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-submit when time is up (only once)
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            autoSubmitExam();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isStarted]);

  // Force auto-submit (no confirm dialog, just submit)
  const autoSubmitExam = async () => {
    setSubmitting(true);
    try {
      await api.post(`/exams/${examId}/finish`);
      clearExamSession();
      toast.warning('Waktu ujian habis! Jawaban telah dikumpulkan otomatis.');
      router.push('/ujian-siswa?submitted=true');
    } catch (error) {
      console.error('Failed to auto-submit exam:', error);
      clearExamSession();
      router.push('/ujian-siswa?reason=time_up');
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartExam = async () => {
    setStartingExam(true);

    // Stop preview stream if running
    stopCameraPreview();
    
    // Enter fullscreen FIRST — must be called synchronously from user gesture
    // before any async operation (getUserMedia / API call) that would lose the gesture context
    await enterFullscreen();

    try {
      // Call API to start exam — this returns questions for students
      const response = await api.post(`/exams/${examId}/start`);
      const startData = response.data?.data;

      if (startData?.questions && startData.questions.length > 0) {
        // Map questions from start endpoint
        const mappedQuestions = startData.questions.map((q: { id: number; order?: number; question_type?: string; type?: string; question_text: string; passage?: string; options?: (string | { text: string; image?: string | null })[]; image?: string }, idx: number) => ({
          id: q.id,
          number: q.order || idx + 1,
          type: (q.question_type || q.type) === 'multiple_choice' ? 'multiple_choice' : 'essay',
          text: q.question_text,
          passage: q.passage || null,
          options: (q.options || []).map((opt: string | { text: string; image?: string | null }) =>
            typeof opt === 'string' ? { text: opt, image: null } : { text: opt.text || '', image: opt.image || null }
          ),
          image: q.image || null,
        }));
        setQuestions(mappedQuestions);

        // Restore existing answers if any
        if (startData.existing_answers) {
          const restored: Record<number, string> = {};
          Object.entries(startData.existing_answers).forEach(([qId, ans]) => {
            const answer = ans as { answer?: string };
            if (answer?.answer) {
              restored[Number(qId)] = answer.answer;
            }
          });
          setAnswers(restored);
        }

        // Set remaining time from server (guard against negative)
        if (startData.remaining_time !== undefined) {
          const remaining = Math.max(1, Math.floor(startData.remaining_time));
          setTimeRemaining(remaining);
        }
      }

      // Camera will auto-start via useEffect after isStarted becomes true
      // and the video element is rendered in the DOM
      setIsStarted(true);
    } catch (error) {
      console.error('Failed to start exam:', error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Gagal memulai ujian. Silakan coba lagi.');
      setStartingExam(false);
    }
  };

  const handleAnswer = async (questionId: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    
    // Save answer to server
    try {
      await api.post(`/exams/${examId}/answer`, {
        question_id: questionId,
        answer,
      });
    } catch (error) {
      console.error('Failed to save answer:', error);
    }
  };

  const handleToggleFlag = (questionNumber: number) => {
    setFlaggedQuestions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(questionNumber)) {
        newSet.delete(questionNumber);
      } else {
        newSet.add(questionNumber);
      }
      return newSet;
    });
  };

  const handleSubmit = () => {
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/exams/${examId}/finish`);
      clearExamSession();
      router.push('/ujian-siswa?submitted=true');
    } catch (error) {
      console.error('Failed to submit exam:', error);
      toast.error('Gagal mengumpulkan ujian. Coba lagi.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  if (!exam || examNotFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Ujian Tidak Tersedia</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">Ujian ini tidak ditemukan atau Anda tidak memiliki akses.</p>
          <Button onClick={() => router.push('/ujian-siswa')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali ke Daftar Ujian
          </Button>
        </Card>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const answeredCount = Object.keys(answers).length;

  if (!isStarted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">{exam.title}</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{exam.subject}</p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <Clock className="w-6 h-6 text-teal-600 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Durasi</p>
                <p className="font-medium">{exam.duration} Menit</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                <p className="text-sm text-slate-600 dark:text-slate-400">Jumlah Soal</p>
                <p className="font-medium">{exam.totalQuestions} Soal</p>
              </div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-medium text-yellow-800 dark:text-yellow-300 mb-2">⚠️ Perhatian:</h3>
              <ul className="text-sm text-yellow-700 dark:text-yellow-400 space-y-1">
                {isMobile ? (
                  <>
                    <li>• <strong>Jangan pindah tab atau buka aplikasi lain</strong> — akan terdeteksi sebagai pelanggaran</li>
                    <li>• Kamera akan aktif selama ujian berlangsung</li>
                    <li>• Pastikan koneksi internet stabil</li>
                    <li>• Gunakan mode <strong>Jangan Ganggu</strong> untuk menghindari notifikasi</li>
                    <li>• <strong>Disarankan:</strong> Aktifkan <strong>{/iPhone|iPad/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') ? 'Guided Access (Pengaturan → Aksesibilitas → Guided Access)' : 'Screen Pinning / Sematkan Layar'}</strong> untuk keamanan tambahan</li>
                  </>
                ) : (
                  <>
                    <li>• Ujian akan berjalan dalam mode fullscreen</li>
                    <li>• Kamera akan aktif selama ujian berlangsung</li>
                    <li>• Keluar dari fullscreen dianggap kecurangan</li>
                    <li>• Pastikan koneksi internet stabil</li>
                  </>
                )}
                {exam.sebRequired && !isMobile && (
                  <li className="font-semibold">• Ujian ini WAJIB menggunakan Safe Exam Browser (SEB)</li>
                )}
              </ul>
            </div>

            {/* SEB Detection Block — only for desktop */}
            {exam.sebRequired && !usingSEB && !isMobile && (
              <div className="bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-lg p-5 mb-6 text-left">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-800 dark:text-red-400 mb-1">Safe Exam Browser Diperlukan</h3>
                    <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                      Ujian ini hanya dapat dikerjakan menggunakan Safe Exam Browser (SEB). 
                      Anda tidak terdeteksi menggunakan SEB.
                    </p>
                    <div className="space-y-2 text-sm text-red-600 dark:text-red-400">
                      <p className="font-medium">Langkah-langkah:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Download file konfigurasi .seb menggunakan tombol di bawah</li>
                        <li>Install <a href="https://safeexambrowser.org/download_en.html" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-red-800">Safe Exam Browser</a> jika belum terinstall</li>
                        <li>Buka file .seb yang sudah didownload — SEB akan otomatis terbuka</li>
                        <li>Login kembali dan mulai ujian</li>
                      </ol>
                      <button
                        onClick={() => downloadSEBConfig(exam.title, examId, {
                          sebRequired: true,
                          sebAllowQuit: exam.sebAllowQuit,
                          sebQuitPassword: exam.sebQuitPassword,
                          sebBlockScreenCapture: exam.sebBlockScreenCapture,
                          sebAllowVirtualMachine: exam.sebAllowVirtualMachine,
                          sebShowTaskbar: exam.sebShowTaskbar,
                        })}
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download Konfigurasi SEB
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {exam.sebRequired && usingSEB && !isMobile && (
              <div className="bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">Safe Exam Browser terdeteksi ✓</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* Camera Preview Test */}
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="w-5 h-5 text-teal-600" />
                    <h3 className="font-medium text-slate-800 dark:text-white text-sm">Tes Kamera Pengawas</h3>
                  </div>
                  {cameraPreviewTested && !cameraPreviewError && (
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Kamera Siap
                    </span>
                  )}
                  {cameraPreviewTested && cameraPreviewError && (
                    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                      <XCircle className="w-3.5 h-3.5" />
                      Gagal
                    </span>
                  )}
                </div>
                
                <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative mb-3">
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />
                  {!cameraPreviewActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70">
                      <CameraOff className="w-10 h-10 mb-2 opacity-40" />
                      <p className="text-xs text-center px-4">
                        {cameraPreviewError
                          ? cameraPreviewError
                          : 'Klik tombol di bawah untuk menguji kamera Anda'}
                      </p>
                    </div>
                  )}
                  {cameraPreviewActive && (
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                      Preview Kamera
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  {!cameraPreviewActive ? (
                    <button
                      onClick={startCameraPreview}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Video className="w-4 h-4" />
                      {cameraPreviewTested ? 'Coba Lagi' : 'Tes Kamera'}
                    </button>
                  ) : (
                    <button
                      onClick={stopCameraPreview}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <VideoOff className="w-4 h-4" />
                      Matikan Preview
                    </button>
                  )}
                </div>

                {cameraPreviewTested && !cameraPreviewError && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2 text-center">
                    ✓ Kamera berhasil diuji. Anda siap memulai ujian.
                  </p>
                )}
                {cameraPreviewError && (
                  <p className="text-xs text-red-500 mt-2 text-center">
                    Ujian tetap bisa dimulai tanpa kamera, tapi pastikan untuk mengizinkan akses kamera.
                  </p>
                )}
              </div>

              <Button
                onClick={handleStartExam}
                fullWidth
                disabled={startingExam || (exam.sebRequired && !usingSEB && !isMobile)}
              >
                {startingExam ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Maximize className="w-5 h-5 mr-2" />
                )}
                {startingExam ? 'Mempersiapkan…' : 'Mulai Ujian'}
              </Button>
              <Button
                variant="outline"
                fullWidth
                onClick={() => router.push('/ujian-siswa')}
                disabled={startingExam}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Kembali ke Daftar Ujian
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const handleRetryCamera = async () => {
    setCameraPermissionDenied(false);
    setShowCameraBanner(false);
    try {
      await startCamera();
    } catch {
      setCameraPermissionDenied(true);
      setShowCameraBanner(true);
    }
  };

  return (
    <div className="min-h-screen bg-background select-none" style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}>
      {/* Camera permission banner */}
      {isStarted && showCameraBanner && !isCameraActive && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Kamera Pengawas Tidak Aktif</p>
              <p className="text-xs opacity-90">
                {cameraPermissionDenied
                  ? 'Izin kamera ditolak. Buka pengaturan browser dan izinkan akses kamera, lalu klik Coba Lagi.'
                  : 'Kamera belum aktif. Klik Izinkan saat browser meminta izin akses kamera.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRetryCamera}
            className="px-4 py-1.5 bg-white text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-50 transition-colors flex-shrink-0"
          >
            Coba Lagi
          </button>
        </div>
      )}
      <div className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-slate-800 dark:text-white">{exam.title}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Soal {currentQuestion + 1} dari {questions.length}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              timeRemaining < 300 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-muted text-slate-700 dark:text-slate-300'
            }`}>
              <Clock className="w-5 h-5" />
              <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              isCameraActive 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            }`}>
              {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              <span className="text-sm font-medium">{isCameraActive ? 'Kamera' : 'Kamera Mati'}</span>
            </div>
            {violationCount > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                <span className="text-sm">
                  {violationCount}{maxViolations ? `/${maxViolations}` : ''} pelanggaran
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card className="p-6">
              {/* Passage / Cerita Soal */}
              {question?.passage && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Bacaan</span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-line leading-relaxed">{question.passage}</p>
                </div>
              )}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Soal {question?.number || currentQuestion + 1}</span>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-1 whitespace-pre-line">{question?.text || 'Soal tidak tersedia'}</h2>
                  {question?.image && (
                    <div className="mt-3">
                      <img
                        src={question.image.startsWith('http') ? question.image : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${question.image}`}
                        alt="Gambar Soal"
                        className="max-w-full max-h-80 rounded-lg border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleToggleFlag(question?.number || currentQuestion + 1)}
                  className={`p-2 rounded-lg ${
                    flaggedQuestions.has(question?.number || currentQuestion + 1)
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                      : 'bg-muted text-slate-600 dark:text-slate-400 hover:text-yellow-600'
                  }`}
                  aria-label="Tandai soal"
                >
                  <Flag className="w-5 h-5" />
                </button>
              </div>
              {question?.type === 'multiple_choice' && question.options && (
                <div className="space-y-3">
                  {question.options.map((option, index) => (
                    <label
                      key={index}
                      className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        answers[question.id] === option.text
                          ? 'border-teal-500 bg-teal-100 dark:bg-teal-900/30 dark:border-teal-400'
                          : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        checked={answers[question.id] === option.text}
                        onChange={() => handleAnswer(question.id, option.text)}
                        className="w-4 h-4 text-teal-600 accent-teal-600 mt-0.5"
                      />
                      <span className={`ml-3 font-semibold mt-0.5 ${
                        answers[question.id] === option.text
                          ? 'text-teal-800 dark:text-teal-300'
                          : 'text-slate-900 dark:text-slate-200'
                      }`}>{String.fromCharCode(65 + index)}.</span>
                      <div className="ml-2 flex-1">
                        {option.text && !/^\[Gambar [A-Z]\]$/.test(option.text) && (
                          <span className={`${
                            answers[question.id] === option.text
                              ? 'text-teal-700 dark:text-teal-300 font-medium'
                              : 'text-slate-800 dark:text-slate-300'
                          }`}>{option.text}</span>
                        )}
                        {option.image && (
                          <img
                            src={option.image.startsWith('http') ? option.image : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/storage/${option.image}`}
                            alt={`Gambar opsi ${String.fromCharCode(65 + index)}`}
                            className="mt-2 max-w-full max-h-48 rounded-lg border border-slate-200 dark:border-slate-700"
                          />
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {question?.type === 'essay' && (
                <textarea
                  value={answers[question.id] || ''}
                  onChange={(e) => handleAnswer(question.id, e.target.value)}
                  placeholder="Tulis jawaban Anda di sini…"
                  rows={6}
                  className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  name={`essay-${question.id}`}
                  aria-label="Jawaban essay"
                />
              )}
            </Card>
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestion === 0}
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Sebelumnya
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-400">{answeredCount} / {questions.length} Dijawab</span>
              {currentQuestion === questions.length - 1 ? (
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                  Kumpulkan
                </Button>
              ) : (
                <Button onClick={() => setCurrentQuestion((prev) => Math.min(questions.length - 1, prev + 1))}>
                  Selanjutnya
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </div>
          </div>
          <div className="lg:col-span-1">
            <Card className="p-4 sticky top-20">
              <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Navigasi Soal</h3>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, index) => (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestion(index)}
                    className={`w-10 h-10 rounded-lg font-medium text-sm ${
                      currentQuestion === index
                        ? 'bg-teal-500 text-white'
                        : answers[q.id]
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-muted text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    } ${flaggedQuestions.has(q.number) ? 'ring-2 ring-yellow-400' : ''}`}
                  >
                    {q.number || index + 1}
                  </button>
                ))}
              </div>
              <div className="mt-6 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 dark:bg-green-900/30 rounded" />
                  <span className="text-slate-600 dark:text-slate-400">Sudah dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-muted rounded" />
                  <span className="text-slate-600 dark:text-slate-400">Belum dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white dark:bg-slate-900 border-2 border-yellow-400 rounded" />
                  <span className="text-slate-600 dark:text-slate-400">Ditandai</span>
                </div>
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Kamera Pengawas</p>
                  <div className="flex items-center gap-1">
                    {isCameraActive ? (
                      <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        Aktif
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-red-500">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        Mati
                      </span>
                    )}
                  </div>
                </div>
                <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {!isCameraActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
                      <CameraOff className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-[10px] text-center px-2 mb-1">Kamera tidak aktif</p>
                    </div>
                  )}
                  {isCameraActive && snapshotStatus !== 'idle' && (
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded max-w-[60%] truncate ${
                        snapshotStatus === 'success' ? 'bg-green-600/80 text-white' :
                        snapshotStatus === 'capturing' ? 'bg-yellow-600/80 text-white' :
                        'bg-red-600/80 text-white'
                      }`} title={snapshotError || undefined}>
                        {snapshotStatus === 'success' ? '✓ Snapshot OK' :
                         snapshotStatus === 'capturing' ? '⏳ Capturing...' :
                         `✗ ${snapshotError || 'Gagal'}`}
                      </span>
                      {lastSnapshotTime && (
                        <span className="text-[9px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                          {lastSnapshotTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Snapshot stats overlay */}
                  {isCameraActive && (snapshotSuccessCount > 0 || snapshotFailCount > 0) && (
                    <div className="absolute top-1 right-1 text-[8px] bg-black/50 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
                      ✓{snapshotSuccessCount} ✗{snapshotFailCount}
                    </div>
                  )}
                  {/* Auto-restart indicator */}
                  {consecutiveSnapshotFails >= 3 && (
                    <div className="absolute top-1 left-1 text-[8px] bg-amber-500/80 text-white px-1.5 py-0.5 rounded backdrop-blur-sm animate-pulse">
                      ⚠ Kamera bermasalah ({consecutiveSnapshotFails}x gagal)
                    </div>
                  )}
                  {/* AI Proctoring status overlay */}
                  {isCameraActive && proctoring.isModelLoaded && (
                    <div className="absolute top-1 left-1 text-[8px] bg-black/50 text-white px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
                      {proctoring.isAnalyzing ? (
                        <>
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                          AI
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                          AI
                        </>
                      )}
                    </div>
                  )}
                </div>
                {/* AI Proctoring risk bar */}
                {isCameraActive && proctoring.isModelLoaded && proctoring.stats.totalAnalyzed > 0 && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        {proctoring.stats.riskLevel === 'low' && <ShieldCheck className="w-3 h-3 text-green-500" />}
                        {proctoring.stats.riskLevel === 'medium' && <Shield className="w-3 h-3 text-yellow-500" />}
                        {proctoring.stats.riskLevel === 'high' && <ShieldAlert className="w-3 h-3 text-orange-500" />}
                        {proctoring.stats.riskLevel === 'critical' && <ShieldAlert className="w-3 h-3 text-red-500" />}
                        AI Proktor
                      </span>
                      <span className={`font-medium ${
                        proctoring.stats.riskLevel === 'low' ? 'text-green-600 dark:text-green-400' :
                        proctoring.stats.riskLevel === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                        proctoring.stats.riskLevel === 'high' ? 'text-orange-600 dark:text-orange-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {proctoring.stats.riskLevel === 'low' ? 'Aman' :
                         proctoring.stats.riskLevel === 'medium' ? 'Perhatian' :
                         proctoring.stats.riskLevel === 'high' ? 'Peringatan' : 'Kritis'}
                      </span>
                    </div>
                    {proctoring.stats.totalDetections > 0 && (
                      <div className="flex flex-wrap gap-1 text-[8px]">
                        {proctoring.stats.noFaceCount > 0 && (
                          <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1 py-0.5 rounded">
                            Wajah hilang: {proctoring.stats.noFaceCount}
                          </span>
                        )}
                        {proctoring.stats.multiFaceCount > 0 && (
                          <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1 py-0.5 rounded">
                            Multi wajah: {proctoring.stats.multiFaceCount}
                          </span>
                        )}
                        {proctoring.stats.headTurnCount > 0 && (
                          <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 px-1 py-0.5 rounded">
                            Menoleh: {proctoring.stats.headTurnCount}
                          </span>
                        )}
                        {proctoring.stats.eyeGazeCount > 0 && (
                          <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">
                            Lirikan: {proctoring.stats.eyeGazeCount}
                          </span>
                        )}
                        {proctoring.stats.identityMismatchCount > 0 && (
                          <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1 py-0.5 rounded">
                            ID berbeda: {proctoring.stats.identityMismatchCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={confirmSubmit}
        title="Kumpulkan Ujian"
        message="Apakah Anda yakin ingin mengumpulkan ujian?"
        confirmText="Kumpulkan"
        variant="warning"
        isLoading={submitting}
      />

      {/* AI Proctoring Warning Overlay */}
      {proctoringWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-md">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 animate-pulse" />
            <div>
              <p className="font-semibold text-sm">Peringatan AI Proktor</p>
              <p className="text-xs text-red-100">{proctoringWarning}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
