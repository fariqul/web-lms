import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

/**
 * Convert storage URLs to use HTTPS backend domain.
 * Handles old records that stored http://52.63.72.178/storage/... URLs.
 */
export function getSecureFileUrl(url: string | undefined | null): string {
  if (!url) return '';
  // Replace old HTTP backend URL with HTTPS domain
  return url
    .replace('http://52.63.72.178', 'https://sma15lms.duckdns.org')
    .replace('http://localhost:8000', 'https://sma15lms.duckdns.org');
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 60000, // Increased to 60 seconds for slow connections
});

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

// Helper function to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors with retry logic
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { _retryCount?: number };
    
    // Don't retry if no config or if it's a 401/403 error
    if (!config || error.response?.status === 401 || error.response?.status === 403) {
      if (error.response?.status === 401) {
        // Unauthorized - clear token and redirect to login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    }

    // Initialize retry count
    config._retryCount = config._retryCount || 0;

    // Check if we should retry (network errors or timeout)
    const shouldRetry = 
      config._retryCount < MAX_RETRIES && 
      (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK' || !error.response);

    if (shouldRetry) {
      config._retryCount += 1;
      await delay(RETRY_DELAY * config._retryCount);
      return api(config);
    }

    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  login: (login: string, password: string) =>
    api.post('/login', { login, password }),
  
  logout: () =>
    api.post('/logout'),
  
  me: () =>
    api.get('/me'),
  
  register: (data: {
    name: string;
    email: string;
    password: string;
    role: string;
    class_id?: number;
  }) => api.post('/register', data),

  forgotPassword: (email: string, contact?: { contact_type?: string; contact_value?: string; nama?: string }) =>
    api.post('/forgot-password', { email, ...contact }),

  resetPassword: (data: { token: string; email: string; password: string; password_confirmation: string }) =>
    api.post('/reset-password', data),
};

// User API
export const userAPI = {
  getAll: (params?: { role?: string; class_id?: number; page?: number; per_page?: number }) =>
    api.get('/users', { params }),
  
  getById: (id: number) =>
    api.get(`/users/${id}`),
  
  create: (data: Partial<{
    name: string;
    email: string;
    password: string;
    role: string;
    class_id: number;
  }>) => api.post('/users', data),
  
  update: (id: number, data: Partial<{
    name: string;
    email: string;
    role: string;
    class_id: number;
  }>) => api.put(`/users/${id}`, data),
  
  delete: (id: number) =>
    api.delete(`/users/${id}`),
  
  resetPassword: (id: number, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
};

// Class API
export const classAPI = {
  getAll: () =>
    api.get('/classes'),
  
  getById: (id: number) =>
    api.get(`/classes/${id}`),
  
  create: (data: { name: string; grade?: string; grade_level?: string; academic_year: string }) =>
    api.post('/classes', data),
  
  update: (id: number, data: Partial<{ name: string; grade?: string; grade_level?: string; academic_year: string }>) =>
    api.put(`/classes/${id}`, data),
  
  delete: (id: number) =>
    api.delete(`/classes/${id}`),
  
  getStudents: (id: number) =>
    api.get(`/classes/${id}/students`),
};

// Attendance API
export const attendanceAPI = {
  // Session management (Teacher)
  startSession: (data: {
    class_id: number;
    subject: string;
    duration_minutes?: number;
  }) => api.post('/attendance/session/start', data),
  
  stopSession: (sessionId: number) =>
    api.post(`/attendance/session/${sessionId}/stop`),
  
  getActiveSessions: () =>
    api.get('/attendance/sessions/active'),
  
  getSessionById: (id: number) =>
    api.get(`/attendance/sessions/${id}`),
  
  // QR Scanning (Student)
  scanQR: (data: {
    qr_token: string;
    photo: string; // base64
    ip_address?: string;
  }) => api.post('/attendance/scan', data),
  
  // Get attendance records
  getBySession: (sessionId: number) =>
    api.get(`/attendance/session/${sessionId}/records`),
  
  getStudentAttendance: (studentId: number, params?: { month?: number; year?: number }) =>
    api.get(`/attendance/student/${studentId}`, { params }),
  
  getStudentHistory: () =>
    api.get('/attendance/history'),
  
  getClassAttendance: (classId: number, params?: { date?: string }) =>
    api.get(`/attendance/class/${classId}`, { params }),
};

// Exam API
export const examAPI = {
  getAll: (params?: { class_id?: number; status?: string; page?: number }) =>
    api.get('/exams', { params }),
  
  getById: (id: number) =>
    api.get(`/exams/${id}`),
  
  create: (data: {
    class_id: number;
    title: string;
    subject: string;
    description?: string;
    start_time: string;
    end_time: string;
    duration: number;
    seb_required?: boolean;
    seb_allow_quit?: boolean;
    seb_quit_password?: string;
    seb_block_screen_capture?: boolean;
    seb_allow_virtual_machine?: boolean;
    seb_show_taskbar?: boolean;
  }) => api.post('/exams', data),
  
  update: (id: number, data: Partial<{
    title: string;
    subject: string;
    description: string;
    start_time: string;
    end_time: string;
    duration: number;
    status: string;
    seb_required: boolean;
    seb_allow_quit: boolean;
    seb_quit_password: string;
    seb_block_screen_capture: boolean;
    seb_allow_virtual_machine: boolean;
    seb_show_taskbar: boolean;
  }>) => api.put(`/exams/${id}`, data),
  
  delete: (id: number) =>
    api.delete(`/exams/${id}`),
  
  // Questions
  getQuestions: (examId: number) =>
    api.get(`/exams/${examId}/questions`),
  
  addQuestion: (examId: number, data: {
    type: string;
    question_text: string;
    options?: string[];
    correct_answer?: string;
    points: number;
  }) => api.post(`/exams/${examId}/questions`, data),
  
  updateQuestion: (examId: number, questionId: number, data: Partial<{
    question_text: string;
    options: string[];
    correct_answer: string;
    points: number;
  }>) => api.put(`/exams/${examId}/questions/${questionId}`, data),
  
  deleteQuestion: (examId: number, questionId: number) =>
    api.delete(`/exams/${examId}/questions/${questionId}`),
  
  // Student exam actions
  start: (examId: number) =>
    api.post(`/exam/${examId}/start`),
  
  submitAnswer: (examId: number, data: {
    question_id: number;
    answer: string;
  }) => api.post(`/exam/${examId}/answer`, data),
  
  submit: (examId: number) =>
    api.post(`/exam/${examId}/submit`),
  
  getResult: (examId: number, studentId?: number) =>
    api.get(`/exams/${examId}/result`, { params: { student_id: studentId } }),
  
  getAllResults: (examId: number) =>
    api.get(`/exams/${examId}/results`),
};

// Monitoring API
export const monitoringAPI = {
  uploadSnapshot: (data: {
    exam_id: number;
    photo: string; // base64
  }) => {
    // Convert base64 to blob and send as FormData
    const formData = new FormData();
    try {
      const byteString = atob(data.photo.split(',')[1]);
      const mimeString = data.photo.split(',')[0].split(':')[1].split(';')[0] || 'image/jpeg';
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });
      // Use File instead of Blob for better MIME detection on backend
      const file = new File([blob], `snapshot_${Date.now()}.jpg`, { type: mimeString });
      formData.append('image', file);
    } catch (e) {
      console.error('[Snapshot] Failed to convert base64 to file:', e);
      return Promise.reject(e);
    }
    
    // DON'T set Content-Type manually — let axios/browser set it with correct boundary
    return api.post(`/exams/${data.exam_id}/snapshot`, formData, {
      timeout: 30000, // 30s timeout for upload
    });
  },
  
  // Upload snapshot directly from a Blob (no base64 conversion needed)
  uploadSnapshotBlob: (examId: number, blob: Blob) => {
    const formData = new FormData();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const file = new File([blob], `snapshot_${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
    formData.append('image', file);
    return api.post(`/exams/${examId}/snapshot`, formData, {
      timeout: 15000, // 15s — snapshots are now small (320×240 JPEG)
    });
  },

  reportViolation: (data: {
    exam_id: number;
    type: string;
    description?: string;
  }) => api.post(`/exams/${data.exam_id}/violation`, data),
  
  getViolations: (examId: number, studentId?: number) =>
    api.get(`/exams/${examId}/results/${studentId}`),
  
  getExamMonitoring: (examId: number) =>
    api.get(`/exams/${examId}/monitoring`),
};

// Schedule API
export const scheduleAPI = {
  getAll: (params?: { class_id?: number; teacher_id?: number; day?: number }) =>
    api.get('/schedules', { params }),
  
  getById: (id: number) =>
    api.get(`/schedules/${id}`),
  
  create: (data: {
    class_id: number;
    subject: string;
    teacher_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room?: string;
  }) => api.post('/schedules', data),
  
  update: (id: number, data: Partial<{
    class_id: number;
    subject: string;
    teacher_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room: string;
  }>) => api.put(`/schedules/${id}`, data),
  
  delete: (id: number) =>
    api.delete(`/schedules/${id}`),
  
  getToday: (classId?: number) =>
    api.get('/schedules/today', { params: { class_id: classId } }),

  getMySchedule: () =>
    api.get('/my-schedule'),

  getTeacherSchedule: () =>
    api.get('/teacher-schedule'),
};

// Dashboard Stats API
export const statsAPI = {
  getAdminStats: () =>
    api.get('/stats/admin'),
  
  getTeacherStats: () =>
    api.get('/stats/teacher'),
  
  getStudentStats: () =>
    api.get('/stats/student'),
  
  getAttendanceChart: (params?: { period?: 'week' | 'month' | 'year' }) =>
    api.get('/stats/attendance-chart', { params }),
  
  getRecentActivities: (limit?: number) =>
    api.get('/stats/activities', { params: { limit } }),
};

// Material/Content API  
export const materialAPI = {
  getAll: (params?: { class_id?: number; subject?: string; page?: number }) =>
    api.get('/materials', { params }),
  
  getById: (id: number) =>
    api.get(`/materials/${id}`),
  
  create: (formData: FormData) =>
    api.post('/materials', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes for large video uploads
    }),
  
  update: (id: number, formData: FormData) =>
    api.post(`/materials/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes for large video uploads
    }),
  
  delete: (id: number) =>
    api.delete(`/materials/${id}`),
  
  download: (id: number) =>
    api.get(`/materials/${id}/download`, {
      responseType: 'blob',
      timeout: 120000, // 2 min for large downloads
    }),
};

// Assignment/Tugas API
export const assignmentAPI = {
  getAll: (params?: { class_id?: number; status?: string }) =>
    api.get('/assignments', { params }),
  
  getById: (id: number) =>
    api.get(`/assignments/${id}`),
  
  create: (formData: FormData) =>
    api.post('/assignments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  
  update: (id: number, formData: FormData) =>
    api.post(`/assignments/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  
  delete: (id: number) =>
    api.delete(`/assignments/${id}`),
  
  // Student submit assignment
  submit: (assignmentId: number, formData: FormData) =>
    api.post(`/assignments/${assignmentId}/submit`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  
  // Get submissions for an assignment (teacher)
  getSubmissions: (assignmentId: number) =>
    api.get(`/assignments/${assignmentId}/submissions`),
  
  // Grade a submission (teacher)
  grade: (submissionId: number, data: { score: number; feedback?: string }) =>
    api.post(`/submissions/${submissionId}/grade`, data),
  
  // Get new assignments count (student dashboard)
  getNewCount: () =>
    api.get('/assignments-new-count'),
  
  // Get pending assignments (student)
  getPending: () =>
    api.get('/assignments-pending'),
};

// Announcement API
export const announcementAPI = {
  getAll: (params?: { all?: boolean }) =>
    api.get('/announcements', { params }),
  
  getById: (id: number) =>
    api.get(`/announcements/${id}`),
  
  create: (data: {
    title: string;
    content: string;
    priority?: 'normal' | 'important' | 'urgent';
    target?: 'all' | 'guru' | 'siswa';
    published_at?: string;
    expires_at?: string;
  }) =>
    api.post('/announcements', data),
  
  update: (id: number, data: {
    title?: string;
    content?: string;
    priority?: 'normal' | 'important' | 'urgent';
    target?: 'all' | 'guru' | 'siswa';
    is_active?: boolean;
    expires_at?: string;
  }) =>
    api.put(`/announcements/${id}`, data),
  
  delete: (id: number) =>
    api.delete(`/announcements/${id}`),
  
  // Get latest announcements for dashboard
  getLatest: (limit?: number) =>
    api.get('/announcements-latest', { params: { limit } }),
  
  // Get unread count
  getUnreadCount: () =>
    api.get('/announcements-unread-count'),
};

// Bank Question API
export const bankQuestionAPI = {
  // For teachers
  getAll: (params?: { subject?: string; grade_level?: string; difficulty?: string; search?: string }) =>
    api.get('/bank-questions', { params }),
  
  create: (data: {
    subject: string;
    type: 'pilihan_ganda' | 'essay';
    question: string;
    options?: string[];
    correct_answer: string;
    explanation?: string;
    difficulty: 'mudah' | 'sedang' | 'sulit';
    grade_level: '10' | '11' | '12' | 'semua';
    class_id?: number;
  }) =>
    api.post('/bank-questions', data),
  
  update: (id: number, data: {
    subject?: string;
    type?: 'pilihan_ganda' | 'essay';
    question?: string;
    options?: string[];
    correct_answer?: string;
    explanation?: string;
    difficulty?: 'mudah' | 'sedang' | 'sulit';
    grade_level?: '10' | '11' | '12' | 'semua';
    class_id?: number;
    is_active?: boolean;
  }) =>
    api.put(`/bank-questions/${id}`, data),
  
  delete: (id: number) =>
    api.delete(`/bank-questions/${id}`),
  
  bulkCreate: (questions: Array<{
    subject: string;
    type: 'pilihan_ganda' | 'essay';
    question: string;
    options?: string[];
    correct_answer: string;
    explanation?: string;
    difficulty: 'mudah' | 'sedang' | 'sulit';
    grade_level: '10' | '11' | '12' | 'semua';
    class_id?: number;
  }>) =>
    api.post('/bank-questions/bulk', { questions }),
  
  duplicate: (id: number) =>
    api.post(`/bank-questions/${id}/duplicate`),
  
  // For students
  getSubjects: (gradeLevel?: string) =>
    api.get('/bank-questions/subjects', { params: { grade_level: gradeLevel } }),
  
  getPracticeQuestions: (params: { subject: string; grade_level?: string; difficulty?: string; limit?: number }) =>
    api.get('/bank-questions/practice', { params }),

  savePracticeResult: (data: {
    subject: string;
    grade_level: string;
    mode: 'tryout' | 'belajar';
    total_questions: number;
    correct_answers: number;
    score: number;
    time_spent: number;
  }) =>
    api.post('/bank-questions/practice-result', data),

  getPracticeStats: () =>
    api.get('/bank-questions/practice-stats'),
};

// PDF Import API
export const pdfImportAPI = {
  // Get available formats
  getFormats: () =>
    api.get('/pdf-import/formats'),
  
  // Parse PDF file (upload)
  parsePdf: (file: File, format?: string, answerKeyFile?: File) => {
    const formData = new FormData();
    formData.append('pdf_file', file);
    if (format) formData.append('format', format);
    if (answerKeyFile) formData.append('answer_key_file', answerKeyFile);
    
    return api.post('/pdf-import/parse', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  // Parse PDF from URL
  parseFromUrl: (url: string, format?: string) =>
    api.post('/pdf-import/parse-url', { url, format }),
  
  // Import parsed questions to database
  importQuestions: (data: {
    questions: Array<{
      number: number;
      question: string;
      options: string[];
      correct_answer: string;
      explanation?: string;
      difficulty?: string;
    }>;
    subject: string;
    grade_level: '10' | '11' | '12' | 'semua';
    difficulty?: string;
    source?: string;
  }) =>
    api.post('/pdf-import/import', data),
};

// URL Import API (utbk.or.id)
export const urlImportAPI = {
  // Preview questions from URL
  preview: (url: string) =>
    api.post('/url-import/preview', { url }),
  
  // Import questions from URL
  import: (data: {
    url: string;
    subject: string;
    difficulty?: 'mudah' | 'sedang' | 'sulit';
    grade_level?: '10' | '11' | '12' | 'semua';
    class_id?: number;
    selected_questions?: number[];
  }) =>
    api.post('/url-import/import', data),
};

// Notification API
export const notificationAPI = {
  getAll: (params?: { page?: number; per_page?: number; unread_only?: boolean }) =>
    api.get('/notifications', { params }),

  getUnreadCount: () =>
    api.get('/notifications/unread-count'),

  markAsRead: (id: number) =>
    api.post(`/notifications/${id}/read`),

  markAllAsRead: () =>
    api.post('/notifications/read-all'),

  delete: (id: number) =>
    api.delete(`/notifications/${id}`),
};

// Progress Report API
export const progressAPI = {
  getStudentReport: (studentId: number, params?: { semester?: string; academic_year?: string }) =>
    api.get(`/progress/student/${studentId}`, { params }),

  getClassReport: (classId: number, params?: { semester?: string; academic_year?: string }) =>
    api.get(`/progress/class/${classId}`, { params }),

  getSemesters: () =>
    api.get('/progress/semesters'),
};

// Export API 
export const exportAPI = {
  exportGrades: (params: { class_id?: number; exam_id?: number; format: 'xlsx' | 'pdf' }) =>
    api.get('/export/grades', { params, responseType: 'blob', timeout: 120000 }),

  exportAttendance: (params: { class_id?: number; month?: number; year?: number; format: 'xlsx' | 'pdf' }) =>
    api.get('/export/attendance', { params, responseType: 'blob', timeout: 120000 }),

  exportStudentReport: (studentId: number, params: { semester?: string; format: 'xlsx' | 'pdf' }) =>
    api.get(`/export/student/${studentId}`, { params, responseType: 'blob', timeout: 120000 }),

  exportExamResults: (examId: number, params: { format: 'xlsx' | 'pdf' }) =>
    api.get(`/export/exam-results/${examId}`, { params, responseType: 'blob', timeout: 120000 }),
};

// Audit Log API
export const auditLogAPI = {
  getAll: (params?: { page?: number; per_page?: number; user_id?: number; action?: string; date_from?: string; date_to?: string }) =>
    api.get('/audit-logs', { params }),

  getActions: () =>
    api.get('/audit-logs/actions'),
};
