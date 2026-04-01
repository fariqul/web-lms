<?php

namespace App\Console\Commands;

use App\Models\Answer;
use App\Models\Exam;
use App\Models\ExamRepublishArchive;
use App\Models\ExamResult;
use App\Models\Question;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RestoreRepublishArchiveCommand extends Command
{
    protected $signature = 'exam:restore-archive
        {exam_id : ID ujian sumber arsip}
        {session_no : Nomor sesi republish yang akan direstore}
        {--target-exam-id= : ID ujian tujuan restore (default: exam_id sumber)}
        {--dry-run : Simulasi tanpa menulis data}';

    protected $description = 'Restore hasil/jawaban dari exam_republish_archives ke tabel utama agar hasil ujian yang tertimpa bisa kembali.';

    public function handle(): int
    {
        $sourceExamId = (int) $this->argument('exam_id');
        $sessionNo = (int) $this->argument('session_no');
        $targetExamId = (int) ($this->option('target-exam-id') ?: $sourceExamId);
        $dryRun = (bool) $this->option('dry-run');

        $archive = ExamRepublishArchive::where('exam_id', $sourceExamId)
            ->where('session_no', $sessionNo)
            ->first();

        if (!$archive) {
            $this->error("Arsip tidak ditemukan untuk exam_id={$sourceExamId}, session_no={$sessionNo}");
            return self::FAILURE;
        }

        $targetExam = Exam::find($targetExamId);
        if (!$targetExam) {
            $this->error("Ujian target tidak ditemukan: {$targetExamId}");
            return self::FAILURE;
        }

        $snapshot = $archive->results_snapshot ?? [];
        $resultRows = [];
        $answerRows = [];

        if (is_array($snapshot)) {
            if (array_key_exists('result_rows', $snapshot) && is_array($snapshot['result_rows'])) {
                $resultRows = $snapshot['result_rows'];
            } elseif (array_is_list($snapshot)) {
                // Legacy format: results_snapshot langsung array result rows
                $resultRows = $snapshot;
            }

            if (array_key_exists('answer_rows', $snapshot) && is_array($snapshot['answer_rows'])) {
                $answerRows = $snapshot['answer_rows'];
            }
        }

        if (empty($resultRows) && empty($answerRows)) {
            $this->warn('Arsip ditemukan, tetapi tidak ada result_rows/answer_rows untuk direstore.');
            return self::SUCCESS;
        }

        $targetQuestions = Question::where('exam_id', $targetExamId)->get();
        $targetQuestionIds = $targetQuestions->pluck('id')->all();
        $questionByText = $targetQuestions
            ->filter(fn (Question $q) => is_string($q->question_text) && $q->question_text !== '')
            ->groupBy('question_text');

        $restoredResults = 0;
        $restoredAnswers = 0;
        $skippedAnswers = 0;

        $runner = function () use (
            $resultRows,
            $answerRows,
            $targetExamId,
            $targetQuestionIds,
            $questionByText,
            &$restoredResults,
            &$restoredAnswers,
            &$skippedAnswers
        ) {
            foreach ($resultRows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $studentId = (int) ($row['student_id'] ?? 0);
                if ($studentId <= 0) {
                    continue;
                }

                ExamResult::updateOrCreate(
                    [
                        'exam_id' => $targetExamId,
                        'student_id' => $studentId,
                    ],
                    [
                        'status' => (string) ($row['status'] ?? 'completed'),
                        'total_score' => (float) ($row['total_score'] ?? 0),
                        'max_score' => (float) ($row['max_score'] ?? 0),
                        'percentage' => (float) ($row['percentage'] ?? 0),
                        'score' => (float) ($row['percentage'] ?? 0),
                        'violation_count' => (int) ($row['violation_count'] ?? 0),
                        'total_answered' => (int) ($row['total_answered'] ?? 0),
                        'started_at' => $row['started_at'] ?? null,
                        'submitted_at' => $row['submitted_at'] ?? null,
                        'finished_at' => $row['finished_at'] ?? null,
                    ]
                );

                $restoredResults++;
            }

            foreach ($answerRows as $row) {
                if (!is_array($row)) {
                    continue;
                }

                $studentId = (int) ($row['student_id'] ?? 0);
                $questionId = (int) ($row['question_id'] ?? 0);

                if ($studentId <= 0) {
                    $skippedAnswers++;
                    continue;
                }

                // If snapshot question_id doesn't belong to target exam, fallback by question_text.
                if (!in_array($questionId, $targetQuestionIds, true)) {
                    $qText = (string) ($row['question_text'] ?? '');
                    $candidate = $qText !== '' ? $questionByText->get($qText)?->first() : null;
                    if ($candidate instanceof Question) {
                        $questionId = $candidate->id;
                    }
                }

                if (!in_array($questionId, $targetQuestionIds, true)) {
                    $skippedAnswers++;
                    continue;
                }

                Answer::updateOrCreate(
                    [
                        'student_id' => $studentId,
                        'question_id' => $questionId,
                    ],
                    [
                        'exam_id' => $targetExamId,
                        'answer' => $row['answer'] ?? null,
                        'is_correct' => array_key_exists('is_correct', $row) ? $row['is_correct'] : null,
                        'score' => array_key_exists('score', $row) ? $row['score'] : null,
                        'feedback' => $row['feedback'] ?? null,
                        'submitted_at' => $row['submitted_at'] ?? null,
                        'graded_at' => $row['graded_at'] ?? null,
                    ]
                );

                $restoredAnswers++;
            }

            // Recalculate summary numbers from restored answers.
            $resultRecords = ExamResult::where('exam_id', $targetExamId)->get();
            foreach ($resultRecords as $result) {
                $result->calculateScore();
            }
        };

        if ($dryRun) {
            $this->info('DRY RUN aktif. Tidak ada data yang ditulis.');
            $this->line("- result_rows tersedia: " . count($resultRows));
            $this->line("- answer_rows tersedia: " . count($answerRows));
            $this->line("- exam_id sumber: {$sourceExamId}");
            $this->line("- exam_id target: {$targetExamId}");
            return self::SUCCESS;
        }

        DB::transaction($runner);

        $this->info('Restore selesai.');
        $this->line("- Exam source: {$sourceExamId}");
        $this->line("- Exam target: {$targetExamId}");
        $this->line("- Result restored/upserted: {$restoredResults}");
        $this->line("- Answer restored/upserted: {$restoredAnswers}");
        $this->line("- Answer skipped (mapping gagal): {$skippedAnswers}");
        $this->warn('Catatan: Pelanggaran detail/snapshot tidak direstore otomatis, yang direstore adalah hasil dan jawaban.');

        return self::SUCCESS;
    }
}
