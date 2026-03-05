"""
AI Proctoring Microservice v2
YOLO v8 nano for object detection + MediaPipe for face/gaze analysis.

Detects:
 - Prohibited objects (phones, books, laptops, etc.) via YOLO
 - Multiple persons via YOLO
 - No face / camera blocked via MediaPipe Face Detection
 - Head turning / looking away via MediaPipe Face Mesh (head pose estimation)
 - Eye gaze deviation via MediaPipe Face Mesh (iris tracking)

Runs on GPU (NVIDIA) or CPU fallback.
"""

import os
import io
import math
import time
import logging
from typing import Optional
from contextlib import asynccontextmanager

import cv2
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─── Config ──────────────────────────────────────────────────────────────

MODEL_PATH = os.getenv("YOLO_MODEL", "yolov8n.pt")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.4"))
DEVICE = os.getenv("DEVICE", "0")  # "0" for GPU, "cpu" for CPU
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Head pose thresholds (degrees)
HEAD_YAW_THRESHOLD = float(os.getenv("HEAD_YAW_THRESHOLD", "30"))    # left/right
HEAD_PITCH_THRESHOLD = float(os.getenv("HEAD_PITCH_THRESHOLD", "25"))  # up/down

# Eye gaze threshold (ratio deviation from center, 0-1)
EYE_GAZE_THRESHOLD = float(os.getenv("EYE_GAZE_THRESHOLD", "0.35"))

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ─── Suspicious object classes (COCO dataset) ───────────────────────────

SUSPICIOUS_CLASSES = {
    67: "cell phone",
    73: "book",
    74: "clock",
    63: "laptop",
    62: "tv",
    64: "mouse",
    66: "keyboard",
    0: "person",
}

PROHIBITED_CLASSES = {
    67: "cell phone",
    73: "book",
    63: "laptop",
    62: "tv",
}

# ─── Global model references ────────────────────────────────────────────

yolo_model = None
face_detection = None
face_mesh = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load models on startup."""
    global yolo_model, face_detection, face_mesh

    # Load YOLO
    try:
        from ultralytics import YOLO
        logger.info(f"Loading YOLO model: {MODEL_PATH} on device: {DEVICE}")
        yolo_model = YOLO(MODEL_PATH)
        dummy = np.zeros((240, 320, 3), dtype=np.uint8)
        yolo_model.predict(dummy, device=DEVICE, verbose=False)
        logger.info("YOLO model loaded and warmed up")
    except Exception as e:
        logger.error(f"Failed to load YOLO model: {e}")
        yolo_model = None

    # Load MediaPipe Face Detection + Face Mesh
    try:
        import mediapipe as mp

        face_detection = mp.solutions.face_detection.FaceDetection(
            model_selection=1,  # 1 = full-range (up to 5m, more robust for varied webcam positions)
            min_detection_confidence=0.3,
        )

        face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,  # Enables iris landmarks (468-477)
            min_detection_confidence=0.3,
            min_tracking_confidence=0.3,
        )

        logger.info("MediaPipe Face Detection + Face Mesh loaded")
    except Exception as e:
        logger.error(f"Failed to load MediaPipe: {e}")
        face_detection = None
        face_mesh = None

    yield

    yolo_model = None
    if face_detection:
        face_detection.close()
    if face_mesh:
        face_mesh.close()
    face_detection = None
    face_mesh = None


app = FastAPI(
    title="AI Proctoring Service",
    version="2.0.0",
    lifespan=lifespan,
)

# ─── Response Models ────────────────────────────────────────────────────


class DetectedObject(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float]
    is_prohibited: bool


class FaceAnalysis(BaseModel):
    face_detected: bool
    face_count: int
    face_confidence: float
    head_yaw: Optional[float] = None
    head_pitch: Optional[float] = None
    head_roll: Optional[float] = None
    is_looking_away: bool = False
    looking_direction: str = "center"
    eye_gaze_ratio: Optional[float] = None
    is_gaze_deviated: bool = False


class AnalysisResult(BaseModel):
    success: bool
    person_count: int
    face_analysis: Optional[FaceAnalysis] = None
    suspicious_objects: list[DetectedObject]
    prohibited_objects: list[DetectedObject]
    all_detections: list[DetectedObject]
    risk_score: int
    processing_time_ms: float
    message: str
    detections: list[str] = []


# ─── Head Pose Estimation ───────────────────────────────────────────────


def estimate_head_pose(landmarks, img_w: int, img_h: int) -> dict:
    """
    Estimate head pose (yaw, pitch, roll) from MediaPipe Face Mesh landmarks
    using solvePnP with a standard 3D face model.
    """
    # 3D model points (standard face proportions)
    model_points = np.array([
        (0.0, 0.0, 0.0),           # Nose tip (1)
        (0.0, -330.0, -65.0),       # Chin (152)
        (-225.0, 170.0, -135.0),    # Left eye outer (263)
        (225.0, 170.0, -135.0),     # Right eye outer (33)
        (-150.0, -150.0, -125.0),   # Left mouth corner (287)
        (150.0, -150.0, -125.0),    # Right mouth corner (57)
    ], dtype=np.float64)

    # 2D image points
    landmark_indices = [1, 152, 263, 33, 287, 57]
    image_points = np.array([
        (landmarks[idx].x * img_w, landmarks[idx].y * img_h)
        for idx in landmark_indices
    ], dtype=np.float64)

    # Camera matrix (approximate)
    focal_length = img_w
    center = (img_w / 2, img_h / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1],
    ], dtype=np.float64)

    dist_coeffs = np.zeros((4, 1))

    success, rotation_vector, _ = cv2.solvePnP(
        model_points, image_points, camera_matrix, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE,
    )

    if not success:
        return {"yaw": 0, "pitch": 0, "roll": 0}

    rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
    sy = math.sqrt(rotation_matrix[0, 0] ** 2 + rotation_matrix[1, 0] ** 2)

    if sy > 1e-6:
        pitch = math.atan2(rotation_matrix[2, 1], rotation_matrix[2, 2])
        yaw = math.atan2(-rotation_matrix[2, 0], sy)
        roll = math.atan2(rotation_matrix[1, 0], rotation_matrix[0, 0])
    else:
        pitch = math.atan2(-rotation_matrix[1, 2], rotation_matrix[1, 1])
        yaw = math.atan2(-rotation_matrix[2, 0], sy)
        roll = 0

    return {
        "yaw": math.degrees(yaw),
        "pitch": math.degrees(pitch),
        "roll": math.degrees(roll),
    }


def estimate_eye_gaze(landmarks, img_w: int, img_h: int) -> dict:
    """
    Estimate eye gaze direction using iris landmarks (refined, 468-477).
    Returns deviation ratio (0 = center, 1 = extreme) and direction.
    """
    try:
        # Left iris center (473), left eye corners (362 inner, 263 outer)
        # Right iris center (468), right eye corners (133 inner, 33 outer)
        left_iris = landmarks[473]
        left_inner = landmarks[362]
        left_outer = landmarks[263]

        right_iris = landmarks[468]
        right_inner = landmarks[133]
        right_outer = landmarks[33]

        def iris_ratio(iris, inner, outer):
            eye_width = math.sqrt(
                (outer.x - inner.x) ** 2 + (outer.y - inner.y) ** 2
            )
            if eye_width < 0.001:
                return 0.5
            iris_pos = math.sqrt(
                (iris.x - inner.x) ** 2 + (iris.y - inner.y) ** 2
            )
            return iris_pos / eye_width

        left_ratio = iris_ratio(left_iris, left_inner, left_outer)
        right_ratio = iris_ratio(right_iris, right_inner, right_outer)

        avg_ratio = (left_ratio + right_ratio) / 2
        deviation = abs(avg_ratio - 0.5) * 2  # Normalize: 0 = center, 1 = extreme

        return {
            "gaze_ratio": round(deviation, 3),
            "is_deviated": deviation > EYE_GAZE_THRESHOLD,
        }
    except (IndexError, AttributeError):
        return {"gaze_ratio": 0, "is_deviated": False}


def analyze_face(img_rgb: np.ndarray) -> FaceAnalysis:
    """
    Run MediaPipe face detection + face mesh.
    Returns face count, head pose, and eye gaze info.
    """
    if face_detection is None or face_mesh is None:
        return FaceAnalysis(face_detected=False, face_count=0, face_confidence=0)

    h, w = img_rgb.shape[:2]

    # Step 1: Face Detection — count faces
    det_results = face_detection.process(img_rgb)
    face_count = 0
    max_confidence = 0.0

    if det_results.detections:
        face_count = len(det_results.detections)
        max_confidence = max(d.score[0] for d in det_results.detections)

    if face_count == 0:
        return FaceAnalysis(
            face_detected=False,
            face_count=0,
            face_confidence=0,
            is_looking_away=False,
            looking_direction="no_face",
        )

    # Step 2: Face Mesh — head pose + eye gaze
    mesh_results = face_mesh.process(img_rgb)

    head_yaw = 0.0
    head_pitch = 0.0
    head_roll = 0.0
    is_looking_away = False
    looking_direction = "center"
    gaze_ratio = 0.0
    is_gaze_deviated = False

    if mesh_results.multi_face_landmarks:
        landmarks = mesh_results.multi_face_landmarks[0].landmark

        # Head pose
        pose = estimate_head_pose(landmarks, w, h)
        head_yaw = round(pose["yaw"], 1)
        head_pitch = round(pose["pitch"], 1)
        head_roll = round(pose["roll"], 1)

        abs_yaw = abs(head_yaw)
        abs_pitch = abs(head_pitch)

        if abs_yaw > HEAD_YAW_THRESHOLD:
            is_looking_away = True
            looking_direction = "left" if head_yaw < 0 else "right"
        elif abs_pitch > HEAD_PITCH_THRESHOLD:
            is_looking_away = True
            looking_direction = "up" if head_pitch > 0 else "down"

        # Eye gaze
        gaze = estimate_eye_gaze(landmarks, w, h)
        gaze_ratio = gaze["gaze_ratio"]
        is_gaze_deviated = gaze["is_deviated"]

    return FaceAnalysis(
        face_detected=True,
        face_count=face_count,
        face_confidence=round(max_confidence, 3),
        head_yaw=head_yaw,
        head_pitch=head_pitch,
        head_roll=head_roll,
        is_looking_away=is_looking_away,
        looking_direction=looking_direction,
        eye_gaze_ratio=gaze_ratio,
        is_gaze_deviated=is_gaze_deviated,
    )


# ─── Endpoints ──────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "yolo_loaded": yolo_model is not None,
        "mediapipe_loaded": face_detection is not None and face_mesh is not None,
        "device": DEVICE,
    }


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_snapshot(image: UploadFile = File(...)):
    """
    Analyze a monitoring snapshot for:
    1. Suspicious/prohibited objects (YOLO)
    2. Person count (YOLO)
    3. Face presence, head pose, eye gaze (MediaPipe)
    """
    if yolo_model is None:
        raise HTTPException(status_code=503, detail="YOLO model not loaded")

    start_time = time.time()

    try:
        contents = await image.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_array = np.array(img)

        # ── YOLO Object Detection ──
        results = yolo_model.predict(
            img_array,
            device=DEVICE,
            conf=CONFIDENCE_THRESHOLD,
            verbose=False,
            imgsz=320,
        )

        all_detections: list[DetectedObject] = []
        suspicious_objects: list[DetectedObject] = []
        prohibited_objects: list[DetectedObject] = []
        person_count = 0

        if results and len(results) > 0:
            result = results[0]
            if result.boxes is not None:
                for box in result.boxes:
                    class_id = int(box.cls[0])
                    confidence = float(box.conf[0])
                    class_name = result.names.get(class_id, f"class_{class_id}")
                    bbox = box.xyxy[0].tolist()
                    is_prohibited = class_id in PROHIBITED_CLASSES

                    det = DetectedObject(
                        class_id=class_id,
                        class_name=class_name,
                        confidence=confidence,
                        bbox=bbox,
                        is_prohibited=is_prohibited,
                    )

                    all_detections.append(det)

                    if class_id == 0:
                        person_count += 1
                    elif class_id in SUSPICIOUS_CLASSES:
                        suspicious_objects.append(det)
                        if is_prohibited:
                            prohibited_objects.append(det)

        # ── MediaPipe Face Analysis ──
        face_result = analyze_face(img_array)

        # ── Risk Score Calculation ──
        risk_score = 0
        detections: list[str] = []

        # Multiple persons (YOLO)
        if person_count > 1:
            risk_score += min(30, (person_count - 1) * 15)
            detections.append(f"multi_person:{person_count}")

        # Prohibited objects
        for obj in prohibited_objects:
            risk_score += int(obj.confidence * 40)
        if prohibited_objects:
            names = list(set(o.class_name for o in prohibited_objects))
            detections.append(f"prohibited_object:{','.join(names)}")

        # Suspicious but not prohibited
        for obj in suspicious_objects:
            if obj not in prohibited_objects:
                risk_score += int(obj.confidence * 10)

        # No face detected (camera blocked/covered)
        if not face_result.face_detected:
            risk_score += 25
            detections.append("no_face")

        # Multiple faces (MediaPipe — supplements YOLO person count)
        if face_result.face_count > 1:
            risk_score += min(20, (face_result.face_count - 1) * 10)
            if f"multi_person:{person_count}" not in detections:
                detections.append(f"multi_face:{face_result.face_count}")

        # Head turned away
        if face_result.is_looking_away:
            risk_score += 15
            detections.append(f"head_turn:{face_result.looking_direction}")

        # Eye gaze deviation
        if face_result.is_gaze_deviated:
            risk_score += 10
            detections.append("eye_gaze_deviated")

        risk_score = min(100, risk_score)

        # ── Build message ──
        processing_time = (time.time() - start_time) * 1000

        message_parts = []
        if person_count > 1:
            message_parts.append(f"{person_count} orang terdeteksi")
        if prohibited_objects:
            names = list(set(o.class_name for o in prohibited_objects))
            message_parts.append(f"Objek terlarang: {', '.join(names)}")
        if not face_result.face_detected:
            message_parts.append("Wajah tidak terdeteksi (kamera tertutup?)")
        if face_result.is_looking_away:
            direction_labels = {
                "left": "kiri", "right": "kanan",
                "up": "atas", "down": "bawah",
            }
            dir_label = direction_labels.get(
                face_result.looking_direction,
                face_result.looking_direction,
            )
            message_parts.append(f"Kepala menoleh ke {dir_label}")
        if face_result.is_gaze_deviated:
            message_parts.append("Pandangan mata menyimpang")
        if not message_parts:
            message_parts.append("Tidak ada aktivitas mencurigakan")

        return AnalysisResult(
            success=True,
            person_count=person_count,
            face_analysis=face_result,
            suspicious_objects=suspicious_objects,
            prohibited_objects=prohibited_objects,
            all_detections=all_detections,
            risk_score=risk_score,
            processing_time_ms=round(processing_time, 2),
            message="; ".join(message_parts),
            detections=detections,
        )

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze-batch")
async def analyze_batch(images: list[UploadFile] = File(...)):
    """Analyze multiple snapshots (max 10)."""
    if yolo_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(images) > 10:
        raise HTTPException(status_code=400, detail="Max 10 images per batch")

    results = []
    for image in images:
        try:
            contents = await image.read()
            img = Image.open(io.BytesIO(contents)).convert("RGB")
            img_array = np.array(img)

            yolo_results = yolo_model.predict(
                img_array,
                device=DEVICE,
                conf=CONFIDENCE_THRESHOLD,
                verbose=False,
                imgsz=320,
            )

            person_count = 0
            prohibited = []
            if yolo_results and len(yolo_results) > 0:
                for box in (yolo_results[0].boxes or []):
                    class_id = int(box.cls[0])
                    if class_id == 0:
                        person_count += 1
                    elif class_id in PROHIBITED_CLASSES:
                        prohibited.append(
                            yolo_results[0].names.get(class_id, "unknown")
                        )

            face = analyze_face(img_array)

            results.append({
                "filename": image.filename,
                "person_count": person_count,
                "prohibited_objects": prohibited,
                "face_detected": face.face_detected,
                "is_looking_away": face.is_looking_away,
                "looking_direction": face.looking_direction,
                "has_issues": (
                    person_count > 1
                    or len(prohibited) > 0
                    or not face.face_detected
                    or face.is_looking_away
                ),
            })
        except Exception as e:
            results.append({
                "filename": image.filename,
                "error": str(e),
            })

    return {"success": True, "results": results}
