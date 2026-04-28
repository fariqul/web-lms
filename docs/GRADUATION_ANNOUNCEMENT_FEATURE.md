# Fitur Pengumuman Kelulusan Siswa (Graduation Announcement)

## 📋 Overview
Fitur yang memungkinkan admin menentukan status kelulusan siswa dan menghasilkan Surat Keterangan Lulus (SKL) otomatis. Siswa dapat melihat status kelulusan mereka dan mengunduh SKL jika dinyatakan lulus.

## 🎯 Fitur Utama

### 1. **Admin Panel Kelola Kelulusan**
- **URL:** `/admin/kelulusan`
- **Deskripsi:** Dashboard untuk admin mengelola status kelulusan per kelas
- **Fitur:**
  - Filter kelas akademik
  - List siswa dengan status current (pending/lulus/tidak_lulus)
  - Single student status edit dengan modal
  - Bulk edit: pilih beberapa siswa → ubah status sekaligus
  - Search filter (nama/NISN/email)
  - Statistics cards (jumlah lulus/tidak_lulus/pending)
  - Toast notifications untuk feedback

### 2. **Student View Pengumuman Kelulusan**
- **URL:** `/pengumuman-kelulusan`
- **Deskripsi:** Tab pengumuman khusus untuk status kelulusan siswa
- **Fitur:**
  - Tampil status kelulusan dengan warna-coded (hijau/merah/kuning)
  - Informasi detail: kelas, tanggal keputusan, admin yang memutuskan
  - Download button SKL untuk siswa yang lulus
  - Catatan dari admin (jika ada)
  - Instruksi penandatanganan SKL

### 3. **SKL (Surat Keterangan Lulus) Generation**
- **Format:** HTML yang printable
- **Konten:**
  - Nama dan identitas siswa (NISN, NIS)
  - Kelas dan tahun akademik
  - Kalimat pernyataan kelulusan
  - Tempat & tanggal penerbitan
  - Kolom tanda tangan (Kepala Sekolah, Wakil Kepala Akademik)
- **Storage:** `/storage/app/public/skl/`
- **Download:** Browser dapat men-download atau mencetak langsung

## 🔧 Implementasi Teknis

### Database Schema
```sql
CREATE TABLE student_graduations (
  id BIGINT PRIMARY KEY,
  student_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  status ENUM('pending', 'lulus', 'tidak_lulus') DEFAULT 'pending',
  notes TEXT,
  skl_path VARCHAR(255),
  decided_at TIMESTAMP,
  decided_by BIGINT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES class_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (student_id, class_id),
  INDEX (student_id, class_id, status)
);
```

### Backend Architecture

#### Models
**`StudentGraduation`** (`app/Models/StudentGraduation.php`)
- Relationships: student (BelongsTo User), class (BelongsTo ClassRoom), decidedBy (BelongsTo User)
- Scopes: lulus(), tidakLulus(), pending(), byClass($id), byStudent($id)
- Constants: STATUS_PENDING, STATUS_LULUS, STATUS_TIDAK_LULUS
- Helper: getStatusLabel($status)

#### Services
**`SKLGeneratorService`** (`app/Services/SKLGeneratorService.php`)
```php
// Static methods:
generateSKL(StudentGraduation $graduation): string
- Generates HTML SKL content
- Stores ke storage/app/public/skl/{filename}.html
- Returns file path relative to storage

downloadSKL(StudentGraduation $graduation): Response
- Returns file download response
```

#### Controllers
**`GraduationController`** (`app/Http/Controllers/Api/GraduationController.php`)
- `getMyGraduation()` - GET /graduation/my-status
- `getByClass(classId)` - GET /graduations/class/{classId}
- `setGraduationStatus(studentId, classId, data)` - POST /graduations/{studentId}/{classId}
- `bulkSetGraduationStatus(data)` - POST /graduations/bulk
- `downloadSKL()` - GET /graduation/download-skl
- `sendGraduationNotification(student, graduation)` - Helper untuk notifikasi

#### Routes
```php
// Admin routes (middleware: role:admin)
Route::get('/graduations/class/{classId}', [GraduationController::class, 'getByClass']);
Route::post('/graduations/{studentId}/{classId}', [GraduationController::class, 'setGraduationStatus']);
Route::post('/graduations/bulk', [GraduationController::class, 'bulkSetGraduationStatus']);

// Student routes (middleware: role:siswa)
Route::get('/graduation/my-status', [GraduationController::class, 'getMyGraduation']);
Route::get('/graduation/download-skl', [GraduationController::class, 'downloadSKL']);
```

### Frontend Components

#### Services (`src/services/api.ts`)
```typescript
export const graduationAPI = {
  getMyGraduation: () => api.get('/graduation/my-status'),
  downloadSKL: () => api.get('/graduation/download-skl', { responseType: 'blob' }),
  getByClass: (classId: number) => api.get(`/graduations/class/${classId}`),
  setGraduationStatus: (studentId, classId, data) => 
    api.post(`/graduations/${studentId}/${classId}`, data),
  bulkSetGraduationStatus: (data) => api.post('/graduations/bulk', data),
};
```

#### Pages
**Admin Panel** (`src/app/admin/kelulusan/page.tsx`)
- Component: `AdminGraduationPage`
- State: selectedClass, graduations, editingId, selectedStudents, search query
- Key functions:
  - `fetchClasses()` - Load all classes
  - `fetchGraduations()` - Load class graduations
  - `handleEditClick()` - Open edit modal
  - `handleSaveEdit()` - Save single student status
  - `handleBulkSave()` - Save bulk student statuses
  - `toggleStudentSelection()` - Toggle checkbox
  - Status color/badge helpers

**Student Announcement** (`src/app/pengumuman-kelulusan/page.tsx`)
- Component: `GraduationAnnouncementPage`
- State: loading, downloading, graduationStatus
- Key functions:
  - `fetchGraduationStatus()` - Load current user's graduation status
  - `handleDownloadSKL()` - Download SKL as HTML file
  - Status display helpers (colors, icons, text)
- Responsive layout dengan gradient background

## 🚀 Workflow Penggunaan

### Alur Admin
1. Admin masuk ke `/admin/kelulusan`
2. Pilih kelas dari dropdown
3. Sistem load list siswa dengan status current
4. Admin bisa:
   - **Edit Single:** Click "Edit" pada siswa → ubah status + catatan → "Simpan"
   - **Bulk Edit:** Pilih beberapa siswa → click "Ubah X Siswa" → ubah status untuk semua → "Simpan untuk X Siswa"
5. SKL otomatis di-generate jika status berubah ke "Lulus"
6. Toast notification confirmation pada setiap action
7. Stats card update real-time

### Alur Siswa
1. Siswa masuk ke `/pengumuman-kelulusan`
2. Sistem load status kelulusan mereka dari API
3. Tampilan berbeda berdasarkan status:
   - **Pending:** Informasi menunggu pengumuman
   - **Lulus:** Status hijau + tombol download SKL + instruksi penandatanganan
   - **Tidak Lulus:** Status merah + pesan hasil kelulusan
4. Jika lulus, siswa dapat:
   - Click "Unduh SKL"
   - Sistem download file HTML
   - Siswa dapat cetak langsung dari browser
   - Bawa ke sekolah untuk penandatanganan

## 📦 Dependencies
- **Frontend:** React 19, Next.js 16, TypeScript, Lucide icons, TailwindCSS
- **Backend:** Laravel 11, PHP 8.3, MySQL 8
- **PDF Generation:** Optional - dapat diintegrasikan dengan barryvdh/laravel-dompdf

## 🔐 Security Considerations

### Access Control
- Admin endpoints: Strict role check `role:admin` middleware
- Student endpoints: Can only access own graduation status
- SQL Injection prevention: Using Eloquent ORM
- XSS prevention: React auto-escapes, HTTP-only cookies for auth

### Data Protection
- SKL files stored di `/storage/app/public/skl/`
- Files accessible via authenticated download only
- Filename sanitized untuk keamanan
- Student dapat hanya download jika status = 'lulus'

### Audit Trail
- `decided_at` dan `decided_by` fields untuk tracking siapa mengubah status dan kapan
- Change history dapat di-query dari database

## 📱 Responsive Design
- Mobile-first approach
- Breakpoints: sm (640px), md (768px), lg (1024px), xl (1280px)
- Admin panel: Scrollable table pada mobile, full layout pada desktop
- Student view: Full-width card display optimal pada semua ukuran
- Dark mode support inherit dari DashboardLayout

## 🎨 UI/UX Patterns
- **Color Coding:**
  - Hijau (#10b981): Status Lulus
  - Merah (#ef4444): Status Tidak Lulus
  - Kuning (#eab308): Status Pending
- **Icons:** Lucide React - CheckCircle2, XCircle, AlertCircle, Download, etc.
- **Animations:** Smooth transitions, loading spinners
- **Modals:** Edit single/bulk dengan confirm buttons
- **Search:** Real-time filter by name/NISN/email

## 📊 Performance Considerations
- Lazy load graduations per class (tidak load semua classes sekaligus)
- Bulk operations dioptimalkan dengan loop + transaction
- Caching: Graduation status dapat di-cache per siswa (optional)
- Database indexes pada (student_id, class_id, status)

## 🔄 State Management
- React hooks: useState, useEffect
- API service layer handles all backend communication
- Toast notifications untuk user feedback
- Loading states untuk async operations

## 📚 Future Enhancements
1. **PDF Export:** Integrate barryvdh/laravel-dompdf untuk real PDF generation
2. **Email Notifications:** Send email ke siswa saat status di-set
3. **Bulk Import:** Import graduation status dari Excel/CSV
4. **History Tracking:** Show audit trail dari semua status changes
5. **Signature Storage:** Upload digital signature untuk SKL
6. **Certificate Download:** Generate PDF certificate untuk print
7. **Admin Reports:** Graduation statistics & analytics per tahun akademik

## 🐛 Known Limitations
- Current SKL format is HTML only (printable via browser)
- No digital signature integration yet
- Bulk operations show success count, but individual error handling basic
- No concurrent edit conflict detection

## ✅ Testing Checklist
- [ ] Admin can select class and load graduations
- [ ] Admin can edit single student status and see SKL generated
- [ ] Admin can bulk edit multiple students
- [ ] Search filter works correctly
- [ ] Student can view own graduation status
- [ ] Student can download SKL when lulus
- [ ] SKL HTML displays correctly in browser
- [ ] Permissions: Only admin can access /admin/kelulusan
- [ ] Permissions: Student can only see own status
- [ ] Mobile responsive on all breakpoints
- [ ] Error handling: Network errors show toast
- [ ] Notifications: Toast shows on success/error

## 🚀 Deployment Steps
1. Run migration: `php artisan migrate`
2. Create storage directory: `mkdir -p storage/app/public/skl`
3. Set proper permissions: `chmod -R 755 storage/`
4. Build frontend: `npm run build`
5. Clear cache: `php artisan cache:clear`
6. Test both admin and student views in production

## 📞 Support & Documentation
- API endpoint docs: See [API.md](./API.md) for full endpoint specifications
- Architecture docs: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- Deployment guide: See [SETUP_HOMESERVER.md](./SETUP_HOMESERVER.md)
