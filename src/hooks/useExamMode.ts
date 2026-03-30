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
  suppressViolations: (durationMs: number) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

// Detect mobile device
function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 2)
    || (window.innerWidth <= 768);
}

function detectIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua);
}

// Get initial window dimensions for split screen detection
function getInitialDimensions() {
  if (typeof window === 'undefined') return { width: 0, height: 0, ratio: 0 };
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: window.innerWidth / window.innerHeight,
  };
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
  const [isIOS] = useState(() => detectIOS());
  const [violations, setViolations] = useState<string[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const [maxViolations, setMaxViolations] = useState<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track whether anti-cheat monitoring is active
  const monitoringActiveRef = useRef(false);
  // Track fullscreen state via ref to avoid stale closure in event handlers
  // Suppress violations temporarily (e.g., during work photo capture)
  const suppressUntilRef = useRef(0);
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
  // Track when snapshot is being captured (suppress camera health check)
  const snapshotInProgressRef = useRef(false);
  // Grace period after snapshot (milliseconds) — some phones need time to recover camera
  const snapshotGraceUntilRef = useRef(0);
  const SNAPSHOT_GRACE_MS = 3000; // 3 second grace period after snapshot
  
  // Mobile security: track initial window dimensions for split screen detection
  const initialDimensionsRef = useRef(getInitialDimensions());
  // Track if split screen warning was already shown (avoid spam)
  const splitScreenWarnedRef = useRef(false);
  // Track last known good dimensions
  const lastGoodDimensionsRef = useRef(getInitialDimensions());
  // Track focus state for floating app detection
  const windowFocusedRef = useRef(true);
  // Track resize events for suspicious patterns
  const resizeCountRef = useRef(0);
  const lastResizeTimeRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

  // Capture a quick snapshot blob from camera (for violation reports)
  const captureViolationBlob = useCallback((): Blob | null => {
    if (!videoRef.current || !isCameraActive) return null;
    const video = videoRef.current;
    const stream = video.srcObject as MediaStream | null;
    if (!stream) return null;
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') return null;
    try {
      const w = Math.min(video.videoWidth || 320, 320);
      const h = Math.min(video.videoHeight || 240, 240);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);
      // Set short grace period after canvas draw (some phones need recovery time)
      snapshotGraceUntilRef.current = Date.now() + 1500; // 1.5 seconds for quick capture
      // Synchronous conversion to blob via toDataURL
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      const byteString = atob(dataUrl.split(',')[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      return new Blob([ab], { type: 'image/jpeg' });
    } catch {
      return null;
    }
  }, [isCameraActive]);

  // Report violation to server (with debounce for mobile)
  const reportViolation = useCallback(async (type: string, description?: string) => {
    // Only report violations once monitoring is active
    if (!monitoringActiveRef.current) return;
    
    // Skip if violations are temporarily suppressed (e.g., work photo capture)
    if (Date.now() < suppressUntilRef.current) return;
    
    // Debounce rapid violations (mobile fires multiple events)
    const now = Date.now();
    if (now - lastViolationTimeRef.current < VIOLATION_DEBOUNCE_MS) return;
    lastViolationTimeRef.current = now;
    
    // Capture a camera snapshot to attach with the violation
    const screenshotBlob = captureViolationBlob();
    
    try {
      const response = await monitoringAPI.reportViolation({
        exam_id: examId,
        type,
        description,
        screenshot: screenshotBlob || undefined,
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
  }, [examId, onViolation, onForceSubmit, captureViolationBlob]);

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

  // Suppress violation reporting temporarily (for work photo capture on mobile)
  // Also extends camera health check grace period to prevent false "camera_off" violations
  const suppressViolations = useCallback((durationMs: number) => {
    const until = Date.now() + durationMs;
    suppressUntilRef.current = until;
    // Also suppress camera health check — native camera app will take over camera resource
    snapshotGraceUntilRef.current = until;
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
  const cameraRestartAttemptsRef = useRef(0); // Track auto-restart attempts for ended tracks
  const MAX_CAMERA_RETRIES = 3;
  const MAX_AUTO_RESTART_ATTEMPTS = 3; // Max auto-restart before reporting violation

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
      // If we already have an active stream with working tracks, don't request again
      if (streamRef.current) {
        const existingTrack = streamRef.current.getVideoTracks()[0];
        if (existingTrack && existingTrack.readyState === 'live' && existingTrack.enabled) {
          console.log('[Camera] Stream already active, skipping re-request');
          setIsCameraActive(true);
          return;
        }
        // Stream exists but track is dead, clean it up first
        console.log('[Camera] Existing stream has dead track, cleaning up...');
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      // Check permission status first (to avoid popup on denied state)
      if (navigator.permissions) {
        try {
          const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          console.log('[Camera] Permission status:', permissionStatus.state);
          if (permissionStatus.state === 'denied') {
            console.warn('[Camera] Permission denied, cannot request camera');
            if (cameraRetryRef.current >= MAX_CAMERA_RETRIES) {
              reportViolation('camera_off', 'Izin kamera ditolak');
            }
            return;
          }
        } catch {
          // Some browsers don't support permission query for camera
        }
      }

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
        
        // Listen for track ended event to trigger auto-restart instead of violation
        videoTrack.onended = () => {
          console.log('[Camera] Video track ended event fired');
          // Don't immediately report violation - camera health check will handle restart
        };
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
      cameraRestartAttemptsRef.current = 0; // Reset restart counter on successful start
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
  // Add longer delay and suppress violations during restart to avoid false positives
  const restartCamera = useCallback(async () => {
    console.log('[Camera] Restarting camera...');
    
    // Suppress violations during camera restart (avoid blur/visibility false positives)
    const suppressUntil = Date.now() + 8000; // 8 seconds grace period
    suppressUntilRef.current = suppressUntil;
    snapshotGraceUntilRef.current = suppressUntil; // Also suppress camera health check
    
    stopCamera();
    cameraRetryRef.current = 0;
    cameraRestartAttemptsRef.current = 0; // Reset restart attempts
    
    // Longer delay to let hardware fully release (important on mobile after native camera app)
    await new Promise(r => setTimeout(r, 1500));
    
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

    // Mark snapshot in progress to suppress camera health check
    snapshotInProgressRef.current = true;
    
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

      // Use canvas: 640×480 for reliable AI face detection
      const w = Math.min(video.videoWidth || 640, 640);
      const h = Math.min(video.videoHeight || 480, 480);

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

      // Convert to JPEG blob at 70% quality for AI proctoring
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.7);
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
    } finally {
      // Always clear snapshot in progress flag and set grace period
      snapshotInProgressRef.current = false;
      snapshotGraceUntilRef.current = Date.now() + SNAPSHOT_GRACE_MS;
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
      if (!monitoringActiveRef.current || fullscreenTransitionRef.current) return;

      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Only report after returning if hidden duration is meaningful.
      if (hiddenAtRef.current) {
        const hiddenDurationMs = Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
        const thresholdMs = isIOS ? 8000 : 1200;
        if (hiddenDurationMs >= thresholdMs) {
          reportViolation('tab_switch', 'Pindah tab/aplikasi');
        }
      }
    };

    // Window blur/focus — more reliable on mobile for app switching
    const handleWindowBlur = () => {
      windowFocusedRef.current = false;
      // On iOS, blur is noisy and often duplicated with visibilitychange.
      if (isIOS) return;
      if (monitoringActiveRef.current && !fullscreenTransitionRef.current) {
        reportViolation('tab_switch', 'Keluar dari halaman ujian');
      }
    };
    
    const handleWindowFocus = () => {
      windowFocusedRef.current = true;
    };

    // === MOBILE SPLIT SCREEN / FLOATING APP DETECTION ===
    const handleResize = () => {
      if (!monitoringActiveRef.current || !isMobile) return;
      
      const now = Date.now();
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      const initialWidth = initialDimensionsRef.current.width;
      const initialHeight = initialDimensionsRef.current.height;
      
      // Skip if we don't have valid initial dimensions
      if (initialWidth === 0 || initialHeight === 0) {
        initialDimensionsRef.current = { width: currentWidth, height: currentHeight, ratio: currentWidth / currentHeight };
        return;
      }

      // iOS Safari sering memicu resize palsu karena toolbar/keyboard/viewport dynamics.
      // Hindari pelanggaran dari sumber ini agar tidak false positive.
      if (isIOS) {
        lastResizeTimeRef.current = now;
        return;
      }
      
      // Detect significant width reduction (split screen typically halves the width)
      const widthRatio = currentWidth / initialWidth;
      const heightRatio = currentHeight / initialHeight;
      
      // Split screen detection: width reduced by more than 40% but height stays similar
      // or height reduced by more than 40% (horizontal split)
      const isSplitScreen = (widthRatio < 0.6 && heightRatio > 0.8) || 
                           (heightRatio < 0.6 && widthRatio > 0.8);
      
      // Floating app detection: both dimensions significantly reduced (small window)
      const isFloatingApp = widthRatio < 0.7 && heightRatio < 0.7;
      
      // Picture-in-Picture like mode: very small window
      const isPiP = (currentWidth < 400 && currentHeight < 400) ||
                   (currentWidth * currentHeight < initialWidth * initialHeight * 0.25);
      
      if ((isSplitScreen || isFloatingApp || isPiP) && !splitScreenWarnedRef.current) {
        // Debounce to avoid false positives during orientation change
        if (now - lastResizeTimeRef.current > 1000) {
          splitScreenWarnedRef.current = true;
          
          let violationType = 'split_screen';
          let description = 'Mode split screen terdeteksi';
          
          if (isPiP) {
            violationType = 'pip_mode';
            description = 'Mode Picture-in-Picture / floating window terdeteksi';
          } else if (isFloatingApp) {
            violationType = 'floating_app';
            description = 'Aplikasi mengambang terdeteksi';
          }
          
          reportViolation(violationType, description);
          
          // Reset warning after 10 seconds to allow new detection if they do it again
          setTimeout(() => {
            splitScreenWarnedRef.current = false;
          }, 10000);
        }
      }
      
      // Track rapid resize events (suspicious pattern)
      if (now - lastResizeTimeRef.current < 500) {
        resizeCountRef.current++;
        if (resizeCountRef.current > 5 && !splitScreenWarnedRef.current) {
          reportViolation('suspicious_resize', 'Perubahan ukuran layar yang mencurigakan');
          splitScreenWarnedRef.current = true;
          setTimeout(() => {
            splitScreenWarnedRef.current = false;
            resizeCountRef.current = 0;
          }, 10000);
        }
      } else {
        resizeCountRef.current = 0;
      }
      
      lastResizeTimeRef.current = now;
    };
    
    // Orientation change — update initial dimensions after legitimate rotation
    const handleOrientationChange = () => {
      if (!monitoringActiveRef.current) return;
      
      // Wait for resize to settle after orientation change
      setTimeout(() => {
        // Only update if window is reasonably sized (not in split/floating mode)
        const currentWidth = window.innerWidth;
        const currentHeight = window.innerHeight;
        const screenWidth = window.screen.availWidth || window.screen.width;
        const screenHeight = window.screen.availHeight || window.screen.height;
        
        // If window takes up most of the screen, it's a legitimate orientation change
        const widthCoverage = currentWidth / screenWidth;
        const heightCoverage = currentHeight / screenHeight;
        
        if (widthCoverage > 0.8 || heightCoverage > 0.8) {
          initialDimensionsRef.current = { width: currentWidth, height: currentHeight, ratio: currentWidth / currentHeight };
          lastGoodDimensionsRef.current = { ...initialDimensionsRef.current };
          console.log('[Security] Orientation change detected, updated baseline dimensions');
        }
      }, 500);
    };
    
    // === PICTURE-IN-PICTURE API DETECTION ===
    const handlePiPEnter = () => {
      if (monitoringActiveRef.current) {
        reportViolation('pip_mode', 'Mode Picture-in-Picture diaktifkan');
      }
    };

    // pagehide — Safari mobile fallback (fires when user switches apps)
    const handlePageHide = (e: PageTransitionEvent) => {
      if (isIOS) return;
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
      if (isIOS) return;
      if (e.touches.length >= 3 && monitoringActiveRef.current) {
        reportViolation('screenshot_attempt', 'Gerakan multi-touch terdeteksi (kemungkinan screenshot)');
      }
    };
    
    // === SCREEN CAPTURE / RECORDING DETECTION ===
    // Detect if screen is being captured (works on some browsers)
    const checkScreenCapture = () => {
      if (!monitoringActiveRef.current || !isMobile) return;
      
      // Check if Display Capture API is active (desktop mainly, but check anyway)
      if ('getDisplayMedia' in navigator.mediaDevices) {
        // We can't directly detect if someone is recording, but we can check for
        // active screen capture sessions in some cases
      }
    };

    // Add event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('selectstart', handleSelectStart);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    
    // PiP detection on video elements
    document.addEventListener('enterpictureinpicture', handlePiPEnter);
    
    // Store initial dimensions on first activation
    if (initialDimensionsRef.current.width === 0) {
      initialDimensionsRef.current = getInitialDimensions();
      lastGoodDimensionsRef.current = { ...initialDimensionsRef.current };
    }

    // Cleanup
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('enterpictureinpicture', handlePiPEnter);
    };
  }, [reportViolation, isMobile, isIOS]);

  // Camera health check + auto-restart on consecutive snapshot failures
  // Also handle track ended gracefully on mobile (don't immediately report violation)
  useEffect(() => {
    if (enableCamera && isCameraActive) {
      // Track if we're currently attempting auto-restart
      let isAutoRestarting = false;
      const autoRestartLimit = isIOS ? 6 : MAX_AUTO_RESTART_ATTEMPTS;

      // Camera status check — detect if camera is turned off
      const checkCamera = setInterval(async () => {
        // Skip camera check during snapshot capture or grace period
        // Some phones temporarily lose camera track during canvas draw operations
        if (snapshotInProgressRef.current) {
          console.log('[Camera Health] Skipping check — snapshot in progress');
          return;
        }
        if (Date.now() < snapshotGraceUntilRef.current) {
          console.log('[Camera Health] Skipping check — in grace period after snapshot');
          return;
        }

        if (streamRef.current) {
          const videoTrack = streamRef.current.getVideoTracks()[0];
          
          // Track ended or disabled — try auto-restart first before reporting violation
          if (!videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended') {
            if (isAutoRestarting) return; // Already restarting, skip this check
            
            // On mobile, track can end due to OS suspending camera — try restart first
            if (cameraRestartAttemptsRef.current < autoRestartLimit) {
              console.log(`[Camera] Track ended/disabled, attempting auto-restart (${cameraRestartAttemptsRef.current + 1}/${autoRestartLimit})`);
              isAutoRestarting = true;
              cameraRestartAttemptsRef.current++;
              
              try {
                await restartCamera();
                console.log('[Camera] Auto-restart successful');
                cameraRestartAttemptsRef.current = 0; // Reset on success
              } catch (error) {
                console.warn('[Camera] Auto-restart failed:', error);
              } finally {
                isAutoRestarting = false;
              }
            } else {
              if (isIOS) {
                // iOS dapat menutup track kamera secara sporadis saat resource pressure.
                // Beri jeda tambahan dan coba lagi, jangan langsung violation.
                snapshotGraceUntilRef.current = Date.now() + 15000;
                cameraRestartAttemptsRef.current = 0;
                return;
              }
              // Only report violation after multiple restart attempts failed
              reportViolation('camera_off', 'Kamera dimatikan atau tidak dapat diakses');
              cameraRestartAttemptsRef.current = 0; // Reset for next cycle
            }
          } else {
            // Camera is working — reset restart attempts
            cameraRestartAttemptsRef.current = 0;
          }
        }
        
        // Auto-restart camera after 5 consecutive snapshot failures
        if (consecutiveFailsRef.current >= 5 && !isAutoRestarting) {
          console.warn('[Camera] 5 consecutive snapshot failures — auto-restarting camera');
          isAutoRestarting = true;
          try {
            await restartCamera();
          } finally {
            isAutoRestarting = false;
          }
        }
      }, 5000);

      // Listen for track ended event directly for faster response
      const handleTrackEnded = () => {
        console.log('[Camera] Video track ended event fired');
        // Don't report immediately — let the interval handler restart
      };

      if (streamRef.current) {
        const videoTrack = streamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.addEventListener('ended', handleTrackEnded);
        }
      }

      return () => {
        clearInterval(checkCamera);
        if (streamRef.current) {
          const videoTrack = streamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.removeEventListener('ended', handleTrackEnded);
          }
        }
      };
    }
  }, [enableCamera, isCameraActive, reportViolation, restartCamera, isIOS]);

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
    suppressViolations,
    videoRef,
  };
}
