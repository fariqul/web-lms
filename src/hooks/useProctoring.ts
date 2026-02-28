'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { monitoringAPI } from '@/services/api';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ProctoringDetection {
  type: 'no_face' | 'multi_face' | 'head_turn' | 'eye_gaze' | 'identity_mismatch';
  confidence: number;
  description: string;
  timestamp: Date;
}

export interface ProctoringStats {
  noFaceCount: number;
  multiFaceCount: number;
  headTurnCount: number;
  eyeGazeCount: number;
  identityMismatchCount: number;
  totalDetections: number;
  totalAnalyzed: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface UseProctoringOptions {
  examId: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  /** Detection interval in ms (default: 2000 = 2 seconds) */
  detectionInterval?: number;
  /** Callback when a suspicious activity is detected */
  onDetection?: (detection: ProctoringDetection) => void;
}

interface UseProctoringReturn {
  isModelLoaded: boolean;
  isAnalyzing: boolean;
  stats: ProctoringStats;
  recentDetections: ProctoringDetection[];
  referenceDescriptor: Float32Array | null;
  captureReference: () => Promise<boolean>;
}

// ─── Thresholds ─────────────────────────────────────────────────────────

const THRESHOLDS = {
  // Minimum face detection confidence
  FACE_DETECTION_SCORE: 0.5,
  // Head turn: angle thresholds (radians, ~25 degrees)
  HEAD_YAW_THRESHOLD: 0.43,
  HEAD_PITCH_THRESHOLD: 0.35,
  // Eye gaze: landmark position ratio threshold
  EYE_GAZE_THRESHOLD: 0.35,
  // Identity: face descriptor distance threshold (lower = stricter)
  IDENTITY_DISTANCE: 0.55,
  // Risk level thresholds (total detections)
  RISK_MEDIUM: 5,
  RISK_HIGH: 15,
  RISK_CRITICAL: 30,
};

// ─── Hook ───────────────────────────────────────────────────────────────

export function useProctoring({
  examId,
  videoRef,
  enabled,
  detectionInterval = 2000,
  onDetection,
}: UseProctoringOptions): UseProctoringReturn {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stats, setStats] = useState<ProctoringStats>({
    noFaceCount: 0,
    multiFaceCount: 0,
    headTurnCount: 0,
    eyeGazeCount: 0,
    identityMismatchCount: 0,
    totalDetections: 0,
    totalAnalyzed: 0,
    riskLevel: 'low',
  });
  const [recentDetections, setRecentDetections] = useState<ProctoringDetection[]>([]);
  const [referenceDescriptor, setReferenceDescriptor] = useState<Float32Array | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const analyzingRef = useRef(false);
  const statsRef = useRef(stats);
  statsRef.current = stats;

  // ─── Load Models ────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);

        if (!cancelled) {
          setIsModelLoaded(true);
          console.log('[Proctoring] Face detection models loaded');
        }
      } catch (error) {
        console.error('[Proctoring] Failed to load models:', error);
      }
    };

    loadModels();
    return () => { cancelled = true; };
  }, [enabled]);

  // ─── Calculate Risk Level ───────────────────────────────────────────

  const calculateRiskLevel = useCallback((totalDetections: number): ProctoringStats['riskLevel'] => {
    if (totalDetections >= THRESHOLDS.RISK_CRITICAL) return 'critical';
    if (totalDetections >= THRESHOLDS.RISK_HIGH) return 'high';
    if (totalDetections >= THRESHOLDS.RISK_MEDIUM) return 'medium';
    return 'low';
  }, []);

  // ─── Add Detection ──────────────────────────────────────────────────

  const addDetection = useCallback((detection: ProctoringDetection) => {
    setRecentDetections(prev => [detection, ...prev].slice(0, 50));
    
    setStats(prev => {
      const updated = { ...prev };
      switch (detection.type) {
        case 'no_face': updated.noFaceCount++; break;
        case 'multi_face': updated.multiFaceCount++; break;
        case 'head_turn': updated.headTurnCount++; break;
        case 'eye_gaze': updated.eyeGazeCount++; break;
        case 'identity_mismatch': updated.identityMismatchCount++; break;
      }
      updated.totalDetections++;
      updated.riskLevel = calculateRiskLevel(updated.totalDetections);
      return updated;
    });

    onDetection?.(detection);
  }, [onDetection, calculateRiskLevel]);

  // ─── Head Pose Estimation from Landmarks ────────────────────────────

  const estimateHeadPose = useCallback((landmarks: faceapi.FaceLandmarks68) => {
    const positions = landmarks.positions;
    
    // Use nose tip and face outline to estimate yaw
    const noseTip = positions[30]; // Nose tip
    const leftFace = positions[0];  // Left face outline
    const rightFace = positions[16]; // Right face outline
    
    const faceWidth = rightFace.x - leftFace.x;
    const noseRelativeX = (noseTip.x - leftFace.x) / faceWidth;
    
    // noseRelativeX = 0.5 means centered
    // <0.35 means looking right, >0.65 means looking left
    const yaw = (noseRelativeX - 0.5) * 2; // -1 to 1 scale
    
    // Pitch: compare nose tip to eye center vertically
    const leftEye = positions[36];
    const rightEye = positions[45];
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = positions[8].y - positions[24].y; // Chin to forehead
    const noseRelativeY = (noseTip.y - eyeCenterY) / (faceHeight || 1);
    const pitch = (noseRelativeY - 0.4) * 2;

    return { yaw, pitch };
  }, []);

  // ─── Eye Gaze Estimation from Landmarks ─────────────────────────────

  const estimateEyeGaze = useCallback((landmarks: faceapi.FaceLandmarks68) => {
    const positions = landmarks.positions;
    
    // Left eye: landmarks 36-41
    const leftEyeInner = positions[39];
    const leftEyeOuter = positions[36];
    const leftPupilX = (positions[37].x + positions[38].x) / 2;
    const leftEyeWidth = leftEyeInner.x - leftEyeOuter.x;
    const leftGaze = (leftPupilX - leftEyeOuter.x) / (leftEyeWidth || 1);
    
    // Right eye: landmarks 42-47
    const rightEyeInner = positions[42];
    const rightEyeOuter = positions[45];
    const rightPupilX = (positions[43].x + positions[44].x) / 2;
    const rightEyeWidth = rightEyeOuter.x - rightEyeInner.x;
    const rightGaze = (rightPupilX - rightEyeInner.x) / (rightEyeWidth || 1);
    
    // Average gaze direction (0.5 = center, <0.3 or >0.7 = looking away)
    const avgGaze = (leftGaze + rightGaze) / 2;
    
    return {
      direction: avgGaze,
      isLookingAway: avgGaze < THRESHOLDS.EYE_GAZE_THRESHOLD || avgGaze > (1 - THRESHOLDS.EYE_GAZE_THRESHOLD),
    };
  }, []);

  // ─── Analyze Frame ──────────────────────────────────────────────────

  const analyzeFrame = useCallback(async () => {
    if (analyzingRef.current || !videoRef.current || !isModelLoaded) return;
    
    const video = videoRef.current;
    if (video.paused || video.ended || !video.videoWidth) return;
    
    analyzingRef.current = true;
    setIsAnalyzing(true);

    try {
      // Detect all faces with landmarks and descriptors
      const detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: THRESHOLDS.FACE_DETECTION_SCORE,
        }))
        .withFaceLandmarks(true) // use tiny landmarks
        .withFaceDescriptors();

      setStats(prev => ({ ...prev, totalAnalyzed: prev.totalAnalyzed + 1 }));

      const now = new Date();

      // ─── No Face Detected ──────────────────────────────────────

      if (detections.length === 0) {
        addDetection({
          type: 'no_face',
          confidence: 1.0,
          description: 'Tidak ada wajah terdeteksi di kamera',
          timestamp: now,
        });

        // Report to backend
        try {
          await monitoringAPI.reportViolation({
            exam_id: examId,
            type: 'no_face',
            description: 'AI: Tidak ada wajah terdeteksi',
          });
        } catch { /* ignore */ }
        
        return;
      }

      // ─── Multiple Faces ────────────────────────────────────────

      if (detections.length > 1) {
        addDetection({
          type: 'multi_face',
          confidence: Math.max(...detections.map(d => d.detection.score)),
          description: `${detections.length} wajah terdeteksi di kamera`,
          timestamp: now,
        });

        try {
          await monitoringAPI.reportViolation({
            exam_id: examId,
            type: 'multiple_face',
            description: `AI: ${detections.length} wajah terdeteksi`,
          });
        } catch { /* ignore */ }
      }

      // ─── Analyze Primary Face ──────────────────────────────────

      const primaryFace = detections[0];
      const landmarks = primaryFace.landmarks;

      // Head Pose
      const { yaw, pitch } = estimateHeadPose(landmarks);
      if (Math.abs(yaw) > THRESHOLDS.HEAD_YAW_THRESHOLD || Math.abs(pitch) > THRESHOLDS.HEAD_PITCH_THRESHOLD) {
        const direction = yaw > 0 ? 'kiri' : 'kanan';
        addDetection({
          type: 'head_turn',
          confidence: Math.min(1, Math.abs(yaw) / 0.8),
          description: `Kepala menoleh ke ${direction}`,
          timestamp: now,
        });
      }

      // Eye Gaze
      const gaze = estimateEyeGaze(landmarks);
      if (gaze.isLookingAway) {
        addDetection({
          type: 'eye_gaze',
          confidence: Math.min(1, Math.abs(gaze.direction - 0.5) * 2),
          description: 'Mata melihat ke arah lain',
          timestamp: now,
        });
      }

      // Identity Verification (if reference descriptor stored)
      if (referenceDescriptor && primaryFace.descriptor) {
        const distance = faceapi.euclideanDistance(
          Array.from(referenceDescriptor),
          Array.from(primaryFace.descriptor)
        );

        if (distance > THRESHOLDS.IDENTITY_DISTANCE) {
          addDetection({
            type: 'identity_mismatch',
            confidence: Math.min(1, distance),
            description: 'Wajah tidak cocok dengan identitas awal',
            timestamp: now,
          });

          try {
            await monitoringAPI.reportViolation({
              exam_id: examId,
              type: 'identity_mismatch',
              description: `AI: Wajah tidak cocok (distance: ${distance.toFixed(3)})`,
            });
          } catch { /* ignore */ }
        }
      }
    } catch (error) {
      console.warn('[Proctoring] Analysis error:', error);
    } finally {
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, [videoRef, isModelLoaded, examId, referenceDescriptor, addDetection, estimateHeadPose, estimateEyeGaze]);

  // ─── Capture Reference Face ─────────────────────────────────────────

  const captureReference = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || !isModelLoaded) return false;

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: 0.5,
        }))
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (detection?.descriptor) {
        setReferenceDescriptor(detection.descriptor);
        console.log('[Proctoring] Reference face captured successfully');
        return true;
      }

      console.warn('[Proctoring] No face found for reference capture');
      return false;
    } catch (error) {
      console.error('[Proctoring] Failed to capture reference:', error);
      return false;
    }
  }, [videoRef, isModelLoaded]);

  // ─── Detection Loop ─────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !isModelLoaded) return;

    // Initial delay before starting detection
    const startDelay = setTimeout(() => {
      intervalRef.current = setInterval(analyzeFrame, detectionInterval);
    }, 3000);

    return () => {
      clearTimeout(startDelay);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, isModelLoaded, analyzeFrame, detectionInterval]);

  return {
    isModelLoaded,
    isAnalyzing,
    stats,
    recentDetections,
    referenceDescriptor,
    captureReference,
  };
}
