FROM python:3.11-slim

# Install system dependencies (OpenCV + MediaPipe + dlib requirements)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    cmake \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install core Python dependencies (required)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install face recognition dependencies (optional - may fail gracefully)
COPY requirements-face-recognition.txt .
RUN pip install --no-cache-dir -r requirements-face-recognition.txt || \
    echo "Warning: face_recognition installation failed. Identity verification will be disabled."

# Download YOLO v8 nano model
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY . .

EXPOSE 8001

# Use 1 worker for GPU inference
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
