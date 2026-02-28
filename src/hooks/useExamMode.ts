'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { monitoringAPI } from '@/services/api';

// Extend ImageCapture type to include grabFrame (not in all TS libs)
declare global {
  interface ImageCapture {
    grabFrame(): Promise<ImageBitmap>;
    takePhoto(photoSettings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
  }
}

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

  // Camera management with retry
  const cameraRetryRef = useRef(0);
  const MAX_CAMERA_RETRIES = 3;

  const startCamera = useCallback(async () => {
    try {
      console.log('[Camera] Requesting camera access...');
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
      cameraRetryRef.current = 0;
      console.log('[Camera] Camera started successfully');
    } catch (error) {
      console.error('[Camera] Camera access failed:', error);
      cameraRetryRef.current += 1;
      
      if (cameraRetryRef.current < MAX_CAMERA_RETRIES) {
        console.log(`[Camera] Retrying... (${cameraRetryRef.current}/${MAX_CAMERA_RETRIES})`);
        // Retry after increasing delay
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

  // Capture snapshot — uses multiple strategies for maximum hardware compatibility
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
      return null;
    }

    // Helper: check if a blob has actual content (not empty/tiny)
    const isBlobValid = (blob: Blob | null): blob is Blob => {
      return !!blob && blob.size > 500;
    };

    try {
      // ===== Strategy 1: ImageCapture.takePhoto() =====
      // Captures photo directly from camera hardware → Blob. No canvas at all.
      if (typeof ImageCapture !== 'undefined') {
        try {
          const imageCapture = new ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          if (isBlobValid(blob)) {
            await monitoringAPI.uploadSnapshotBlob(examId, blob);
            console.log(`[Snapshot] ImageCapture.takePhoto success: ${Math.round(blob.size / 1024)}KB`);
            return 'captured';
          }
          console.warn('[Snapshot] takePhoto produced invalid blob');
        } catch (e) {
          console.warn('[Snapshot] ImageCapture.takePhoto failed:', e);
        }
      }

      // ===== Strategy 2: MediaRecorder → extract frame as JPEG =====
      // Record short video clip from stream (bypasses GPU driver issues),
      // then load the clip into an offscreen <video>, draw to canvas → JPEG.
      // This works because decoding a recorded video file uses a different
      // rendering pipeline than live camera → canvas.
      try {
        // Find a supported mime type
        const mimeTypes = [
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4',
        ];
        let selectedMime = '';
        for (const mime of mimeTypes) {
          if (MediaRecorder.isTypeSupported(mime)) {
            selectedMime = mime;
            break;
          }
        }

        const videoBlob = await new Promise<Blob>((resolve, reject) => {
          const chunks: Blob[] = [];
          const recorderOptions: MediaRecorderOptions = {};
          if (selectedMime) recorderOptions.mimeType = selectedMime;

          let recorder: MediaRecorder;
          try {
            recorder = new MediaRecorder(stream, recorderOptions);
          } catch {
            recorder = new MediaRecorder(stream);
          }

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = () => {
            if (chunks.length > 0) {
              resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
            } else {
              reject(new Error('MediaRecorder produced no data'));
            }
          };
          recorder.onerror = () => reject(new Error('MediaRecorder error'));

          recorder.start();
          // Record 500ms — enough for at least one keyframe
          setTimeout(() => {
            if (recorder.state === 'recording') {
              recorder.stop();
            }
          }, 500);
        });

        if (!isBlobValid(videoBlob)) {
          throw new Error('MediaRecorder produced invalid blob');
        }

        // Now extract a frame from the recorded clip
        const jpegBlob = await new Promise<Blob>((resolve, reject) => {
          const offscreenVideo = document.createElement('video');
          offscreenVideo.muted = true;
          offscreenVideo.playsInline = true;
          offscreenVideo.preload = 'auto';

          const blobUrl = URL.createObjectURL(videoBlob);
          let resolved = false;

          const cleanup = () => {
            URL.revokeObjectURL(blobUrl);
            offscreenVideo.src = '';
            offscreenVideo.load();
          };

          const extractFrame = () => {
            if (resolved) return;
            resolved = true;
            try {
              const w = offscreenVideo.videoWidth || 640;
              const h = offscreenVideo.videoHeight || 480;
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (!ctx) { cleanup(); reject(new Error('No canvas context')); return; }

              ctx.drawImage(offscreenVideo, 0, 0, w, h);

              // Verify not blank
              const pixels = ctx.getImageData(0, 0, w, h).data;
              let hasContent = false;
              for (let i = 0; i < pixels.length; i += 4000) {
                if (pixels[i] > 5 || pixels[i + 1] > 5 || pixels[i + 2] > 5) {
                  hasContent = true;
                  break;
                }
              }

              if (!hasContent) {
                cleanup();
                reject(new Error('Extracted frame is black'));
                return;
              }

              canvas.toBlob((b) => {
                cleanup();
                if (b && b.size > 500) {
                  resolve(b);
                } else {
                  reject(new Error('Canvas toBlob produced invalid result'));
                }
              }, 'image/jpeg', 0.6);
            } catch (err) {
              cleanup();
              reject(err);
            }
          };

          // When video has loaded enough to seek
          offscreenVideo.onloadeddata = () => {
            // Seek to 200ms to skip potential blank first frame
            offscreenVideo.currentTime = 0.2;
          };
          offscreenVideo.onseeked = () => extractFrame();
          // Fallback: if seeking doesn't fire, try on canplay
          offscreenVideo.oncanplay = () => {
            setTimeout(() => { if (!resolved) extractFrame(); }, 300);
          };
          offscreenVideo.onerror = () => { cleanup(); reject(new Error('Failed to load recorded video')); };

          // Safety timeout
          setTimeout(() => {
            if (!resolved) {
              resolved = true;
              cleanup();
              reject(new Error('Frame extraction timeout'));
            }
          }, 5000);

          offscreenVideo.src = blobUrl;
          offscreenVideo.load();
        });

        await monitoringAPI.uploadSnapshotBlob(examId, jpegBlob);
        console.log(`[Snapshot] MediaRecorder→JPEG success: ${Math.round(jpegBlob.size / 1024)}KB`);
        return 'captured';
      } catch (e) {
        console.warn('[Snapshot] MediaRecorder→JPEG failed:', e);
        // If frame extraction failed but we have a valid video blob, upload that as fallback
      }

      // ===== Strategy 3: Canvas with willReadFrequently (software rendering) =====
      try {
        // Wait for a frame
        await new Promise<void>((resolve) => {
          if ('requestVideoFrameCallback' in video) {
            (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void })
              .requestVideoFrameCallback(() => resolve());
          } else {
            requestAnimationFrame(() => resolve());
          }
          setTimeout(resolve, 500);
        });

        const width = video.videoWidth || track.getSettings().width || 640;
        const height = video.videoHeight || track.getSettings().height || 480;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        // willReadFrequently: true forces software-backed canvas (CPU mode)
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('No 2d context');
        ctx.drawImage(video, 0, 0, width, height);

        // Check for blank image
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let hasContent = false;
        for (let i = 0; i < pixels.length; i += 4000) {
          if (pixels[i] > 5 || pixels[i + 1] > 5 || pixels[i + 2] > 5) {
            hasContent = true;
            break;
          }
        }

        if (hasContent) {
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.5);
          });
          if (isBlobValid(blob)) {
            await monitoringAPI.uploadSnapshotBlob(examId, blob);
            console.log(`[Snapshot] Canvas (software) success: ${Math.round(blob.size / 1024)}KB`);
            return 'captured';
          }
        }
        console.warn('[Snapshot] Canvas produced black image');
      } catch (e) {
        console.warn('[Snapshot] Canvas failed:', e);
      }

      console.error('[Snapshot] All strategies failed');
      return null;
    } catch (error) {
      console.error('[Snapshot] Failed:', error);
      throw error;
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

  // Camera health check (snapshot capturing is handled by the exam page)
  useEffect(() => {
    if (enableCamera && isCameraActive) {
      // Camera status check - detect if camera is turned off
      const checkCamera = setInterval(() => {
        if (streamRef.current) {
          const videoTrack = streamRef.current.getVideoTracks()[0];
          if (!videoTrack || !videoTrack.enabled || videoTrack.readyState === 'ended') {
            reportViolation('camera_off', 'Kamera dimatikan');
          }
        }
      }, 5000);

      return () => {
        clearInterval(checkCamera);
      };
    }
  }, [enableCamera, isCameraActive, reportViolation]);

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
