/**
 * Daftar mata pelajaran SMA yang konsisten di seluruh aplikasi.
 * Digunakan di semua form: materi, tugas, ujian, absensi, bank soal, dll.
 */
export const SUBJECT_LIST = [
  'Bahasa Indonesia',
  'Bahasa Inggris',
  'Matematika',
  'Fisika',
  'Kimia',
  'Biologi',
  'Sejarah',
  'Sosiologi',
  'Ekonomi',
  'Geografi',
  'PKN',
  'Informatika',
  'Seni Budaya',
  'Pendidikan Agama',
  'PJOK',
  'IPA',
  'Pengetahuan Umum',
] as const;

export type SubjectName = typeof SUBJECT_LIST[number];

/**
 * Format untuk komponen Select (value-label pairs).
 * Value = label (nama asli) agar konsisten di database.
 */
export const SUBJECT_OPTIONS = SUBJECT_LIST.map((name) => ({
  value: name,
  label: name,
}));
