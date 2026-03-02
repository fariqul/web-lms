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
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\Font;
use Barryvdh\DomPDF\Facade\Pdf;

class ExportController extends Controller
{
    // =========================================
    // EXAM RESULTS (Template-based)
    // GET /api/export/exam-results/{examId}
    // =========================================
    public function examResults(Request $request, int $examId)
    {
        $request->validate([
            'format' => 'required|in:xlsx,pdf',
        ]);

        try {
            $format = $request->input('format');
            $exam = Exam::with(['classRoom', 'classes:id,name'])->findOrFail($examId);
            $results = $exam->results()
                ->with(['student:id,name,nisn'])
                ->orderBy('total_score', 'desc')
                ->get();

            // Load answers per student (Answer doesn't have exam_result_id, uses exam_id + student_id)
            $allAnswers = \App\Models\Answer::where('exam_id', $exam->id)
                ->with('question:id,type')
                ->get()
                ->groupBy('student_id');

            // Attach answers to each result
            foreach ($results as $result) {
                $result->setRelation('studentAnswers', $allAnswers->get($result->student_id, collect()));
            }

            $className = $exam->classes->count() > 0
                ? $exam->classes->pluck('name')->join(', ')
                : ($exam->classRoom->name ?? '-');

            if ($format === 'xlsx') {
                return $this->generateExamResultsExcel($exam, $results, $className);
            }

            return $this->generateExamResultsPdf($exam, $results, $className);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('[Export] examResults failed: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Export gagal: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Generate exam results XLSX using template.
     */
    private function generateExamResultsExcel(Exam $exam, $results, string $className)
    {
        $templatePath = storage_path('app/templates/Template_Hasil_Ujian_LMS.xlsx');

        if (file_exists($templatePath)) {
            $spreadsheet = IOFactory::load($templatePath);
        } else {
            $spreadsheet = new Spreadsheet();
        }

        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Hasil Ujian');

        // Clear template data rows (rows 2-51)
        for ($r = 2; $r <= 51; $r++) {
            for ($c = 'A'; $c <= 'J'; $c++) {
                $sheet->setCellValue($c . $r, '');
            }
        }

        // --- Info header (rows 1-3) ---
        $sheet->mergeCells('A1:J1');
        $sheet->setCellValue('A1', 'Hasil Ujian: ' . $exam->title);
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(14);
        $sheet->getStyle('A1')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $sheet->mergeCells('A2:J2');
        $sheet->setCellValue('A2', 'Mata Pelajaran: ' . ($exam->subject ?? '-') . '  |  Kelas: ' . $className . '  |  Tanggal: ' . ($exam->start_time ? $exam->start_time->format('d/m/Y') : '-'));
        $sheet->getStyle('A2')->getFont()->setSize(11)->setItalic(true);
        $sheet->getStyle('A2')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        $sheet->mergeCells('A3:J3');
        $sheet->setCellValue('A3', 'Diekspor: ' . now()->format('d/m/Y H:i'));
        $sheet->getStyle('A3')->getFont()->setSize(9)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FF666666'));
        $sheet->getStyle('A3')->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);

        // --- Column headers (row 4) ---
        $headerRow = 4;
        $headers = ['No', 'Nama Siswa', 'NIS', 'Benar', 'Salah', 'Skor', 'Nilai', 'Status', 'Waktu Selesai', 'Keterangan'];
        $cols = range('A', 'J');

        foreach ($headers as $idx => $header) {
            $cell = $cols[$idx] . $headerRow;
            $sheet->setCellValue($cell, $header);
        }

        // Header styling - blue fill
        $headerStyle = [
            'font' => ['bold' => true, 'color' => ['rgb' => '000000'], 'size' => 11],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'D9E1F2']],
            'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER],
        ];
        $sheet->getStyle("A{$headerRow}:J{$headerRow}")->applyFromArray($headerStyle);

        // --- Data rows ---
        $dataRow = $headerRow + 1;
        $totalCorrect = 0;
        $totalWrong = 0;
        $totalScore = 0;
        $passCount = 0;

        foreach ($results as $i => $result) {
            $row = $dataRow + $i;

            // Count correct/wrong from answers
            $correct = 0;
            $wrong = 0;
            $hasEssay = false;
            $ungradedEssay = 0;

            if ($result->studentAnswers) {
                foreach ($result->studentAnswers as $answer) {
                    $qType = $answer->question->type ?? 'multiple_choice';
                    if ($qType === 'essay') {
                        $hasEssay = true;
                        if ($answer->score === null) {
                            $ungradedEssay++;
                        }
                    } else {
                        if ($answer->is_correct) {
                            $correct++;
                        } else {
                            $wrong++;
                        }
                    }
                }
            }

            $pct = $result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0;
            $status = $result->status ?? ($pct >= 75 ? 'Lulus' : 'Tidak Lulus');
            $finishedAt = $result->finished_at ? \Carbon\Carbon::parse($result->finished_at)->format('H:i:s') : '-';

            // Keterangan
            $keterangan = '';
            if ($hasEssay && $ungradedEssay > 0) {
                $keterangan = "Essay belum dinilai ({$ungradedEssay})";
            } elseif ($hasEssay) {
                $keterangan = 'Essay sudah dinilai';
            }

            $sheet->setCellValue('A' . $row, $i + 1);
            $sheet->setCellValue('B' . $row, $result->student->name ?? '-');
            $sheet->setCellValue('C' . $row, $result->student->nisn ?? '-');
            $sheet->setCellValue('D' . $row, $correct);
            $sheet->setCellValue('E' . $row, $wrong);
            $sheet->setCellValue('F' . $row, $result->total_score);
            $sheet->setCellValue('G' . $row, $pct);
            $sheet->setCellValue('H' . $row, $status);
            $sheet->setCellValue('I' . $row, $finishedAt);
            $sheet->setCellValue('J' . $row, $keterangan);

            // Status color
            $statusColor = $status === 'Lulus' ? '27AE60' : 'E74C3C';
            $sheet->getStyle('H' . $row)->getFont()->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FF' . $statusColor));
            $sheet->getStyle('H' . $row)->getFont()->setBold(true);

            // Alternating row color
            if ($i % 2 === 1) {
                $sheet->getStyle("A{$row}:J{$row}")->getFill()
                    ->setFillType(Fill::FILL_SOLID)
                    ->getStartColor()->setRGB('F2F2F2');
            }

            $totalCorrect += $correct;
            $totalWrong += $wrong;
            $totalScore += $pct;
            if ($status === 'Lulus') $passCount++;
        }

        $lastDataRow = $dataRow + count($results) - 1;

        // Data borders
        if (count($results) > 0) {
            $sheet->getStyle("A{$dataRow}:J{$lastDataRow}")->applyFromArray([
                'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
                'alignment' => ['vertical' => Alignment::VERTICAL_CENTER],
            ]);
            // Center number columns
            $sheet->getStyle("A{$dataRow}:A{$lastDataRow}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("D{$dataRow}:G{$lastDataRow}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $sheet->getStyle("I{$dataRow}:I{$lastDataRow}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        }

        // --- Summary section ---
        $summaryRow = $lastDataRow + 2;
        $count = count($results);
        $avgScore = $count > 0 ? round($totalScore / $count, 2) : 0;
        $failCount = $count - $passCount;

        $summaryData = [
            ['Total Siswa', $count],
            ['Rata-rata Nilai', $avgScore],
            ['Lulus', $passCount],
            ['Tidak Lulus', $failCount],
            ['Persentase Kelulusan', $count > 0 ? round(($passCount / $count) * 100, 1) . '%' : '0%'],
        ];

        $sheet->setCellValue('A' . $summaryRow, 'RINGKASAN');
        $sheet->getStyle('A' . $summaryRow)->getFont()->setBold(true)->setSize(11);
        $summaryRow++;

        foreach ($summaryData as $item) {
            $sheet->setCellValue('A' . $summaryRow, $item[0]);
            $sheet->setCellValue('B' . $summaryRow, $item[1]);
            $sheet->getStyle('A' . $summaryRow)->getFont()->setBold(true);
            $summaryRow++;
        }

        // Column widths
        $widths = ['A' => 5, 'B' => 25, 'C' => 15, 'D' => 8, 'E' => 8, 'F' => 8, 'G' => 8, 'H' => 12, 'I' => 14, 'J' => 25];
        foreach ($widths as $col => $w) {
            $sheet->getColumnDimension($col)->setWidth($w);
        }

        // Write to temp file and return
        $filename = 'Hasil_Ujian_' . str_replace(' ', '_', $exam->title) . '_' . date('Y-m-d');
        $tempFile = tempnam(sys_get_temp_dir(), 'xlsx_');
        $writer = new Xlsx($spreadsheet);
        $writer->save($tempFile);

        return response()->download($tempFile, $filename . '.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Generate exam results PDF with DomPDF.
     */
    private function generateExamResultsPdf(Exam $exam, $results, string $className)
    {
        $rows = [];
        foreach ($results as $i => $result) {
            $correct = 0;
            $wrong = 0;

            if ($result->studentAnswers) {
                foreach ($result->studentAnswers as $answer) {
                    $qType = $answer->question->type ?? 'multiple_choice';
                    if ($qType !== 'essay') {
                        if ($answer->is_correct) $correct++;
                        else $wrong++;
                    }
                }
            }

            $pct = $result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0;
            $status = $result->status ?? ($pct >= 75 ? 'Lulus' : 'Tidak Lulus');
            $finishedAt = $result->finished_at ? \Carbon\Carbon::parse($result->finished_at)->format('H:i:s') : '-';

            $rows[] = [
                'no' => $i + 1,
                'name' => $result->student->name ?? '-',
                'nisn' => $result->student->nisn ?? '-',
                'correct' => $correct,
                'wrong' => $wrong,
                'score' => $result->total_score,
                'pct' => $pct,
                'status' => $status,
                'time' => $finishedAt,
            ];
        }

        $totalCount = count($rows);
        $avgScore = $totalCount > 0 ? round(collect($rows)->avg('pct'), 2) : 0;
        $passCount = collect($rows)->where('status', 'Lulus')->count();

        $html = $this->examResultsPdfHtml($exam, $className, $rows, $totalCount, $avgScore, $passCount);

        $pdf = Pdf::loadHTML($html)->setPaper('a4', 'landscape');
        $filename = 'Hasil_Ujian_' . str_replace(' ', '_', $exam->title) . '_' . date('Y-m-d') . '.pdf';

        return $pdf->download($filename);
    }

    private function examResultsPdfHtml(Exam $exam, string $className, array $rows, int $total, float $avg, int $pass): string
    {
        $date = $exam->start_time ? $exam->start_time->format('d/m/Y') : '-';
        $exportDate = now()->format('d/m/Y H:i');
        $failCount = $total - $pass;
        $passPct = $total > 0 ? round(($pass / $total) * 100, 1) : 0;

        $html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
        $html .= '<style>';
        $html .= 'body{font-family:Arial,sans-serif;font-size:11px;margin:15px 20px;color:#222}';
        $html .= 'h1{font-size:16px;text-align:center;margin:0 0 4px}';
        $html .= '.subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:2px}';
        $html .= '.meta{text-align:center;font-size:9px;color:#888;margin-bottom:12px}';
        $html .= 'table{width:100%;border-collapse:collapse;margin-bottom:12px}';
        $html .= 'th,td{border:1px solid #444;padding:5px 7px}';
        $html .= 'th{background:#2563eb;color:#fff;font-weight:bold;text-align:center;font-size:10px}';
        $html .= 'td{font-size:10px}';
        $html .= 'tr:nth-child(even){background:#f3f4f6}';
        $html .= '.center{text-align:center}';
        $html .= '.lulus{color:#27ae60;font-weight:bold}';
        $html .= '.tidak{color:#e74c3c;font-weight:bold}';
        $html .= '.summary{margin-top:8px}';
        $html .= '.summary td{border:none;padding:3px 8px;font-size:11px}';
        $html .= '.summary .label{font-weight:bold;width:180px}';
        $html .= '.footer{text-align:center;margin-top:15px;font-size:9px;color:#aaa}';
        $html .= '</style></head><body>';

        $html .= '<h1>' . htmlspecialchars('Hasil Ujian: ' . $exam->title) . '</h1>';
        $html .= '<div class="subtitle">Mata Pelajaran: ' . htmlspecialchars($exam->subject ?? '-') . ' | Kelas: ' . htmlspecialchars($className) . ' | Tanggal: ' . $date . '</div>';
        $html .= '<div class="meta">Diekspor: ' . $exportDate . '</div>';

        $html .= '<table><thead><tr>';
        foreach (['No', 'Nama Siswa', 'NIS', 'Benar', 'Salah', 'Skor', 'Nilai (%)', 'Status', 'Waktu'] as $h) {
            $html .= '<th>' . $h . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($rows as $r) {
            $cls = $r['status'] === 'Lulus' ? 'lulus' : 'tidak';
            $html .= '<tr>';
            $html .= '<td class="center">' . $r['no'] . '</td>';
            $html .= '<td>' . htmlspecialchars($r['name']) . '</td>';
            $html .= '<td class="center">' . htmlspecialchars($r['nisn']) . '</td>';
            $html .= '<td class="center">' . $r['correct'] . '</td>';
            $html .= '<td class="center">' . $r['wrong'] . '</td>';
            $html .= '<td class="center">' . $r['score'] . '</td>';
            $html .= '<td class="center">' . $r['pct'] . '</td>';
            $html .= '<td class="center ' . $cls . '">' . $r['status'] . '</td>';
            $html .= '<td class="center">' . $r['time'] . '</td>';
            $html .= '</tr>';
        }

        $html .= '</tbody></table>';

        $html .= '<table class="summary">';
        $html .= '<tr><td class="label">Total Siswa:</td><td>' . $total . '</td></tr>';
        $html .= '<tr><td class="label">Rata-rata Nilai:</td><td>' . $avg . '</td></tr>';
        $html .= '<tr><td class="label">Lulus:</td><td>' . $pass . '</td></tr>';
        $html .= '<tr><td class="label">Tidak Lulus:</td><td>' . $failCount . '</td></tr>';
        $html .= '<tr><td class="label">Persentase Kelulusan:</td><td>' . $passPct . '%</td></tr>';
        $html .= '</table>';

        $html .= '<div class="footer">SMA 15 Makassar LMS - Diekspor pada ' . $exportDate . '</div>';
        $html .= '</body></html>';

        return $html;
    }

    // =========================================
    // GRADES (Generic)
    // GET /api/export/grades
    // =========================================
    public function grades(Request $request)
    {
        $request->validate([
            'format' => 'required|in:xlsx,pdf',
            'class_id' => 'nullable|integer|exists:classes,id',
            'exam_id' => 'nullable|integer|exists:exams,id',
        ]);

        $format = $request->input('format');

        // If specific exam requested, redirect to examResults
        if ($request->exam_id) {
            return $this->examResults($request, $request->exam_id);
        }

        // All grades for a class
        $classId = $request->class_id;
        $class = $classId ? ClassRoom::findOrFail($classId) : null;

        $query = ExamResult::with(['student:id,name,nisn', 'exam:id,title,subject,class_id'])
            ->orderBy('exam_id')
            ->orderByDesc('total_score');

        if ($classId) {
            $query->whereHas('exam', function ($q) use ($classId) {
                $q->where('class_id', $classId)
                  ->orWhereHas('classes', fn($cq) => $cq->where('classes.id', $classId));
            });
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

        return $this->generateExport($data, $format, 'nilai');
    }

    // =========================================
    // ATTENDANCE
    // GET /api/export/attendance
    // =========================================
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

        $studentsQuery = User::where('role', 'siswa');
        if ($classId) {
            $studentsQuery->where('class_id', $classId);
        }
        $students = $studentsQuery->orderBy('name')->get();

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

    // =========================================
    // STUDENT REPORT (Rapor)
    // GET /api/export/student/{studentId}
    // =========================================
    public function studentReport(Request $request, int $studentId)
    {
        $request->validate([
            'format' => 'required|in:xlsx,pdf',
            'semester' => 'nullable|string',
        ]);

        $format = $request->input('format');
        $student = User::with('classRoom')->findOrFail($studentId);

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
            $data['rows'][] = [$no++, $subject, $scores['count'], $avg];
            $overallTotal += $avg;
            $overallCount++;
        }

        $data['summary'] = [
            'Rata-rata Keseluruhan' => $overallCount > 0 ? round($overallTotal / $overallCount, 2) : 0,
            'Persentase Kehadiran' => $attendancePct . '%',
            'Total Kehadiran' => $presentCount . '/' . $totalAttendance,
        ];

        return $this->generateExport($data, $format, 'rapor_' . $student->name);
    }

    // =========================================
    // GENERIC EXPORT (PhpSpreadsheet + DomPDF)
    // =========================================
    private function generateExport(array $data, string $format, string $filenameBase)
    {
        $filename = str_replace(' ', '_', $filenameBase) . '_' . date('Y-m-d');

        if ($format === 'xlsx') {
            return $this->generateXlsx($data, $filename);
        }

        return $this->generatePdf($data, $filename);
    }

    /**
     * Generate real XLSX with PhpSpreadsheet.
     */
    private function generateXlsx(array $data, string $filename)
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Data');

        $row = 1;

        // Title
        $lastCol = chr(64 + count($data['headers'])); // e.g. 'H' for 8 columns
        $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
        $sheet->setCellValue("A{$row}", $data['title'] ?? '');
        $sheet->getStyle("A{$row}")->getFont()->setBold(true)->setSize(14);
        $sheet->getStyle("A{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $row++;

        if (!empty($data['subtitle'])) {
            $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
            $sheet->setCellValue("A{$row}", $data['subtitle']);
            $sheet->getStyle("A{$row}")->getFont()->setSize(11)->setItalic(true);
            $sheet->getStyle("A{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
            $row++;
        }

        // Export date
        $sheet->mergeCells("A{$row}:{$lastCol}{$row}");
        $sheet->setCellValue("A{$row}", 'Diekspor: ' . now()->format('d/m/Y H:i'));
        $sheet->getStyle("A{$row}")->getFont()->setSize(9)->setColor(new \PhpOffice\PhpSpreadsheet\Style\Color('FF888888'));
        $sheet->getStyle("A{$row}")->getAlignment()->setHorizontal(Alignment::HORIZONTAL_CENTER);
        $row++;

        // Blank row
        $row++;

        // Headers
        $headerRow = $row;
        foreach ($data['headers'] as $idx => $header) {
            $col = chr(65 + $idx);
            $sheet->setCellValue($col . $headerRow, $header);
        }
        $sheet->getStyle("A{$headerRow}:{$lastCol}{$headerRow}")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => '000000'], 'size' => 11],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => 'D9E1F2']],
            'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        $row++;

        // Data rows
        $dataStart = $row;
        foreach ($data['rows'] as $idx => $rowData) {
            foreach ($rowData as $colIdx => $value) {
                $col = chr(65 + $colIdx);
                $sheet->setCellValue($col . $row, $value);
            }
            // Alternating color
            if ($idx % 2 === 1) {
                $sheet->getStyle("A{$row}:{$lastCol}{$row}")->getFill()
                    ->setFillType(Fill::FILL_SOLID)
                    ->getStartColor()->setRGB('F2F2F2');
            }
            $row++;
        }

        // Data borders
        if (count($data['rows']) > 0) {
            $lastDataRow = $row - 1;
            $sheet->getStyle("A{$dataStart}:{$lastCol}{$lastDataRow}")->applyFromArray([
                'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
            ]);
        }

        // Summary
        if (!empty($data['summary'])) {
            $row++;
            foreach ($data['summary'] as $label => $value) {
                $sheet->setCellValue('A' . $row, $label);
                $sheet->setCellValue('B' . $row, $value);
                $sheet->getStyle('A' . $row)->getFont()->setBold(true);
                $row++;
            }
        }

        // Auto-size columns
        foreach (range('A', $lastCol) as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $tempFile = tempnam(sys_get_temp_dir(), 'xlsx_');
        $writer = new Xlsx($spreadsheet);
        $writer->save($tempFile);

        return response()->download($tempFile, $filename . '.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    /**
     * Generate real PDF with DomPDF.
     */
    private function generatePdf(array $data, string $filename)
    {
        $exportDate = now()->format('d/m/Y H:i');

        $html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>';
        $html .= 'body{font-family:Arial,sans-serif;font-size:11px;margin:15px 20px;color:#222}';
        $html .= 'h1{font-size:16px;text-align:center;margin:0 0 4px}';
        $html .= '.subtitle{text-align:center;font-size:11px;color:#555;margin-bottom:2px}';
        $html .= '.meta{text-align:center;font-size:9px;color:#888;margin-bottom:12px}';
        $html .= 'table{width:100%;border-collapse:collapse;margin-bottom:12px}';
        $html .= 'th,td{border:1px solid #444;padding:5px 7px;font-size:10px}';
        $html .= 'th{background:#2563eb;color:#fff;font-weight:bold;text-align:center}';
        $html .= 'tr:nth-child(even){background:#f3f4f6}';
        $html .= '.summary td{border:none;padding:3px 8px;font-size:11px}';
        $html .= '.summary .label{font-weight:bold}';
        $html .= '.footer{text-align:center;margin-top:15px;font-size:9px;color:#aaa}';
        $html .= '</style></head><body>';

        $html .= '<h1>' . htmlspecialchars($data['title'] ?? 'Export Data') . '</h1>';
        if (!empty($data['subtitle'])) {
            $html .= '<div class="subtitle">' . htmlspecialchars($data['subtitle']) . '</div>';
        }
        $html .= '<div class="meta">Diekspor: ' . $exportDate . '</div>';

        $html .= '<table><thead><tr>';
        foreach ($data['headers'] as $h) {
            $html .= '<th>' . htmlspecialchars($h) . '</th>';
        }
        $html .= '</tr></thead><tbody>';

        foreach ($data['rows'] as $row) {
            $html .= '<tr>';
            foreach ($row as $cell) {
                $html .= '<td>' . htmlspecialchars((string) $cell) . '</td>';
            }
            $html .= '</tr>';
        }
        $html .= '</tbody></table>';

        if (!empty($data['summary'])) {
            $html .= '<table class="summary">';
            foreach ($data['summary'] as $label => $value) {
                $html .= '<tr><td class="label">' . htmlspecialchars($label) . ':</td><td>' . htmlspecialchars((string) $value) . '</td></tr>';
            }
            $html .= '</table>';
        }

        $html .= '<div class="footer">SMA 15 Makassar LMS - Diekspor pada ' . $exportDate . '</div>';
        $html .= '</body></html>';

        $orientation = count($data['headers']) > 6 ? 'landscape' : 'portrait';
        $pdf = Pdf::loadHTML($html)->setPaper('a4', $orientation);

        return $pdf->download($filename . '.pdf');
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
