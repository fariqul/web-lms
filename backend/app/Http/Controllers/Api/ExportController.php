<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\ClassRoom;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExportController extends Controller
{
    /**
     * Export grades data.
     * GET /api/export/grades
     */
    public function grades(Request $request)
    {
        $request->validate([
            'format' => 'required|in:xlsx,pdf',
            'class_id' => 'nullable|integer|exists:classes,id',
            'exam_id' => 'nullable|integer|exists:exams,id',
        ]);

        $format = $request->input('format');

        // If specific exam
        if ($request->exam_id) {
            $exam = Exam::with(['class', 'results.student'])->findOrFail($request->exam_id);
            $results = $exam->results()->with('student:id,name,nisn')->orderBy('total_score', 'desc')->get();

            $data = [
                'title' => 'Nilai Ujian: ' . $exam->title,
                'class' => $exam->class->name ?? '-',
                'subject' => $exam->subject,
                'date' => $exam->start_time?->format('d/m/Y'),
                'headers' => ['No', 'Nama', 'NISN', 'Skor', 'Maks', 'Persentase', 'Status'],
                'rows' => [],
            ];

            foreach ($results as $i => $result) {
                $pct = $result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0;
                $data['rows'][] = [
                    $i + 1,
                    $result->student->name ?? '-',
                    $result->student->nisn ?? '-',
                    $result->total_score,
                    $result->max_score,
                    $pct . '%',
                    $result->status ?? ($pct >= 75 ? 'Lulus' : 'Tidak Lulus'),
                ];
            }
        } else {
            // All grades for a class
            $classId = $request->class_id;
            $class = $classId ? ClassRoom::findOrFail($classId) : null;

            $query = ExamResult::with(['student:id,name,nisn', 'exam:id,title,subject,class_id'])
                ->orderBy('exam_id')
                ->orderByDesc('total_score');

            if ($classId) {
                $query->whereHas('exam', fn($q) => $q->where('class_id', $classId));
            }

            $results = $query->get();

            $data = [
                'title' => 'Rekap Nilai' . ($class ? ' - ' . $class->name : ''),
                'headers' => ['No', 'Nama', 'NISN', 'Ujian', 'Mata Pelajaran', 'Skor', 'Maks', 'Persentase'],
                'rows' => [],
            ];

            foreach ($results as $i => $result) {
                $pct = $result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0;
                $data['rows'][] = [
                    $i + 1,
                    $result->student->name ?? '-',
                    $result->student->nisn ?? '-',
                    $result->exam->title ?? '-',
                    $result->exam->subject ?? '-',
                    $result->total_score,
                    $result->max_score,
                    $pct . '%',
                ];
            }
        }

        return $this->generateExport($data, $format, 'nilai');
    }

    /**
     * Export attendance data.
     * GET /api/export/attendance
     */
    public function attendance(Request $request)
    {
        $request->validate([
            'format' => 'required|in:xlsx,pdf',
            'class_id' => 'nullable|integer|exists:classes,id',
            'month' => 'nullable|integer|min:1|max:12',
            'year' => 'nullable|integer|min:2020|max:2099',
        ]);

        $format = $request->input('format');
        $classId = $request->input('class_id');
        $month = $request->input('month', now()->month);
        $year = $request->input('year', now()->year);

        $class = $classId ? ClassRoom::findOrFail($classId) : null;

        // Get students
        $studentsQuery = User::where('role', 'siswa');
        if ($classId) {
            $studentsQuery->where('class_id', $classId);
        }
        $students = $studentsQuery->orderBy('name')->get();

        // Get attendance sessions in the given month
        $sessionsQuery = AttendanceSession::whereMonth('valid_from', $month)
            ->whereYear('valid_from', $year);

        if ($classId) {
            $sessionsQuery->where('class_id', $classId);
        }

        $sessionIds = $sessionsQuery->pluck('id');

        $data = [
            'title' => 'Rekap Absensi ' . $this->monthName($month) . ' ' . $year . ($class ? ' - ' . $class->name : ''),
            'headers' => ['No', 'Nama', 'NISN', 'Hadir', 'Sakit', 'Izin', 'Alpha', 'Total', '% Kehadiran'],
            'rows' => [],
        ];

        foreach ($students as $i => $student) {
            $attendances = Attendance::where('student_id', $student->id)
                ->whereIn('session_id', $sessionIds)
                ->get();

            $hadir = $attendances->where('status', 'hadir')->count();
            $sakit = $attendances->where('status', 'sakit')->count();
            $izin = $attendances->where('status', 'izin')->count();
            $alpha = $attendances->where('status', 'alpha')->count();
            $total = $hadir + $sakit + $izin + $alpha;
            $percentage = $total > 0 ? round(($hadir / $total) * 100, 2) : 0;

            $data['rows'][] = [
                $i + 1,
                $student->name,
                $student->nisn ?? '-',
                $hadir,
                $sakit,
                $izin,
                $alpha,
                $total,
                $percentage . '%',
            ];
        }

        return $this->generateExport($data, $format, 'absensi');
    }

    /**
     * Export student report (rapor).
     * GET /api/export/student/{studentId}
     */
    public function studentReport(Request $request, int $studentId)
    {
        $request->validate([
            'format' => 'required|in:xlsx,pdf',
            'semester' => 'nullable|string',
        ]);

        $format = $request->input('format');
        $student = User::with('classRoom')->findOrFail($studentId);

        // Get all exam results grouped by subject
        $examResults = ExamResult::where('student_id', $studentId)
            ->with(['exam:id,title,subject'])
            ->get();

        $subjectScores = [];
        foreach ($examResults as $result) {
            $subject = $result->exam->subject ?? 'Lainnya';
            if (!isset($subjectScores[$subject])) {
                $subjectScores[$subject] = ['total' => 0, 'count' => 0];
            }
            $pct = $result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0;
            $subjectScores[$subject]['total'] += $pct;
            $subjectScores[$subject]['count']++;
        }

        // Attendance summary
        $totalAttendance = Attendance::where('student_id', $studentId)->count();
        $presentCount = Attendance::where('student_id', $studentId)->where('status', 'hadir')->count();
        $attendancePct = $totalAttendance > 0 ? round(($presentCount / $totalAttendance) * 100, 2) : 0;

        $data = [
            'title' => 'Rapor Siswa: ' . $student->name,
            'subtitle' => 'Kelas: ' . ($student->classRoom->name ?? '-') . ' | NISN: ' . ($student->nisn ?? '-'),
            'headers' => ['No', 'Mata Pelajaran', 'Jumlah Ujian', 'Rata-rata Nilai'],
            'rows' => [],
        ];

        $no = 1;
        $overallTotal = 0;
        $overallCount = 0;
        foreach ($subjectScores as $subject => $scores) {
            $avg = $scores['count'] > 0 ? round($scores['total'] / $scores['count'], 2) : 0;
            $data['rows'][] = [
                $no++,
                $subject,
                $scores['count'],
                $avg,
            ];
            $overallTotal += $avg;
            $overallCount++;
        }

        // Add summary rows
        $data['summary'] = [
            'Rata-rata Keseluruhan' => $overallCount > 0 ? round($overallTotal / $overallCount, 2) : 0,
            'Persentase Kehadiran' => $attendancePct . '%',
            'Total Kehadiran' => $presentCount . '/' . $totalAttendance,
        ];

        return $this->generateExport($data, $format, 'rapor_' . $student->name);
    }

    /**
     * Generate export file (CSV-based for xlsx, HTML for pdf).
     */
    private function generateExport(array $data, string $format, string $filenameBase): \Illuminate\Http\Response
    {
        $filename = str_replace(' ', '_', $filenameBase) . '_' . date('Y-m-d');

        if ($format === 'xlsx') {
            return $this->generateCsv($data, $filename);
        }

        return $this->generatePdfHtml($data, $filename);
    }

    /**
     * Generate CSV (opens in Excel).
     */
    private function generateCsv(array $data, string $filename): \Illuminate\Http\Response
    {
        $output = "\xEF\xBB\xBF"; // UTF-8 BOM for Excel

        // Title
        $output .= '"' . ($data['title'] ?? '') . '"' . "\n";
        if (!empty($data['subtitle'])) {
            $output .= '"' . $data['subtitle'] . '"' . "\n";
        }
        $output .= "\n";

        // Headers
        $output .= implode(',', array_map(fn($h) => '"' . $h . '"', $data['headers'])) . "\n";

        // Rows
        foreach ($data['rows'] as $row) {
            $output .= implode(',', array_map(fn($v) => '"' . str_replace('"', '""', $v) . '"', $row)) . "\n";
        }

        // Summary
        if (!empty($data['summary'])) {
            $output .= "\n";
            foreach ($data['summary'] as $label => $value) {
                $output .= '"' . $label . '","' . $value . '"' . "\n";
            }
        }

        return response($output, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '.csv"',
        ]);
    }

    /**
     * Generate a PDF via simple HTML-to-PDF (using browser print).
     */
    private function generatePdfHtml(array $data, string $filename): \Illuminate\Http\Response
    {
        $html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
        $html .= '<title>' . ($data['title'] ?? 'Export') . '</title>';
        $html .= '<style>';
        $html .= 'body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }';
        $html .= 'h1 { font-size: 16px; text-align: center; margin-bottom: 5px; }';
        $html .= 'h2 { font-size: 13px; text-align: center; color: #555; margin-top: 0; }';
        $html .= 'table { width: 100%; border-collapse: collapse; margin-top: 15px; }';
        $html .= 'th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }';
        $html .= 'th { background-color: #2563eb; color: white; font-weight: bold; }';
        $html .= 'tr:nth-child(even) { background-color: #f3f4f6; }';
        $html .= '.summary { margin-top: 15px; }';
        $html .= '.summary td { font-weight: bold; border: none; padding: 3px 8px; }';
        $html .= '.footer { text-align: center; margin-top: 20px; font-size: 10px; color: #999; }';
        $html .= '</style></head><body>';

        $html .= '<h1>' . htmlspecialchars($data['title'] ?? '') . '</h1>';
        if (!empty($data['subtitle'])) {
            $html .= '<h2>' . htmlspecialchars($data['subtitle']) . '</h2>';
        }

        $html .= '<table><thead><tr>';
        foreach ($data['headers'] as $header) {
            $html .= '<th>' . htmlspecialchars($header) . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($data['rows'] as $row) {
            $html .= '<tr>';
            foreach ($row as $cell) {
                $html .= '<td>' . htmlspecialchars($cell) . '</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</tbody></table>';

        if (!empty($data['summary'])) {
            $html .= '<table class="summary">';
            foreach ($data['summary'] as $label => $value) {
                $html .= '<tr><td>' . htmlspecialchars($label) . ':</td><td>' . htmlspecialchars($value) . '</td></tr>';
            }
            $html .= '</table>';
        }

        $html .= '<div class="footer">SMA 15 Makassar LMS - Diekspor pada ' . now()->format('d/m/Y H:i') . '</div>';
        $html .= '</body></html>';

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '.html"',
        ]);
    }

    private function monthName(int $month): string
    {
        $months = [
            1 => 'Januari', 2 => 'Februari', 3 => 'Maret', 4 => 'April',
            5 => 'Mei', 6 => 'Juni', 7 => 'Juli', 8 => 'Agustus',
            9 => 'September', 10 => 'Oktober', 11 => 'November', 12 => 'Desember',
        ];
        return $months[$month] ?? '';
    }
}
