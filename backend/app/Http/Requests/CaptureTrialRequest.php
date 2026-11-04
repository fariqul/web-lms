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
        ];
    }
}
