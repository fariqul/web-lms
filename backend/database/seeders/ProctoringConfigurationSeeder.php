<?php

namespace Database\Seeders;

use App\Models\ProctoringConfiguration;
use Illuminate\Database\Seeder;

class ProctoringConfigurationSeeder extends Seeder
{
    /**
     * Seed default proctoring configurations for both draft and active scopes.
     */
    public function run(): void
    {
        $defaults = ProctoringConfiguration::getDefaults();

        ProctoringConfiguration::updateOrCreate(
            ['scope' => 'draft'],
            array_merge($defaults, ['scope' => 'draft'])
        );

        ProctoringConfiguration::updateOrCreate(
            ['scope' => 'active'],
            array_merge($defaults, ['scope' => 'active'])
        );
    }
}
