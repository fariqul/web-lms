'use client';

/**
 * Utility for client-side face detection using face-api.js and TinyFaceDetector model.
 * Used during camera preview testing before students can start CBT exams.
 */

let modelsLoaded = false;
let modelLoadingPromise: Promise<boolean> | null = null;

/**
 * Load TinyFaceDetector model from public/models directory.
 */
export async function loadFaceDetectionModels(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (modelsLoaded) return true;
  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelLoadingPromise = (async () => {
    try {
      const faceapi = await import('face-api.js');
      if (!faceapi.nets.tinyFaceDetector.isLoaded) {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      }
      modelsLoaded = true;
      return true;
    } catch (err) {
      console.warn('[FaceDetection] Failed to load face-api model:', err);
      modelsLoaded = false;
      return false;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
}

export interface FaceDetectionResult {
  detected: boolean;
  score: number;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Detect a single face in an HTMLVideoElement.
 */
export async function detectFaceInVideo(video: HTMLVideoElement): Promise<FaceDetectionResult> {
  if (
    !video ||
    video.readyState < 2 ||
    video.paused ||
    video.ended ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    return { detected: false, score: 0 };
  }

  const isLoaded = await loadFaceDetectionModels();
  if (!isLoaded) {
    return { detected: false, score: 0 };
  }

  try {
    const faceapi = await import('face-api.js');
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224, // Fast, low CPU footprint for continuous camera preview
      scoreThreshold: 0.4, // Balanced threshold matching proctoring for varied lighting
    });

    const result = await faceapi.detectSingleFace(video, options);
    if (result && result.score >= 0.4) {
      return {
        detected: true,
        score: result.score,
        box: {
          x: result.box.x,
          y: result.box.y,
          width: result.box.width,
          height: result.box.height,
        },
      };
    }

    return {
      detected: false,
      score: result ? result.score : 0,
    };
  } catch (err) {
    console.warn('[FaceDetection] Detection failed:', err);
    return { detected: false, score: 0 };
  }
}
