'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { monitoringAPI } from '@/services/api';

interface UseExamModeOptions {
  examId: number;
  onViolation?: (type: string) => void;
  onForceSubmit?: () => void;
  enableCamera?: boolean;
  snapshotInterval?: number; // in seconds
}

interface UseExamModeReturn {
  isFullscreen: boolean;
  isCameraActive: boolean;
  isMobile: boolean;
  violations: string[];
  violationCount: number;
  maxViolations: number | null;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  captureSnapshot: () => Promise<string | null>;
  activateMonitoring: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

// Detect mobile device
function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 2)
    || (window.innerWidth <= 768);
}

export function useExamMode({
  examId,
  onViolation,
  onForceSubmit,
  enableCamera = true,
  snapshotInterval = 60,
}: UseExamModeOptions): UseExamModeReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMobile] = useState(() => detectMobile());
  const [violations, setViolations] = useState<string[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const [maxViolations, setMaxViolations] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track whether anti-cheat monitoring is active
  const monitoringActiveRef = useRef(false);
  // Track fullscreen state via ref to avoid stale closure in event handlers
  const isFullscreenRef = useRef(false);
  // Debounce rapid-fire violation reports on mobile
  const lastViolationTimeRef = useRef(0);
  const VIOLATION_DEBOUNCE_MS = 2000;

  // Report violation to server (with debounce for mobile)
  const reportViolation = useCallback(async (type: string, description?: string) => {
    // Only report violations once monitoring is active
    if (!monitoringActiveRef.current) return;
    
    // Debounce rapid violations (mobile fires multiple events)
    const now = Date.now();
    if (now - lastViolationTimeRef.current < VIOLATION_DEBOUNCE_MS) return;
    lastViolationTimeRef.current = now;
    
    try {
      const response = await monitoringAPI.reportViolation({
        exam_id: examId,
        type,
        description,
      });
      
      const data = response.data?.data;
      if (data) {
        setViolationCount(data.violation_count);
        setMaxViolations(data.max_violations);
        
        // Force submit if max violations exceeded
        if (data.force_submit) {
          onForceSubmit?.();
          return;
        }
      }
      
      setViolations(prev => [...prev, type]);
      onViolation?.(type);
    } catch (error) {
      console.error('Failed to report violation:', error);
    }
  }, [examId, onViolation, onForceSubmit]);

  // Activate monitoring — can be called independently of fullscreen
  const activateMonitoring = useCallback(() => {
    if (monitoringActiveRef.current) return;
    // Small delay to avoid immediate false positives
    setTimeout(() => {
      monitoringActiveRef.current = true;
    }, 1500);
  }, []);

  // Fullscreen management
  const enterFullscreen = useCallback(async () => {
    try {
      // On mobile, fullscreen API may not work — that's OK
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
      isFullscreenRef.current = true;
    } catch (error) {
      console.error('Fullscreen request failed (expected on mobile):', error);
      // On mobile, treat as "fullscreen" even if API fails
      if (isMobile) {
        setIsFullscreen(true);
        isFullscreenRef.current = true;
      }
    }
    // Always activate monitoring regardless of fullscreen success
    activateMonitoring();
  }, [isMobile, activateMonitoring]);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    setIsFullscreen(false);
    isFullscreenRef.current = false;
  }, []);

  // Camera management
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (error) {
      console.error('Camera access failed:', error);
      reportViolation('camera_off', 'Kamera tidak dapat diakses');
    }
  }, [reportViolation]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Capture snapshot
  const captureSnapshot = useCallback(async (): Promise<string | null> => {
    if (!videoRef.current || !isCameraActive) return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      ctx.drawImage(videoRef.current, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.7);
      
      // Upload snapshot to server
      await monitoringAPI.uploadSnapshot({
        exam_id: examId,
        photo: base64,
      });
      
      return base64;
    } catch (error) {
      console.error('Snapshot capture failed:', error);
      return null;
    }
  }, [examId, isCameraActive]);

  // Event listeners for anti-cheat
  useEffect(() => {
    // Fullscreen change detection — use ref to avoid dependency on isFullscreen state
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      
      // Report violation only if monitoring is active and was previously fullscreen
      // Skip on mobile since fullscreen API is unreliable
      if (!isMobile && !isNowFullscreen && isFullscreenRef.current && monitoringActiveRef.current) {
        reportViolation('fullscreen_exit', 'Keluar dari mode fullscreen');
      }
      isFullscreenRef.current = isNowFullscreen;
    };

    // Tab visibility change detection (works on both mobile & desktop)
    const handleVisibilityChange = () => {
      if (document.hidden && monitoringActiveRef.current) {
        reportViolation('tab_switch', 'Pindah tab/aplikasi');
      }
    };

    // Window blur/focus — more reliable on mobile for app switching
    const handleWindowBlur = () => {
      if (monitoringActiveRef.current) {
        reportViolation('tab_switch', 'Keluar dari halaman ujian');
      }
    };

    // pagehide — Safari mobile fallback (fires when user switches apps)
    const handlePageHide = (e: PageTransitionEvent) => {
      if (!e.persisted && monitoringActiveRef.current) {
        // Page is actually being unloaded, not just hidden
        return;
      }
      if (monitoringActiveRef.current) {
        reportViolation('tab_switch', 'Meninggalkan halaman ujian');
      }
    };

    // Copy/Paste prevention
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('copy_paste', 'Mencoba menyalin teks');
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('copy_paste', 'Mencoba menempel teks');
    };

    // Context menu prevention (long-press on mobile)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Touch selection prevention on mobile
    const handleSelectStart = (e: Event) => {
      if (monitoringActiveRef.current) {
        e.preventDefault();
      }
    };

    // Key combination prevention
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent common shortcuts
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'a' || e.key === 'p')) ||
        (e.altKey && e.key === 'Tab') ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && e.key === 'i')
      ) {
        e.preventDefault();
        reportViolation('copy_paste', `Shortcut terlarang: ${e.key}`);
      }
    };

    // Multi-touch detection (possible screenshot gesture on mobile)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3 && monitoringActiveRef.current) {
        reportViolation('screenshot_attempt', 'Gerakan multi-touch terdeteksi (kemungkinan screenshot)');
      }
    };

    // Add event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });

    // Cleanup
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, [reportViolation, isMobile]);

  // Camera monitoring & snapshot interval
  useEffect(() => {
    if (enableCamera && isCameraActive) {
      // Periodic snapshot
      snapshotIntervalRef.current = setInterval(() => {
        captureSnapshot();
      }, snapshotInterval * 1000);

      // Camera status check
      const checkCamera = setInterval(() => {
        if (streamRef.current) {
          const videoTrack = streamRef.current.getVideoTracks()[0];
          if (!videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended') {
            reportViolation('camera_off', 'Kamera dimatikan');
          }
        }
      }, 5000);

      return () => {
        if (snapshotIntervalRef.current) {
          clearInterval(snapshotIntervalRef.current);
        }
        clearInterval(checkCamera);
      };
    }
  }, [enableCamera, isCameraActive, snapshotInterval, captureSnapshot, reportViolation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      monitoringActiveRef.current = false;
      stopCamera();
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
    };
  }, [stopCamera]);

  return {
    isFullscreen,
    isCameraActive,
    isMobile,
    violations,
    violationCount,
    maxViolations,
    enterFullscreen,
    exitFullscreen,
    startCamera,
    stopCamera,
    captureSnapshot,
    activateMonitoring,
    videoRef,
  };
}
