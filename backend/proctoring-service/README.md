# AI Proctoring Service

FastAPI microservice for real-time exam proctoring using:
- **YOLOv8** for object detection (phones, books, etc.)
- **MediaPipe** for face detection, head pose, and eye gaze tracking
- **face_recognition** (optional) for identity verification

## Quick Start

### Docker (Recommended)

```bash
# Build and run
docker-compose up -d proctoring

# Check health
curl http://localhost:8001/health
```

### Local Development

```bash
# Install core dependencies
pip install -r requirements.txt

# (Optional) Install face recognition for identity verification
# Requires CMake and build-essential
pip install -r requirements-face-recognition.txt

# Run service
uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

## Dependencies

### Core (Required)
- YOLOv8 for object detection
- MediaPipe for face/gaze analysis
- FastAPI for API server

### Optional (Face Recognition)
- `face_recognition` - Face embedding extraction
- `dlib` - Required by face_recognition (needs CMake to build)

**If optional dependencies fail to install**, the service will still work with:
- ✅ Object detection
- ✅ Multi-person detection
- ✅ Head pose tracking
- ✅ Eye gaze tracking
- ❌ Identity mismatch detection (disabled)

## Configuration

Environment variables (set in `.env` or docker-compose):

```env
# YOLO Model
YOLO_MODEL=yolov8n.pt

# Detection thresholds
CONFIDENCE_THRESHOLD=0.45
HEAD_YAW_THRESHOLD=38
HEAD_PITCH_THRESHOLD=33
EYE_GAZE_THRESHOLD=0.48

# Alert deduplication
ALERT_DEDUP_WINDOW_SECONDS=15

# Device
DEVICE=0  # GPU (0, 1, ...) or "cpu"
```

## API Endpoints

### GET `/health`
Health check with model status

**Response**:
```json
{
  "status": "ok",
  "yolo_loaded": true,
  "mediapipe_loaded": true,
  "face_recognition_loaded": true,
  "device": "0"
}
```

### POST `/analyze`
Analyze monitoring snapshot

**Request**: `multipart/form-data` with `image` file

**Response**:
```json
{
  "success": true,
  "person_count": 1,
  "face_analysis": {
    "face_detected": true,
    "face_count": 1,
    "head_yaw": -5.2,
    "head_pitch": 3.1,
    "is_looking_away": false,
    "eye_gaze_ratio": 0.12,
    "is_gaze_deviated": false,
    "face_embedding": [0.123, -0.456, ...] // 128 floats (if face_recognition available)
  },
  "prohibited_objects": [],
  "risk_score": 5,
  "message": "Tidak ada aktivitas mencurigakan"
}
```

## Troubleshooting

### Issue: dlib build fails

**Linux**:
```bash
# Install build tools
sudo apt-get update
sudo apt-get install cmake build-essential

# Retry install
pip install -r requirements-face-recognition.txt
```

**Windows**:
1. Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/)
2. Select "Desktop development with C++" workload
3. Retry: `pip install -r requirements-face-recognition.txt`

**Alternative**: Use pre-built dlib wheel
```bash
# Find wheel for your Python version at:
# https://github.com/z-mahmud22/Dlib_Windows_Python3.x

# Install wheel
pip install dlib-19.24.0-cp311-cp311-win_amd64.whl
pip install face_recognition
```

### Issue: Service works but face_embedding is None

**Check**: Health endpoint shows `face_recognition_loaded: false`

**Cause**: face_recognition library not installed or import failed

**Solution**: Install optional dependencies manually (see above)

**Impact**: Service will work normally except identity mismatch detection will be disabled

## Performance

| Metric | Value |
|--------|-------|
| Processing time | ~200ms (without face recognition) |
| Processing time | ~280ms (with face recognition) |
| Memory usage | ~500MB (YOLO + MediaPipe + face_recognition) |
| Throughput | ~3-4 images/second |

## License

See main project LICENSE
