'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useExamMode } from '@/hooks/useExamMode';
import { useProctoring, ProctoringDetection } from '@/hooks/useProctoring';
import { Button, Card, ConfirmDialog, Modal } from '@/components/ui';
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
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import api, { getSecureFileUrl } from '@/services/api';
import { useToast } from '@/components/ui/Toast';
import { isSEBBrowser, downloadSEBConfig } from '@/utils/seb';
import { useExamSocket } from '@/hooks/useSocket';
import { useAuth } from '@/context/AuthContext';
import { MathText } from '@/components/ui/MathText';
import { useAnswerQueue } from '@/hooks/useAnswerQueue';

interface QuestionOption {
  text: string;
  image?: string | null;
}

interface Question {
  id: number;
  number: number;
  type: 'multiple_choice' | 'multiple_answer' | 'essay';
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

interface ExamImagePreview {
  src: string;
  alt: string;
  title: string;
}

const MIN_IMAGE_PREVIEW_ZOOM = 1;
const MAX_IMAGE_PREVIEW_ZOOM = 3;
const IMAGE_PREVIEW_ZOOM_STEP = 0.25;

const normalizeQuestionType = (type?: string): Question['type'] => {
  if (type === 'multiple_answer') return 'multiple_answer';
  if (type === 'essay') return 'essay';
  return 'multiple_choice';
};

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
  // Work photo (foto cara kerja) state
  const [workPhotos, setWorkPhotos] = useState<Record<number, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<number | null>(null);
  const workPhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const workPhotoQuestionRef = React.useRef<number | null>(null);
  const [usingSEB, setUsingSEB] = useState(false);
  const resumeAttemptedRef = React.useRef(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [showCameraBanner, setShowCameraBanner] = useState(false);
  const [cameraPreviewActive, setCameraPreviewActive] = useState(false);
  const [cameraPreviewTested, setCameraPreviewTested] = useState(false);
  const [cameraPreviewError, setCameraPreviewError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<ExamImagePreview | null>(null);
  const [imagePreviewZoom, setImagePreviewZoom] = useState<number>(MIN_IMAGE_PREVIEW_ZOOM);
  const previewVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const previewStreamRef = React.useRef<MediaStream | null>(null);
  // Ref to track intentional navigation (submission) to bypass beforeunload
  const isNavigatingAwayRef = React.useRef(false);
  const kickedByAdminRef = React.useRef(false);

  // Nomor Tes
  const { user: authUser } = useAuth();
  const [nomorTes, setNomorTes] = useState('');
  const [nomorTesError, setNomorTesError] = useState<string | null>(null);
  const hasNomorTes = authUser?.has_nomor_tes === true;
  const canManualSubmit = timeRemaining <= 600;

  // === FIX 1: Reliable answer saving with retry queue ===
  const answerQueue = useAnswerQueue({
    examId,
    debounceMs: 2000,
    maxRetries: 5,
    onPermanentFailure: (questionId) => {
      toast.error(`Jawaban soal #${questions.findIndex(q => q.id === questionId) + 1} gagal tersimpan. Periksa koneksi internet.`);
    },
  });

  // Clear exam session flags (call before navigating away after submit)
  const clearExamSession = React.useCallback(() => {
    sessionStorage.removeItem(`exam_active_${examId}`);
    sessionStorage.removeItem(`exam_question_${examId}`);
  }, [examId]);

  const flushAnswersBeforeFinish = React.useCallback(async () => {
    // Flush the answer queue first (retry pending saves)
    await answerQueue.flushAll();
    
    // Fallback: also send all answers directly in case queue missed some
    const entries = Object.entries(answers).filter(([, value]) => typeof value === 'string' && value.trim() !== '');
    if (entries.length === 0) return;

    try {
      await api.post(`/exams/${examId}/answers/batch`, {
        answers: entries.map(([questionId, value]) => ({
          question_id: Number(questionId),
          answer: value,
        })),
      });
    } catch {
      // Fallback: try individual saves
      await Promise.allSettled(
        entries.map(([questionId, value]) =>
          api.post(`/exams/${examId}/answer`, {
            question_id: Number(questionId),
            answer: value,
          })
        )
      );
    }
  }, [answers, examId, answerQueue]);

  // Force submit handler
  const handleForceSubmit = async () => {
    setSubmitting(true);
    try {
      await flushAnswersBeforeFinish();
      await api.post(`/exams/${examId}/finish`, {
        answers,
        time_spent: (exam?.duration || 90) * 60 - timeRemaining,
        force_submit: true,
      });
      clearExamSession();
      isNavigatingAwayRef.current = true;
      router.push('/ujian-siswa?reason=force_submit');
    } catch (error) {
      console.error('Failed to submit exam:', error);
      clearExamSession();
      isNavigatingAwayRef.current = true;
      router.push('/ujian-siswa');
    }
  };

  const {
    isCameraActive,
    isMobile,
    violationCount,
    maxViolations,
    policyAction,
    freezeUntil,
    consecutiveSnapshotFails,
    enterFullscreen,
    exitFullscreen,
    startCamera,
    stopCamera,
    restartCamera,
    captureSnapshot,
    suppressViolations,
    videoRef,
  } = useExamMode({
    examId,
    onViolation: () => {},
    onForceSubmit: handleForceSubmit,
  });
  const isAnswerFrozen = freezeUntil !== null;

  const forceExitExamByAdmin = React.useCallback(() => {
    setSubmitting(true);
    stopCamera();
    clearExamSession();
    toast.warning('Ujian telah diselesaikan oleh admin. Jawaban Anda telah dikumpulkan otomatis.');
    setTimeout(() => {
      isNavigatingAwayRef.current = true;
      router.push('/ujian-siswa?reason=admin_ended');
    }, 1500);
  }, [stopCamera, clearExamSession, toast, router]);

  const [snapshotStatus, setSnapshotStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle');
  const [lastSnapshotTime, setLastSnapshotTime] = useState<Date | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshotSuccessCount, setSnapshotSuccessCount] = useState(0);
  const [snapshotFailCount, setSnapshotFailCount] = useState(0);
  const [snapshotMonitoringEnabled, setSnapshotMonitoringEnabled] = useState(true);
  const snapshotMonitoringRef = React.useRef(true);
  const snapshotDisabledToastShownRef = React.useRef(false);
  const [proctoringWarning, setProctoringWarning] = useState<string | null>(null);

  const syncSnapshotMonitoringState = React.useCallback((rawValue: unknown) => {
    const enabled = rawValue !== false;
    snapshotMonitoringRef.current = enabled;
    setSnapshotMonitoringEnabled(enabled);

    if (enabled) {
      snapshotDisabledToastShownRef.current = false;
      return enabled;
    }

    setSnapshotStatus('idle');
    setSnapshotError(null);
    setLastSnapshotTime(null);
    snapshotDisabledToastShownRef.current = false;

    return enabled;
  }, []);

  // AI Proctoring — face detection, head pose, eye gaze, identity verification
  const proctoring = useProctoring({
    examId,
    videoRef,
    enabled: isStarted && isCameraActive,
    detectionInterval: 1500,
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
  }, [isStarted, isCameraActive, proctoring.isModelLoaded, proctoring]);

  // Socket: listen for admin ending the exam
  const examSocket = useExamSocket(examId);

  useEffect(() => {
    if (!isStarted || !examSocket.isConnected) return;

    const room = 'system.snapshot-monitor';
    examSocket.emit('join-system', { room });

    return () => {
      examSocket.emit('leave-system', { room });
    };
  }, [isStarted, examSocket]);
  
  useEffect(() => {
    if (!isStarted) return;

    const handleExamEnded = () => {
      // Admin ended the exam — auto-cleanup and redirect
      forceExitExamByAdmin();
    };

    examSocket.onExamEnded(handleExamEnded);
    return () => {
      examSocket.off(`exam.${examId}.ended`);
    };
  }, [isStarted, examId, examSocket, forceExitExamByAdmin]);

  // Socket: listen for admin kicking current student from exam session.
  useEffect(() => {
    const handleStudentKicked = (payload: unknown) => {
      const data = payload as { student_id?: number; message?: string };
      if (!authUser?.id || data.student_id !== authUser.id) return;
      if (kickedByAdminRef.current) return;

      kickedByAdminRef.current = true;
      isNavigatingAwayRef.current = true;
      sessionStorage.setItem('force_logout_bypass', '1');
      sessionStorage.removeItem(`exam_active_${examId}`);
      sessionStorage.removeItem(`exam_question_${examId}`);
      stopCamera();

      window.dispatchEvent(
        new CustomEvent('lms:force-logout', {
          detail: {
            reason: 'removed_by_admin',
            message: data.message || 'Anda dikeluarkan sementara dari ujian oleh admin. Silakan login kembali.',
          },
        })
      );
    };

    examSocket.on(`exam.${examId}.student-kicked`, handleStudentKicked);
    return () => {
      examSocket.off(`exam.${examId}.student-kicked`);
    };
  }, [examId, examSocket, authUser?.id, stopCamera]);

  // Fallback: poll exam status periodically in case websocket event is missed.
  // Poll every 30s and pause when tab is hidden.
  useEffect(() => {
    if (!isStarted || submitting) return;

    const checkEndedStatus = async () => {
      if (document.hidden) return;

      try {
        const response = await api.get(`/exams/${examId}`);
        const examData = response.data?.data;
        if (!examData) return;

        const statusCompleted = examData.status === 'completed';
        const endedByTime = examData.end_time ? new Date(examData.end_time).getTime() <= Date.now() : false;

        if (statusCompleted || endedByTime) {
          forceExitExamByAdmin();
        }
      } catch {
        // Ignore transient polling errors; websocket remains primary channel.
      }
    };

    let interval: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const startPolling = () => {
      if (interval || document.hidden) return;
      interval = setInterval(() => {
        void checkEndedStatus();
      }, 30000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }

      void checkEndedStatus();
      startPolling();
    };

    void checkEndedStatus();
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isStarted, submitting, examId, forceExitExamByAdmin]);

  // Socket: listen for real-time question changes (admin/guru editing during exam)
  useEffect(() => {
    if (!isStarted) return;

    const mapQuestion = (q: { id: number; order?: number; question_text: string; type?: string; question_type?: string; passage?: string; options?: (string | { text: string; image?: string | null })[]; image?: string }, idx: number): Question => ({
      id: q.id,
      number: idx + 1,
      type: normalizeQuestionType(q.question_type || q.type),
      text: q.question_text,
      passage: q.passage || null,
      options: (q.options || []).map((opt: string | { text: string; image?: string | null }) =>
        typeof opt === 'string' ? { text: opt, image: null } : { text: opt.text || '', image: opt.image || null }
      ),
      image: q.image || null,
    });

    const handleQuestionAdded = (data: unknown) => {
      const { question } = data as { question: { id: number; question_text: string; type?: string; passage?: string; options?: (string | { text: string; image?: string | null })[]; image?: string; order?: number } };
      if (!question) return;
      setQuestions(prev => {
        // Don't add if already exists
        if (prev.some(q => q.id === question.id)) return prev;
        const newQ = mapQuestion(question, prev.length);
        return [...prev, newQ];
      });
    };

    const handleQuestionUpdated = (data: unknown) => {
      const { question } = data as { question: { id: number; question_text: string; type?: string; passage?: string; options?: (string | { text: string; image?: string | null })[]; image?: string; order?: number } };
      if (!question) return;
      setQuestions(prev => prev.map((q, idx) => {
        if (q.id === question.id) {
          return mapQuestion(question, idx);
        }
        return q;
      }));
    };

    const handleQuestionDeleted = (data: unknown) => {
      const { question_id } = data as { question_id: number; deleted_order: number; total_questions: number };
      if (!question_id) return;
      setQuestions(prev => {
        const filtered = prev.filter(q => q.id !== question_id);
        // Renumber remaining questions
        return filtered.map((q, idx) => ({ ...q, number: idx + 1 }));
      });
      // Adjust current question index if needed
      setCurrentQuestion(prev => {
        const newLength = questions.length - 1;
        if (prev >= newLength && newLength > 0) return newLength - 1;
        return prev;
      });
    };

    examSocket.onQuestionAdded(handleQuestionAdded);
    examSocket.onQuestionUpdated(handleQuestionUpdated);
    examSocket.onQuestionDeleted(handleQuestionDeleted);

    return () => {
      examSocket.off(`exam.${examId}.question-added`);
      examSocket.off(`exam.${examId}.question-updated`);
      examSocket.off(`exam.${examId}.question-deleted`);
    };
  }, [isStarted, examId, examSocket, questions.length]);

  const syncTimeFromServer = useCallback(async (force: boolean = false) => {
    try {
      const response = await api.get(`/exams/${examId}/time-sync`);
      const serverRemaining = response.data?.data?.remaining_time;
      if (serverRemaining !== undefined) {
        const normalized = Math.max(0, Math.floor(serverRemaining));
        setTimeRemaining(prev => {
          if (force) {
            return normalized;
          }

          const drift = Math.abs(prev - normalized);
          // Only correct if drift > 5 seconds (avoid micro-corrections)
          if (drift > 5) {
            return normalized;
          }
          return prev;
        });
      }
    } catch {
      // Ignore sync errors — client timer continues as fallback
    }
  }, [examId]);

  // Socket: listen for exam settings changes during active exam (duration, max_violations, etc.)
  useEffect(() => {
    if (!isStarted) return;

    const handleExamUpdated = (data: unknown) => {
      const d = data as {
        exam_id: number;
        duration?: number;
        max_violations?: number;
        title?: string;
        time_adjustment?: boolean;
        requested_delta_minutes?: number;
        applied_delta_minutes?: number;
      };
      const isTimeAdjustment = d.time_adjustment === true || typeof d.applied_delta_minutes === 'number';

      // If duration changed, recalculate remaining time
      if (d.duration && exam) {
        const newDurationSeconds = d.duration * 60;
        const oldDurationSeconds = exam.duration * 60;
        const diff = newDurationSeconds - oldDurationSeconds;
        if (diff !== 0) {
          const minSeconds = isTimeAdjustment && diff < 0 ? 60 : 1;
          setTimeRemaining(prev => Math.max(minSeconds, prev + diff));
          setExam(prev => prev ? { ...prev, duration: d.duration! } : prev);
          if (isTimeAdjustment) {
            if (diff > 0) {
              toast.info(`Admin menambah waktu ujian ${Math.round(diff / 60)} menit`);
            } else {
              toast.info(`Admin mengurangi waktu ujian ${Math.round(Math.abs(diff) / 60)} menit`);
            }
          } else {
            toast.info(`Durasi ujian diubah menjadi ${d.duration} menit`);
          }
          void syncTimeFromServer(true);
        }
      }
      if (d.title) {
        setExam(prev => prev ? { ...prev, title: d.title! } : prev);
      }
    };

    examSocket.onExamUpdated(handleExamUpdated);
    return () => {
      examSocket.off(`exam.${examId}.updated`);
    };
  }, [isStarted, examId, examSocket, exam, toast, syncTimeFromServer]);

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
              number: idx + 1,
              type: normalizeQuestionType(q.question_type || q.type),
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
              const restoredPhotos: Record<number, string> = {};
              Object.entries(startData.existing_answers).forEach(([qId, ans]) => {
                const answer = ans as { answer?: string; work_photo?: string };
                if (answer?.answer) {
                  restored[Number(qId)] = answer.answer;
                }
                if (answer?.work_photo) {
                  restoredPhotos[Number(qId)] = answer.work_photo;
                }
              });
              setAnswers(restored);
              if (Object.keys(restoredPhotos).length > 0) setWorkPhotos(restoredPhotos);
            }
            if (startData.remaining_time !== undefined) {
              const remaining = Math.max(1, Math.floor(startData.remaining_time));
              setTimeRemaining(remaining);
            }
            syncSnapshotMonitoringState(startData.snapshot_monitor_enabled);
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
  }, [exam, examId, enterFullscreen, isStarted, syncSnapshotMonitoringState, toast]);

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
      // Allow navigation if intentionally submitting
      if (isNavigatingAwayRef.current) return;
      // Allow navigation during forced logout flow (admin block/session revoke)
      if (sessionStorage.getItem('force_logout_bypass') === '1') return;
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
  }, [isStarted, isCameraActive]);

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
  }, [isStarted, isCameraActive]);

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

  // Real-time sync snapshot monitor setting during active exam.
  useEffect(() => {
    if (!isStarted) return;

    let cancelled = false;

    const applySnapshotMonitorState = (enabledValue: unknown, showChangeToast: boolean) => {
      const prevEnabled = snapshotMonitoringRef.current;
      const enabled = syncSnapshotMonitoringState(enabledValue);

      if (showChangeToast && prevEnabled !== enabled) {
        if (enabled) {
          snapshotDisabledToastShownRef.current = false;
          toast.info('Monitoring snapshot diaktifkan admin. Upload snapshot dilanjutkan.');
        } else {
          snapshotDisabledToastShownRef.current = true;
          toast.info('Monitoring snapshot dinonaktifkan admin. Kamera tetap wajib aktif selama ujian.');
        }
      }
    };

    const syncInitialSnapshotStatus = async () => {
      try {
        const response = await api.get('/snapshot-monitor/status');
        if (cancelled) return;
        applySnapshotMonitorState(response.data?.data?.snapshot_monitor_enabled, false);
      } catch {
        // Ignore transient errors; websocket + upload endpoint guard will handle consistency.
      }
    };

    const handleSnapshotMonitorUpdated = (payload: unknown) => {
      const data = payload as { snapshot_monitor_enabled?: boolean };
      applySnapshotMonitorState(data?.snapshot_monitor_enabled, true);
    };

    void syncInitialSnapshotStatus();
    examSocket.on('system.snapshot-monitor.updated', handleSnapshotMonitorUpdated);

    return () => {
      cancelled = true;
      examSocket.off('system.snapshot-monitor.updated');
    };
  }, [isStarted, examSocket, syncSnapshotMonitoringState, toast]);

  // Track snapshot status for visual feedback.
  // Capture every 30s and pause when tab is hidden.
  useEffect(() => {
    if (!isStarted || !isCameraActive || !snapshotMonitoringEnabled) return;

    const doSnapshot = async (): Promise<boolean> => {
      try {
        setSnapshotStatus('capturing');
        setSnapshotError(null);
        const result = await captureSnapshot();
        if (result === 'captured') {
          setSnapshotStatus('success');
          setLastSnapshotTime(new Date());
          setSnapshotSuccessCount(c => c + 1);
          setSnapshotError(null);
          return true;
        } else if (result === 'disabled') {
          syncSnapshotMonitoringState(false);
          if (!snapshotDisabledToastShownRef.current) {
            toast.info('Monitoring snapshot dinonaktifkan oleh admin. Kamera tetap wajib aktif selama ujian.');
            snapshotDisabledToastShownRef.current = true;
          }
          return false;
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

    let snapshotCheck: ReturnType<typeof setInterval> | null = null;
    let firstTimer: ReturnType<typeof setTimeout> | null = null;

    const stopSnapshotPolling = () => {
      if (snapshotCheck) {
        clearInterval(snapshotCheck);
        snapshotCheck = null;
      }
      if (firstTimer) {
        clearTimeout(firstTimer);
        firstTimer = null;
      }
    };

    const startSnapshotPolling = () => {
      if (document.hidden || snapshotCheck) return;
      snapshotCheck = setInterval(() => {
        void doSnapshot();
      }, 30000);

      // First snapshot after 3s — give camera time to initialize
      firstTimer = setTimeout(() => {
        void doSnapshot();
      }, 3000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopSnapshotPolling();
        return;
      }

      void doSnapshot();
      startSnapshotPolling();
    };

    startSnapshotPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopSnapshotPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isStarted, isCameraActive, snapshotMonitoringEnabled, captureSnapshot, syncSnapshotMonitoringState, toast]);

  const fetchExam = useCallback(async () => {
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
  }, [examId]);

  useEffect(() => {
    void fetchExam();
  }, [fetchExam]);

  // Force auto-submit (no confirm dialog, just submit)
  const autoSubmitExam = useCallback(async () => {
    setSubmitting(true);
    try {
      await flushAnswersBeforeFinish();
      await api.post(`/exams/${examId}/finish`, {
        answers,
        time_spent: (exam?.duration || 90) * 60 - timeRemaining,
      });
      clearExamSession();
      toast.warning('Waktu ujian habis! Jawaban telah dikumpulkan otomatis.');
      // Mark as intentionally navigating away to bypass beforeunload
      isNavigatingAwayRef.current = true;
      router.push('/ujian-siswa?submitted=true');
    } catch (error) {
      console.error('Failed to auto-submit exam:', error);
      clearExamSession();
      isNavigatingAwayRef.current = true;
      router.push('/ujian-siswa?reason=time_up');
    }
  }, [answers, clearExamSession, exam?.duration, examId, flushAnswersBeforeFinish, router, timeRemaining, toast]);

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
  }, [isStarted, autoSubmitExam]);

  // === FIX 2: Timer re-sync from server every 60 seconds ===
  useEffect(() => {
    if (!isStarted || submitting) return;

    // Sync every 60 seconds
    const interval = setInterval(() => {
      void syncTimeFromServer(false);
    }, 60000);
    // First sync after 30s (let exam settle first)
    const firstSync = setTimeout(() => {
      void syncTimeFromServer(false);
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(firstSync);
    };
  }, [isStarted, submitting, syncTimeFromServer]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMinutesSeconds = (seconds: number) => {
    const safe = Math.max(0, seconds);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartExam = async () => {
    // Validate nomor_tes if required
    if (hasNomorTes) {
      if (!nomorTes.trim()) {
        setNomorTesError('Nomor tes wajib diisi');
        return;
      }
      setNomorTesError(null);
    }

    const normalizedNomorTes = nomorTes
      .trim()
      .replace(/[\s\u00A0\u200B-\u200D\uFEFF]+/g, '')
      .toUpperCase();

    setStartingExam(true);

    // Stop preview stream if running
    stopCameraPreview();
    
    // Enter fullscreen FIRST — must be called synchronously from user gesture
    // before any async operation (getUserMedia / API call) that would lose the gesture context
    await enterFullscreen();

    try {
      // Call API to start exam — this returns questions for students
      const response = await api.post(`/exams/${examId}/start`, hasNomorTes ? { nomor_tes: normalizedNomorTes } : {});
      const startData = response.data?.data;

      if (startData?.questions && startData.questions.length > 0) {
        // Map questions from start endpoint
        const mappedQuestions = startData.questions.map((q: { id: number; order?: number; question_type?: string; type?: string; question_text: string; passage?: string; options?: (string | { text: string; image?: string | null })[]; image?: string }, idx: number) => ({
          id: q.id,
          number: idx + 1,
          type: normalizeQuestionType(q.question_type || q.type),
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
          const restoredPhotos: Record<number, string> = {};
          Object.entries(startData.existing_answers).forEach(([qId, ans]) => {
            const answer = ans as { answer?: string; work_photo?: string };
            if (answer?.answer) {
              restored[Number(qId)] = answer.answer;
            }
            if (answer?.work_photo) {
              restoredPhotos[Number(qId)] = answer.work_photo;
            }
          });
          setAnswers(restored);
          if (Object.keys(restoredPhotos).length > 0) setWorkPhotos(restoredPhotos);
        }

        // Set remaining time from server (guard against negative)
        if (startData.remaining_time !== undefined) {
          const remaining = Math.max(1, Math.floor(startData.remaining_time));
          setTimeRemaining(remaining);
        }

        syncSnapshotMonitoringState(startData.snapshot_monitor_enabled);
      }

      // Camera will auto-start via useEffect after isStarted becomes true
      // and the video element is rendered in the DOM
      setIsStarted(true);
    } catch (error) {
      console.error('Failed to start exam:', error);
      const err = error as { response?: { data?: { message?: string } } };
      const errMsg = err.response?.data?.message || 'Gagal memulai ujian. Silakan coba lagi.';
      // Exit fullscreen on error so student can see the error and retry
      exitFullscreen();
      // Show nomor_tes error inline if relevant
      if (errMsg.toLowerCase().includes('nomor tes')) {
        setNomorTesError(errMsg);
      } else {
        toast.error(errMsg);
      }
      setStartingExam(false);
    }
  };

  // === FIX 3: Debounced batch answer save via queue ===
  const handleAnswer = useCallback((questionId: number, answer: string) => {
    if (isAnswerFrozen) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
    // Queue for batch save (debounced 2s, with retry)
    answerQueue.queueAnswer(questionId, answer);
  }, [answerQueue, isAnswerFrozen]);

  // Work photo capture — suppress violations while camera app is open
  const handleWorkPhotoClick = (questionId: number) => {
    const selectedQuestion = questions.find((q) => q.id === questionId);
    if (!selectedQuestion || selectedQuestion.type !== 'essay') {
      return;
    }

    workPhotoQuestionRef.current = questionId;
    // Suppress violations for 90s (camera app opens as separate activity on mobile)
    // This is longer because native camera app will completely take over the camera resource
    suppressViolations(90000);
    workPhotoInputRef.current?.click();
  };

  const handleWorkPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const questionId = workPhotoQuestionRef.current;
    if (!file || !questionId) return;

    const selectedQuestion = questions.find((q) => q.id === questionId);
    if (!selectedQuestion || selectedQuestion.type !== 'essay') {
      e.target.value = '';
      return;
    }

    // Reset file input so the same file can be re-selected
    e.target.value = '';

    setUploadingPhoto(questionId);
    try {
      const formData = new FormData();
      formData.append('question_id', String(questionId));
      formData.append('photo', file);
      const response = await api.post(`/exams/${examId}/work-photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data?.data?.work_photo) {
        setWorkPhotos(prev => ({ ...prev, [questionId]: response.data.data.work_photo }));
      }
    } catch (error) {
      console.error('Failed to upload work photo:', error);
    } finally {
      setUploadingPhoto(null);
      
      // After work photo upload, camera track is likely dead (was used by native camera app)
      // Restart camera automatically and extend suppression period
      if (isCameraActive) {
        console.log('[WorkPhoto] Upload done, restarting proctoring camera...');
        suppressViolations(10000); // Extra 10 seconds grace period
        try {
          await restartCamera();
          console.log('[WorkPhoto] Camera restarted successfully');
        } catch (err) {
          console.warn('[WorkPhoto] Failed to restart camera:', err);
        }
      }
    }
  };

  const handleMultipleAnswerToggle = (questionId: number, optionText: string) => {
    if (isAnswerFrozen) return;
    const current = answers[questionId];
    let selected: string[] = [];
    try { selected = current ? JSON.parse(current) : []; } catch { selected = []; }
    if (selected.includes(optionText)) {
      selected = selected.filter(s => s !== optionText);
    } else {
      selected = [...selected, optionText];
    }
    if (selected.length === 0) {
      // Remove answer if nothing selected
      setAnswers((prev) => { const next = { ...prev }; delete next[questionId]; return next; });
      return;
    }
    const answer = JSON.stringify(selected);
    handleAnswer(questionId, answer);
  };

  const isMultipleAnswerSelected = (questionId: number, optionText: string): boolean => {
    const current = answers[questionId];
    if (!current) return false;
    try {
      const selected: string[] = JSON.parse(current);
      return selected.includes(optionText);
    } catch { return false; }
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

  const openImagePreview = useCallback((imagePath: string | null | undefined, alt: string, title: string) => {
    if (!imagePath) return;
    setImagePreview({
      src: getSecureFileUrl(imagePath),
      alt,
      title,
    });
    setImagePreviewZoom(MIN_IMAGE_PREVIEW_ZOOM);
  }, []);

  const closeImagePreview = useCallback(() => {
    setImagePreviewZoom(MIN_IMAGE_PREVIEW_ZOOM);
    setImagePreview(null);
  }, []);

  const zoomInImagePreview = useCallback(() => {
    setImagePreviewZoom((prev) => Math.min(MAX_IMAGE_PREVIEW_ZOOM, Number((prev + IMAGE_PREVIEW_ZOOM_STEP).toFixed(2))));
  }, []);

  const zoomOutImagePreview = useCallback(() => {
    setImagePreviewZoom((prev) => Math.max(MIN_IMAGE_PREVIEW_ZOOM, Number((prev - IMAGE_PREVIEW_ZOOM_STEP).toFixed(2))));
  }, []);

  const resetImagePreviewZoom = useCallback(() => {
    setImagePreviewZoom(MIN_IMAGE_PREVIEW_ZOOM);
  }, []);

  const handleSubmit = () => {
    if (!canManualSubmit) {
      const minutesLeft = Math.ceil((timeRemaining - 600) / 60);
      toast.warning(`Tombol kumpulkan aktif 10 menit sebelum waktu habis. Tunggu sekitar ${Math.max(1, minutesLeft)} menit lagi.`);
      return;
    }
    setShowSubmitConfirm(true);
  };

  const confirmSubmit = async () => {
    if (!canManualSubmit) {
      setShowSubmitConfirm(false);
      toast.warning('Kumpulkan belum tersedia. Tunggu hingga 10 menit terakhir.');
      return;
    }
    setSubmitting(true);
    setShowSubmitConfirm(false); // Close dialog immediately
    try {
      await flushAnswersBeforeFinish();
      await api.post(`/exams/${examId}/finish`, {
        answers,
        time_spent: (exam?.duration || 90) * 60 - timeRemaining,
      });
      clearExamSession();
      // Mark as intentionally navigating away to bypass beforeunload
      isNavigatingAwayRef.current = true;
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
                    Kamera wajib aktif untuk memulai ujian. Pastikan izin kamera diaktifkan di pengaturan browser.
                  </p>
                )}
              </div>

              {/* Nomor Tes Input */}
              {hasNomorTes && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700/50 rounded-lg p-4">
                  <label className="block text-sm font-medium text-indigo-800 dark:text-indigo-300 mb-2">
                    Masukkan Nomor Tes
                  </label>
                  <input
                    type="text"
                    value={nomorTes}
                    onChange={(e) => {
                      setNomorTes(e.target.value);
                      setNomorTesError(null);
                    }}
                    placeholder="Masukkan nomor tes yang diberikan"
                    className={`w-full rounded-lg border ${
                      nomorTesError
                        ? 'border-red-400 focus:ring-red-500 focus:border-red-500'
                        : 'border-indigo-300 dark:border-indigo-600 focus:ring-indigo-500 focus:border-indigo-500'
                    } py-2.5 px-4 text-sm bg-white dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2`}
                  />
                  {nomorTesError && (
                    <p className="text-xs text-red-500 mt-1">{nomorTesError}</p>
                  )}
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1.5">
                    Nomor tes diperoleh dari panitia ujian secara fisik
                  </p>
                </div>
              )}

              <Button
                onClick={handleStartExam}
                fullWidth
                disabled={startingExam || (exam.sebRequired && !usingSEB && !isMobile) || !cameraPreviewTested || !!cameraPreviewError}
              >
                {startingExam ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Maximize className="w-5 h-5 mr-2" />
                )}
                {startingExam ? 'Mempersiapkan…' : 'Mulai Ujian'}
              </Button>
              {(!cameraPreviewTested || !!cameraPreviewError) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center -mt-1">
                  {!cameraPreviewTested
                    ? '⚠️ Tes kamera terlebih dahulu sebelum memulai ujian'
                    : '⚠️ Kamera gagal diakses. Izinkan kamera untuk memulai ujian.'}
                </p>
              )}
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
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-shrink">
              <h1 className="font-semibold text-slate-800 dark:text-white text-sm sm:text-base truncate">{exam.title}</h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Soal {currentQuestion + 1}/{questions.length}</p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              {/* --- SAVE STATUS INDICATOR --- */}
              {answerQueue.errorCount > 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" title={`${answerQueue.errorCount} jawaban gagal disimpan`}>
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-medium">Gagal Save ({answerQueue.errorCount})</span>
                </div>
              ) : answerQueue.isSaving || answerQueue.pendingCount > 0 ? (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs sm:text-sm font-medium">Menyimpan...</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 opacity-60">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs sm:text-sm font-medium hidden sm:inline">Tersimpan</span>
                </div>
              )}

              <div className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm ${
                timeRemaining < 300 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-muted text-slate-700 dark:text-slate-300'
              }`}>
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                <span className="font-mono font-bold">{formatTime(timeRemaining)}</span>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg ${
                isCameraActive 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                  : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              }`}>
                {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                <span className="text-xs sm:text-sm font-medium hidden sm:inline">{isCameraActive ? 'Kamera' : 'Mati'}</span>
              </div>
              {violationCount > 0 && (
                <div className="flex items-center gap-1 text-red-600 dark:text-red-400 px-2 py-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                    {violationCount}{maxViolations ? `/${maxViolations}` : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="lg:col-span-3">
            <Card className="p-4 sm:p-6">
              {/* Passage / Cerita Soal */}
              {question?.passage && (
                <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Bacaan</span>
                  <MathText text={question.passage} as="p" className="text-sm text-slate-700 dark:text-slate-300 mt-2 whitespace-pre-line leading-relaxed" />
                </div>
              )}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Soal {question?.number || currentQuestion + 1}</span>
                  <MathText text={question?.text || 'Soal tidak tersedia'} as="h2" className="text-lg font-semibold text-slate-900 dark:text-white mt-1 whitespace-pre-line" />
                  {question?.image && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => openImagePreview(question.image, 'Gambar soal', `Gambar Soal ${question?.number || currentQuestion + 1}`)}
                        className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                        aria-label="Lihat gambar soal lebih besar"
                      >
                        <Image
                          src={getSecureFileUrl(question.image)}
                          alt="Gambar Soal"
                          width={1200}
                          height={800}
                          className="max-w-full h-auto max-h-80 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in transition-transform duration-200 hover:scale-[1.01]"
                          unoptimized
                        />
                      </button>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Klik gambar untuk melihat detail lebih besar.</p>
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
              {isAnswerFrozen && (
                <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-700 dark:text-amber-300">
                  Aktivitas mencurigakan terdeteksi. Input jawaban dibekukan sementara ({policyAction}).
                </div>
              )}
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
                        disabled={isAnswerFrozen}
                        className="w-4 h-4 text-teal-600 accent-teal-600 mt-0.5"
                      />
                      <span className={`ml-3 font-semibold mt-0.5 ${
                        answers[question.id] === option.text
                          ? 'text-teal-800 dark:text-teal-300'
                          : 'text-slate-900 dark:text-slate-200'
                      }`}>{String.fromCharCode(65 + index)}.</span>
                      <div className="ml-2 flex-1">
                        {option.text && !/^\[Gambar [A-Z]\]$/.test(option.text) && (
                          <MathText text={option.text} className={`${
                            answers[question.id] === option.text
                              ? 'text-teal-700 dark:text-teal-300 font-medium'
                              : 'text-slate-800 dark:text-slate-300'
                          }`} />
                        )}
                        {option.image && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openImagePreview(
                                option.image,
                                `Gambar opsi ${String.fromCharCode(65 + index)}`,
                                `Soal ${question?.number || currentQuestion + 1} - Opsi ${String.fromCharCode(65 + index)}`
                              );
                            }}
                            className="mt-2 block rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                            aria-label={`Lihat gambar opsi ${String.fromCharCode(65 + index)} lebih besar`}
                          >
                            <Image
                              src={getSecureFileUrl(option.image)}
                              alt={`Gambar opsi ${String.fromCharCode(65 + index)}`}
                              width={800}
                              height={480}
                              className="max-w-full h-auto max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in transition-transform duration-200 hover:scale-[1.01]"
                              unoptimized
                            />
                          </button>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {question?.type === 'multiple_answer' && question.options && (
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-3 font-medium">Pilih semua jawaban yang benar (bisa lebih dari satu)</p>
                  <div className="space-y-3">
                    {question.options.map((option, index) => {
                      const selected = isMultipleAnswerSelected(question.id, option.text);
                      return (
                        <label
                          key={index}
                          className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                            selected
                              ? 'border-teal-500 bg-teal-100 dark:bg-teal-900/30 dark:border-teal-400'
                              : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => handleMultipleAnswerToggle(question.id, option.text)}
                            disabled={isAnswerFrozen}
                            className="w-4 h-4 text-teal-600 accent-teal-600 mt-0.5 rounded"
                          />
                          <span className={`ml-3 font-semibold mt-0.5 ${
                            selected
                              ? 'text-teal-800 dark:text-teal-300'
                              : 'text-slate-900 dark:text-slate-200'
                          }`}>{String.fromCharCode(65 + index)}.</span>
                          <div className="ml-2 flex-1">
                            {option.text && !/^\[Gambar [A-Z]\]$/.test(option.text) && (
                              <MathText text={option.text} className={`${
                                selected
                                  ? 'text-teal-700 dark:text-teal-300 font-medium'
                                  : 'text-slate-800 dark:text-slate-300'
                              }`} />
                            )}
                            {option.image && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  openImagePreview(
                                    option.image,
                                    `Gambar opsi ${String.fromCharCode(65 + index)}`,
                                    `Soal ${question?.number || currentQuestion + 1} - Opsi ${String.fromCharCode(65 + index)}`
                                  );
                                }}
                                className="mt-2 block rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                                aria-label={`Lihat gambar opsi ${String.fromCharCode(65 + index)} lebih besar`}
                              >
                                <Image
                                  src={getSecureFileUrl(option.image)}
                                  alt={`Gambar opsi ${String.fromCharCode(65 + index)}`}
                                  width={800}
                                  height={480}
                                  className="max-w-full h-auto max-h-48 rounded-lg border border-slate-200 dark:border-slate-700 cursor-zoom-in transition-transform duration-200 hover:scale-[1.01]"
                                  unoptimized
                                />
                              </button>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {question?.type === 'essay' && (
                <textarea
                  value={answers[question.id] || ''}
                  onChange={(e) => handleAnswer(question.id, e.target.value)}
                  placeholder="Tulis jawaban Anda di sini…"
                  rows={6}
                  disabled={isAnswerFrozen}
                  className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  name={`essay-${question.id}`}
                  aria-label="Jawaban essay"
                />
              )}

              {question?.type === 'essay' && (
                <>
                  {/* Work photo (foto cara kerja) */}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <input
                      ref={workPhotoInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleWorkPhotoChange}
                      className="hidden"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleWorkPhotoClick(question.id)}
                        disabled={uploadingPhoto === question.id}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/50 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors disabled:opacity-50"
                      >
                        {uploadingPhoto === question.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4" />
                        )}
                        {uploadingPhoto === question.id ? 'Mengupload...' : workPhotos[question.id] ? 'Ganti Foto' : 'Foto Cara Kerja'}
                      </button>
                      {workPhotos[question.id] && (
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Foto terupload
                        </span>
                      )}
                    </div>
                    {workPhotos[question.id] && (
                      <div className="mt-2">
                        <Image
                          src={getSecureFileUrl(workPhotos[question.id])}
                          alt="Foto cara kerja"
                          width={800}
                          height={480}
                          className="max-w-full h-auto max-h-48 rounded-lg border border-slate-200 dark:border-slate-700"
                          unoptimized
                        />
                      </div>
                    )}
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
                      📸 Foto cara kerja/coretan Anda untuk soal ini (opsional)
                    </p>
                  </div>
                </>
              )}
            </Card>
            <div className="flex items-center justify-between mt-6 gap-2">
              <Button
                variant="outline"
                onClick={() => setCurrentQuestion((prev) => Math.max(0, prev - 1))}
                disabled={currentQuestion === 0}
                className="text-xs sm:text-sm"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Sebelumnya</span>
                <span className="sm:hidden">Prev</span>
              </Button>
              <span className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{answeredCount}/{questions.length}</span>
              {currentQuestion === questions.length - 1 ? (
                <Button onClick={handleSubmit} disabled={submitting || !canManualSubmit} className="text-xs sm:text-sm">
                  {submitting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 animate-spin" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />}
                  Kumpulkan
                </Button>
              ) : (
                <Button onClick={() => setCurrentQuestion((prev) => Math.min(questions.length - 1, prev + 1))} className="text-xs sm:text-sm">
                  <span className="hidden sm:inline">Selanjutnya</span>
                  <span className="sm:hidden">Next</span>
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-1 sm:ml-2" />
                </Button>
              )}
            </div>
            {!canManualSubmit && (
              <p className="mt-2 text-right text-[11px] text-amber-600 dark:text-amber-300">
                Kumpulkan aktif saat sisa waktu 10 menit terakhir. Tersedia dalam {formatMinutesSeconds(timeRemaining - 600)}.
              </p>
            )}
          </div>
          <div className="lg:col-span-1">
            <Card className="p-4 sticky top-20">
              <h3 className="font-semibold text-slate-800 dark:text-white mb-4">Navigasi Soal</h3>
              <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar pb-2">
                {questions.map((q, index) => {
                  const hasAnswer = answers[q.id] && String(answers[q.id]).trim() !== '' && answers[q.id] !== '[]';
                  const isFlagged = flaggedQuestions.has(q.number);
                  const isCurrent = currentQuestion === index;
                  const saveStatus = answerQueue.saveStatuses[q.id];

                  // Base colors depending on answer status
                  let btnColor = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700';
                  
                  if (saveStatus === 'error') {
                    btnColor = 'bg-red-100/80 dark:bg-red-900/40 text-red-700 border border-red-300';
                  } else if (hasAnswer) {
                    btnColor = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50';
                  }

                  // If it's the current question, override styling
                  if (isCurrent) {
                    btnColor = 'bg-teal-500 text-white shadow-md ring-2 ring-teal-500/30';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestion(index)}
                      className={`relative aspect-square w-full rounded-lg flex flex-col items-center justify-center font-medium transition-all duration-200 ${btnColor} ${isFlagged && !isCurrent ? 'ring-2 ring-yellow-400' : ''}`}
                    >
                      <span className="text-sm">{q.number || index + 1}</span>
                      
                      {/* Sub-indicators container */}
                      <div className="flex gap-1 mt-0.5">
                        {saveStatus === 'error' && (
                          <AlertTriangle className={`w-2.5 h-2.5 ${isCurrent ? 'text-red-200' : 'text-red-600'}`} />
                        )}
                        {saveStatus === 'saving' && (
                          <Loader2 className={`w-2 h-2 animate-spin ${isCurrent ? 'text-white/70' : 'text-amber-600'}`} />
                        )}
                      </div>
                    </button>
                  );
                })}
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
                  <div className="flex flex-col items-end gap-1">
                    {isCameraActive ? (
                      <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400">
                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                        Kamera Aktif
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-red-500">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                        Kamera Mati
                      </span>
                    )}
                    <span className={`flex items-center gap-1 text-[10px] ${
                      examSocket.isConnected
                        ? 'text-cyan-600 dark:text-cyan-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        examSocket.isConnected
                          ? 'bg-cyan-500 animate-pulse'
                          : 'bg-amber-500'
                      }`} />
                      {examSocket.isConnected ? 'Sinkronisasi Live Aktif' : 'Sinkronisasi Live Terputus'}
                    </span>
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
                  {isCameraActive && !snapshotMonitoringEnabled && (
                    <div className="absolute bottom-1 left-1 right-1">
                      <span className="block text-[9px] px-1.5 py-0.5 rounded bg-slate-700/85 text-white text-center">
                        Snapshot dimatikan admin
                      </span>
                    </div>
                  )}
                  {isCameraActive && snapshotMonitoringEnabled && snapshotStatus !== 'idle' && (
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
                  {isCameraActive && snapshotMonitoringEnabled && (snapshotSuccessCount > 0 || snapshotFailCount > 0) && (
                    <div className="absolute top-1 right-1 text-[8px] bg-black/50 text-white px-1.5 py-0.5 rounded backdrop-blur-sm">
                      ✓{snapshotSuccessCount} ✗{snapshotFailCount}
                    </div>
                  )}
                  {/* Auto-restart indicator */}
                  {snapshotMonitoringEnabled && consecutiveSnapshotFails >= 3 && (
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

      <Modal
        isOpen={Boolean(imagePreview)}
        onClose={closeImagePreview}
        title={imagePreview?.title || 'Pratinjau Gambar'}
        size="full"
      >
        {imagePreview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
              <span className="text-xs text-slate-600 dark:text-slate-300">Zoom: {Math.round(imagePreviewZoom * 100)}%</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={zoomOutImagePreview}
                  disabled={imagePreviewZoom <= MIN_IMAGE_PREVIEW_ZOOM}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  Kecilkan
                </button>
                <button
                  type="button"
                  onClick={resetImagePreviewZoom}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  type="button"
                  onClick={zoomInImagePreview}
                  disabled={imagePreviewZoom >= MAX_IMAGE_PREVIEW_ZOOM}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  Besarkan
                </button>
              </div>
            </div>
            <div className="w-full max-h-[75vh] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-2 sm:p-3">
              <div className="min-h-[220px] flex items-start justify-center">
                <Image
                  src={imagePreview.src}
                  alt={imagePreview.alt}
                  width={1800}
                  height={1200}
                  className="h-auto max-w-none rounded-lg transition-[width] duration-200"
                  style={{ width: `${Math.round(imagePreviewZoom * 100)}%` }}
                  unoptimized
                />
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              Gunakan tombol zoom untuk melihat detail. Tekan ESC atau klik area luar untuk menutup pratinjau.
            </p>
          </div>
        )}
      </Modal>

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
