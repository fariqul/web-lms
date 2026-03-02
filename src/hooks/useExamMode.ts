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
  consecutiveSnapshotFails: number;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => void;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  restartCamera: () => Promise<void>;
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
  snapshotInterval = 30,
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
  // Track fullscreen transition — suppress blur/visibility violations during transition
  const fullscreenTransitionRef = useRef(false);
  // Debounce rapid-fire violation reports on mobile
  const lastViolationTimeRef = useRef(0);
  const VIOLATION_DEBOUNCE_MS = 2000;
  // Track consecutive snapshot failures for auto-restart
  const [consecutiveSnapshotFails, setConsecutiveSnapshotFails] = useState(0);
  const consecutiveFailsRef = useRef(0);
  // Upload retry queue — max 3 blobs in memory
  const retryQueueRef = useRef<Blob[]>([]);
  const MAX_RETRY_QUEUE = 3;

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
    // Longer delay to avoid false positives during fullscreen transition & camera permission dialog
    setTimeout(() => {
      monitoringActiveRef.current = true;
      fullscreenTransitionRef.current = false;
      console.log('[Monitoring] Anti-cheat monitoring activated');
    }, 5000);
  }, []);

  // Fullscreen management
  const enterFullscreen = useCallback(async () => {
    // Mark transition — suppress blur/visibility violations during fullscreen request
    fullscreenTransitionRef.current = true;
    
    try {
      // On mobile, fullscreen API may not work — that's OK
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
      isFullscreenRef.current = true;
    } catch (error) {
      console.error('Fullscreen request failed:', error);
      // Treat as "fullscreen" even if API fails — don't penalize the student
      // This commonly happens when the fullscreen request isn't from a direct user gesture
      // (e.g., after async API call) or on mobile devices
      setIsFullscreen(true);
      isFullscreenRef.current = true;
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

  // Camera management with retry — lowered to 320×240 for performance
  const cameraRetryRef = useRef(0);
  const MAX_CAMERA_RETRIES = 3;

  // Virtual camera detection patterns
  const VIRTUAL_CAMERA_PATTERNS = [
    'obs', 'virtual', 'droidcam', 'manycam', 'snap camera', 'xsplit',
    'camtwist', 'e2esoft', 'splitcam', 'youcam', 'epoccam', 'iriun',
    'camo', 'kinoni', 'ndi', 'newtek', 'mmhmm', 'streamlabs',
    'virtual cam', 'vcam', 'fake', 'screen capture',
  ];

  const isVirtualCamera = useCallback((label: string): boolean => {
    const lower = label.toLowerCase();
    return VIRTUAL_CAMERA_PATTERNS.some(p => lower.includes(p));
  }, []);

  const startCamera = useCallback(async () => {
    try {
      console.log('[Camera] Requesting camera access (320×240)...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
        },
        audio: false,
      });

      // Check for virtual camera
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const label = videoTrack.label || '';
        console.log('[Camera] Device label:', label);
        if (isVirtualCamera(label)) {
          console.warn('[Camera] Virtual camera detected:', label);
          reportViolation('virtual_camera', `Kamera virtual terdeteksi: ${label}`);
        }
      }

      // Also check all available video devices for suspicious labels
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const virtualDevices = videoDevices.filter(d => isVirtualCamera(d.label));
        if (virtualDevices.length > 0) {
          console.warn('[Camera] Virtual camera devices found:', virtualDevices.map(d => d.label));
          // Only report if the active device isn't already reported
          if (!isVirtualCamera(videoTrack?.label || '')) {
            reportViolation('virtual_camera', `Software kamera virtual terdeteksi di perangkat`);
          }
        }
      } catch {
        // enumerateDevices may fail in some browsers, not critical
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      streamRef.current = stream;
      setIsCameraActive(true);
      cameraRetryRef.current = 0;
      consecutiveFailsRef.current = 0;
      setConsecutiveSnapshotFails(0);
      console.log('[Camera] Camera started successfully');
    } catch (error) {
      console.error('[Camera] Camera access failed:', error);
      cameraRetryRef.current += 1;
      
      if (cameraRetryRef.current < MAX_CAMERA_RETRIES) {
        console.log(`[Camera] Retrying... (${cameraRetryRef.current}/${MAX_CAMERA_RETRIES})`);
        setTimeout(() => {
          startCamera();
        }, cameraRetryRef.current * 2000);
      } else {
        console.error('[Camera] All retries exhausted');
        reportViolation('camera_off', 'Kamera tidak dapat diakses');
      }
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

  // Restart camera — stop existing stream and re-acquire
  const restartCamera = useCallback(async () => {
    console.log('[Camera] Restarting camera...');
    stopCamera();
    cameraRetryRef.current = 0;
    // Small delay to let hardware release
    await new Promise(r => setTimeout(r, 500));
    await startCamera();
    consecutiveFailsRef.current = 0;
    setConsecutiveSnapshotFails(0);
  }, [stopCamera, startCamera]);

  // Flush retry queue — attempt to upload queued snapshots
  const flushRetryQueue = useCallback(async () => {
    while (retryQueueRef.current.length > 0) {
      const blob = retryQueueRef.current[0];
      try {
        await monitoringAPI.uploadSnapshotBlob(examId, blob);
        retryQueueRef.current.shift(); // Remove on success
        console.log(`[Snapshot] Retry queue flush success, remaining: ${retryQueueRef.current.length}`);
      } catch {
        // Stop flushing on first failure
        break;
      }
    }
  }, [examId]);

  // Capture snapshot — single robust canvas-based method
  const captureSnapshot = useCallback(async (): Promise<string | null> => {
    if (!videoRef.current || !isCameraActive) {
      console.warn('[Snapshot] Skipped: videoRef or camera not active');
      return null;
    }

    const video = videoRef.current;
    const stream = video.srcObject as MediaStream | null;
    if (!stream) {
      console.warn('[Snapshot] Skipped: no srcObject on video');
      return null;
    }

    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') {
      console.warn('[Snapshot] Skipped: no live video track');
      // Count as failure for auto-restart
      consecutiveFailsRef.current += 1;
      setConsecutiveSnapshotFails(consecutiveFailsRef.current);
      return null;
    }

    try {
      // Wait for a fresh frame before drawing
      await new Promise<void>((resolve) => {
        if ('requestVideoFrameCallback' in video) {
          (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void })
            .requestVideoFrameCallback(() => resolve());
        } else {
          requestAnimationFrame(() => resolve());
        }
        // Safety timeout — don't wait forever
        setTimeout(resolve, 300);
      });

      // Use small canvas: 320×240 for lightweight snapshots
      const w = Math.min(video.videoWidth || 320, 320);
      const h = Math.min(video.videoHeight || 240, 240);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      // willReadFrequently: true → forces software-backed canvas (CPU rendering)
      // This avoids GPU driver issues on school lab PCs with generic drivers
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('No 2d context');

      ctx.drawImage(video, 0, 0, w, h);

      // Verify the frame has actual content (not black/blank)
      const pixels = ctx.getImageData(0, 0, w, h).data;
      let nonBlackPixels = 0;
      const sampleStep = Math.max(1, Math.floor(pixels.length / 400)); // Sample ~100 pixels
      for (let i = 0; i < pixels.length; i += sampleStep * 4) {
        if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) {
          nonBlackPixels++;
        }
      }

      if (nonBlackPixels < 5) {
        console.warn('[Snapshot] Frame appears blank/black — skipping');
        consecutiveFailsRef.current += 1;
        setConsecutiveSnapshotFails(consecutiveFailsRef.current);
        return null;
      }

      // Convert to JPEG blob at 60% quality
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.6);
      });

      if (!blob || blob.size < 500) {
        console.warn('[Snapshot] toBlob produced invalid result');
        consecutiveFailsRef.current += 1;
        setConsecutiveSnapshotFails(consecutiveFailsRef.current);
        return null;
      }

      // Try to upload
      try {
        await monitoringAPI.uploadSnapshotBlob(examId, blob);
        console.log(`[Snapshot] Upload success: ${Math.round(blob.size / 1024)}KB (${w}×${h})`);
        consecutiveFailsRef.current = 0;
        setConsecutiveSnapshotFails(0);

        // Also flush any queued retries
        if (retryQueueRef.current.length > 0) {
          flushRetryQueue();
        }
        return 'captured';
      } catch (uploadError: unknown) {
        console.warn('[Snapshot] Upload failed, queuing for retry:', uploadError);
        // Log validation errors for debugging
        if (uploadError && typeof uploadError === 'object' && 'response' in uploadError) {
          const axiosErr = uploadError as { response?: { data?: { errors?: Record<string, string[]> } } };
          if (axiosErr.response?.data?.errors) {
            console.warn('[Snapshot] Validation errors:', axiosErr.response.data.errors);
          }
        }
        // Add to retry queue (max 3)
        if (retryQueueRef.current.length < MAX_RETRY_QUEUE) {
          retryQueueRef.current.push(blob);
        } else {
          // Drop oldest, add newest
          retryQueueRef.current.shift();
          retryQueueRef.current.push(blob);
        }
        throw uploadError;
      }
    } catch (error) {
      console.error('[Snapshot] Failed:', error);
      consecutiveFailsRef.current += 1;
      setConsecutiveSnapshotFails(consecutiveFailsRef.current);
      throw error;
    }
  }, [examId, isCameraActive, flushRetryQueue]);

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
      if (document.hidden && monitoringActiveRef.current && !fullscreenTransitionRef.current) {
        reportViolation('tab_switch', 'Pindah tab/aplikasi');
      }
    };

    // Window blur/focus — more reliable on mobile for app switching
    const handleWindowBlur = () => {
      if (monitoringActiveRef.current && !fullscreenTransitionRef.current) {
        reportViolation('tab_switch', 'Keluar dari halaman ujian');
      }
    };

    // pagehide — Safari mobile fallback (fires when user switches apps)
    const handlePageHide = (e: PageTransitionEvent) => {
      if (!e.persisted && monitoringActiveRef.current) {
        // Page is actually being unloaded, not just hidden
        return;
      }
      if (monitoringActiveRef.current && !fullscreenTransitionRef.current) {
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

  // Camera health check + auto-restart on consecutive snapshot failures
  useEffect(() => {
    if (enableCamera && isCameraActive) {
      // Camera status check — detect if camera is turned off
      const checkCamera = setInterval(() => {
        if (streamRef.current) {
          const videoTrack = streamRef.current.getVideoTracks()[0];
          if (!videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended') {
            reportViolation('camera_off', 'Kamera dimatikan');
          }
        }
        // Auto-restart camera after 5 consecutive snapshot failures
        if (consecutiveFailsRef.current >= 5) {
          console.warn('[Camera] 5 consecutive snapshot failures — auto-restarting camera');
          restartCamera();
        }
      }, 5000);

      return () => {
        clearInterval(checkCamera);
      };
    }
  }, [enableCamera, isCameraActive, reportViolation, restartCamera]);

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
    consecutiveSnapshotFails,
    enterFullscreen,
    exitFullscreen,
    startCamera,
    stopCamera,
    restartCamera,
    captureSnapshot,
    activateMonitoring,
    videoRef,
  };
}
