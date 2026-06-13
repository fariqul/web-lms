'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Camera, Video, VideoOff, AlertCircle, Loader2 } from 'lucide-react';
import type { CameraPreviewProps, CameraState } from '@/types/diagnostic';

/**
 * CameraPreview Component
 * 
 * Handles camera permission, live video preview, and frame capture
 * Requirements: 2.1 (Camera initialization), 2.2 (Frame capture quality)
 */
export function CameraPreview({
  onCapture,
  onPermissionDenied,
  onError,
}: CameraPreviewProps) {
  const [cameraState, setCameraState] = useState<CameraState>({
    status: 'idle',
    stream: null,
    resolution: null,
    errorMessage: null,
  });
  const [isCapturing, setIsCapturing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Request camera permission and start video stream
   */
  const handleStartCamera = async () => {
    setCameraState((prev) => ({ ...prev, status: 'requesting' }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Wait for video metadata to load
        videoRef.current.onloadedmetadata = () => {
          const width = videoRef.current?.videoWidth || 0;
          const height = videoRef.current?.videoHeight || 0;

          setCameraState({
            status: 'active',
            stream,
            resolution: { width, height },
            errorMessage: null,
          });
        };
      }
    } catch (error) {
      const err = error as Error;
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraState({
          status: 'denied',
          stream: null,
          resolution: null,
          errorMessage: 'Izin akses kamera ditolak. Harap aktifkan izin kamera di pengaturan browser.',
        });
        onPermissionDenied();
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraState({
          status: 'error',
          stream: null,
          resolution: null,
          errorMessage: 'Kamera tidak ditemukan. Pastikan kamera terpasang dan tidak digunakan aplikasi lain.',
        });
        onError('Camera not found');
      } else {
        setCameraState({
          status: 'error',
          stream: null,
          resolution: null,
          errorMessage: `Error mengakses kamera: ${err.message}`,
        });
        onError(err.message);
      }
    }
  };

  /**
   * Capture current frame from video stream
   */
  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current || cameraState.status !== 'active') {
      return;
    }

    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw current frame to canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to Blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert canvas to blob'));
            }
          },
          'image/jpeg',
          0.95 // Quality
        );
      });

      // Call parent callback
      await onCapture(blob);
    } catch (error) {
      const err = error as Error;
      onError(`Failed to capture frame: ${err.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Stop camera stream and cleanup
   */
  const handleStopCamera = () => {
    if (cameraState.stream) {
      cameraState.stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraState({
      status: 'idle',
      stream: null,
      resolution: null,
      errorMessage: null,
    });
  };

  /**
   * Cleanup on component unmount
   */
  useEffect(() => {
    return () => {
      if (cameraState.stream) {
        cameraState.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraState.stream]);

  return (
    <div className="space-y-4">
      {/* Camera Preview Area */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
        {cameraState.status === 'idle' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4">
              <VideoOff className="w-16 h-16 text-gray-500 mx-auto" />
              <p className="text-gray-400">Kamera belum aktif</p>
              <button
                onClick={handleStartCamera}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
              >
                <Camera className="w-5 h-5" />
                Start Camera Test
              </button>
            </div>
          </div>
        )}

        {cameraState.status === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center space-y-4">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto" />
              <p className="text-gray-400">Meminta izin akses kamera...</p>
            </div>
          </div>
        )}

        {cameraState.status === 'active' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}

        {cameraState.status === 'denied' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center space-y-4 max-w-md px-6">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto" />
              <p className="text-red-400 font-medium">Izin Kamera Ditolak</p>
              <p className="text-gray-400 text-sm">
                {cameraState.errorMessage}
              </p>
              <div className="bg-gray-800 rounded-lg p-4 text-left text-sm space-y-2">
                <p className="text-gray-300 font-medium">Cara mengaktifkan izin kamera:</p>
                <ol className="list-decimal list-inside text-gray-400 space-y-1">
                  <li>Klik ikon kunci/info di address bar browser</li>
                  <li>Cari pengaturan &quot;Camera&quot; atau &quot;Kamera&quot;</li>
                  <li>Ubah dari &quot;Block&quot; menjadi &quot;Allow&quot;</li>
                  <li>Refresh halaman dan coba lagi</li>
                </ol>
              </div>
              <button
                onClick={handleStartCamera}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        )}

        {cameraState.status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center space-y-4 max-w-md px-6">
              <AlertCircle className="w-16 h-16 text-orange-500 mx-auto" />
              <p className="text-orange-400 font-medium">Error Mengakses Kamera</p>
              <p className="text-gray-400 text-sm">
                {cameraState.errorMessage}
              </p>
              <button
                onClick={handleStartCamera}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          </div>
        )}

        {/* Status Overlay */}
        {cameraState.status === 'active' && (
          <div className="absolute top-4 left-4 flex gap-2">
            <div className="px-3 py-1.5 bg-green-500/90 backdrop-blur-sm rounded-full text-white text-xs font-medium flex items-center gap-1.5">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Active
            </div>
            {cameraState.resolution && (
              <div className="px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm rounded-full text-white text-xs font-medium">
                {cameraState.resolution.width}x{cameraState.resolution.height}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control Buttons */}
      {cameraState.status === 'active' && (
        <div className="flex gap-3">
          <button
            onClick={handleCapture}
            disabled={isCapturing}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isCapturing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" />
                Capture & Analyze
              </>
            )}
          </button>

          <button
            onClick={handleStopCamera}
            disabled={isCapturing}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            Stop Camera
          </button>
        </div>
      )}

      {/* Camera Status Info */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Camera Status:
          </span>
          <StatusBadge status={cameraState.status} />
        </div>

        {cameraState.resolution && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">Resolution:</span>
            <span className="font-mono text-gray-900 dark:text-gray-100">
              {cameraState.resolution.width} × {cameraState.resolution.height}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Status Badge Component
 */
function StatusBadge({ status }: { status: CameraState['status'] }) {
  const config = {
    idle: { label: 'Idle', color: 'bg-gray-500' },
    requesting: { label: 'Requesting...', color: 'bg-yellow-500' },
    active: { label: 'Active', color: 'bg-green-500' },
    denied: { label: 'Permission Denied', color: 'bg-red-500' },
    error: { label: 'Error', color: 'bg-orange-500' },
  };

  const { label, color } = config[status];

  return (
    <span className={`px-2.5 py-1 ${color} text-white text-xs font-medium rounded-full`}>
      {label}
    </span>
  );
}
