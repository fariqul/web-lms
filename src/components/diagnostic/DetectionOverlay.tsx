'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { DetectionOverlayProps } from '@/types/diagnostic';
import { getObjectSeverityColor } from '@/types/diagnostic';

/**
 * DetectionOverlay Component
 * 
 * Renders captured image with visual overlays for detected objects and faces
 * Requirements: 4.1 (Visual accuracy), 6.1 (Test persistence - face_embedding with dimensions)
 */
export function DetectionOverlay({
  imageUrl,
  detections,
  showLandmarks,
  onToggleLandmarks,
}: DetectionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (!imageUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    
    image.onload = () => {
      // Set canvas dimensions to match image
      canvas.width = image.width;
      canvas.height = image.height;

      // Draw image
      ctx.drawImage(image, 0, 0);

      // Draw detection overlays
      drawObjectBoundingBoxes(ctx, detections.objects, image.width, image.height);
      drawFaceBoundingBoxes(ctx, detections.faces, image.width, image.height, showLandmarks);
      drawFaceCountBadge(ctx, detections.faces.length, image.width);
      drawFaceEmbeddingBadge(ctx, detections.faces, image.width);

      setImageLoaded(true);
    };

    image.onerror = () => {
      console.error('Failed to load image for overlay');
      setImageLoaded(false);
    };

    image.src = imageUrl;
  }, [imageUrl, detections, showLandmarks]);

  return (
    <div className="space-y-4">
      <div className="relative bg-gray-900 rounded-lg overflow-hidden">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-gray-400">Loading image...</div>
          </div>
        )}
        
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ display: imageLoaded ? 'block' : 'none' }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-4">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">Objects:</span> {detections.objects.length} |{' '}
          <span className="font-medium">Faces:</span> {detections.faces.length}
        </div>

        <button
          onClick={onToggleLandmarks}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            showLandmarks
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          {showLandmarks ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {showLandmarks ? 'Hide' : 'Show'} Landmarks
        </button>
      </div>
    </div>
  );
}

/**
 * Draw object bounding boxes with color coding
 */
function drawObjectBoundingBoxes(
  ctx: CanvasRenderingContext2D,
  objects: DetectionOverlayProps['detections']['objects'],
  canvasWidth: number,
  canvasHeight: number
) {
  objects.forEach((obj) => {
    const [x1, y1, x2, y2] = obj.bbox;
    const width = x2 - x1;
    const height = y2 - y1;

    // Get color based on severity
    const color = getObjectSeverityColor(obj.severity);

    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, width, height);

    // Draw label background
    const label = `${obj.class} ${Math.round(obj.confidence * 100)}%`;
    ctx.font = 'bold 14px sans-serif';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 20;

    const labelX = x1;
    const labelY = y1 > textHeight + 5 ? y1 - textHeight - 2 : y1;

    ctx.fillStyle = color;
    ctx.fillRect(labelX, labelY, textWidth + 10, textHeight);

    // Draw label text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, labelX + 5, labelY + 15);
  });
}

/**
 * Draw face bounding boxes with landmarks and indicators
 */
function drawFaceBoundingBoxes(
  ctx: CanvasRenderingContext2D,
  faces: DetectionOverlayProps['detections']['faces'],
  canvasWidth: number,
  canvasHeight: number,
  showLandmarks: boolean
) {
  faces.forEach((face, index) => {
    const [x1, y1, x2, y2] = face.bbox;
    const width = x2 - x1;
    const height = y2 - y1;

    // Draw face bounding box (blue)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, width, height);

    // Draw facial landmarks if enabled
    if (showLandmarks && face.landmarks) {
      ctx.fillStyle = '#3b82f6';
      face.landmarks.forEach(([lx, ly]) => {
        ctx.beginPath();
        ctx.arc(lx, ly, 2, 0, 2 * Math.PI);
        ctx.fill();
      });
    }

    // Draw head pose arrows
    drawHeadPoseArrows(ctx, face, x1, y1, width, height);

    // Draw eye gaze indicators
    drawEyeGazeIndicators(ctx, face, x1, y1, width, height);

    // Draw face number label
    const label = `Face #${index + 1}`;
    ctx.font = 'bold 14px sans-serif';
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(x1, y2 + 2, textWidth + 10, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x1 + 5, y2 + 17);
  });
}

/**
 * Draw head pose direction arrows
 */
function drawHeadPoseArrows(
  ctx: CanvasRenderingContext2D,
  face: DetectionOverlayProps['detections']['faces'][0],
  x: number,
  y: number,
  width: number,
  height: number
) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const { yaw, pitch } = face.head_pose;

  // Calculate arrow direction based on yaw and pitch
  // Yaw: rotation around vertical axis (left/right)
  // Pitch: rotation around horizontal axis (up/down)
  const arrowLength = 40;
  const yawRad = (yaw * Math.PI) / 180;
  const pitchRad = (pitch * Math.PI) / 180;

  const endX = centerX + Math.sin(yawRad) * arrowLength;
  const endY = centerY - Math.sin(pitchRad) * arrowLength;

  // Draw arrow line
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw arrowhead
  const angle = Math.atan2(endY - centerY, endX - centerX);
  const arrowHeadLength = 10;

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - arrowHeadLength * Math.cos(angle - Math.PI / 6),
    endY - arrowHeadLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - arrowHeadLength * Math.cos(angle + Math.PI / 6),
    endY - arrowHeadLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  // Draw head pose values
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillText(`Y:${yaw.toFixed(0)}° P:${pitch.toFixed(0)}°`, x, y - 5);
}

/**
 * Draw eye gaze direction indicators
 */
function drawEyeGazeIndicators(
  ctx: CanvasRenderingContext2D,
  face: DetectionOverlayProps['detections']['faces'][0],
  x: number,
  y: number,
  width: number,
  height: number
) {
  const { left_ratio, right_ratio } = face.eye_gaze;

  // Approximate eye positions (1/3 from top, 1/4 and 3/4 from left)
  const eyeY = y + height * 0.33;
  const leftEyeX = x + width * 0.3;
  const rightEyeX = x + width * 0.7;

  const eyeRadius = 8;
  const pupilRadius = 4;

  // Draw left eye
  drawEye(ctx, leftEyeX, eyeY, eyeRadius, pupilRadius, left_ratio);

  // Draw right eye
  drawEye(ctx, rightEyeX, eyeY, eyeRadius, pupilRadius, right_ratio);
}

/**
 * Draw single eye with pupil position
 */
function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  eyeRadius: number,
  pupilRadius: number,
  gazeRatio: number
) {
  // Draw eye outline
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, eyeRadius, 0, 2 * Math.PI);
  ctx.stroke();

  // Calculate pupil position based on gaze ratio
  // gazeRatio 0.35 is center, higher is looking away
  const pupilOffset = (gazeRatio - 0.35) * eyeRadius * 2;
  const pupilX = x + pupilOffset;

  // Draw pupil
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(pupilX, y, pupilRadius, 0, 2 * Math.PI);
  ctx.fill();
}

/**
 * Draw face count badge in top-right corner
 */
function drawFaceCountBadge(
  ctx: CanvasRenderingContext2D,
  faceCount: number,
  canvasWidth: number
) {
  if (faceCount === 0) return;

  const label = `${faceCount} ${faceCount === 1 ? 'Face' : 'Faces'}`;
  ctx.font = 'bold 16px sans-serif';
  const textMetrics = ctx.measureText(label);
  const textWidth = textMetrics.width;
  const padding = 12;
  const badgeWidth = textWidth + padding * 2;
  const badgeHeight = 32;
  const badgeX = canvasWidth - badgeWidth - 16;
  const badgeY = 16;

  // Draw badge background
  ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();

  // Draw badge text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, badgeX + padding, badgeY + 21);
}

/**
 * Draw face embedding badge
 */
function drawFaceEmbeddingBadge(
  ctx: CanvasRenderingContext2D,
  faces: DetectionOverlayProps['detections']['faces'],
  canvasWidth: number
) {
  // Check if any face has embedding
  const faceWithEmbedding = faces.find((f) => f.embedding_present && f.embedding_dimensions);
  if (!faceWithEmbedding) return;

  const label = `✓ Embedding: ${faceWithEmbedding.embedding_dimensions}-dim`;
  ctx.font = 'bold 14px sans-serif';
  const textMetrics = ctx.measureText(label);
  const textWidth = textMetrics.width;
  const padding = 10;
  const badgeWidth = textWidth + padding * 2;
  const badgeHeight = 28;
  const badgeX = canvasWidth - badgeWidth - 16;
  const badgeY = 56; // Below face count badge

  // Draw badge background
  ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
  ctx.fill();

  // Draw badge text
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, badgeX + padding, badgeY + 19);
}
