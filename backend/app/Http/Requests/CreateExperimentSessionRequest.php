<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateExperimentSessionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'            => 'required|string|max:255',
            'researcher_name' => 'required|string|max:255',
            'lighting'        => 'required|in:bright,normal,dim,backlit,other',
            'device_info'     => 'nullable|string|max:255',
            'distance_cm'     => 'nullable|integer|between:10,500',
            'notes'           => 'nullable|string|max:2000',
            'dataset_split'   => 'required|in:calibration,test',
            'config_scope'    => 'required|in:draft,active',
        ];
    }
}
