<!-- Instruksi Copilot untuk LMS SMA 15 Makassar -->

## 📋 Gambaran Proyek
Sistem Manajemen Pembelajaran (LMS) untuk SMA 15 Makassar dengan fitur CBT Exam, attendance QR code otomatis, dan proctoring real-time. Dibangun dengan teknologi modern untuk memastikan keamanan, performa, dan user experience terbaik.

## 🔧 Tech Stack
| Kategori | Teknologi |
|----------|-----------|
| **Frontend** | Next.js 16, TypeScript, React 19, Tailwind CSS 4 |
| **Backend** | Laravel 11, PHP 8.3, MySQL 8 |
| **Real-time** | Socket.io, WebSocket Broadcasting |
| **Tools** | Axios (HTTP), Face-api.js (Face Detection), Recharts (Charts) |
| **Deployment** | Docker, Docker Compose, Home Server |

## 📁 Struktur Folder (Terstruktur)
```
src/
├── app/                    # Next.js App Router - Route pages & layouts
│   ├── (auth)/            # Group routes: login, register
│   ├── admin/             # Admin dashboard pages
│   ├── guru/              # Teacher features pages
│   └── siswa/             # Student features pages
├── components/            # Reusable React components
│   ├── ui/               # Atomic UI components (button, modal, card, etc)
│   ├── forms/            # Form components dengan validation
│   ├── modals/           # Modal components terstruktur
│   └── layouts/          # Layout wrappers (DashboardLayout, AdminLayout)
├── context/              # React Context providers (Auth, Toast, Theme)
├── hooks/                # Custom hooks (useExamMode, useSocket, useAuth)
├── services/             # API client & service layer
│   ├── api.ts           # Base API client dengan Axios
│   ├── exam.service.ts  # Exam-related API calls
│   └── user.service.ts  # User-related API calls
├── types/                # TypeScript type definitions & interfaces
├── constants/            # Constants, enums, static data
├── utils/                # Utility functions, helpers
└── lib/                  # Library configurations

backend/
├── app/
│   ├── Http/Controllers/Api/  # API Controllers (ExamController, UserController, etc)
│   ├── Models/               # Eloquent Models (User, Exam, ExamResult, etc)
│   ├── Services/             # Business logic layer
│   ├── Traits/               # Reusable model traits
│   └── Jobs/                 # Queue jobs untuk async operations
├── database/
│   ├── migrations/           # Database schema migrations
│   └── seeders/              # Database seeders untuk development
├── routes/
│   ├── api.php              # API routes dengan middleware grouping
│   └── web.php              # Web routes (jika ada)
├── config/                   # Configuration files
├── proctoring-service/      # Python service untuk face detection & integrity check
└── storage/                  # Uploaded files, logs, caches

docs/                         # Documentation files
├── API.md                    # API endpoint documentation
├── SETUP.md                  # Setup & installation guide
├── FEATURES.md               # Feature documentation
└── TROUBLESHOOTING.md        # Common issues & solutions
```

## 👥 User Roles & Permissions
| Role | Fitur Utama | Tanggung Jawab |
|------|-----------|----------------|
| **Admin** | User management, Class management, Statistics dashboard, System monitoring | Manajemen user & class, monitoring keseluruhan sistem |
| **Guru (Teacher)** | Exam creation, Attendance sessions, Student monitoring, Essay grading, Real-time proctoring | Membuat ujian, grade siswa, monitor keamanan ujian |
| **Siswa (Student)** | QR attendance, Take exams, View materials, Submit work photos, Check results | Mengikuti ujian, upload bukti kerja, lihat hasil |

## 🎯 Fitur Utama & Implementasi
### 1. **CBT Exam dengan Anti-Cheat**
- Mandatory camera monitoring & face detection (Face-api.js)
- Photo evidence upload untuk essay questions
- WebSocket real-time proctoring (admin melihat feed siswa live)
- Lock screen mode, prevent alt+tab/minimize
- Answer security: encrypted submission, tamper detection
- Status transitions: draft → in_progress → submitted → graded
- **File kunci**: `src/app/ujian/[id]/page.tsx`, `ExamController.php`, `proctoring-service/main.py`

### 2. **Attendance QR Code Otomatis**
- Dynamic QR generation per session (anti-titip/proxy)
- Time-based validation (valid hanya di jam session)
- Location verification (opsional)
- Real-time check-in updates via WebSocket
- **File kunci**: `src/app/siswa/attendance/page.tsx`, `AttendanceController.php`

### 3. **Real-time Monitoring & Notifications**
- WebSocket connections per exam session
- Admin dashboard live student status
- Instant notifications untuk suspicious activities
- Exam results broadcast real-time
- **File kunci**: `socket-server/server.js`, `useSocket` hook

## 🛠️ Konvensi & Best Practices

### 📝 TypeScript & Type Safety
- **WAJIB**: Gunakan TypeScript untuk SEMUA file baru (.ts, .tsx)
- Define types di `src/types/` untuk shared types
- Use strict mode dalam tsconfig
- Hindari `any` type - selalu define proper types
- Use interfaces untuk object structures, type untuk unions/primitives
```typescript
// ✅ Good
interface User {
  id: number;
  name: string;
  role: 'admin' | 'guru' | 'siswa';
}

// ❌ Avoid
const user: any = {...}
```

### 🎨 Component & Style Standards
- **Gunakan skill `frontend-design`** untuk desain yang estetis, bukan generic AI output
- Konsistensikan komponen & pattern design di seluruh aplikasi
- Spacing & typography yang harmonis (jangan terlalu banyak efek)
- Dark mode support built-in dengan Tailwind CSS 4
- Responsive design mobile-first: sm, md, lg, xl breakpoints
- Reusekan komponen UI dari `src/components/ui/`

### 🔌 API & Services Layer
- **Semua API calls HARUS** melalui `src/services/api.ts`
- Proper error handling dengan try-catch & toast notifications
- Request/Response typing dengan interfaces
- Axios interceptors untuk auth headers, token refresh
- Base URL dari environment variables
```typescript
// ✅ Good structure
const exams = await examService.getStudentExams();

// ❌ Avoid direct axios
const exams = await axios.get('/api/exams');
```

### 🌐 Real-time Features (WebSocket)
- Use custom hook `useSocket` untuk koneksi
- Implement proper disconnect/reconnect logic
- Message typing: define interfaces untuk setiap socket event
- Memory leak prevention: cleanup listeners on unmount
- **PENTING**: Test proctoring-service integrity (Python backend)

### ⚠️ Error Handling & Validation
**Frontend:**
- Try-catch blocks dengan error response parsing
- User-friendly error messages (Bahasa Indonesia)
- Optional chaining (?.) untuk nested property access
- Null coalescing (??) untuk default values

**Backend:**
- Validation di Controller level sebelum business logic
- Proper HTTP status codes (400 Bad Request, 401 Unauthorized, 422 Unprocessable Entity)
- Consistent error response format
- Log errors untuk debugging tanpa expose sensitive data
```json
{
  "success": false,
  "message": "Error message in Indonesian",
  "errors": { "field": ["error message"] }
}
```

### 🔐 Security Best Practices
- JWT tokens: store di httpOnly cookies, NEVER in localStorage
- CSRF protection: Laravel auto-enabled, verify in forms
- SQL Injection prevention: use Eloquent, NEVER raw queries
- XSS prevention: sanitize user input, React auto-escapes
- Role-based access control: middleware di routes & API
- Sensitive data (photos, files): private storage, secure URLs
- Password hashing: bcrypt (Laravel default)
- Rate limiting: apply ke login, API endpoints

**Data Sensitif:**
- Jangan stringify/log password, tokens, PII
- Pastikan exam answers encrypted at rest
- Work photos stored securely, accessible hanya ke authorized users
- Clear cache on logout

### 🧪 Testing & Quality Assurance
- **Frontend**: Test component rendering, user interactions, API mocking
- **Backend**: Test controllers, models, validation rules, edge cases
- Manual testing untuk fitur real-time & proctoring (critical path)
- Test responsiveness di mobile devices (Chrome DevTools)
- Test exam submission workflow end-to-end
```typescript
// Example test approach
describe('ExamPage', () => {
  it('should prevent submission with unsaved photos', async () => {
    // Test implementation
  });
});
```

### 📊 Performance Optimization
- **Frontend**: Code splitting per route, lazy load components
- Next.js Image optimization untuk photos
- Minimize bundle size: tree-shake unused code
- Database indexes untuk frequently queried columns (user_id, exam_id, status)
- WebSocket message batching untuk high-frequency updates
- Cache exam questions/materials (rarely change)
- Monitor: use Vercel Analytics untuk frontend, Laravel horizon untuk queues

### 🚀 Deployment & Environment
- **Docker Compose** untuk local dev: backend, database, redis, proctoring-service
- Environment variables: `.env.local` untuk development
- Database migrations: run di setiap deployment
- SSL certificates: setup untuk home server (docs/SETUP_HOMESERVER.md)
- Monitoring: setup logs aggregation, error tracking (Sentry/Bugsnag recommended)
- Backup database: automated daily backups ke cloud storage

### 📚 Dokumentasi & Communication
- Write clear comments untuk logic kompleks
- Document API endpoints: param, response, error cases
- Keep README.md updated dengan setup instructions
- Communicate dengan backend team untuk integration points
- Use type definitions sebagai self-documenting code
- Create feature docs di `docs/FEATURES.md` untuk fitur kompleks

## 🔄 Workflow Development
### Untuk Fitur Baru:
1. **Planning**: Define requirements, data model, user flow
2. **Backend First**: Create API endpoints, validation, migrations
3. **Frontend Design**: Sketch UI/UX (gunakan skill `frontend-design`)
4. **Implementation**: Develop component, integrate API
5. **Testing**: Manual test, fix bugs, edge cases
6. **Documentation**: Update API docs, feature docs
7. **Deployment**: Deploy backend dulu, test, deploy frontend

### Untuk Bug Fixes:
1. Reproduce error dengan clear steps
2. Identify root cause (frontend, backend, atau data)
3. Fix dengan minimal changes
4. Test fix thoroughly
5. Verify no regression di fitur related

## 📖 Bahasa & Komunikasi
- **Selalu gunakan Bahasa Indonesia** dalam:
  - Pertanyaan & diskusi tentang project
  - Komentar kode kompleks
  - Error messages & UI text
  - Documentation & feature descriptions
- Akan memudahkan tim pahami & collaborate

## 🤖 Agent Skills & Tools
- **skill `frontend-design`**: Untuk desain UI yang estetis & innovative
- **skill `find-docs`**: Cari dokumentasi teknologi yang relevan sebelum coding
- **skill `error-handling-patterns`**: Design error handling yang robust
- **skill `color-palette`**: Generate accessible color schemes
- **agent `Explore`**: Untuk research codebase yang kompleks

## ✅ Checklist Kualitas Kode
Sebelum push ke repository:
- [ ] TypeScript compiles tanpa error
- [ ] ESLint/Prettier rules passed
- [ ] No console.log atau debug code
- [ ] Error handling implemented
- [ ] API calls punya try-catch
- [ ] Responsive design tested
- [ ] Accessibility basic checks (keyboard nav, screen reader)
- [ ] Security: no sensitive data logged
- [ ] Performance: no N+1 queries, lazy load resources
- [ ] Documentation updated (README, API docs, feature docs)