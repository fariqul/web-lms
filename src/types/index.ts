// User Types
export type UserRole = 'admin' | 'guru' | 'siswa';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  class_id?: number;
  avatar?: string;
  nisn?: string;
  nip?: string;
  class?: Class;
  created_at: string;
  updated_at: string;
}

// Class Types
export interface Class {
  id: number;
  name: string;
  grade: string;
  academic_year: string;
  students_count?: number;
}

// Attendance Types
export interface AttendanceSession {
  id: number;
  class_id: number;
  subject: string;
  teacher_id: number;
  qr_token: string;
  valid_from: string;
  valid_until: string;
  status: 'active' | 'expired' | 'closed';
  class?: Class;
  teacher?: User;
}

export interface Attendance {
  id: number;
  session_id: number;
  student_id: number;
  photo_path: string;
  ip_address: string;
  status: 'hadir' | 'izin' | 'sakit' | 'alpha';
  scanned_at: string;
  student?: User;
  session?: AttendanceSession;
}

// Exam Types
export interface Exam {
  id: number;
  class_id: number;
  teacher_id: number;
  title: string;
  description?: string;
  subject: string;
  start_time: string;
  end_time: string;
  duration: number; // in minutes
  duration_minutes?: number; // alias
  total_questions: number;
  status: 'draft' | 'scheduled' | 'active' | 'completed';
  class?: Class;
  teacher?: User;
  my_result?: ExamResult;
}

export interface Question {
  id: number;
  exam_id: number;
  type: 'multiple_choice' | 'essay' | 'true_false';
  question_text: string;
  options?: string[];
  correct_answer?: string;
  points: number;
  order: number;
}

export interface Answer {
  id: number;
  student_id: number;
  question_id: number;
  exam_id: number;
  answer: string;
  is_correct?: boolean;
  score?: number;
  submitted_at: string;
}

export interface ExamResult {
  id: number;
  exam_id: number;
  student_id: number;
  total_score: number;
  max_score: number;
  percentage: number;
  score?: number;
  status: 'in_progress' | 'submitted' | 'graded' | 'completed';
  started_at: string;
  submitted_at?: string;
  exam?: Exam;
  student?: User;
}

// Violation Types
export interface Violation {
  id: number;
  exam_id: number;
  student_id: number;
  type: 'tab_switch' | 'fullscreen_exit' | 'copy_paste' | 'camera_off' | 'screenshot';
  description?: string;
  timestamp: string;
  student?: User;
}

// Schedule Types
export interface Schedule {
  id: number;
  class_id: number;
  subject: string;
  teacher_id: number;
  day: 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat' | 'sabtu';
  start_time: string;
  end_time: string;
  room?: string;
  teacher?: User;
  class?: Class;
}

// Dashboard Stats Types
export interface AdminStats {
  total_students: number;
  total_teachers: number;
  total_classes: number;
  active_exams: number;
  attendance_today: number;
}

export interface TeacherStats {
  classes_count: number;
  students_count: number;
  exams_created: number;
  attendance_sessions: number;
}

export interface StudentStats {
  attendance_rate: number;
  exams_completed: number;
  average_score: number;
  upcoming_exams: number;
}

// Activity Log
export interface Activity {
  id: number;
  type: 'attendance' | 'exam' | 'user' | 'system';
  message: string;
  icon?: string;
  color?: string;
  created_at: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

// Auth Types
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
