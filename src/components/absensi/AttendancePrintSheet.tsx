import React from 'react';
import styles from './AttendancePrintSheet.module.css';

type AttendanceStatus = 'hadir' | 'sakit' | 'izin' | 'alpha' | null | undefined;

type JamCode = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX' | 'X';

const JAM_CODES: JamCode[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const DEFAULT_SCHEDULE = [
  { jam: 'I', waktu: '07.45 - 08.25' },
  { jam: 'II', waktu: '08.25 - 09.05' },
  { jam: 'III', waktu: '09.05 - 09.45' },
  { jam: 'IV', waktu: '09.45 - 10.25' },
  { jam: 'ISTIRAHAT I (15 MENIT)', waktu: '', isBreak: true },
  { jam: 'V', waktu: '10.40 - 11.20' },
  { jam: 'VI', waktu: '11.20 - 12.00' },
  { jam: 'ISTIRAHAT II (60 MENIT)', waktu: '', isBreak: true },
  { jam: 'VII', waktu: '13.00 - 13.40' },
  { jam: 'VIII', waktu: '13.40 - 14.20' },
  { jam: 'IX', waktu: '14.20 - 15.00' },
  { jam: 'X', waktu: '15.00 - 15.40' },
];

export interface AttendancePrintStudent {
  nisn?: string;
  no_induk?: string;
  nama: string;
  jenis_kelamin?: 'L' | 'P';
  jam?: Record<string, AttendanceStatus>;
}

export interface AttendancePrintScheduleInput {
  jam: JamCode;
  mapel?: string;
  guru?: string;
}

export interface AttendancePrintProps {
  kelas: string;
  tanggal: string;
  siswa: AttendancePrintStudent[];
  jadwal?: AttendancePrintScheduleInput[];
  waliKelas?: {
    nama?: string;
    nip?: string;
  };
}

const statusSymbol = (status: AttendanceStatus) => {
  switch (status) {
    case 'hadir':
      return '\u2713';
    case 'sakit':
      return 'S';
    case 'izin':
      return 'I';
    case 'alpha':
      return 'A';
    default:
      return '';
  }
};

const resolveStatus = (student: AttendancePrintStudent, code: JamCode, index: number) => {
  const jam = student.jam || {};
  return (
    jam[code] ||
    jam[code.toLowerCase()] ||
    jam[String(index + 1)] ||
    jam[String(index + 1).padStart(2, '0')]
  );
};

export function AttendancePrintSheet({ kelas, tanggal, siswa, jadwal = [], waliKelas }: AttendancePrintProps) {
  const jadwalMap = new Map(jadwal.map((row) => [row.jam, row]));
  const scheduleRows = DEFAULT_SCHEDULE.map((row) => {
    if ('isBreak' in row && row.isBreak) {
      return row;
    }

    const key = row.jam as JamCode;
    const override = jadwalMap.get(key);
    return {
      ...row,
      mapel: override?.mapel || '',
      guru: override?.guru || '',
    };
  });

  const waliNama = waliKelas?.nama || '........................';
  const waliNip = waliKelas?.nip || '';

  return (
    <div className={`${styles.sheet} print-only`}>
      <div className={styles.header}>
        <img src="/logo-sekolah.png" alt="Logo sekolah" className={styles.logo} />
        <div className={styles.headerTitle}>
          <div className={styles.schoolName}>SMA NEGERI 15 MAKASSAR</div>
          <div className={styles.mainTitle}>DAFTAR KEHADIRAN PESERTA DIDIK</div>
          <div className={styles.semesterTitle}>SEMESTER GANJIL TAHUN PELAJARAN 2025-2026</div>
        </div>
        <img src="/logo-sekolah.png" alt="Logo sekolah" className={styles.logo} />
      </div>

      <div className={styles.metaRow}>
        <div>KELAS : {kelas || '-'}</div>
        <div>HARI / TANGGAL : {tanggal || '-'}</div>
      </div>

      <table className={styles.table}>
        <colgroup>
          <col style={{ width: '28px' }} />
          <col style={{ width: '70px' }} />
          <col style={{ width: '70px' }} />
          <col style={{ width: '220px' }} />
          <col style={{ width: '38px' }} />
          {JAM_CODES.map((code) => (
            <col key={code} style={{ width: '26px' }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>No</th>
            <th rowSpan={2}>NISN</th>
            <th rowSpan={2}>NO. INDUK</th>
            <th rowSpan={2}>NAMA</th>
            <th rowSpan={2}>L/P</th>
            <th colSpan={10}>JAM KE...</th>
          </tr>
          <tr>
            {JAM_CODES.map((code) => (
              <th key={code}>{code}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {siswa.map((item, index) => (
            <tr key={`${item.nama}-${index}`}>
              <td className={styles.center}>{index + 1}</td>
              <td className={styles.center}>{item.nisn || '-'}</td>
              <td className={styles.center}>{item.no_induk || '-'}</td>
              <td>{item.nama}</td>
              <td className={styles.center}>{item.jenis_kelamin || '-'}</td>
              {JAM_CODES.map((code, jamIndex) => (
                <td key={`${item.nama}-${code}`} className={styles.center}>
                  {statusSymbol(resolveStatus(item, code, jamIndex))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <table className={`${styles.table} ${styles.scheduleTable}`}>
        <colgroup>
          <col style={{ width: '60px' }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '200px' }} />
          <col style={{ width: '200px' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Jam</th>
            <th>Waktu</th>
            <th>Mapel</th>
            <th>Nama Guru</th>
          </tr>
        </thead>
        <tbody>
          {scheduleRows.map((row, index) => {
            if ('isBreak' in row && row.isBreak) {
              return (
                <tr key={`break-${index}`}>
                  <td colSpan={4} className={styles.breakRow}>
                    [{row.jam}]
                  </td>
                </tr>
              );
            }

            return (
              <tr key={`${row.jam}-${index}`}>
                <td className={styles.center}>{row.jam}</td>
                <td className={styles.center}>{row.waktu}</td>
                <td>{row.mapel || ''}</td>
                <td>{row.guru || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={styles.footer}>
        <div className={styles.signatureBlock}>
          <div>Guru BK/BP</div>
          <div className={styles.signatureSpace} />
          <div>NIP:</div>
        </div>
        <div className={styles.signatureBlock}>
          <div>Wali Kelas</div>
          <div className={styles.signatureSpace} />
          <div className={styles.signatureName}>{waliNama}</div>
          <div>NIP: {waliNip}</div>
        </div>
      </div>
    </div>
  );
}
