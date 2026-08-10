'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as faceapi from 'face-api.js';

export interface ProctoringDetection {
  type: 'no_face' | 'multi_face';
  confidence: number;
  description: string;
  timestamp: Date;
}

export interface ProctoringStats {
  noFaceCount: number;
  multiFaceCount: number;
  totalDetections: number;
  totalAnalyzed: number;
}

interface UseProctoringOptions {
  examId: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  detectionInterval?: number;
  onDetection?: (detection: ProctoringDetection) => void;
}

interface UseProctoringReturn {
  isModelLoaded: boolean;
  isAnalyzing: boolean;
  stats: ProctoringStats;
}

const THRESHOLDS = {
  FACE_DETECTION_SCORE: 0.35,
};

const MIN_CONFIRMATIONS = {
  no_face: 3,
  multi_face: 2,
};

export function useProctoring({
  videoRef,
  enabled,
  detectionInterval = 3000,
  onDetection,
}: UseProctoringOptions): UseProctoringReturn {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stats, setStats] = useState<ProctoringStats>({
    noFaceCount: 0,
    multiFaceCount: 0,
    totalDetections: 0,
    totalAnalyzed: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const analyzingRef = useRef(false);
  
  const streakRef = useRef({ type: 'none', count: 0 });
  const cooldownRef = useRef({ type: 'none', until: 0 });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        if (!cancelled) {
          setIsModelLoaded(true);
        }
      } catch (error) {
        console.error('[Proctoring] Failed to load models:', error);
      }
    };

    loadModels();
    return () => { cancelled = true; };
  }, [enabled]);

  const analyzeFrame = useCallback(async () => {
    if (analyzingRef.current || !videoRef.current || !isModelLoaded) return;
    
    const video = videoRef.current;
    if (video.paused || video.ended || !video.videoWidth) return;
    
    analyzingRef.current = true;
    setIsAnalyzing(true);

    try {
      const detections = await faceapi.detectAllFaces(
        video, 
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 224,
          scoreThreshold: THRESHOLDS.FACE_DETECTION_SCORE,
        })
      );

      setStats(prev => ({ ...prev, totalAnalyzed: prev.totalAnalyzed + 1 }));

      const faceCount = detections.length;
      let detectedType: 'none' | 'no_face' | 'multi_face' = 'none';
      let confidence = 1.0;
      let description = '';

      if (faceCount === 0) {
        detectedType = 'no_face';
        description = 'Tidak ada wajah terdeteksi di kamera';
      } else if (faceCount > 1) {
        detectedType = 'multi_face';
        confidence = Math.max(...detections.map(d => d.score));
        description = `${faceCount} wajah terdeteksi`;
      }

      const now = Date.now();
      
      if (detectedType !== 'none' && cooldownRef.current.type === detectedType && cooldownRef.current.until > now) {
        return; 
      }

      if (detectedType === 'none') {
        streakRef.current = { type: 'none', count: 0 };
      } else {
        if (streakRef.current.type === detectedType) {
          streakRef.current.count++;
        } else {
          streakRef.current = { type: detectedType, count: 1 };
        }

        const required = MIN_CONFIRMATIONS[detectedType];
        if (streakRef.current.count >= required) {
          const detection: ProctoringDetection = {
            type: detectedType,
            confidence,
            description,
            timestamp: new Date(),
          };

          setStats(prev => ({
            ...prev,
            noFaceCount: prev.noFaceCount + (detectedType === 'no_face' ? 1 : 0),
            multiFaceCount: prev.multiFaceCount + (detectedType === 'multi_face' ? 1 : 0),
            totalDetections: prev.totalDetections + 1,
          }));

          onDetection?.(detection);

          streakRef.current = { type: 'none', count: 0 };
          cooldownRef.current = { type: detectedType, until: now + 60_000 };
        }
      }
    } catch (error) {
      console.warn('[Proctoring] Analysis error:', error);
    } finally {
      analyzingRef.current = false;
      setIsAnalyzing(false);
    }
  }, [videoRef, isModelLoaded, onDetection]);

  useEffect(() => {
    if (!enabled || !isModelLoaded) return;
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
  };
}
