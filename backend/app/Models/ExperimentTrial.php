<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExperimentTrial extends Model
{
    protected $fillable = [
        'session_id', 'scenario',
        'gt_no_face', 'gt_multi_face', 'gt_phone', 'gt_book',
        'gt_head_turn', 'gt_eye_gaze_away', 'gt_identity_mismatch',
        'snapshot_path', 'image_width', 'image_height', 'image_size_kb',
        'person_count', 'face_count', 'face_detected', 'face_confidence',
        'face_bbox', 'head_yaw', 'head_pitch', 'head_roll',
        'eye_gaze_ratio', 'face_distance', 'all_detections',
        'risk_score_raw', 'fastapi_detections',
        'client_face_detected', 'client_face_count', 'client_face_confidence',
        'client_face_bbox', 'client_model', 'client_latency_ms', 'client_error',
        'score_no_face', 'score_multi_face', 'score_head_turn',
        'score_eye_gaze', 'score_object_detection', 'score_identity_mismatch',
        'total_score', 'risk_level',
        'pred_no_face', 'pred_multi_face', 'pred_head_turn',
        'pred_eye_gaze_away', 'pred_phone', 'pred_book', 'pred_identity_mismatch',
        'config_version_id', 'config_scope_used',
        'inference_ms', 'server_total_ms', 'end_to_end_ms',
        'is_invalid', 'invalidation_reason',
        'trial_number', 'captured_at',
    ];

    protected $casts = [
        'gt_no_face'             => 'bool',
        'gt_multi_face'          => 'bool',
        'gt_phone'               => 'bool',
        'gt_book'                => 'bool',
        'gt_head_turn'           => 'bool',
        'gt_eye_gaze_away'       => 'bool',
        'gt_identity_mismatch'   => 'bool',
        'face_detected'          => 'bool',
        'is_invalid'             => 'bool',
        'pred_no_face'           => 'bool',
        'pred_multi_face'        => 'bool',
        'pred_head_turn'         => 'bool',
        'pred_eye_gaze_away'     => 'bool',
        'pred_phone'             => 'bool',
        'pred_book'              => 'bool',
        'pred_identity_mismatch' => 'bool',
        'face_bbox'              => 'array',
        'client_face_detected'   => 'bool',
        'client_face_count'      => 'integer',
        'client_face_confidence' => 'float',
        'client_face_bbox'       => 'array',
        'client_latency_ms'      => 'integer',
        'all_detections'         => 'array',
        'fastapi_detections'     => 'array',
        'captured_at'            => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(ExperimentSession::class, 'session_id');
    }

    public function configVersion(): BelongsTo
    {
        return $this->belongsTo(ProctoringConfigVersion::class, 'config_version_id');
    }

    public function scopeValid($query)
    {
        return $query->where('is_invalid', false);
    }
}
