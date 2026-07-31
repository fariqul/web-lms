<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AssignmentController extends Controller
{
    /**
     * Display a listing of assignments
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Assignment::with(['teacher:id,name', 'classRoom:id,name']);

        // Filter by role
        if ($user->role === 'siswa') {
            // Students see assignments for their class
            $query->where('class_id', $user->class_id)
                  ->where('status', 'active');
        } elseif ($user->role === 'guru') {
            // Teachers see their own assignments
            $query->where('teacher_id', $user->id);
        }

        // Filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        // Filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $assignments = $query->withCount('submissions')
            ->withCount(['submissions as ungraded_count' => function ($query) {
                $query->where('status', '!=', 'graded');
            }])
            ->orderBy('deadline', 'asc')
            ->get();

        // For students, add submission status
        if ($user->role === 'siswa') {
            $assignments = $assignments->map(function ($assignment) use ($user) {
                /** @var \App\Models\Assignment $assignment */
                $submission = $assignment->submissions()
                    ->where('student_id', $user->id)
                    ->first();
                
                if ($submission) {
                    // Hide score from students - only show submission status
                    $submission->makeHidden(['score']);
                }
                $assignment->my_submission = $submission;
                $assignment->has_submitted = $submission !== null;
                return $assignment;
            });
        }

        return response()->json([
            'success' => true,
            'data' => $assignments,
        ]);
    }

    /**
     * Store a newly created assignment
     */
    public function store(Request $request)
    {
        $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'required|string|max:100',
            'class_id' => 'required|exists:classes,id',
            'deadline' => 'required|date|after:now',
            'max_score' => 'nullable|integer|min:1|max:1000',
            'attachment' => 'nullable|file|max:51200|mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,zip,rar,jpg,jpeg,png', // 50MB, allowed types
            'link_url' => 'nullable|url|max:500',
        ]);

        $user = $request->user();

        if (!in_array($user->role, ['guru', 'admin'])) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $attachmentUrl = null;
        if ($request->hasFile('attachment')) {
            $file = $request->file('attachment');
            $filename = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '', $file->getClientOriginalName());
            $path = $file->storeAs('assignments', $filename, 'public');
            $attachmentUrl = url('/storage/' . $path);
        }

        $assignment = Assignment::create([
            'title' => $request->title,
            'description' => $request->description,
            'subject' => $request->subject,
            'teacher_id' => $user->id,
            'class_id' => $request->class_id,
            'deadline' => $request->deadline,
            'max_score' => $request->max_score ?? 100,
            'attachment_url' => $attachmentUrl,
            'link_url' => $request->link_url,
            'status' => 'active',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Tugas berhasil dibuat',
            'data' => $assignment->load(['teacher:id,name', 'classRoom:id,name']),
        ], 201);
    }

    /**
     * Display the specified assignment
     */
    public function show(Request $request, Assignment $assignment)
    {
        $user = $request->user();
        
        // Students can only view assignments for their class
        if ($user->role === 'siswa' && $assignment->class_id !== $user->class_id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke tugas ini',
            ], 403);
        }

        // Teachers can only view their own assignments
        if ($user->role === 'guru' && $assignment->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke tugas ini',
            ], 403);
        }

        $assignment->load(['teacher:id,name', 'classRoom:id,name']);
        
        // Include submissions for teacher
        if ($user->role === 'guru' || $user->role === 'admin') {
            $assignment->load(['submissions.student:id,name,nisn']);
        }
        
        // Include own submission for student (without score)
        if ($user->role === 'siswa') {
            $submission = $assignment->submissions()
                ->where('student_id', $user->id)
                ->first();
            if ($submission) {
                $submission->makeHidden(['score']);
            }
            $assignment->my_submission = $submission;
        }

        return response()->json([
            'success' => true,
            'data' => $assignment,
        ]);
    }

    /**
     * Update the specified assignment
     */
    public function update(Request $request, Assignment $assignment)
    {
        $user = $request->user();

        if ($user->role !== 'admin' && $assignment->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $request->validate([
            'title' => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'subject' => 'sometimes|string|max:100',
            'class_id' => 'sometimes|exists:classes,id',
            'deadline' => 'sometimes|date',
            'max_score' => 'nullable|integer|min:1|max:1000',
            'status' => 'sometimes|in:active,closed',
            'attachment' => 'nullable|file|max:51200',
            'link_url' => 'nullable|url|max:500',
        ]);

        if ($request->hasFile('attachment')) {
            // Delete old file
            if ($assignment->attachment_url && str_contains($assignment->attachment_url, '/storage/assignments/')) {
                $oldPath = str_replace(url('/storage/'), '', $assignment->attachment_url);
                Storage::disk('public')->delete($oldPath);
            }

            $file = $request->file('attachment');
            $filename = time() . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '', $file->getClientOriginalName());
            $path = $file->storeAs('assignments', $filename, 'public');
            $assignment->attachment_url = url('/storage/' . $path);
        }

        $assignment->fill($request->only([
            'title', 'description', 'subject', 'class_id', 'deadline', 'max_score', 'status', 'link_url'
        ]));
        $assignment->save();

        return response()->json([
            'success' => true,
            'message' => 'Tugas berhasil diperbarui',
            'data' => $assignment->load(['teacher:id,name', 'classRoom:id,name']),
        ]);
    }

    /**
     * Remove the specified assignment
     */
    public function destroy(Assignment $assignment)
    {
        $user = request()->user();

        if ($user->role !== 'admin' && $assignment->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        // Delete attachment
        if ($assignment->attachment_url && str_contains($assignment->attachment_url, '/storage/assignments/')) {
            $oldPath = str_replace(url('/storage/'), '', $assignment->attachment_url);
            Storage::disk('public')->delete($oldPath);
        }

        $assignment->delete();

        return response()->json([
            'success' => true,
            'message' => 'Tugas berhasil dihapus',
        ]);
    }

    /**
     * Student submits assignment
     */
    public function submit(Request $request, Assignment $assignment)
    {
        $user = $request->user();

        if ($user->role !== 'siswa') {
            return response()->json([
                'success' => false,
                'message' => 'Hanya siswa yang bisa mengumpulkan tugas',
            ], 403);
        }

        // Check if student is in the same class
        if ($user->class_id !== $assignment->class_id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak terdaftar di kelas ini',
            ], 403);
        }

        // Check if already submitted
        $existingSubmission = AssignmentSubmission::where('assignment_id', $assignment->id)
            ->where('student_id', $user->id)
            ->first();

        if ($existingSubmission) {
            return response()->json([
                'success' => false,
                'message' => 'Anda sudah mengumpulkan tugas ini',
            ], 400);
        }

        $request->validate([
            'content' => 'nullable|string',
            'file' => 'nullable|file|max:51200|mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,zip,rar,jpg,jpeg,png',
            'link_url' => 'nullable|url|max:500',
        ]);

        // At least one of content, file, or link_url must be provided
        if (!$request->input('content') && !$request->hasFile('file') && !$request->input('link_url')) {
            return response()->json([
                'success' => false,
                'message' => 'Isi jawaban, upload file, atau berikan link',
            ], 422);
        }

        $fileUrl = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $filename = time() . '_' . $user->id . '_' . preg_replace('/[^a-zA-Z0-9._-]/', '', $file->getClientOriginalName());
            $path = $file->storeAs('submissions', $filename, 'public');
            $fileUrl = url('/storage/' . $path);
        }

        $isLate = now()->gt($assignment->deadline);

        $submission = AssignmentSubmission::create([
            'assignment_id' => $assignment->id,
            'student_id' => $user->id,
            'content' => $request->input('content'),
            'file_url' => $fileUrl,
            'link_url' => $request->input('link_url'),
            'status' => $isLate ? 'late' : 'submitted',
            'submitted_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => $isLate ? 'Tugas terlambat dikumpulkan' : 'Tugas berhasil dikumpulkan',
            'data' => $submission,
        ], 201);
    }

    /**
     * Teacher grades a submission
     */
    public function grade(Request $request, AssignmentSubmission $submission)
    {
        $user = $request->user();
        $assignment = $submission->assignment;

        if ($user->role !== 'admin' && $assignment->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $request->validate([
            'score' => 'required|integer|min:0|max:' . $assignment->max_score,
            'feedback' => 'nullable|string',
        ]);

        $submission->update([
            'score' => $request->score,
            'feedback' => $request->feedback,
            'status' => 'graded',
            'graded_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Nilai berhasil disimpan',
            'data' => $submission->load('student:id,name,nisn'),
        ]);
    }

    /**
     * Get submissions for an assignment (teacher only)
     */
    public function submissions(Assignment $assignment)
    {
        $user = request()->user();

        if ($user->role !== 'admin' && $assignment->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $submissions = $assignment->submissions()
            ->with('student:id,name,nisn')
            ->orderBy('submitted_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $submissions,
        ]);
    }

    /**
     * Get new assignments count for student dashboard
     */
    public function newCount(Request $request)
    {
        $user = $request->user();

        if ($user->role !== 'siswa') {
            return response()->json([
                'success' => true,
                'data' => ['count' => 0],
            ]);
        }

        // Count assignments created in last 7 days that student hasn't submitted
        $count = Assignment::where('class_id', $user->class_id)
            ->where('status', 'active')
            ->where('created_at', '>=', now()->subDays(7))
            ->whereDoesntHave('submissions', function ($query) use ($user) {
                $query->where('student_id', $user->id);
            })
            ->count();

        return response()->json([
            'success' => true,
            'data' => ['count' => $count],
        ]);
    }

    /**
     * Get pending (unsubmitted) assignments for student
     */
    public function pending(Request $request)
    {
        $user = $request->user();

        if ($user->role !== 'siswa') {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $assignments = Assignment::with(['teacher:id,name', 'classRoom:id,name'])
            ->where('class_id', $user->class_id)
            ->where('status', 'active')
            ->whereDoesntHave('submissions', function ($query) use ($user) {
                $query->where('student_id', $user->id);
            })
            ->orderBy('deadline', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $assignments,
        ]);
    }

    /**
     * Export submissions for an assignment to Excel
     */
    public function exportSubmissions(Assignment $assignment)
    {
        $user = request()->user();

        if ($user->role !== 'admin' && $assignment->teacher_id !== $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 403);
        }

        $assignment->load('classRoom:id,name');
        $submissions = $assignment->submissions()
            ->with('student:id,name,nisn')
            ->orderBy('submitted_at', 'asc')
            ->get();

        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Rekap Tugas');

        // Header info
        $sheet->setCellValue('A1', 'Rekap Pengumpulan Tugas');
        $sheet->mergeCells('A1:G1');
        $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(14);

        $sheet->setCellValue('A2', 'Judul Tugas');
        $sheet->setCellValue('B2', $assignment->title);
        $sheet->setCellValue('A3', 'Mata Pelajaran');
        $sheet->setCellValue('B3', $assignment->subject);
        $sheet->setCellValue('A4', 'Kelas');
        $sheet->setCellValue('B4', $assignment->classRoom?->name ?? '-');
        $sheet->setCellValue('A5', 'Deadline');
        $sheet->setCellValue('B5', $assignment->deadline);
        $sheet->setCellValue('A6', 'Nilai Maksimal');
        $sheet->setCellValue('B6', $assignment->max_score);

        $sheet->getStyle('A2:A6')->getFont()->setBold(true);

        // Table header
        $headerRow = 8;
        $headers = ['No', 'NISN', 'Nama Siswa', 'Jawaban', 'Link Jawaban', 'Status', 'Nilai', 'Feedback', 'Waktu Pengumpulan'];
        foreach ($headers as $col => $header) {
            $cell = \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($col + 1) . $headerRow;
            $sheet->setCellValue($cell, $header);
        }

        // Style header row
        $headerRange = 'A' . $headerRow . ':I' . $headerRow;
        $sheet->getStyle($headerRange)->getFont()->setBold(true);
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
            ->getStartColor()->setARGB('FF4472C4');
        $sheet->getStyle($headerRange)->getFont()->getColor()->setARGB('FFFFFFFF');

        // Data rows
        $row = $headerRow + 1;
        $no = 1;
        foreach ($submissions as $submission) {
            $statusLabel = match ($submission->status) {
                'graded' => 'Sudah Dinilai',
                'late' => 'Terlambat',
                default => 'Menunggu Penilaian',
            };

            $sheet->setCellValue('A' . $row, $no);
            $sheet->setCellValue('B' . $row, $submission->student?->nisn ?? '-');
            $sheet->setCellValue('C' . $row, $submission->student?->name ?? '-');
            $sheet->setCellValue('D' . $row, $submission->content ?? '-');
            $sheet->setCellValue('E' . $row, $submission->link_url ?? '-');
            $sheet->setCellValue('F' . $row, $statusLabel);
            $sheet->setCellValue('G' . $row, $submission->score ?? '-');
            $sheet->setCellValue('H' . $row, $submission->feedback ?? '-');
            $sheet->setCellValue('I' . $row, $submission->submitted_at?->format('d/m/Y H:i') ?? '-');

            $no++;
            $row++;
        }

        // Add borders to the data table
        $dataRange = 'A' . $headerRow . ':I' . ($row - 1);
        $sheet->getStyle($dataRange)->getBorders()->getAllBorders()
            ->setBorderStyle(\PhpOffice\PhpSpreadsheet\Style\Border::BORDER_THIN);

        // Auto-size columns
        foreach (range('A', 'I') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        // Summary row
        $summaryRow = $row + 1;
        $sheet->setCellValue('A' . $summaryRow, 'Total Pengumpulan: ' . $submissions->count());
        $sheet->getStyle('A' . $summaryRow)->getFont()->setBold(true);

        $gradedCount = $submissions->where('status', 'graded')->count();
        $sheet->setCellValue('A' . ($summaryRow + 1), 'Sudah Dinilai: ' . $gradedCount);
        $sheet->setCellValue('A' . ($summaryRow + 2), 'Belum Dinilai: ' . ($submissions->count() - $gradedCount));

        if ($gradedCount > 0) {
            $avgScore = $submissions->where('status', 'graded')->avg('score');
            $sheet->setCellValue('A' . ($summaryRow + 3), 'Rata-rata Nilai: ' . round($avgScore, 1));
        }

        // Generate filename
        $safeTitle = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $assignment->title);
        $filename = 'Rekap_Tugas_' . $safeTitle . '_' . date('Ymd') . '.xlsx';

        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
