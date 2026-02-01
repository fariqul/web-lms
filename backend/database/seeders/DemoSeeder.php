<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\User;
use App\Models\ClassRoom;
use Illuminate\Support\Facades\Hash;

class DemoSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create Classes
        $classes = [
            ['name' => 'X IPA 1', 'grade_level' => 'X', 'academic_year' => '2024/2025'],
            ['name' => 'X IPA 2', 'grade_level' => 'X', 'academic_year' => '2024/2025'],
            ['name' => 'X IPS 1', 'grade_level' => 'X', 'academic_year' => '2024/2025'],
            ['name' => 'XI IPA 1', 'grade_level' => 'XI', 'academic_year' => '2024/2025'],
            ['name' => 'XI IPA 2', 'grade_level' => 'XI', 'academic_year' => '2024/2025'],
            ['name' => 'XI IPS 1', 'grade_level' => 'XI', 'academic_year' => '2024/2025'],
            ['name' => 'XII IPA 1', 'grade_level' => 'XII', 'academic_year' => '2024/2025'],
            ['name' => 'XII IPA 2', 'grade_level' => 'XII', 'academic_year' => '2024/2025'],
            ['name' => 'XII IPS 1', 'grade_level' => 'XII', 'academic_year' => '2024/2025'],
        ];

        foreach ($classes as $class) {
            ClassRoom::create($class);
        }

        // Create Admin
        User::create([
            'name' => 'Administrator',
            'email' => 'admin@sma15mks.sch.id',
            'password' => Hash::make('password'),
            'role' => 'admin',
        ]);

        // Create Teachers
        $teachers = [
            ['name' => 'Pak Budi Santoso', 'email' => 'guru@sma15mks.sch.id', 'nip' => '198501152010011001'],
            ['name' => 'Bu Sri Wahyuni', 'email' => 'sri.wahyuni@sma15mks.sch.id', 'nip' => '198703202012012002'],
            ['name' => 'Pak Ahmad Hidayat', 'email' => 'ahmad.hidayat@sma15mks.sch.id', 'nip' => '199001102015011003'],
        ];

        foreach ($teachers as $teacher) {
            User::create([
                'name' => $teacher['name'],
                'email' => $teacher['email'],
                'password' => Hash::make('password'),
                'role' => 'guru',
                'nip' => $teacher['nip'],
            ]);
        }

        // Create Students
        $xIpa1 = ClassRoom::where('name', 'X IPA 1')->first();
        
        $students = [
            ['name' => 'Andi Pratama', 'email' => 'siswa@sma15mks.sch.id', 'nisn' => '0012345678'],
            ['name' => 'Budi Setiawan', 'email' => 'budi.setiawan@sma15mks.sch.id', 'nisn' => '0012345679'],
            ['name' => 'Citra Dewi', 'email' => 'citra.dewi@sma15mks.sch.id', 'nisn' => '0012345680'],
            ['name' => 'Dian Safitri', 'email' => 'dian.safitri@sma15mks.sch.id', 'nisn' => '0012345681'],
            ['name' => 'Eka Putra', 'email' => 'eka.putra@sma15mks.sch.id', 'nisn' => '0012345682'],
            ['name' => 'Fajar Ramadhan', 'email' => 'fajar.ramadhan@sma15mks.sch.id', 'nisn' => '0012345683'],
            ['name' => 'Gita Permata', 'email' => 'gita.permata@sma15mks.sch.id', 'nisn' => '0012345684'],
            ['name' => 'Hendra Wijaya', 'email' => 'hendra.wijaya@sma15mks.sch.id', 'nisn' => '0012345685'],
            ['name' => 'Indah Lestari', 'email' => 'indah.lestari@sma15mks.sch.id', 'nisn' => '0012345686'],
            ['name' => 'Joko Susilo', 'email' => 'joko.susilo@sma15mks.sch.id', 'nisn' => '0012345687'],
        ];

        foreach ($students as $student) {
            User::create([
                'name' => $student['name'],
                'email' => $student['email'],
                'password' => Hash::make('password'),
                'role' => 'siswa',
                'nisn' => $student['nisn'],
                'class_id' => $xIpa1->id,
            ]);
        }

        // Add more students to other classes
        $otherClasses = ClassRoom::where('name', '!=', 'X IPA 1')->get();
        $nisnCounter = 12345688;
        
        foreach ($otherClasses as $class) {
            for ($i = 1; $i <= 5; $i++) {
                User::create([
                    'name' => "Siswa {$class->name} - {$i}",
                    'email' => "siswa{$nisnCounter}@sma15mks.sch.id",
                    'password' => Hash::make('password'),
                    'role' => 'siswa',
                    'nisn' => "00{$nisnCounter}",
                    'class_id' => $class->id,
                ]);
                $nisnCounter++;
            }
        }

        $this->command->info('Demo data seeded successfully!');
        $this->command->info('');
        $this->command->info('Login credentials:');
        $this->command->info('Admin: admin@sma15mks.sch.id / password');
        $this->command->info('Guru: guru@sma15mks.sch.id / password');
        $this->command->info('Siswa: siswa@sma15mks.sch.id / password');
    }
}
