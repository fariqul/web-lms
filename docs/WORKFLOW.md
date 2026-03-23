# 🚀 Development Workflow & Troubleshooting

## Setting Up Development Environment

### Prerequisites
```bash
# Node.js & npm
node --version  # >= 20.x
npm --version   # >= 10.x

# PHP & Laravel (backend setup separately)
php --version   # >= 8.3
composer --version

# Docker (optional but recommended)
docker --version
docker-compose --version
```

### Frontend Setup
```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env.local
# Edit .env.local dengan:
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# 3. Run development server
npm run dev
# Open http://localhost:3000
```

### Backend Setup (Docker)
```bash
# 1. Start services
docker-compose up -d

# 2. Run migrations
docker exec -it project-amsp-backend php artisan migrate --seed

# 3. Check status
docker-compose ps
```

### Docker Compose Services
```yaml
Services yang berjalan:
- backend (Laravel): http://localhost:8000
- database (MySQL): localhost:3306
- redis (Cache): localhost:6379
- socket-server (Node.js): http://localhost:3001
- proctoring-service (Python): http://localhost:5000
```

## Common Development Tasks

### Adding a New Feature

```bash
# 1. Create feature branch
git checkout -b feature/exam-scheduling

# 2. Backend - Create migration
php artisan make:model ExamSchedule -m

# 3. Backend - Create controller & routes
php artisan make:controller Api/ExamScheduleController --api

# 4. Frontend - Create page & components
mkdir -p src/app/admin/exam-schedule
touch src/app/admin/exam-schedule/page.tsx

# 5. Frontend - Create service methods
# Edit src/services/api.ts to add API calls

# 6. Test locally
npm run dev
npm run build  # Test production build

# 7. Verify no errors
npm run lint
php artisan tinker  # Test backend logic
```

### Creating Database Migration

```bash
# Generate migration
php artisan make:migration create_exam_schedules_table

# Edit database/migrations/####_create_exam_schedules_table.php
# Example:
```php
Schema::create('exam_schedules', function (Blueprint $table) {
    $table->id();
    $table->foreignId('exam_id')->constrained()->onDelete('cascade');
    $table->dateTime('scheduled_at');
    $table->dateTime('started_at')->nullable();
    $table->dateTime('ended_at')->nullable();
    $table->enum('status', ['scheduled', 'active', 'completed', 'cancelled']);
    $table->timestamps();
    
    $table->index('exam_id');
    $table->index('scheduled_at');
});
```

# Run migration
php artisan migrate
```

### Running Tests

```bash
# Frontend tests
npm test
npm test -- --coverage

# Backend tests
docker exec -it project-amsp-backend php artisan test
docker exec -it project-amsp-backend php artisan test --filter=ExamControllerTest
```

### Debugging

#### Frontend Debugging
```typescript
// 1. Browser DevTools
// Open Chrome DevTools (F12)
// - Network tab: check API calls
// - Application tab: check localStorage/cookies
// - Console: check errors

// 2. React DevTools
// Install React DevTools browser extension
// - Component tree inspection
// - Props/state visualization

// 3. VS Code Debugging
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "console": "integratedTerminal"
    }
  ]
}
```

#### Backend Debugging
```bash
# 1. Enable query logging
# In .env: DB_LOG_QUERIES=true

# 2. Check logs
tail -f storage/logs/laravel.log

# 3. Use tinker untuk debugging
php artisan tinker
>>> $user = User::find(1);
>>> $user->exams()->count();
>>> exit;

# 4. Add debugging to code
\Log::debug('Debug message', ['context' => $variable]);
```

## 🐛 Common Issues & Solutions

### Issue 1: CORS Error - "Access to XMLHttpRequest blocked"
**Symptom:** Frontend API calls fail with CORS error

**Solution:**
```php
// config/cors.php
'allowed_origins' => [
    'http://localhost:3000',
    'https://lms.example.com',
],

'allowed_methods' => ['*'],
'allowed_headers' => ['*'],
'supports_credentials' => true,
```

### Issue 2: WebSocket Connection Fails
**Symptom:** Real-time features tidak bekerja, WebSocket tidak konek

**Solution:**
```bash
# 1. Check socket server running
docker-compose ps  # socket-server harus UP

# 2. Check NEXT_PUBLIC_SOCKET_URL di .env.local
# Pastikan address & port benar

# 3. Check browser console untuk connection error
# Open DevTools > Console

# 4. Restart socket server
docker-compose restart socket-server

# 5. Verify socket service
curl http://localhost:3001/health
```

### Issue 3: Database Migration Error
**Symptom:** "SQLSTATE[42S02]: Table not found" error

**Solution:**
```bash
# 1. Check migration status
php artisan migrate:status

# 2. Rollback jika ada error
php artisan migrate:rollback

# 3. Check migration file untuk SQL errors
cat database/migrations/####_xxxx.php

# 4. Re-run migration
php artisan migrate
```

### Issue 4: Camera/Proctoring Not Working
**Symptom:** Camera tidak muncul di exam, proctoring tidak jalan

**Solution:**
```typescript
// 1. Check camera permissions dalam browser
// Settings > Privacy > Camera > Allow

// 2. Check face-api.js models loaded
// Console: check if face-api models available
console.log(faceapi.getModels());

// 3. Check proctoring service
curl http://localhost:5000/health

// 4. Verify camera access
// Edit: src/hooks/useProctoring.ts
// Add: console.log('Camera access:', stream);
```

### Issue 5: JWT Token Expired
**Symptom:** Suddenly logged out, API returns 401 Unauthorized

**Solution:**
```php
// config/sanctum.php
'expiration' => 24 * 60, // 24 hours

// Implement token refresh
// Backend: create refresh endpoint
// Frontend: interceptor untuk auto-refresh
```

```typescript
// src/services/api.ts
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try refresh token
      const newToken = await api.post('/auth/refresh');
      // Retry original request
      return api(error.config);
    }
    throw error;
  }
);
```

### Issue 6: Slow API Response / Database Timeout
**Symptom:** API calls timeout atau sangat lambat

**Solution:**
```php
// 1. Check N+1 queries
// Enable query logging dan analisis

// 2. Add database indexes
ALTER TABLE exam_results ADD INDEX idx_student_status (student_id, status);

// 3. Implement caching
Cache::remember('exams:active', 3600, fn() => Exam::where('status', 'active')->get());

// 4. Use pagination
Exam::paginate(15); // Instead of get() semua

// 5. Check Laravel Horizon untuk queue jobs
docker exec -it project-amsp-backend php artisan horizon
```

### Issue 7: Out of Memory Error
**Symptom:** "Fatal error: Allowed memory size exhausted"

**Solution:**
```bash
# 1. Increase PHP memory limit
# docker-compose.yml atau php.ini
php_memory_limit=512M

# 2. Check memory usage
docker stats project-amsp-backend

# 3. Optimize queries (avoid loading huge collections)
# Bad: User::all() dalam loop
# Good: User::chunk(100, fn($users) => { ... })
```

### Issue 8: Work Photo Upload Fails
**Symptom:** Upload photo gagal dengan 422 error

**Solution:**
```typescript
// 1. Check file validation

// Frontend validation:
const file = event.target.files?.[0];
if (!file) return;
if (file.size > 5 * 1024 * 1024) {
  alert('File terlalu besar (max 5MB)');
  return;
}
if (!['image/jpeg', 'image/png'].includes(file.type)) {
  alert('Format harus JPG atau PNG');
  return;
}

// 2. Check backend validation
// ExamController::uploadWorkPhoto()
$request->validate([
    'photo' => 'required|image|max:5120|mimes:jpeg,png',
    'answer_id' => 'required|exists:answers,id',
]);

// 3. Check storage permissions
chmod -R 777 storage/app/work-photos

// 4. Check disk space
df -h
```

### Issue 9: Real-time Exam Status Not Updating
**Symptom:** Admin dashboard tidak menampilkan real-time student progress

**Solution:**
```typescript
// 1. Check socket listeners registered
useEffect(() => {
  if (!socket) return;
  
  // Debug: log all incoming events
  socket.onAny((event, ...args) => {
    console.log('Socket event:', event, args);
  });

  return () => socket.offAny();
}, [socket]);

// 2. Check backend broadcasting
// ExamController::submitExam()
// Pastikan: event(new ExamSubmitted($examResult));

// 3. Verify socket channel subscription
// Should match: "exam.{exam_id}"
socket.on('exam:submitted', handleExamUpdate);
```

### Issue 10: Build/Compile Error
**Symptom:** "npm run build" atau "php artisan build" gagal

**Solution:**
```bash
# Frontend
npm run lint  # Check linting errors
npm run build -- --no-cache  # Force rebuild
rm -rf .next node_modules && npm install && npm run build

# Backend
php artisan config:cache  # Clear cache
php artisan route:cache
composer dump-autoload

# Check TypeScript errors
npx tsc --noEmit
```

## Performance Tuning

### Frontend Optimization
```bash
# 1. Analyze bundle size
npm run build
npx next-bundle-analyzer

# 2. Enable compression
# next.config.ts
compress: true

# 3. Image optimization
# Use next/image component
import Image from 'next/image';
<Image src={url} alt="" width={400} height={300} />
```

### Backend Optimization
```bash
# 1. Cache configuration
php artisan config:cache
php artisan route:cache

# 2. Database optimization
php artisan db:seed --class=CreateIndexes

# 3. Queue monitoring
php artisan horizon

# 4. Monitor performance
php artisan telescope  # Laravel Telescope
```

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] No console errors or warnings
- [ ] Environment variables set correctly
- [ ] Database migrations tested
- [ ] Build succeeds locally
- [ ] Security checklist completed
- [ ] Performance benchmarks met
- [ ] Documentation updated

### Deployment Steps
```bash
# 1. Backend
docker-compose build backend
docker-compose up -d backend

# 2. Run migrations
docker exec -it project-amsp-backend php artisan migrate --force

# 3. Frontend build
npm run build
npm run start

# 4. Verify deployment
curl https://lms.example.com/api/health
curl https://lms.example.com
```

### Post-Deployment
- [ ] Check error logs
- [ ] Monitor server metrics
- [ ] Test critical user flows
- [ ] Verify email notifications send
- [ ] Check backup running
- [ ] Setup monitoring alerts

---

**Gunakan guide ini untuk troubleshooting dan development yang smooth!**
