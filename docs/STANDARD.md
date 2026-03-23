# 📐 Standard & Best Practices

## Database Optimization Standards

### Indexing Strategy
```sql
-- ✅ Add indexes untuk frequently queried columns
ALTER TABLE users ADD INDEX idx_role_blocked (role, is_blocked);
ALTER TABLE exam_results ADD INDEX idx_student_status (student_id, status);
ALTER TABLE answers ADD INDEX idx_exam_student (exam_id, student_id);

-- Query akan JAUH lebih cepat
SELECT * FROM exam_results 
WHERE student_id = 123 AND status = 'submitted'
ORDER BY created_at DESC;
```

### N+1 Query Prevention
```php
// ❌ N+1 Query
$exams = Exam::all();
foreach ($exams as $exam) {
    $results = ExamResult::where('exam_id', $exam->id)->count(); // DB call per exam!
}

// ✅ Use relationships & eager loading
$exams = Exam::with('results')->get();
foreach ($exams as $exam) {
    echo $exam->results->count(); // Already loaded in memory
}

// ✅ Better - use aggregation
$exams = Exam::withCount('results')->get();
foreach ($exams as $exam) {
    echo $exam->results_count; // No additional queries
}
```

### Connection Pooling untuk Production
```php
// config/database.php
'connections' => [
    'mysql' => [
        'driver' => 'mysql',
        'host' => env('DB_HOST', 'localhost'),
        'pool' => [
            'min' => 5,
            'max' => 20, // Sesuaikan dengan traffic
        ],
    ],
],
```

## Caching Standards

### Query Caching
```php
// Cache expensive queries
public function getStudentResults($studentId)
{
    return Cache::remember(
        "student:$studentId:results",
        now()->addHours(1), // TTL 1 hour
        fn() => ExamResult::where('student_id', $studentId)->get()
    );
}

// Invalidate on update
public function submitExam(ExamResult $result)
{
    $result->save();
    Cache::forget("student:{$result->student_id}:results");
}
```

### Frontend Caching Strategy
```typescript
// SWR (Stale-While-Revalidate) pattern
import useSWR from 'swr';

function StudentExams() {
  const { data: exams, error, mutate } = useSWR(
    '/api/exams/my-exams',
    fetcher,
    {
      revalidateOnFocus: false, // Don't refetch on tab focus
      dedupingInterval: 60000, // Cache untuk 1 menit
    }
  );

  return <div>{/* Show cached data */}</div>;
}
```

## API Response Standards

### Consistent Response Format
```json
{
  "success": true,
  "message": "Data berhasil diambil",
  "data": { /* actual data */ },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0"
  }
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Validasi gagal",
  "errors": {
    "email": ["Email sudah terdaftar", "Format email tidak valid"],
    "password": ["Password minimal 8 karakter"]
  }
}
```

### Pagination Standard
```json
{
  "success": true,
  "data": [ /* items */ ],
  "pagination": {
    "total": 150,
    "per_page": 15,
    "current_page": 1,
    "last_page": 10,
    "next_page": 2
  }
}
```

## Performance Benchmarks

### Frontend Target Metrics
| Metric | Target | Tool |
|--------|--------|------|
| Time to Interactive (TTI) | < 3s | Lighthouse |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| First Input Delay (FID) | < 100ms | Web Vitals |
| Cumulative Layout Shift (CLS) | < 0.1 | Web Vitals |
| Bundle Size | < 400KB | Next.js analyzer |

### Backend Targets
| Metric | Target | Tool |
|--------|--------|------|
| API response | < 200ms (p95) | New Relic / Datadog |
| DB query | < 100ms (p95) | Log analysis |
| Cache hit rate | > 80% | Redis CLI |
| Concurrent users | > 500 | Load test |

### Optimization Checklist
- [ ] Images optimized & webp format
- [ ] Code splitting per route
- [ ] Minified CSS/JS
- [ ] Database queries optimized
- [ ] Caching strategy implemented
- [ ] Images lazy-loaded
- [ ] Third-party scripts deferred

## Monitoring & Observability

### Logging Standards
```typescript
// Frontend - structured logging
const logAnalytics = {
  event: 'exam_submitted',
  user_id: user.id,
  exam_id: exam.id,
  duration_seconds: totalTime,
  timestamp: new Date().toISOString(),
};
console.log(JSON.stringify(logAnalytics));
```

```php
// Backend - use structured logging
Log::info('exam_submitted', [
    'user_id' => auth()->id(),
    'exam_id' => $examResult->exam_id,
    'duration' => $examResult->duration_seconds,
    'status' => $examResult->status,
]);
```

### Metrics to Monitor
```
Frontend:
- Page load time
- API error rate
- User interactions (exam starts, submissions)
- Camera/proctoring errors

Backend:
- API response times
- Database query times
- Failed validations
- Authentication failures
- File uploads (work photos)
- WebSocket connections

Database:
- Slow queries
- Connection count
- Query lock waits
- Disk space
```

### Alert Thresholds
| Issue | Threshold | Action |
|-------|-----------|--------|
| API Error Rate | > 5% | Immediate investigation |
| DB Query Time | > 1s (p95) | Review indexes |
| Memory Usage | > 80% | Check for leaks |
| Disk Space | < 10% free | Cleanup / Scale storage |
| Failed Logins | > 10/min/IP | Rate limit |

## Testing Standards

### Coverage Targets
```
Frontend Components: > 80% coverage
API Endpoints: > 75% coverage (focus on happy path & errors)
Critical paths: 100% (auth, exam submission, grading)
```

### Test Types by Feature
```
Exam Features:
- Unit: Question parsing, score calculation
- Integration: Exam creation → submission → grading
- E2E: Complete exam workflow with UI

Proctoring Features:
- Unit: Face detection logic
- Integration: Camera capture → backend → storage
- Manual: Visual verification of camera feed

Real-time Features:
- Unit: Socket event formatting
- Integration: Event broadcast & reception
- Load: Concurrent socket connections
```

## Security Checklist

### Before Production Deploy
- [ ] HTTPS enforced (SSL certificate)
- [ ] CORS properly configured
- [ ] SQLi prevention (use ORM, parameterized queries)
- [ ] XSS prevention (input sanitization)
- [ ] CSRF tokens on forms
- [ ] Rate limiting on auth endpoints
- [ ] Password requirements enforced
- [ ] Sensitive data not logged
- [ ] Secrets in environment variables only
- [ ] Database backups configured
- [ ] File upload validation (size, type, malware scan)
- [ ] JWT expiration set (default 24 hours)
- [ ] httpOnly + Secure cookies
- [ ] Admin endpoints require role check
- [ ] Audit logging for sensitive ops

### Exam Security Specific
- [ ] Camera access required for exam
- [ ] Work photo upload to essay only
- [ ] Answer submission encrypted
- [ ] Exam timer server-side validated
- [ ] Prevent alt+tab / screen switching
- [ ] Disable copy/paste during exam
- [ ] Proctoring service heartbeat monitored
- [ ] Suspicious activity logged

## Documentation Standards

### API Documentation Template
```markdown
### GET /api/exams/{id}/results

**Description:** Ambil hasil ujian specific exam

**Authentication:** Required (JWT)

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| id | integer | Yes | Exam ID |
| include_answers | boolean | No | Include jawaban siswa |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "exam_id": 1,
    "results": [ /* ExamResult objects */ ]
  }
}
```

**Errors:**
- 401: Not authenticated
- 403: No permission
- 404: Exam not found

**Example:**
```curl
curl -X GET https://api.example.com/api/exams/1/results \
  -H "Authorization: Bearer TOKEN"
```
```

### Feature Documentation Template
```markdown
## Fitur: Work Photo untuk Essay

### Overview
Students dapat upload foto cara kerja mereka saat mengerjakan essay questions.
Fitur ini untuk verifikasi integritas exam dan mencegah cheating.

### User Flow
1. Student membuka exam → essay question
2. Upload photo tombol muncul
3. Student ambil foto via camera / upload dari galeri
4. Photo di-save, exam dapat di-submit
5. Teacher review photo saat grading

### Technical Details
- Photo stored in `storage/work-photos/{exam_id}/{student_id}/`
- Max size: 5MB, formats: JPG, PNG
- Uploaded via multipart/form-data
- Only for question type: 'essay'

### Key Files
- Frontend: `src/app/ujian/[id]/page.tsx`
- Backend: `ExamController::uploadWorkPhoto()`
- Table: `answers.work_photo_path`

### Error Handling
- Video/corrupt file: 422 response
- Non-essay question: 403 Forbidden
```

---

**Terapkan standar ini untuk production-ready code!**
