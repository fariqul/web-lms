import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const JAM_CODES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;
type JamCode = (typeof JAM_CODES)[number];

type AttendanceStatus = 'hadir' | 'sakit' | 'izin' | 'alpha';

const TIME_SLOTS: Array<{ code: JamCode; start: string; end: string }> = [
  { code: 'I', start: '07:45', end: '08:25' },
  { code: 'II', start: '08:25', end: '09:05' },
  { code: 'III', start: '09:05', end: '09:45' },
  { code: 'IV', start: '09:45', end: '10:25' },
  { code: 'V', start: '10:40', end: '11:20' },
  { code: 'VI', start: '11:20', end: '12:00' },
  { code: 'VII', start: '13:00', end: '13:40' },
  { code: 'VIII', start: '13:40', end: '14:20' },
  { code: 'IX', start: '14:20', end: '15:00' },
  { code: 'X', start: '15:00', end: '15:40' },
];

const DAY_MAP: Record<number, string> = {
  0: 'minggu',
  1: 'senin',
  2: 'selasa',
  3: 'rabu',
  4: 'kamis',
  5: 'jumat',
  6: 'sabtu',
};

function normalizeKey(value: string | null | undefined): string {
  if (!value) return '';
  return value.toLowerCase().replace(/[\s\/_-]+/g, '').replace(/[^a-z0-9]/g, '');
}

function parseMinutes(value?: string | null): number | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function mapTimeToJam(timeValue?: string | null): JamCode | null {
  const minutes = parseMinutes(timeValue);
  if (minutes === null) return null;
  const slot = TIME_SLOTS.find((s) => {
    const start = parseMinutes(s.start) ?? 0;
    const end = parseMinutes(s.end) ?? 0;
    return minutes >= start && minutes < end;
  });
  return slot?.code ?? null;
}

function formatTanggalIndonesia(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getDayIndex(dateStr: string): number | null {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDay();
}

async function backendFetchJson(request: NextRequest, path: string) {
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  const authHeader = request.headers.get('authorization');
  if (authHeader) headers.set('Authorization', authHeader);
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) headers.set('Cookie', cookieHeader);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

function resolveStatus(status: string | null | undefined): AttendanceStatus | null {
  if (!status) return null;
  if (status === 'alfa') return 'alpha';
  if (status === 'alpha' || status === 'hadir' || status === 'izin' || status === 'sakit') return status;
  return null;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const kelasParam = (searchParams.get('kelas') || '').trim();
  const tanggalParam = (searchParams.get('tanggal') || '').trim();

  if (!kelasParam || !tanggalParam) {
    return NextResponse.json(
      { message: 'Query kelas dan tanggal wajib diisi.' },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalParam)) {
    return NextResponse.json(
      { message: 'Format tanggal harus YYYY-MM-DD.' },
      { status: 422 }
    );
  }

  const classesRes = await backendFetchJson(request, `/classes?search=${encodeURIComponent(kelasParam)}`);
  if (!classesRes.ok) {
    const message = (classesRes.data as { message?: string })?.message || 'Gagal memuat data kelas.';
    return NextResponse.json({ message }, { status: classesRes.status });
  }

  const classes = (classesRes.data as { data?: Array<{ id: number; name: string }> })?.data || [];
  const kelasKey = normalizeKey(kelasParam);
  const matchedClass =
    classes.find((item) => normalizeKey(item.name) === kelasKey) ||
    (classes.length === 1 ? classes[0] : null);

  if (!matchedClass) {
    return NextResponse.json({ message: 'Kelas tidak ditemukan.' }, { status: 404 });
  }

  const classId = matchedClass.id;
  const tanggalDisplay = formatTanggalIndonesia(tanggalParam);
  const dayIndex = getDayIndex(tanggalParam);
  const dayKey = dayIndex === null ? null : DAY_MAP[dayIndex];

  const [studentsRes, schedulesRes, sessionsRes] = await Promise.all([
    backendFetchJson(request, `/students/class/${classId}`),
    backendFetchJson(request, `/schedules?class_id=${classId}`),
    backendFetchJson(request, `/attendance-sessions?class_id=${classId}&date=${encodeURIComponent(tanggalParam)}&per_page=100`),
  ]);

  let students: Array<{
    id: number;
    name: string;
    nisn?: string;
    nis?: string;
    jenis_kelamin?: 'L' | 'P';
  }> = [];

  if (studentsRes.ok) {
    students = (studentsRes.data as { data?: typeof students })?.data || [];
  } else if (studentsRes.status === 403 || studentsRes.status === 401) {
    const classDetailRes = await backendFetchJson(request, `/classes/${classId}`);
    if (classDetailRes.ok) {
      const classData = (classDetailRes.data as { data?: { students?: typeof students } })?.data;
      students = classData?.students || [];
    }
  }

  if (!sessionsRes.ok) {
    const message = (sessionsRes.data as { message?: string })?.message || 'Gagal memuat sesi absensi.';
    return NextResponse.json({ message }, { status: sessionsRes.status });
  }

  const sessionsPayload = sessionsRes.data as { data?: { data?: Array<{ id: number; subject?: string; valid_from?: string }> } | Array<{ id: number; subject?: string; valid_from?: string }> };
  const sessionsRaw = Array.isArray(sessionsPayload?.data)
    ? sessionsPayload?.data
    : sessionsPayload?.data?.data || [];

  const schedulePayload = schedulesRes.ok
    ? (schedulesRes.data as { data?: Array<{ id: number; subject: string; teacher?: { name?: string }; start_time?: string; day?: string; day_of_week?: number }> })
    : { data: [] };

  const schedulesAll = schedulePayload.data || [];
  const schedulesForDay = dayKey
    ? schedulesAll.filter((row) => {
        if (row.day && row.day.toLowerCase() === dayKey) return true;
        if (row.day_of_week && row.day_of_week === dayIndex) return true;
        return false;
      })
    : [];

  const schedulesSorted = [...schedulesForDay].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
  const scheduleRows: Array<{ jam: JamCode; mapel: string; guru: string; subjectKey: string; startMinutes: number | null }> = [];
  const usedScheduleJams = new Set<JamCode>();

  const pickNextScheduleJam = () => JAM_CODES.find((code) => !usedScheduleJams.has(code)) || null;

  schedulesSorted.forEach((row) => {
    let jam = mapTimeToJam(row.start_time);
    if (!jam || usedScheduleJams.has(jam)) {
      jam = pickNextScheduleJam();
    }
    if (!jam) return;
    usedScheduleJams.add(jam);
    scheduleRows.push({
      jam,
      mapel: row.subject,
      guru: row.teacher?.name || '',
      subjectKey: normalizeKey(row.subject),
      startMinutes: parseMinutes(row.start_time),
    });
  });

  const sessionDetails = await Promise.all(
    sessionsRaw.map(async (session) => {
      const detailRes = await backendFetchJson(request, `/attendance-sessions/${session.id}`);
      if (!detailRes.ok) return null;
      return detailRes.data as {
        data?: {
          id: number;
          subject?: string;
          valid_from?: string;
          student_attendances?: Array<{
            student: { id: number; name: string; nisn?: string; nis?: string; jenis_kelamin?: 'L' | 'P' };
            status?: string;
          }>;
        };
      };
    })
  );

  const studentsMap = new Map<number, {
    id: number;
    nama: string;
    nisn?: string;
    no_induk?: string;
    jenis_kelamin?: 'L' | 'P';
    jam: Record<string, AttendanceStatus>;
  }>();

  const upsertStudent = (student: { id: number; name: string; nisn?: string; nis?: string; jenis_kelamin?: 'L' | 'P' }) => {
    const existing = studentsMap.get(student.id);
    if (!existing) {
      studentsMap.set(student.id, {
        id: student.id,
        nama: student.name,
        nisn: student.nisn || undefined,
        no_induk: student.nis || undefined,
        jenis_kelamin: student.jenis_kelamin || undefined,
        jam: {},
      });
      return;
    }

    if (!existing.nisn && student.nisn) existing.nisn = student.nisn;
    if (!existing.no_induk && student.nis) existing.no_induk = student.nis;
    if (!existing.jenis_kelamin && student.jenis_kelamin) existing.jenis_kelamin = student.jenis_kelamin;
  };

  students.forEach((student) => upsertStudent(student));

  const sessionJamMap = new Map<number, JamCode>();
  const usedSessionJams = new Set<JamCode>();
  const sortedSessions = sessionsRaw
    .map((s) => ({
      id: s.id,
      subject: s.subject || '',
      valid_from: s.valid_from || '',
    }))
    .sort((a, b) => (a.valid_from || '').localeCompare(b.valid_from || ''));

  const pickNextSessionJam = () => JAM_CODES.find((code) => !usedSessionJams.has(code)) || null;

  sortedSessions.forEach((session) => {
    let jam = mapTimeToJam(session.valid_from);
    if (!jam || usedSessionJams.has(jam)) {
      const subjectKey = normalizeKey(session.subject);
      const scheduleMatch = scheduleRows.find((row) => row.subjectKey === subjectKey && !usedSessionJams.has(row.jam));
      jam = scheduleMatch?.jam || null;
    }
    if (!jam || usedSessionJams.has(jam)) {
      jam = pickNextSessionJam();
    }
    if (!jam) return;
    usedSessionJams.add(jam);
    sessionJamMap.set(session.id, jam);
  });

  sessionDetails.forEach((detail) => {
    if (!detail?.data) return;
    const jam = sessionJamMap.get(detail.data.id);
    if (!jam) return;

    const studentAttendances = detail.data.student_attendances || [];
    studentAttendances.forEach((item) => {
      upsertStudent(item.student);
      const studentEntry = studentsMap.get(item.student.id);
      if (!studentEntry) return;
      const status = resolveStatus(item.status || null);
      if (status) {
        studentEntry.jam[jam] = status;
      }
    });
  });

  const siswa = Array.from(studentsMap.values()).sort((a, b) => a.nama.localeCompare(b.nama, 'id-ID'));
  const missingNis = siswa.filter((item) => String(item.no_induk ?? '').trim() === '');
  if (missingNis.length > 0) {
    return NextResponse.json(
      {
        message: 'NIS siswa wajib diisi sebelum cetak absensi.',
        data: {
          missing_nis: missingNis.map((item) => ({
            id: item.id,
            nama: item.nama,
            nisn: item.nisn || '',
          })),
        },
      },
      { status: 422 }
    );
  }
  const jadwal = scheduleRows
    .sort((a, b) => JAM_CODES.indexOf(a.jam) - JAM_CODES.indexOf(b.jam))
    .map((row) => ({
      jam: row.jam,
      mapel: row.mapel,
      guru: row.guru,
    }));

  return NextResponse.json({
    kelas: matchedClass.name,
    tanggal: tanggalDisplay,
    waliKelas: { nama: '', nip: '' },
    siswa,
    jadwal,
  });
}
