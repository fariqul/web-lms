<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CaptureTrialRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'image'                => 'required|file|mimes:jpeg,jpg,png,webp|max:4096',
            'scenario'             => 'nullable|string|max:100',
            'gt_no_face'           => 'nullable|boolean',
            'gt_multi_face'        => 'nullable|boolean',
            'gt_phone'             => 'nullable|boolean',
            'gt_book'              => 'nullable|boolean',
            'gt_head_turn'         => 'nullable|boolean',
            'gt_eye_gaze_away'     => 'nullable|boolean',
            'gt_identity_mismatch' => 'nullable|boolean',
            'end_to_end_ms'        => 'nullable|integer|min:0',
            'client_face_detected'   => 'nullable|boolean',
            'client_face_count'      => 'nullable|integer|min:0|max:20',
            'client_face_confidence' => 'nullable|numeric|min:0|max:1',
            'client_face_bbox'       => 'nullable|json',
            'client_model'           => 'nullable|string|max:64',
            'client_latency_ms'      => 'nullable|integer|min:0|max:60000',
            'client_error'           => 'nullable|string|max:255',
        ];
    }
}
