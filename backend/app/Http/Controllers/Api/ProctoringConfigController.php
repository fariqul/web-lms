<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateProctoringConfigRequest;
use App\Models\ProctoringConfiguration;
use App\Models\ProctoringConfigVersion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Exception;

class ProctoringConfigController extends Controller
{
    /**
     * GET /api/proctoring-config
     * Returns draft, active, defaults, and version metadata.
     */
    public function getConfig(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            $draft    = ProctoringConfiguration::getDraft();
            $active   = ProctoringConfiguration::getActive();
            $defaults = ProctoringConfiguration::getDefaults();
            $version  = ProctoringConfigVersion::getLatestVersionNumber('active');

            // Determine if draft matches active (key-level comparison of scalar fields)
            $scalarKeys = [
                'head_yaw_threshold', 'head_pitch_threshold', 'eye_gaze_threshold',
                'face_similarity_threshold', 'confidence_threshold', 'alert_dedup_window_sec',
                'risk_violation_min', 'risk_alert_any_min', 'risk_alert_high_min', 'risk_alert_crit_min',
                'risk_level_medium_min', 'risk_level_high_min', 'risk_level_critical_min',
                'snapshot_interval_sec', 'anomaly_trigger_sec', 'anomaly_cooldown_sec',
            ];
            $draftSameAsActive = true;
            foreach ($scalarKeys as $key) {
                if (($draft[$key] ?? null) != ($active[$key] ?? null)) {
                    $draftSameAsActive = false;
                    break;
                }
            }
            if ($draftSameAsActive) {
                // Also compare JSON fields as encoded strings
                $draftSameAsActive = json_encode($draft['score_weights']) === json_encode($active['score_weights'])
                    && json_encode($draft['score_increments']) === json_encode($active['score_increments']);
            }

            return response()->json([
                'success' => true,
                'data'    => [
                    'draft'                 => $draft,
                    'active'                => $active,
                    'defaults'              => $defaults,
                    'active_version'        => $version ?: null,
                    'draft_is_same_as_active' => $draftSameAsActive,
                ],
            ]);
        } catch (Exception $e) {
            Log::error('[ProctoringConfig] getConfig error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal memuat konfigurasi: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/proctoring-config/draft
     * Update (or create) the draft configuration.
     */
    public function updateDraft(UpdateProctoringConfigRequest $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            $data = $request->validated();
            $data['updated_by'] = $request->user()->id;

            ProctoringConfiguration::updateOrCreate(['scope' => 'draft'], $data);

            ProctoringConfiguration::invalidateCache('draft');

            return response()->json([
                'success' => true,
                'message' => 'Draft konfigurasi berhasil disimpan.',
            ]);
        } catch (Exception $e) {
            Log::error('[ProctoringConfig] updateDraft error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal menyimpan draft: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/proctoring-config/apply
     * Promote draft to active and create a version record.
     */
    public function applyToActive(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            // Get draft from DB (not cache)
            $draft = ProctoringConfiguration::where('scope', 'draft')->first();
            if (!$draft) {
                return response()->json(['success' => false, 'message' => 'Tidak ada draft konfigurasi untuk diterapkan.'], 422);
            }

            // Fields to copy from draft → active
            $fields = [
                'head_yaw_threshold', 'head_pitch_threshold', 'eye_gaze_threshold',
                'face_similarity_threshold', 'confidence_threshold', 'per_class_confidence',
                'alert_dedup_window_sec', 'score_weights', 'score_increments',
                'risk_violation_min', 'risk_alert_any_min', 'risk_alert_high_min', 'risk_alert_crit_min',
                'risk_level_medium_min', 'risk_level_high_min', 'risk_level_critical_min',
                'snapshot_interval_sec', 'anomaly_trigger_sec', 'anomaly_cooldown_sec',
                'notes',
            ];

            $draftData = array_intersect_key($draft->toArray(), array_flip($fields));
            $draftData['updated_by'] = $request->user()->id;

            $active = ProctoringConfiguration::updateOrCreate(['scope' => 'active'], $draftData);

            // Create version record
            $nextVersion = ProctoringConfigVersion::getLatestVersionNumber('active') + 1;

            $snapshot = $this->buildConfigSnapshotFromModel($active);

            $version = ProctoringConfigVersion::create([
                'config_scope'   => 'active',
                'version_number' => $nextVersion,
                'snapshot'       => $snapshot,
                'changed_by'     => $request->user()->id,
                'notes'          => $request->input('notes'),
            ]);

            ProctoringConfiguration::invalidateCache('active');

            // AuditLog if available
            if (class_exists('\App\Models\AuditLog')) {
                try {
                    \App\Models\AuditLog::create([
                        'user_id'     => $request->user()->id,
                        'action'      => 'proctoring_config_applied',
                        'description' => "Konfigurasi proctoring diterapkan ke active (versi #{$nextVersion})",
                    ]);
                } catch (\Throwable $e) {
                    Log::warning('[ProctoringConfig] AuditLog write failed: ' . $e->getMessage());
                }
            }

            return response()->json([
                'success' => true,
                'message' => "Konfigurasi berhasil diterapkan sebagai versi #{$nextVersion}.",
                'data'    => ['version_number' => $nextVersion],
            ]);
        } catch (Exception $e) {
            Log::error('[ProctoringConfig] applyToActive error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal menerapkan konfigurasi: ' . $e->getMessage()], 500);
        }
    }

    /**
     * GET /api/proctoring-config/history
     * Return the last 20 active config versions with diff from previous.
     */
    public function getVersionHistory(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            $versions = ProctoringConfigVersion::where('config_scope', 'active')
                ->with('changedBy:id,name')
                ->orderByDesc('version_number')
                ->limit(20)
                ->get();

            // Build list with key-level diff from previous version
            $data = $versions->map(function ($v, $idx) use ($versions) {
                $prevVersion = $versions->get($idx + 1);
                $diff = [];
                if ($prevVersion) {
                    $current = $v->snapshot;
                    $prev    = $prevVersion->snapshot;
                    foreach ($current as $key => $val) {
                        $prevVal = $prev[$key] ?? null;
                        $curStr  = is_array($val) ? json_encode($val) : (string) $val;
                        $prevStr = is_array($prevVal) ? json_encode($prevVal) : (string) $prevVal;
                        if ($curStr !== $prevStr) {
                            $diff[$key] = ['from' => $prevVal, 'to' => $val];
                        }
                    }
                }

                return [
                    'id'             => $v->id,
                    'version_number' => $v->version_number,
                    'snapshot'       => $v->snapshot,
                    'changed_by'     => $v->changedBy ? ['id' => $v->changedBy->id, 'name' => $v->changedBy->name] : null,
                    'notes'          => $v->notes,
                    'created_at'     => $v->created_at,
                    'diff'           => $diff,
                ];
            });

            return response()->json(['success' => true, 'data' => $data]);
        } catch (Exception $e) {
            Log::error('[ProctoringConfig] getVersionHistory error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal memuat riwayat versi: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/proctoring-config/rollback/{versionId}
     * Roll active config back to a specific version.
     */
    public function rollback(Request $request, int $versionId): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            $versionRecord = ProctoringConfigVersion::findOrFail($versionId);

            $snapshot = $versionRecord->snapshot;
            $snapshot['updated_by'] = $request->user()->id;

            $active = ProctoringConfiguration::updateOrCreate(['scope' => 'active'], $snapshot);

            // Create a new version record for this rollback
            $nextVersion = ProctoringConfigVersion::getLatestVersionNumber('active') + 1;
            ProctoringConfigVersion::create([
                'config_scope'   => 'active',
                'version_number' => $nextVersion,
                'snapshot'       => $this->buildConfigSnapshotFromModel($active),
                'changed_by'     => $request->user()->id,
                'notes'          => "Rollback ke versi #{$versionId}",
            ]);

            ProctoringConfiguration::invalidateCache('active');

            return response()->json([
                'success' => true,
                'message' => "Berhasil rollback ke versi #{$versionId} (versi baru: #{$nextVersion}).",
                'data'    => ['version_number' => $nextVersion],
            ]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json(['success' => false, 'message' => 'Versi tidak ditemukan.'], 404);
        } catch (Exception $e) {
            Log::error('[ProctoringConfig] rollback error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal rollback: ' . $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/proctoring-config/reset
     * Delete a scope's DB row (falls back to config defaults).
     */
    public function resetToDefaults(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        try {
            $scope = $request->input('scope', 'draft');
            if (!in_array($scope, ['draft', 'active'])) {
                return response()->json(['success' => false, 'message' => 'Scope tidak valid.'], 422);
            }

            ProctoringConfiguration::where('scope', $scope)->delete();
            ProctoringConfiguration::invalidateCache($scope);

            return response()->json([
                'success' => true,
                'message' => "Konfigurasi {$scope} berhasil direset ke default.",
            ]);
        } catch (Exception $e) {
            Log::error('[ProctoringConfig] resetToDefaults error: ' . $e->getMessage());
            return response()->json(['success' => false, 'message' => 'Gagal reset konfigurasi: ' . $e->getMessage()], 500);
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private function buildConfigSnapshotFromModel(ProctoringConfiguration $model): array
    {
        return [
            'head_yaw_threshold'      => $model->head_yaw_threshold,
            'head_pitch_threshold'    => $model->head_pitch_threshold,
            'eye_gaze_threshold'      => $model->eye_gaze_threshold,
            'face_similarity_threshold' => $model->face_similarity_threshold,
            'confidence_threshold'    => $model->confidence_threshold,
            'per_class_confidence'    => $model->per_class_confidence,
            'alert_dedup_window_sec'  => $model->alert_dedup_window_sec,
            'score_weights'           => $model->score_weights,
            'score_increments'        => $model->score_increments,
            'risk_violation_min'      => $model->risk_violation_min,
            'risk_alert_any_min'      => $model->risk_alert_any_min,
            'risk_alert_high_min'     => $model->risk_alert_high_min,
            'risk_alert_crit_min'     => $model->risk_alert_crit_min,
            'risk_level_medium_min'   => $model->risk_level_medium_min,
            'risk_level_high_min'     => $model->risk_level_high_min,
            'risk_level_critical_min' => $model->risk_level_critical_min,
            'snapshot_interval_sec'   => $model->snapshot_interval_sec,
            'anomaly_trigger_sec'     => $model->anomaly_trigger_sec,
            'anomaly_cooldown_sec'    => $model->anomaly_cooldown_sec,
            'notes'                   => $model->notes,
        ];
    }
}
