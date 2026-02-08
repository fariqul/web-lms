<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceSession;
use App\Models\Assignment;
use App\Models\AssignmentSubmission;
use App\Models\ClassRoom;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProgressController extends Controller
{
    /**
     * Get available semesters/academic years.
     * GET /api/progress/semesters
     */
    public function semesters()
    {
        $academicYears = ClassRoom::distinct()->pluck('academic_year')->sort()->values();

        $semesters = [];
        foreach ($academicYears as $year) {
            $semesters[] = [
                'value' => '1_' . $year,
                'label' => 'Semester 1 - ' . $year,
                'semester' => '1',
                'academic_year' => $year,
            ];
            $semesters[] = [
                'value' => '2_' . $year,
                'label' => 'Semester 2 - ' . $year,
                'semester' => '2',
                'academic_year' => $year,
            ];
        }

        return response()->json([
            'success' => true,
            'data' => $semesters,
        ]);
    }

    /**
     * Get progress report for a single student.
     * GET /api/progress/student/{studentId}
     */
    public function studentReport(Request $request, int $studentId)
    {
        $user = $request->user();

        // Students can only view their own report
        if ($user->role === 'siswa' && $user->id !== $studentId) {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses ke data ini.',
            ], 403);
        }

        $student = User::with('classRoom')->findOrFail($studentId);

        if ($student->role !== 'siswa') {
            return response()->json([
                'success' => false,
                'message' => 'User bukan siswa.',
            ], 400);
        }

        $semester = $request->input('semester');
        $academicYear = $request->input('academic_year');

        // Get exam results
        $examResultsQuery = ExamResult::where('student_id', $studentId)
            ->with(['exam:id,title,subject,class_id,start_time']);

        if ($academicYear) {
            $examResultsQuery->whereHas('exam', function ($q) use ($academicYear) {
                $q->whereHas('class', function ($q2) use ($academicYear) {
                    $q2->where('academic_year', $academicYear);
                });
            });
        }

        $examResults = $examResultsQuery->get();

        // Group by subject
        $subjectScores = [];
        foreach ($examResults as $result) {
            $subject = $result->exam->subject ?? 'Lainnya';
            if (!isset($subjectScores[$subject])) {
                $subjectScores[$subject] = [
                    'subject' => $subject,
                    'exams' => [],
                    'total_score' => 0,
                    'count' => 0,
                ];
            }
            $percentage = $result->percentage ?? ($result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0);
            $subjectScores[$subject]['exams'][] = [
                'exam_id' => $result->exam_id,
                'exam_title' => $result->exam->title,
                'score' => $result->total_score,
                'max_score' => $result->max_score,
                'percentage' => $percentage,
                'date' => $result->submitted_at?->format('Y-m-d'),
            ];
            $subjectScores[$subject]['total_score'] += $percentage;
            $subjectScores[$subject]['count']++;
        }

        // Flatten exam scores from subjects
        $examScores = [];
        foreach ($subjectScores as $data) {
            foreach ($data['exams'] as $exam) {
                $examScores[] = [
                    'exam_id' => $exam['exam_id'],
                    'title' => $exam['exam_title'],
                    'subject' => $data['subject'],
                    'score' => $exam['score'],
                    'max_score' => $exam['max_score'],
                    'percentage' => $exam['percentage'],
                    'date' => $exam['date'],
                ];
            }
        }

        // Calculate averages per subject
        $subjects = [];
        foreach ($subjectScores as $subject => $data) {
            $avg = $data['count'] > 0 ? round($data['total_score'] / $data['count'], 2) : 0;
            $subjects[] = [
                'subject' => $subject,
                'average' => $avg,
                'count' => $data['count'],
            ];
        }

        // Attendance stats
        $attendanceQuery = Attendance::where('student_id', $studentId);
        if ($academicYear) {
            $attendanceQuery->whereHas('session', function ($q) use ($academicYear) {
                $q->whereHas('class', function ($q2) use ($academicYear) {
                    $q2->where('academic_year', $academicYear);
                });
            });
        }

        $totalAttendance = (clone $attendanceQuery)->count();
        $presentCount = (clone $attendanceQuery)->where('status', 'hadir')->count();
        $sickCount = (clone $attendanceQuery)->where('status', 'sakit')->count();
        $permissionCount = (clone $attendanceQuery)->where('status', 'izin')->count();
        $absentCount = (clone $attendanceQuery)->where('status', 'alpha')->count();

        $attendancePercentage = $totalAttendance > 0 ? round(($presentCount / $totalAttendance) * 100, 2) : 0;

        // Assignment stats
        $assignmentQuery = AssignmentSubmission::where('student_id', $studentId);
        $totalSubmissions = $assignmentQuery->count();
        $gradedSubmissions = (clone $assignmentQuery)->whereNotNull('score')->get();
        $averageAssignment = $gradedSubmissions->count() > 0 ? round($gradedSubmissions->avg('score'), 2) : 0;

        // Overall average
        $allPercentages = $examResults->map(function ($r) {
            return $r->percentage ?? ($r->max_score > 0 ? round(($r->total_score / $r->max_score) * 100, 2) : 0);
        });
        $overallAverage = $allPercentages->count() > 0 ? round($allPercentages->avg(), 2) : 0;

        // Ranking in class
        $ranking = null;
        if ($student->class_id) {
            $classStudents = User::where('class_id', $student->class_id)
                ->where('role', 'siswa')
                ->pluck('id');

            $classRanking = ExamResult::select('student_id', DB::raw('AVG(CASE WHEN max_score > 0 THEN (total_score / max_score) * 100 ELSE 0 END) as avg_score'))
                ->whereIn('student_id', $classStudents)
                ->groupBy('student_id')
                ->orderByDesc('avg_score')
                ->get();

            $rank = 1;
            foreach ($classRanking as $ranked) {
                if ($ranked->student_id === $studentId) {
                    $ranking = [
                        'rank' => $rank,
                        'total_students' => $classRanking->count(),
                    ];
                    break;
                }
                $rank++;
            }
        }

        // Determine trend (compare first half vs second half of exam scores)
        $trend = 'stable';
        if ($examResults->count() >= 4) {
            $sorted = $examResults->sortBy(function ($r) {
                return $r->submitted_at ?? $r->created_at;
            })->values();
            $half = intdiv($sorted->count(), 2);
            $firstHalf = $sorted->take($half)->map(fn($r) => $r->percentage ?? ($r->max_score > 0 ? round(($r->total_score / $r->max_score) * 100, 2) : 0))->avg();
            $secondHalf = $sorted->skip($half)->map(fn($r) => $r->percentage ?? ($r->max_score > 0 ? round(($r->total_score / $r->max_score) * 100, 2) : 0))->avg();
            if ($secondHalf > $firstHalf + 2) $trend = 'up';
            elseif ($secondHalf < $firstHalf - 2) $trend = 'down';
        }

        // Total assignments for the student's class
        $totalAssignments = 0;
        if ($student->class_id) {
            $totalAssignments = \App\Models\Assignment::where('class_id', $student->class_id)->count();
        }

        return response()->json([
            'success' => true,
            'data' => [
                'student' => [
                    'id' => $student->id,
                    'name' => $student->name,
                    'nisn' => $student->nisn ?? '',
                    'class_name' => $student->classRoom ? $student->classRoom->name : '-',
                ],
                'summary' => [
                    'average_score' => $overallAverage,
                    'total_exams' => $examResults->count(),
                    'attendance_rate' => $attendancePercentage,
                    'total_assignments' => $totalAssignments,
                    'assignments_submitted' => $totalSubmissions,
                ],
                'exam_scores' => $examScores,
                'subject_averages' => $subjects,
                'attendance_summary' => [
                    'hadir' => $presentCount,
                    'izin' => $permissionCount,
                    'sakit' => $sickCount,
                    'alpha' => $absentCount,
                    'total_sessions' => $totalAttendance,
                ],
                'trend' => $trend,
            ],
        ]);
    }

    /**
     * Get class-wide progress report with rankings.
     * GET /api/progress/class/{classId}
     */
    public function classReport(Request $request, int $classId)
    {
        $user = $request->user();

        // Only admin and guru can view class reports
        if ($user->role === 'siswa') {
            return response()->json([
                'success' => false,
                'message' => 'Anda tidak memiliki akses.',
            ], 403);
        }

        $class = ClassRoom::findOrFail($classId);
        $academicYear = $request->input('academic_year');

        $students = User::where('class_id', $classId)
            ->where('role', 'siswa')
            ->get();

        $studentIds = $students->pluck('id');

        // Get exam results for all students
        $examResultsQuery = ExamResult::whereIn('student_id', $studentIds)
            ->with(['exam:id,title,subject']);

        if ($academicYear) {
            $examResultsQuery->whereHas('exam', function ($q) use ($academicYear) {
                $q->whereHas('class', function ($q2) use ($academicYear) {
                    $q2->where('academic_year', $academicYear);
                });
            });
        }

        $examResults = $examResultsQuery->get()->groupBy('student_id');

        // Calc per-student average
        $rankings = [];
        foreach ($students as $student) {
            $results = $examResults->get($student->id, collect());
            $percentages = $results->map(function ($r) {
                return $r->percentage ?? ($r->max_score > 0 ? round(($r->total_score / $r->max_score) * 100, 2) : 0);
            });

            // Attendance
            $attendanceQuery = Attendance::where('student_id', $student->id);
            $totalAttendance = $attendanceQuery->count();
            $presentCount = (clone $attendanceQuery)->where('status', 'hadir')->count();
            $attendancePercentage = $totalAttendance > 0 ? round(($presentCount / $totalAttendance) * 100, 2) : 0;

            $rankings[] = [
                'student_id' => $student->id,
                'name' => $student->name,
                'nisn' => $student->nisn,
                'exam_average' => $percentages->count() > 0 ? round($percentages->avg(), 2) : 0,
                'exam_count' => $percentages->count(),
                'attendance_percentage' => $attendancePercentage,
                'total_attendance' => $totalAttendance,
            ];
        }

        // Sort by exam_average desc
        usort($rankings, fn($a, $b) => $b['exam_average'] <=> $a['exam_average']);

        // Add rank
        foreach ($rankings as $i => &$r) {
            $r['rank'] = $i + 1;
        }

        // Subject averages for the class
        $allResults = ExamResult::whereIn('student_id', $studentIds)
            ->with(['exam:id,title,subject'])
            ->get();

        $subjectAverages = [];
        foreach ($allResults as $result) {
            $subject = $result->exam->subject ?? 'Lainnya';
            if (!isset($subjectAverages[$subject])) {
                $subjectAverages[$subject] = ['total' => 0, 'count' => 0];
            }
            $pct = $result->percentage ?? ($result->max_score > 0 ? round(($result->total_score / $result->max_score) * 100, 2) : 0);
            $subjectAverages[$subject]['total'] += $pct;
            $subjectAverages[$subject]['count']++;
        }

        $subjects = [];
        foreach ($subjectAverages as $subject => $data) {
            $subjects[] = [
                'subject' => $subject,
                'average' => $data['count'] > 0 ? round($data['total'] / $data['count'], 2) : 0,
                'exam_count' => $data['count'],
            ];
        }

        return response()->json([
            'success' => true,
            'data' => [
                'class_name' => $class->name,
                'total_students' => count($rankings),
                'class_average' => count($rankings) > 0
                    ? round(collect($rankings)->avg('exam_average'), 2)
                    : 0,
                'attendance_rate' => count($rankings) > 0
                    ? round(collect($rankings)->avg('attendance_percentage'), 2)
                    : 0,
                'students' => collect($rankings)->map(function ($r) {
                    return [
                        'id' => $r['student_id'],
                        'name' => $r['name'],
                        'nisn' => $r['nisn'] ?? '',
                        'average_score' => $r['exam_average'],
                        'attendance_rate' => $r['attendance_percentage'],
                        'rank' => $r['rank'],
                    ];
                })->values(),
                'subject_averages' => $subjects,
            ],
        ]);
    }
}
