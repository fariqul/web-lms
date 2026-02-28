"""
AI Proctoring Microservice
YOLO v8 nano object detection for exam monitoring snapshots.

Detects: phones, books, notes, earbuds, second screens, etc.
Runs on GPU (NVIDIA GTX 1660 Super) via CUDA.
"""

import os
import io
import time
import logging
from typing import Optional
from contextlib import asynccontextmanager

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

logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ─── Suspicious object classes (COCO dataset) ───────────────────────────

# COCO class IDs that are suspicious during an exam
SUSPICIOUS_CLASSES = {
    67: "cell phone",
    73: "book",
    74: "clock",
    63: "laptop",
    62: "tv",  # second monitor/screen
    64: "mouse",
    66: "keyboard",
    # Additional classes that may indicate cheating
    0: "person",  # track person count
}

# Classes that are definitely prohibited
PROHIBITED_CLASSES = {
    67: "cell phone",
    73: "book",
    63: "laptop",
    62: "tv",
}

# ─── Global model reference ─────────────────────────────────────────────

model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load YOLO model on startup."""
    global model
    try:
        from ultralytics import YOLO
        logger.info(f"Loading YOLO model: {MODEL_PATH} on device: {DEVICE}")
        model = YOLO(MODEL_PATH)
        # Warmup with a dummy image
        dummy = np.zeros((240, 320, 3), dtype=np.uint8)
        model.predict(dummy, device=DEVICE, verbose=False)
        logger.info("YOLO model loaded and warmed up")
    except Exception as e:
        logger.error(f"Failed to load YOLO model: {e}")
        model = None
    yield
    model = None


app = FastAPI(
    title="AI Proctoring Service",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Response Models ────────────────────────────────────────────────────


class DetectedObject(BaseModel):
    class_id: int
    class_name: str
    confidence: float
    bbox: list[float]  # [x1, y1, x2, y2]
    is_prohibited: bool


class AnalysisResult(BaseModel):
    success: bool
    person_count: int
    suspicious_objects: list[DetectedObject]
    prohibited_objects: list[DetectedObject]
    all_detections: list[DetectedObject]
    risk_score: int  # 0-100
    processing_time_ms: float
    message: str


# ─── Endpoints ──────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "device": DEVICE,
    }


@app.post("/analyze", response_model=AnalysisResult)
async def analyze_snapshot(image: UploadFile = File(...)):
    """
    Analyze a monitoring snapshot for suspicious objects.
    Accepts JPEG/PNG image file.
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    start_time = time.time()

    try:
        # Read and decode image
        contents = await image.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img_array = np.array(img)

        # Run YOLO inference
        results = model.predict(
            img_array,
            device=DEVICE,
            conf=CONFIDENCE_THRESHOLD,
            verbose=False,
            imgsz=320,  # Small input size for speed
        )

        # Parse detections
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

                    if class_id == 0:  # person
                        person_count += 1
                    elif class_id in SUSPICIOUS_CLASSES:
                        suspicious_objects.append(det)
                        if is_prohibited:
                            prohibited_objects.append(det)

        # Calculate risk score
        risk_score = 0
        if person_count > 1:
            risk_score += min(30, (person_count - 1) * 15)
        for obj in prohibited_objects:
            risk_score += int(obj.confidence * 40)
        for obj in suspicious_objects:
            if obj not in prohibited_objects:
                risk_score += int(obj.confidence * 10)
        risk_score = min(100, risk_score)

        processing_time = (time.time() - start_time) * 1000

        message_parts = []
        if person_count > 1:
            message_parts.append(f"{person_count} orang terdeteksi")
        if prohibited_objects:
            names = list(set(o.class_name for o in prohibited_objects))
            message_parts.append(f"Objek terlarang: {', '.join(names)}")
        if not message_parts:
            message_parts.append("Tidak ada objek mencurigakan")

        return AnalysisResult(
            success=True,
            person_count=person_count,
            suspicious_objects=suspicious_objects,
            prohibited_objects=prohibited_objects,
            all_detections=all_detections,
            risk_score=risk_score,
            processing_time_ms=round(processing_time, 2),
            message="; ".join(message_parts),
        )

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze-batch")
async def analyze_batch(images: list[UploadFile] = File(...)):
    """Analyze multiple snapshots in one request (max 10)."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(images) > 10:
        raise HTTPException(status_code=400, detail="Max 10 images per batch")

    results = []
    for image in images:
        try:
            contents = await image.read()
            img = Image.open(io.BytesIO(contents)).convert("RGB")
            img_array = np.array(img)

            yolo_results = model.predict(
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
                        prohibited.append(yolo_results[0].names.get(class_id, "unknown"))

            results.append({
                "filename": image.filename,
                "person_count": person_count,
                "prohibited_objects": prohibited,
                "has_issues": person_count > 1 or len(prohibited) > 0,
            })
        except Exception as e:
            results.append({
                "filename": image.filename,
                "error": str(e),
            })

    return {"success": True, "results": results}
