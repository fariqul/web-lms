# 🏗️ System Architecture & Integration

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├─────────────────────────────────────────────────────────────────┤
│  🌐 Browser (Web)            📱 Mobile Browser                   │
│  - Next.js Frontend          - Responsive UI                     │
│  - React 19 Components       - Camera Access                     │
│  - WebSocket Client          - QR Scanner                        │
└─────────────────────────────────────────────────────────────────┘
                                    ↕↕↕ HTTPS + WSS
                                  
┌─────────────────────────────────────────────────────────────────┐
│                      Gateway / Proxy Layer                       │
├─────────────────────────────────────────────────────────────────┤
│  - Reverse Proxy (Nginx)                                        │
│  - SSL/TLS Termination                                          │
│  - Rate Limiting                                                │
│  - Request Routing                                              │
└─────────────────────────────────────────────────────────────────┘
                ↕↕↕ HTTP/REST          ↕↕↕ WebSocket
                
┌─────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Server        │    │  Socket Server   │    │ Proctoring Srv  │
│   (Laravel 11)      │    │   (Node.js)      │    │   (Python)      │
├─────────────────────┤    ├──────────────────┤    ├─────────────────┤
│ • Auth/Sessions     │    │ • Real-time      │    │ • Face Detection│
│ • Exam CRUD         │    │   Updates        │    │ • Screen Check  │
│ • Grading          │    │ • Live Monitoring│    │ • Proctoring    │
│ • Attendance        │    │ • Notifications  │    │   Results       │
│ • User Mgmt         │    │ • Event Broadcast│    │                 │
└─────────────────────┘    └──────────────────┘    └─────────────────┘
        ↕ SQL                     ↕ Redis                ↕ HTTP
        
┌────────────────────────────────────────────────────────────────┐
│                     Data & Caching Layer                        │
├────────────────────────────────────────────────────────────────┤
│  📊 MySQL (Primary DB)    | 🔴 Redis (Cache & Sessions)        │
│  - Users                  | - Session store                      │
│  - Exams & Questions      | - API response cache                │
│  - Results & Answers      | - Rate limit counters               │
│  - Attendance             | - Real-time data                    │
│  - Work Photos (metadata) | - Pub/Sub messaging                 │
└────────────────────────────────────────────────────────────────┘
        ↕ File I/O
        
┌────────────────────────────────────────────────────────────────┐
│                    Storage Layer                                 │
├────────────────────────────────────────────────────────────────┤
│  💾 Local Storage              | ☁️ Cloud Storage (Optional)     │
│  - Work photos                 | - Backup exams                  │
│  - Uploaded materials          | - Archived results              │
│  - Generated reports           | - Log archives                  │
│  - Exam logs                   |                                 │
└────────────────────────────────────────────────────────────────┘
```

## Request Flow - Exam Submission

```
1. STUDENT SUBMITS EXAM
   └─ Click "Serahkan" button
      └─ Frontend validates (all photos uploaded, timer checked)
      └─ [POST] /api/exams/{id}/submit
         └─ Request body: { answers, duration, signature }

2. BACKEND PROCESSING
   └─ ExamController::submitExam()
      ├─ Validate JWT token (middleware)
      ├─ Check exam not already submitted
      ├─ Verify all answers present
      ├─ Lock exam record (prevent double submit)
      ├─ Calculate score for auto-graded questions
      ├─ Update exam_results.status = 'submitted'
      └─ Broadcast event: ExamSubmitted

3. SOCKET BROADCAST
   └─ BroadcastExamSubmitted event
      └─ Channel: "exam.{exam_id}"
      └─ Event: "exam:submitted"
      └─ Payload: { exam_id, student_id, status, ungradedEssays }
      └─ Admin listening on dashboard receives update

4. RESPONSE TO STUDENT
   ├─ 200 OK + exam result data
   ├─ Frontend shows: "Ujian berhasil diserahkan"
   ├─ Clear exam session
   └─ Redirect to results page

5. TEACHER GRADES ESSAYS
   └─ Teacher opens grading panel
      └─ [PATCH] /api/answers/{id}/grade
         └─ Request: { score, feedback }
         └─ Backend updates answer.graded_at, answer.score
         └─ If all essays graded:
            └─ exam_results.status = 'graded'
            └─ Broadcast: exam:fully_graded
```

## State Management Architecture

### Frontend State Layers

```
┌──────────────────────────────────────────────────────────────┐
│                    Global State (Context)                      │
├──────────────────────────────────────────────────────────────┤
│  • AuthContext - User auth state, permissions               │
│  • ToastContext - Notifications                             │
│  • ThemeContext - Dark/light mode                           │
└─────────────────────────────────────────────────────────────┘
                        ↓ useContext() hook
                        
┌─────────────────────────────────────────────────────────────┐
│              Page Component Local State                       │
├─────────────────────────────────────────────────────────────┤
│  Example: src/app/ujian/[id]/page.tsx                       │
│  • currentQuestion: Question                                │
│  • answers: Map<questionId, Answer>                        │
│  • timeRemaining: number                                    │
│  • isSubmitting: boolean                                    │
│  • cameraActive: boolean                                    │
│  • workPhotos: Map<answerId, File>                         │
└─────────────────────────────────────────────────────────────┘
                        ↓ useState() hook
                        
┌─────────────────────────────────────────────────────────────┐
│            Sub-Component Props (Controlled)                   │
├─────────────────────────────────────────────────────────────┤
│  Example: <QuestionCard question={q} onAnswer={...} />     │
│  Props drilled down from parent                             │
│  Callback functions bubble up events                        │
└─────────────────────────────────────────────────────────────┘
```

### Backend State Management

```
┌─────────────────────────────────────────────────────────────┐
│                  Session Storage (Redis)                      │
├─────────────────────────────────────────────────────────────┤
│  • User session ID                                          │
│  • CSRF token                                               │
│  • Exam in-progress lock                                    │
│  • Role-based permissions cache                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Database State (MySQL)                           │
├─────────────────────────────────────────────────────────────┤
│  • users - User credentials, roles                          │
│  • exam_results - Exam attempt records                      │
│  • answers - Student answers per question                  │
│  • exams - Exam definitions                                 │
│  • questions - Question bank                                │
│  • attendance_sessions - QR attendance                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│          Real-time State (WebSocket + Redis)                 │
├─────────────────────────────────────────────────────────────┤
│  • Active exam sessions (who's taking what exam)             │
│  • Current question being viewed                             │
│  • Active camera feeds (proctoring monitoring)               │
│  • Submitted exams (for admin dashboard)                     │
└─────────────────────────────────────────────────────────────┘
```

## Data Models & Entity Relationships

### Core Tables

```
users
├── id (PK)
├── name
├── email (UNIQUE)
├── password (hashed)
├── role (admin|guru|siswa)
├── is_blocked
├── blocked_at
├── block_reason
├── created_at
└── indexes: idx_role_blocked, idx_email

exams
├── id (PK)
├── teacher_id (FK → users)
├── class_id (FK → classes)
├── title
├── description
├── status (draft|published|active|closed)
├── duration_minutes
├── start_time
├── end_time
├── passing_score
├── question_count
├── created_at
└── indexes: idx_teacher_id, idx_class_id, idx_status

exam_results
├── id (PK)
├── exam_id (FK → exams)
├── student_id (FK → users)
├── status (draft|in_progress|submitted|graded)
├── total_score
├── ungradedEssays count
├── started_at
├── submitted_at
├── graded_at
├── duration_seconds
├── proctoring_data (JSON)
├── created_at
└── indexes: idx_student_status, idx_exam_id

questions
├── id (PK)
├── exam_id (FK → exams)
├── type (essay|multiple_choice|multiple_answer)
├── text
├── options (JSON for MCU)
├── correct_answers (JSON)
├── score_weight
├── order_position
└── indexes: idx_exam_id

answers
├── id (PK)
├── exam_result_id (FK → exam_results)
├── question_id (FK → questions)
├── student_answer
├── work_photo_path
├── score
├── graded_at (NULL until graded)
├── grade_comment
├── created_at
└── indexes: idx_exam_result_id, idx_graded_at

attendance_sessions
├── id (PK)
├── teacher_id (FK → users)
├── class_id (FK → classes)
├── qr_code (unique)
├── expires_at
├── created_at
├── indexes: idx_class_id, idx_qr_code

attendance_logs
├── id (PK)
├── session_id (FK → attendance_sessions)
├── student_id (FK → users)
├── checked_in_at
└── indexes: idx_session_student (UNIQUE)
```

## API Versioning Strategy

```
Current Version: v1

Endpoints pattern: /api/v1/resource/{id}/action

Examples:
  GET    /api/v1/exams              - List exams
  POST   /api/v1/exams              - Create exam
  GET    /api/v1/exams/{id}         - Get single exam
  PATCH  /api/v1/exams/{id}         - Update exam
  DELETE /api/v1/exams/{id}         - Delete exam
  
Advanced:
  POST   /api/v1/exams/{id}/submit  - Custom action
  PATCH  /api/v1/answers/{id}/grade - Grade answer
  POST   /api/v1/attendance         - Check-in

Authentication:
  Header: Authorization: Bearer {JWT_TOKEN}
  Token stored in httpOnly cookie (security)
  Expires: 24 hours
  Refresh endpoint: POST /api/v1/auth/refresh
```

## Security Architecture

### Authentication Flow
```
1. LOGIN
   ├─ POST /api/auth/login { email, password }
   └─ Backend validates credentials
      └─ Generate JWT token
      └─ Set httpOnly cookie
      └─ Return user data + permissions

2. AUTHENTICATED REQUEST
   ├─ Browser auto-sends cookie
   ├─ Middleware verifies token
   ├─ Extract user from token payload
   └─ Check role-based permissions

3. LOGOUT
   ├─ POST /api/auth/logout
   ├─ Clear cookie
   ├─ Frontend clears context
   └─ Redirect to /login
```

### Authorization Layers
```
1. Route Middleware
   └─ auth:sanctum (JWT verification)
   └─ role:admin|guru|siswa (role check)

2. Controller Level
   └─ $this->authorize('action', $resource);
   └─ Check ownership (student can only view own exams)

3. Query Level
   └─ Eloquent scopes to filter data
   └─ Example: User::where('role', 'siswa')->get()

4. Field Level
   └─ Don't return sensitive fields
   └─ Example: $user->makeHidden(['password', 'tokens']);
```

## Deployment Architecture

### Local Development
```
Single machine running:
├─ Next.js dev server (port 3000)
├─ Laravel server (port 8000)
├─ MySQL (port 3306)
├─ Redis (port 6379)
├─ Socket server (port 3001)
└─ Proctoring service (port 5000)

Via: docker-compose up -d
```

### Home Server Production
```
Single server with Docker:
├─ Frontend container (Next.js → Nginx)
├─ Backend container (Laravel)
├─ Database container (MySQL + volumes for persistence)
├─ Cache container (Redis)
├─ Socket server container (Node.js)
├─ Proctoring container (Python)
└─ Volumes for uploads (work photos, materials)

Via: docker-compose -f docker-compose.prod.yml up -d
```

### Cloud Deployment (Future Scaling)
```
Option 1 - Kubernetes:
├─ Frontend pods (Next.js) → Service → Ingress
├─ API pods (Laravel) → Service → HPA
├─ Socket pods (Node.js) → Service → Sticky sessions
├─ Database (Managed RDS)
├─ Cache (Managed Redis)
└─ Object storage (S3 / Google Cloud Storage)

Option 2 - Managed Platform (Vercel + Railway/Render):
├─ Frontend → Vercel
├─ Backend API → Railway
├─ Database → Managed PostgreSQL
├─ Cache → Managed Redis
└─ Storage → S3
```

## Monitoring & Observability Points

### Key Metrics
```
Application Level:
✓ API response times (ms)
✓ Error rates (5xx, 4xx)
✓ Request counts per endpoint
✓ Active exam sessions
✓ Work photo upload success rate
✓ Grading completion rate

Infrastructure Level:
✓ CPU usage (target: < 70%)
✓ Memory usage (target: < 80%)
✓ Disk space (alert: < 10%)
✓ Database connections
✓ Redis memory usage
✓ WebSocket connections

Business Level:
✓ Student pass rate
✓ Average exam duration
✓ Teacher grading lag
✓ System availability uptime
```

### Logging Points
```
Authentication:
└─ Failed login attempts
└─ Failed API token validation
└─ Permission denied events

Exam Operations:
└─ Exam created/modified/deleted
└─ Exam started/submitted
└─ Answer submitted
└─ Essay graded
└─ Status changed

Suspicious Activity:
└─ Multiple failed logins
└─ Unusual score changes
└─ Screen switching detected
└─ Camera access denied

iPhone Anti-Exit (Exam Mode):
└─ Event sumber: visibilitychange + blur + pagehide
└─ Ambang deteksi: 3 detik keluar aplikasi/tab
└─ Satu siklus keluar dihitung maksimal 1 pelanggaran (anti double-count)
└─ Backend tidak mengabaikan tipe kritikal: tab_switch, window_blur, fullscreen_exit

System:
└─ Database connection failures
└─ Cache misses
└─ WebSocket disconnections
└─ File upload failures
```

---

**Referensi architecture ini saat troubleshooting atau scaling project!**
