<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CreateExperimentSessionRequest;
use App\Http\Requests\CaptureTrialRequest;
use App\Models\ExperimentSession;
use App\Models\ExperimentTrial;
use App\Models\ProctoringConfiguration;
use App\Models\ProctoringConfigVersion;
use App\Models\ExamResult;
use App\Services\ExperimentMetricsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Carbon\Carbon;
use Exception;

class ExperimentController extends Controller
{
    // ──────────────────────────────────────────────────────────────────────────
    // index — list sessions
    // ──────────────────────────────────────────────────────────────────────────

    public function index(Request $request): JsonResponse
    {
        $query = ExperimentSession::withCount('trials');

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('dataset_split')) {
            $query->where('dataset_split', $request->query('dataset_split'));
        }

        $sessions = $query->orderByDesc('created_at')->paginate(20);

        return response()->json($sessions);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // store — create new session
    // ──────────────────────────────────────────────────────────────────────────

    public function store(CreateExperimentSessionRequest $request): JsonResponse
    {
        $data               = $request->validated();
        $data['created_by'] = $request->user()->id;
        $data['status']     = 'created';

        // If config_scope=active, attach the latest active config version
        if (($data['config_scope'] ?? 'draft') === 'active') {
            $latestVersion = ProctoringConfigVersion::where('config_scope', 'active')
                ->orderByDesc('version_number')
                ->first();
            if ($latestVersion) {
                $data['config_version_id'] = $latestVersion->id;
            }
        }

        $session = ExperimentSession::create($data);

        return response()->json($session, 201);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // show — single session detail
    // ──────────────────────────────────────────────────────────────────────────

    public function show(int $id): JsonResponse
    {
        $session = ExperimentSession::withCount('trials')->findOrFail($id);

        // Group trial counts by scenario
        $trialCountsByScenario = ExperimentTrial::where('session_id', $id)
            ->selectRaw('scenario, count(*) as count')
            ->groupBy('scenario')
            ->pluck('count', 'scenario');

        return response()->json([
            'data'                    => $session,
            'trial_counts_by_scenario' => $trialCountsByScenario,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // start — begin capturing
    // ──────────────────────────────────────────────────────────────────────────

    public function start(int $id): JsonResponse
    {
        $session = ExperimentSession::findOrFail($id);

        if (!in_array($session->status, ['created', 'paused'])) {
            return response()->json([
                'message' => 'Sesi hanya dapat dimulai dari status created atau paused.',
            ], 422);
        }

        $update = ['status' => 'running'];
        if ($session->started_at === null) {
            $update['started_at'] = now();
        }

        // Try to fetch FastAPI health info
        try {
            $proctoringServiceUrl = env('PROCTORING_SERVICE_URL', 'http://proctoring:8001');
            $healthResponse = Http::timeout(5)->get("{$proctoringServiceUrl}/health");

            if ($healthResponse->successful()) {
                $healthData = $healthResponse->json();
                $update['fastapi_device'] = $healthData['device'] ?? $healthData['hardware'] ?? null;
                $update['fastapi_model']  = $healthData['model'] ?? $healthData['model_name'] ?? null;
            }
        } catch (Exception $e) {
            Log::warning('[ExperimentController] FastAPI health check failed: ' . $e->getMessage());
        }

        // Invalidate proctoring config cache so the session uses fresh config
        ProctoringConfiguration::invalidateCache('active');
        ProctoringConfiguration::invalidateCache('draft');

        $session->update($update);
        $session->refresh();

        return response()->json($session);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // pause / resume
    // ──────────────────────────────────────────────────────────────────────────

    public function pause(int $id): JsonResponse
    {
        $session = ExperimentSession::findOrFail($id);

        if ($session->status !== 'running') {
            return response()->json(['message' => 'Sesi tidak dalam status running.'], 422);
        }

        $session->update(['status' => 'paused']);

        return response()->json($session->fresh());
    }

    public function resume(int $id): JsonResponse
    {
        $session = ExperimentSession::findOrFail($id);

        if ($session->status !== 'paused') {
            return response()->json(['message' => 'Sesi tidak dalam status paused.'], 422);
        }

        $session->update(['status' => 'running']);

        return response()->json($session->fresh());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // complete / cancel
    // ──────────────────────────────────────────────────────────────────────────

    public function complete(int $id): JsonResponse
    {
        $session = ExperimentSession::findOrFail($id);
        $session->update(['status' => 'completed', 'completed_at' => now()]);

        return response()->json($session->fresh());
    }

    public function cancel(int $id): JsonResponse
    {
        $session = ExperimentSession::findOrFail($id);
        $session->update(['status' => 'cancelled']);

        return response()->json($session->fresh());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // setBaseline — send image to FastAPI, store embedding
    // ──────────────────────────────────────────────────────────────────────────

    public function setBaseline(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|file|mimes:jpeg,jpg,png,webp|max:4096',
        ]);

        $session = ExperimentSession::findOrFail($id);

        try {
            $imageContents = file_get_contents($request->file('image')->getRealPath());
            $mimeType      = $request->file('image')->getMimeType() ?: 'image/jpeg';

            $proctoringServiceUrl = env('PROCTORING_SERVICE_URL', 'http://proctoring:8001');

            $response = Http::timeout(60)
                ->attach('image', $imageContents, 'baseline.jpg', ['Content-Type' => $mimeType])
                ->post("{$proctoringServiceUrl}/analyze");

            if (!$response->successful()) {
                throw new Exception('Proctoring service error: ' . $response->body());
            }

            $analysisResult = $response->json();
            $embedding      = $analysisResult['face_analysis']['face_embedding'] ?? null;

            if (!$embedding) {
                return response()->json([
                    'success' => false,
                    'message' => 'Wajah tidak terdeteksi',
                ], 400);
            }

            $session->update(['baseline_embedding' => $embedding]);

            return response()->json([
                'success'       => true,
                'message'       => 'Baseline berhasil disimpan.',
                'face_detected' => true,
            ]);
        } catch (Exception $e) {
            Log::error('[ExperimentController] setBaseline error: ' . $e->getMessage());

            return response()->json([
                'success' => false,
                'message' => 'Terjadi kesalahan: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // trials — list trials for a session
    // ──────────────────────────────────────────────────────────────────────────

    public function trials(int $id, Request $request): JsonResponse
    {
        $query = ExperimentTrial::where('session_id', $id);

        $boolFilters = [
            'is_invalid', 'gt_no_face', 'gt_multi_face', 'gt_phone',
            'gt_book', 'gt_head_turn', 'gt_eye_gaze_away', 'gt_identity_mismatch',
        ];

        if ($request->filled('scenario')) {
            $query->where('scenario', $request->query('scenario'));
        }

        foreach ($boolFilters as $field) {
            if ($request->has($field) && $request->query($field) !== null) {
                $query->where($field, (bool) $request->query($field));
            }
        }

        $trials = $query->orderBy('trial_number')->paginate(20);

        return response()->json($trials);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // capture — main data-collection endpoint
    // ──────────────────────────────────────────────────────────────────────────

    public function capture(int $id, CaptureTrialRequest $request): JsonResponse
    {
        // 1. Load session, validate running status
        $session = ExperimentSession::findOrFail($id);

        if ($session->status !== 'running') {
            return response()->json([
                'message' => 'Sesi tidak dalam status running. Mulai sesi terlebih dahulu.',
            ], 422);
        }

        // 2. Warn if there is an active exam in progress (non-blocking)
        $activeExamWarning = ExamResult::where('status', 'in_progress')->exists();

        // 3. Rate limit: prevent captures too close together
        $cacheKey    = "experiment_capture_last_{$id}";
        $lastCapture = Cache::get($cacheKey);
        $minIntervalMs = (int) env('EXPERIMENT_MIN_CAPTURE_INTERVAL_MS', 500);

        if ($lastCapture !== null) {
            $elapsedMs = (int) ((microtime(true) - $lastCapture) * 1000);
            if ($elapsedMs < $minIntervalMs) {
                return response()->json([
                    'message' => 'Terlalu cepat. Tunggu sebentar sebelum capture berikutnya.',
                ], 422);
            }
        }

        try {
            // 4. Save image to experiment_snapshots disk
            $imageFile     = $request->file('image');
            $imageContents = file_get_contents($imageFile->getRealPath());
            $mimeType      = $imageFile->getMimeType() ?: 'image/jpeg';
            $timestamp     = now()->format('YmdHis');
            $random        = substr(md5(uniqid('', true)), 0, 8);
            $filename      = "{$timestamp}_{$random}.jpg";
            $storagePath   = "{$id}/{$filename}";

            Storage::disk('experiment_snapshots')->put($storagePath, $imageContents);

            // 5. Load configuration
            $config = ($session->config_scope === 'active')
                ? ProctoringConfiguration::getActive()
                : ProctoringConfiguration::getDraft();

            // 6. Start server timer
            $serverStart = microtime(true);

            // 7. Build threshold_config
            $thresholdConfigData = [
                'head_yaw_threshold'        => $config['head_yaw_threshold'],
                'head_pitch_threshold'      => $config['head_pitch_threshold'],
                'eye_gaze_threshold'        => $config['eye_gaze_threshold'],
                'confidence_threshold'      => $config['confidence_threshold'],
                'face_similarity_threshold' => $config['face_similarity_threshold'],
            ];

            // Attach baseline embedding if available
            if (!empty($session->baseline_embedding)) {
                $thresholdConfigData['baseline_embedding'] = $session->baseline_embedding;
            }

            $thresholdConfig = json_encode($thresholdConfigData);

            // 8. Send to FastAPI
            $proctoringServiceUrl = env('PROCTORING_SERVICE_URL', 'http://proctoring:8001');

            $fastapiResponse = Http::timeout(60)
                ->attach('image', $imageContents, 'capture.jpg', ['Content-Type' => $mimeType])
                ->post("{$proctoringServiceUrl}/analyze", ['threshold_config' => $thresholdConfig]);

            // 9. Measure server-side latency
            $serverTotalMs = (int) ((microtime(true) - $serverStart) * 1000);

            if (!$fastapiResponse->successful()) {
                throw new Exception('Proctoring service error: ' . $fastapiResponse->body());
            }

            $result = $fastapiResponse->json();

            // ── Parse FastAPI response fields ─────────────────────────────
            $faceAnalysis      = $result['face_analysis'] ?? [];
            $allDetections     = $result['all_detections'] ?? [];
            $fastapiDetections = $result['detections'] ?? null;

            $faceDetected    = (bool) ($faceAnalysis['face_detected'] ?? $result['face_detected'] ?? false);
            $faceConfidence  = $faceAnalysis['face_confidence'] ?? $faceAnalysis['confidence'] ?? null;
            $faceBbox        = $faceAnalysis['face_bbox'] ?? null;
            $headYaw         = $faceAnalysis['head_yaw'] ?? null;
            $headPitch       = $faceAnalysis['head_pitch'] ?? null;
            $headRoll        = $faceAnalysis['head_roll'] ?? null;
            $eyeGazeRatio    = $faceAnalysis['eye_gaze_ratio'] ?? null;
            $faceDistance    = $faceAnalysis['face_distance'] ?? $result['face_distance'] ?? null;
            $personCount     = $result['person_count'] ?? null;
            $faceCount       = $result['face_count'] ?? ($result['multi_face_detection']['face_count'] ?? null);
            $riskScoreRaw    = $result['risk_score'] ?? null;
            $inferenceMsRaw  = $result['processing_time_ms'] ?? $result['inference_ms'] ?? null;

            // ── Compute component scores ──────────────────────────────────
            $scoreIncrements = $config['score_increments'] ?? [];
            $incNoFace     = (int) ($scoreIncrements['no_face']     ?? 15);
            $incMultiFace  = (int) ($scoreIncrements['multi_face']  ?? 10);
            $incHeadTurn   = (int) ($scoreIncrements['head_turn']   ?? 8);
            $incEyeGaze    = (int) ($scoreIncrements['eye_gaze']    ?? 5);
            $incObject     = (int) ($scoreIncrements['object']      ?? 15);
            $incIdentity   = (int) ($scoreIncrements['identity']    ?? 30);

            $headYawThreshold       = (float) ($config['head_yaw_threshold'] ?? 38);
            $headPitchThreshold     = (float) ($config['head_pitch_threshold'] ?? 33);
            $eyeGazeThreshold       = (float) ($config['eye_gaze_threshold'] ?? 0.48);
            $confidenceThreshold    = (float) ($config['confidence_threshold'] ?? 0.45);
            $faceSimilarityThreshold = (float) ($config['face_similarity_threshold'] ?? 0.6);

            $scoreNoFace   = (!$faceDetected) ? $incNoFace : 0;
            $scoreMultiFace = ($faceCount !== null && $faceCount > 1) ? $incMultiFace : 0;

            $scoreHeadTurn = 0;
            if ($headYaw !== null && abs((float) $headYaw) > $headYawThreshold) {
                $scoreHeadTurn = $incHeadTurn;
            } elseif ($headPitch !== null && abs((float) $headPitch) > $headPitchThreshold) {
                $scoreHeadTurn = $incHeadTurn;
            }

            $scoreEyeGaze = 0;
            if ($eyeGazeRatio !== null && (float) $eyeGazeRatio > $eyeGazeThreshold) {
                $scoreEyeGaze = $incEyeGaze;
            }

            // Object detection score: any prohibited item found
            $scoreObjectDetection = 0;
            foreach ($allDetections as $det) {
                $className  = strtolower($det['class_name'] ?? ($det['class'] ?? ''));
                $confidence = (float) ($det['confidence'] ?? 0);
                if (in_array($className, ['cell phone', 'phone', 'mobile phone', 'book'])
                    && $confidence > $confidenceThreshold) {
                    $scoreObjectDetection = $incObject;
                    break;
                }
            }

            $scoreIdentityMismatch = 0;
            if ($faceDistance !== null && (float) $faceDistance > $faceSimilarityThreshold) {
                $scoreIdentityMismatch = $incIdentity;
            }

            $totalScore = $scoreNoFace + $scoreMultiFace + $scoreHeadTurn
                + $scoreEyeGaze + $scoreObjectDetection + $scoreIdentityMismatch;

            // ── Risk level ────────────────────────────────────────────────
            $riskLevelMediumMin   = (int) ($config['risk_level_medium_min'] ?? 26);
            $riskLevelHighMin     = (int) ($config['risk_level_high_min'] ?? 51);
            $riskLevelCriticalMin = (int) ($config['risk_level_critical_min'] ?? 76);

            if ($totalScore >= $riskLevelCriticalMin) {
                $riskLevel = 'critical';
            } elseif ($totalScore >= $riskLevelHighMin) {
                $riskLevel = 'high';
            } elseif ($totalScore >= $riskLevelMediumMin) {
                $riskLevel = 'medium';
            } else {
                $riskLevel = 'low';
            }

            // ── AI predictions ────────────────────────────────────────────
            $predNoFace  = !$faceDetected;
            $predMultiFace = ($faceCount !== null && $faceCount > 1)
                || ($personCount !== null && $personCount > 1);

            $predHeadTurn = false;
            if ($headYaw !== null && abs((float) $headYaw) > $headYawThreshold) {
                $predHeadTurn = true;
            }
            if ($headPitch !== null && abs((float) $headPitch) > $headPitchThreshold) {
                $predHeadTurn = true;
            }

            $predEyeGazeAway = $eyeGazeRatio !== null
                && (float) $eyeGazeRatio > $eyeGazeThreshold;

            $predPhone = false;
            $predBook  = false;
            foreach ($allDetections as $det) {
                $className  = strtolower($det['class_name'] ?? ($det['class'] ?? ''));
                $confidence = (float) ($det['confidence'] ?? 0);
                if (in_array($className, ['cell phone', 'phone', 'mobile phone'])
                    && $confidence > $confidenceThreshold) {
                    $predPhone = true;
                }
                if ($className === 'book' && $confidence > $confidenceThreshold) {
                    $predBook = true;
                }
            }

            $predIdentityMismatch = $faceDistance !== null
                && (float) $faceDistance > $faceSimilarityThreshold;

            // ── Config version for this trial ─────────────────────────────
            $configVersionId = $session->config_version_id;
            if ($configVersionId === null && $session->config_scope === 'active') {
                $latestVersion = ProctoringConfigVersion::where('config_scope', 'active')
                    ->orderByDesc('version_number')
                    ->first();
                $configVersionId = $latestVersion?->id;
            }

            // ── Trial number ──────────────────────────────────────────────
            $trialNumber = $session->trials()->count() + 1;

            // ── Persist trial ─────────────────────────────────────────────
            $trial = ExperimentTrial::create([
                'session_id'             => $session->id,
                'scenario'               => $request->input('scenario'),
                'gt_no_face'             => $request->boolean('gt_no_face', false),
                'gt_multi_face'          => $request->boolean('gt_multi_face', false),
                'gt_phone'               => $request->boolean('gt_phone', false),
                'gt_book'                => $request->boolean('gt_book', false),
                'gt_head_turn'           => $request->boolean('gt_head_turn', false),
                'gt_eye_gaze_away'       => $request->boolean('gt_eye_gaze_away', false),
                'gt_identity_mismatch'   => $request->boolean('gt_identity_mismatch', false),
                'snapshot_path'          => $storagePath,
                'image_size_kb'          => strlen($imageContents) > 0
                    ? (int) ceil(strlen($imageContents) / 1024) : null,
                'person_count'           => $personCount,
                'face_count'             => $faceCount,
                'face_detected'          => $faceDetected,
                'face_confidence'        => $faceConfidence,
                'face_bbox'              => $faceBbox,
                'head_yaw'               => $headYaw,
                'head_pitch'             => $headPitch,
                'head_roll'              => $headRoll,
                'eye_gaze_ratio'         => $eyeGazeRatio,
                'face_distance'          => $faceDistance,
                'all_detections'         => $allDetections ?: null,
                'risk_score_raw'         => $riskScoreRaw,
                'fastapi_detections'     => $fastapiDetections,
                'score_no_face'          => $scoreNoFace,
                'score_multi_face'       => $scoreMultiFace,
                'score_head_turn'        => $scoreHeadTurn,
                'score_eye_gaze'         => $scoreEyeGaze,
                'score_object_detection' => $scoreObjectDetection,
                'score_identity_mismatch' => $scoreIdentityMismatch,
                'total_score'            => $totalScore,
                'risk_level'             => $riskLevel,
                'pred_no_face'           => $predNoFace,
                'pred_multi_face'        => $predMultiFace,
                'pred_head_turn'         => $predHeadTurn,
                'pred_eye_gaze_away'     => $predEyeGazeAway,
                'pred_phone'             => $predPhone,
                'pred_book'              => $predBook,
                'pred_identity_mismatch' => $predIdentityMismatch,
                'config_version_id'      => $configVersionId,
                'config_scope_used'      => $session->config_scope,
                'inference_ms'           => $inferenceMsRaw !== null ? (int) $inferenceMsRaw : null,
                'server_total_ms'        => $serverTotalMs,
                'end_to_end_ms'          => $request->filled('end_to_end_ms')
                    ? (int) $request->input('end_to_end_ms') : null,
                'is_invalid'             => false,
                'trial_number'           => $trialNumber,
                'captured_at'            => now(),
            ]);

            // 14. Update rate-limit cache
            Cache::put($cacheKey, microtime(true), 10);

            return response()->json([
                'data'                => $trial,
                'active_exam_warning' => $activeExamWarning,
            ]);
        } catch (Exception $e) {
            Log::error('[ExperimentController] capture error', [
                'session_id' => $id,
                'error'      => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Terjadi kesalahan: ' . $e->getMessage(),
            ], 500);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // updateTrial — patch ground-truth labels / invalidation
    // ──────────────────────────────────────────────────────────────────────────

    public function updateTrial(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'gt_no_face'           => 'nullable|boolean',
            'gt_multi_face'        => 'nullable|boolean',
            'gt_phone'             => 'nullable|boolean',
            'gt_book'              => 'nullable|boolean',
            'gt_head_turn'         => 'nullable|boolean',
            'gt_eye_gaze_away'     => 'nullable|boolean',
            'gt_identity_mismatch' => 'nullable|boolean',
            'is_invalid'           => 'nullable|boolean',
            'invalidation_reason'  => 'nullable|string|max:255',
        ]);

        $trial = ExperimentTrial::findOrFail($id);
        $trial->update($request->only([
            'gt_no_face', 'gt_multi_face', 'gt_phone', 'gt_book',
            'gt_head_turn', 'gt_eye_gaze_away', 'gt_identity_mismatch',
            'is_invalid', 'invalidation_reason',
        ]));

        return response()->json($trial->fresh());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // destroy — delete session + snapshots
    // ──────────────────────────────────────────────────────────────────────────

    public function destroy(int $id, Request $request): JsonResponse
    {
        if (!$request->boolean('confirm')) {
            return response()->json([
                'message' => 'Tambahkan ?confirm=true untuk menghapus sesi dan semua snapshotnya.',
            ], 422);
        }

        $session = ExperimentSession::findOrFail($id);

        // Remove snapshot directory for this session
        try {
            Storage::disk('experiment_snapshots')->deleteDirectory((string) $id);
        } catch (Exception $e) {
            Log::warning("[ExperimentController] Could not delete snapshot directory for session {$id}: " . $e->getMessage());
        }

        $session->delete(); // cascade removes trials

        return response()->json(['message' => 'Sesi dan semua data terkait berhasil dihapus.']);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // metrics — classification metrics
    // ──────────────────────────────────────────────────────────────────────────

    public function metrics(int $id): JsonResponse
    {
        $session = ExperimentSession::findOrFail($id);

        $allTrials   = $session->trials()->get();
        $validTrials = $session->trials()->valid()->get();

        $svc = new ExperimentMetricsService();

        $metrics      = $svc->computeMetrics($validTrials);
        $latencyStats = $svc->latencyStats($validTrials);

        return response()->json([
            'per_category'       => $metrics['per_category'],
            'overall'            => $metrics['overall'],
            'latency'            => $latencyStats,
            'trial_count'        => $allTrials->count(),
            'valid_trial_count'  => $validTrials->count(),
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // sweep — threshold sweep analysis
    // ──────────────────────────────────────────────────────────────────────────

    public function sweep(int $id, Request $request): JsonResponse
    {
        $request->validate([
            'param'    => 'required|in:head_yaw,head_pitch,eye_gaze,confidence,face_distance',
            'category' => 'required|in:head_turn,eye_gaze_away,phone,book,identity_mismatch',
            'min'      => 'required|numeric',
            'max'      => 'required|numeric|gt:min',
            'steps'    => 'nullable|integer|min:2|max:100',
        ]);

        $session  = ExperimentSession::findOrFail($id);
        $trials   = $session->trials()->valid()->get();

        $min      = (float) $request->input('min');
        $max      = (float) $request->input('max');
        $steps    = (int) $request->input('steps', 20);

        // Generate linearly spaced values between min and max
        $values = [];
        if ($steps <= 1) {
            $values = [$min];
        } else {
            for ($i = 0; $i < $steps; $i++) {
                $values[] = $min + ($max - $min) * ($i / ($steps - 1));
            }
        }

        $svc    = new ExperimentMetricsService();
        $result = $svc->thresholdSweep(
            $trials,
            $request->input('param'),
            $values,
            $request->input('category')
        );

        return response()->json([
            'param'    => $request->input('param'),
            'category' => $request->input('category'),
            'sweep'    => $result,
        ]);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // exportCsv — download CSV
    // ──────────────────────────────────────────────────────────────────────────

    public function exportCsv(int $id)
    {
        $session = ExperimentSession::findOrFail($id);
        $trials  = $session->trials()->orderBy('trial_number')->get();

        $svc     = new ExperimentMetricsService();
        $csv     = $svc->exportToCsv($trials, $session);
        $filename = "experiment_session_{$id}.csv";

        return response()->stream(
            function () use ($csv) {
                echo $csv;
            },
            200,
            [
                'Content-Type'        => 'text/csv; charset=UTF-8',
                'Content-Disposition' => "attachment; filename=\"{$filename}\"",
                'Cache-Control'       => 'no-store, no-cache',
            ]
        );
    }
}
