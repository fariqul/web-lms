<?php
require __DIR__.'/../backend/vendor/autoload.php';
$app = require_once __DIR__.'/../backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use App\Models\ClassRoom;
use App\Models\StudentEnrollment;

$jsonFile = 'D:\belajar\sync_kelas_xi_xii.json';
if (!file_exists($jsonFile)) {
    die("File JSON tidak ditemukan!\n");
}

$students = json_decode(file_get_contents($jsonFile), true);
$academicYear = '2026/2027';

$classesCache = [];
$updated = 0;
$notFound = 0;

echo "Mulai sinkronisasi " . count($students) . " siswa lama Kelas XI & XII ke Kelas Baru...\n";

foreach ($students as $st) {
    $nisn = $st['nisn'];
    $className = $st['class_name'];
    
    // Temukan user berdasarkan NISN
    $user = clone User::query()->where('nisn', $nisn)->first();
    if (!$user) {
        $notFound++;
        continue;
    }
    
    // Temukan atau cache ClassRoom
    if (!isset($classesCache[$className])) {
        $classRoom = clone ClassRoom::query()
            ->where('name', $className)
            ->where('academic_year', $academicYear)
            ->first();
            
        if (!$classRoom) {
            // Jika kelas belum ada, buat kelasnya
            $grade = explode('.', $className)[0];
            $classRoom = clone ClassRoom::create([
                'name' => $className,
                'academic_year' => $academicYear,
                'grade_level' => $grade,
                'is_active' => true
            ]);
        }
        $classesCache[$className] = $classRoom->id;
    }
    
    $classId = $classesCache[$className];
    
    // Update User class_id
    if ($user->class_id !== $classId) {
        // Gunakan query builder agar tidak mentrigger event jika tidak perlu
        User::query()->where('id', $user->id)->update(['class_id' => $classId]);
        
        // Update Enrollment
        $enrollment = clone StudentEnrollment::query()
            ->where('student_id', $user->id)
            ->where('academic_year', $academicYear)
            ->first();
            
        if ($enrollment) {
            StudentEnrollment::query()->where('id', $enrollment->id)->update(['class_id' => $classId]);
        } else {
            // Deactivate old enrollments
            StudentEnrollment::query()->where('student_id', $user->id)->update(['is_active' => false]);
            
            // Create new enrollment
            clone StudentEnrollment::create([
                'student_id' => $user->id,
                'class_id' => $classId,
                'academic_year' => $academicYear,
                'semester' => 1,
                'start_date' => date('Y-07-15'),
                'is_active' => true
            ]);
        }
        
        $updated++;
    }
}

echo "✅ Sinkronisasi Selesai!\n";
echo "- Total Siswa di-update (Pindah Kelas): $updated\n";
echo "- Siswa tidak ditemukan di database (mungkin akun belum ada): $notFound\n";
