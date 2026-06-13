# Panduan Testing Proctoring Diagnostic Tool

## Persiapan

### 1. Upload File ke Server Sekolah

**Backend Files:**
```bash
# Upload controller
backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php

# Routes sudah di-update di:
backend/routes/api.php
```

**Models sudah ada:**
- `backend/app/Models/ProctoringDiagnosticTest.php`
- `backend/app/Models/ProctoringDiagnosticIssue.php`

**Service sudah ada:**
- `backend/app/Services/TroubleshootingEngine.php`

### 2. Jalankan Migrasi (jika belum)

```bash
cd backend
php artisan migrate
```

Pastikan 2 tabel dibuat:
- `proctoring_diagnostic_tests`
- `proctoring_diagnostic_issues`

### 3. Get Admin Token

Login sebagai admin dan dapatkan token:

```bash
# Login request
POST http://localhost/api/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password"
}
```

Response akan berisi `token`. Copy token ini untuk digunakan di semua request selanjutnya.

---

## Testing Endpoints

### Tool: Thunder Client / Postman / cURL

Install extension **Thunder Client** di VS Code atau gunakan **Postman**.

---

## 1. Test Health Check

**Endpoint:** `GET /api/proctoring-diagnostic/health`

**Thunder Client:**
```
Method: GET
URL: http://localhost/api/proctoring-diagnostic/health
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
```

**cURL:**
```bash
curl -X GET "http://localhost/api/proctoring-diagnostic/health" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "backend_api": {
      "status": "healthy",
      "response_time_ms": 12,
      "version": "1.0.0"
    },
    "proctoring_service": {
      "status": "healthy",
      "response_time_ms": 45,
      "yolo_loaded": true,
      "mediapipe_loaded": true,
      "face_recognition_loaded": true,
      "device": "gpu"
    },
    "database": {
      "status": "healthy",
      "response_time_ms": 8
    },
    "queue_workers": {
      "status": "running",
      "worker_count": 3
    },
    "last_check": "2024-12-28T14:35:00+08:00"
  }
}
```

**Troubleshooting:**
- ❌ 401 Unauthorized → Token salah atau expired
- ❌ 403 Forbidden → User bukan admin
- ❌ 500 Error → Check Laravel logs: `tail -f storage/logs/laravel.log`

---

## 2. Test Analyze Capture

**Endpoint:** `POST /api/proctoring-diagnostic/analyze`

### Cara Mendapatkan Base64 Image

**Opsi A: Gunakan online tool**
1. Buka https://www.base64-image.de/
2. Upload foto wajah Anda
3. Copy base64 string (dengan prefix `data:image/jpeg;base64,`)

**Opsi B: Gunakan PHP**
```php
$imageData = base64_encode(file_get_contents('photo.jpg'));
$base64 = "data:image/jpeg;base64," . $imageData;
```

**Thunder Client:**
```
Method: POST
URL: http://localhost/api/proctoring-diagnostic/analyze
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
  Content-Type: application/json
Body (JSON):
```

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "test_id": 1,
    "overall_health_score": 87,
    "overall_status": "healthy",
    "components": {
      "object_detection": {
        "status": "success",
        "score": 100,
        "confidence": 0.92,
        "details": { "detected_count": 1, "prohibited_count": 0 }
      },
      "face_detection": {
        "status": "success",
        "score": 100,
        "confidence": 0.98,
        "details": { "face_count": 1 }
      }
      // ... other components
    },
    "detected_objects": [],
    "detected_faces": [
      {
        "bbox": [100, 50, 300, 250],
        "head_pose": { "yaw": 5.2, "pitch": -3.1, "roll": 0.8 },
        "eye_gaze": { "left_ratio": 0.25, "right_ratio": 0.28 },
        "embedding_present": true,
        "embedding_dimensions": 128
      }
    ],
    "processing_time_ms": 285,
    "troubleshooting": [],
    "timestamp": "2024-12-28T14:32:15+08:00"
  }
}
```

**Troubleshooting:**
- ❌ 422 Validation Error → Image field required atau format salah
- ❌ 500 Error "Proctoring service error" → Proctoring service tidak jalan
  ```bash
  # Check proctoring service
  docker ps | grep proctoring
  docker logs proctoring-service
  ```

---

## 3. Test Get Test History

**Endpoint:** `GET /api/proctoring-diagnostic/tests`

**Thunder Client:**
```
Method: GET
URL: http://localhost/api/proctoring-diagnostic/tests
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "timestamp": "2024-12-28 14:32:15 WIB",
      "overall_health_score": 87,
      "overall_status": "healthy",
      "component_status": {
        "object_detection": "pass",
        "face_detection": "pass",
        "head_pose": "pass",
        "eye_gaze": "pass",
        "face_embedding": "pass"
      },
      "issues_count": 0,
      "admin_name": "Admin User",
      "test_type": "manual"
    }
  ]
}
```

---

## 4. Test Get Single Test Result

**Endpoint:** `GET /api/proctoring-diagnostic/tests/{id}`

**Thunder Client:**
```
Method: GET
URL: http://localhost/api/proctoring-diagnostic/tests/1
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "timestamp": "2024-12-28 14:32:15 WIB",
    "admin_name": "Admin User",
    "overall_health_score": 87,
    "overall_status": "healthy",
    "component_scores": { /* ... */ },
    "detected_objects": [],
    "detected_faces": [ /* ... */ ],
    "processing_time_ms": 285,
    "image_size_kb": 120,
    "test_type": "manual",
    "scenario_name": null,
    "issues": []
  }
}
```

---

## 5. Test Download Report

**Endpoint:** `GET /api/proctoring-diagnostic/tests/{id}/report`

**Thunder Client:**
```
Method: GET
URL: http://localhost/api/proctoring-diagnostic/tests/1/report
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
```

**Expected Response:** File JSON akan di-download dengan nama `diagnostic-test-1.json`

**Cara test di browser:**
```
http://localhost/api/proctoring-diagnostic/tests/1/report?token=YOUR_TOKEN
```

---

## 6. Test Compare Tests

**Endpoint:** `GET /api/proctoring-diagnostic/tests/compare?ids=1,2`

**Prasyarat:** Harus ada minimal 2 test di database

**Thunder Client:**
```
Method: GET
URL: http://localhost/api/proctoring-diagnostic/tests/compare?ids=1,2
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "test1": {
      "id": 1,
      "timestamp": "2024-12-28 14:32:15 WIB",
      "overall_health_score": 87,
      "overall_status": "healthy"
    },
    "test2": {
      "id": 2,
      "timestamp": "2024-12-28 15:10:22 WIB",
      "overall_health_score": 92,
      "overall_status": "healthy"
    },
    "comparison": {
      "overall_score_difference": 5,
      "component_differences": {
        "object_detection": {
          "test1_score": 95,
          "test2_score": 100,
          "difference": 5,
          "change_type": "improvement"
        }
        // ... other components
      },
      "improvements": [
        { "component": "object_detection", "improvement": 5 }
      ],
      "regressions": []
    }
  }
}
```

---

## 7. Test Run Scenario

**Endpoint:** `POST /api/proctoring-diagnostic/scenarios/{scenario}/run`

**Valid scenarios:**
- `object_detection`
- `multi_face`
- `head_turning`
- `identity_baseline`
- `identity_mismatch`

**Thunder Client:**
```
Method: POST
URL: http://localhost/api/proctoring-diagnostic/scenarios/object_detection/run
Headers:
  Authorization: Bearer YOUR_ADMIN_TOKEN_HERE
  Content-Type: application/json
Body (JSON):
```

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA..."
}
```

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "scenario": "object_detection",
    "test_id": 3,
    "verdict": "pass",
    "explanation": "PASS: Objek berhasil terdeteksi. Sistem object detection berfungsi dengan baik.",
    "requirements_met": [
      "Minimal 1 objek terdeteksi"
    ],
    "requirements_failed": [],
    "analysis": {
      // Same as analyze endpoint response
    }
  }
}
```

---

## Testing Checklist

### ✅ Backend API Tests

- [ ] Health check returns all services status
- [ ] Analyze capture dengan wajah normal (expected: healthy)
- [ ] Analyze capture dengan objek terlarang (expected: object detected)
- [ ] Analyze capture tanpa wajah (expected: suggestions muncul)
- [ ] Get test history (minimal 1 test)
- [ ] Get single test result
- [ ] Download report (file JSON ter-download)
- [ ] Compare 2 tests
- [ ] Run scenario: object_detection
- [ ] Run scenario: multi_face
- [ ] Run scenario: head_turning

### ✅ Authorization Tests

- [ ] Access tanpa token → 401 Unauthorized
- [ ] Access dengan token non-admin → 403 Forbidden
- [ ] Access dengan token admin → 200 OK

### ✅ Error Handling Tests

- [ ] POST analyze tanpa image field → 422 Validation Error
- [ ] GET test dengan ID tidak ada → 404 Not Found
- [ ] Compare dengan hanya 1 ID → 422 Validation Error
- [ ] Invalid scenario name → 422 Validation Error

---

## Troubleshooting Common Issues

### Issue 1: 401 Unauthorized
**Penyebab:** Token expired atau tidak valid  
**Solusi:** Login ulang dan dapatkan token baru

### Issue 2: 403 Forbidden
**Penyebab:** User bukan admin  
**Solusi:** Pastikan user memiliki role 'admin' di database

```sql
-- Check user role
SELECT id, name, email, role FROM users WHERE email = 'your@email.com';

-- Update role to admin
UPDATE users SET role = 'admin' WHERE id = 1;
```

### Issue 3: 500 Proctoring Service Error
**Penyebab:** Proctoring service tidak jalan  
**Solusi:**
```bash
# Check if running
docker ps | grep proctoring

# Restart if needed
docker-compose restart proctoring-service

# Check logs
docker logs proctoring-service
```

### Issue 4: Class 'ProctoringDiagnosticController' not found
**Penyebab:** File controller belum di-upload atau namespace salah  
**Solusi:**
```bash
# Verify file exists
ls -la backend/app/Http/Controllers/Api/ProctoringDiagnosticController.php

# Clear cache
php artisan cache:clear
php artisan config:clear
php artisan route:clear
```

### Issue 5: SQLSTATE[42S02]: Base table or view not found
**Penyebab:** Migrasi belum dijalankan  
**Solusi:**
```bash
php artisan migrate

# Check tables created
php artisan tinker
DB::table('proctoring_diagnostic_tests')->count();
```

---

## Next Steps

Setelah semua endpoint berhasil di-test:

1. ✅ Backend working → Lanjut implementasi frontend components (Task 11-14)
2. ❌ Ada error → Debug dulu sebelum lanjut frontend

**Ada pertanyaan atau error?** Paste error message untuk troubleshooting.
