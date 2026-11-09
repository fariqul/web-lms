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

/** Client-layer observation recorded alongside a server measurement. */
export interface ClientFaceObservation {
  detected: boolean | null;
  count: number | null;
  confidence: number | null;
  box: { x: number; y: number; width: number; height: number } | null;
  model: string;
  latencyMs: number | null;
  error: string | null;
}

const CAPTURE_MODEL = 'tiny_face_detector@416/0.5';
const CAPTURE_INPUT_SIZE = 416;
const CAPTURE_SCORE_THRESHOLD = 0.5;

/**
 * Detect all faces in the exact frame that is uploaded, so client and server
 * measurements describe the same image. Never throws: failures are reported
 * through `error`, and `detected` stays null so nothing is recorded as a
 * negative the model never actually judged.
 */
export async function detectFacesInImage(blob: Blob): Promise<ClientFaceObservation> {
  const started = performance.now();
  const base: ClientFaceObservation = {
    detected: null,
    count: null,
    confidence: null,
    box: null,
    model: CAPTURE_MODEL,
    latencyMs: null,
    error: null,
  };

  if (typeof window === 'undefined') {
    return { ...base, error: 'not_browser' };
  }

  const isLoaded = await loadFaceDetectionModels();
  if (!isLoaded) {
    return { ...base, error: 'model_not_loaded' };
  }

  try {
    const faceapi = await import('face-api.js');
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return { ...base, error: 'canvas_unavailable' };
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: CAPTURE_INPUT_SIZE,
      scoreThreshold: CAPTURE_SCORE_THRESHOLD,
    });
    const detections = await faceapi.detectAllFaces(canvas, options);

    let largest: { score: number; box: { x: number; y: number; width: number; height: number } } | null = null;
    for (const det of detections) {
      if (!largest || det.box.width * det.box.height > largest.box.width * largest.box.height) {
        largest = { score: det.score, box: det.box };
      }
    }

    return {
      detected: detections.length > 0,
      count: detections.length,
      confidence: largest ? Math.round(largest.score * 1000) / 1000 : null,
      box: largest
        ? {
            x: Math.round(largest.box.x),
            y: Math.round(largest.box.y),
            width: Math.round(largest.box.width),
            height: Math.round(largest.box.height),
          }
        : null,
      model: CAPTURE_MODEL,
      latencyMs: Math.round(performance.now() - started),
      error: null,
    };
  } catch (err) {
    return {
      ...base,
      latencyMs: Math.round(performance.now() - started),
      error: (err instanceof Error ? err.message : 'detection_failed').slice(0, 200),
    };
  }
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
