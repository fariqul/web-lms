<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Schedule;
use App\Models\ClassRoom;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ScheduleController extends Controller
{
    /**
     * Map day number to day name
     */
    private array $dayMap = [
        1 => 'senin',
        2 => 'selasa',
        3 => 'rabu',
        4 => 'kamis',
        5 => 'jumat',
        6 => 'sabtu',
    ];

    /**
     * Display a listing of schedules - OPTIMIZED
     */
    public function index(Request $request)
    {
        $query = Schedule::with(['classRoom:id,name', 'teacher:id,name']);

        // Filter by class
        if ($request->has('class_id')) {
            $query->where('class_id', $request->class_id);
        }

        // Filter by teacher
        if ($request->has('teacher_id')) {
            $query->where('teacher_id', $request->teacher_id);
        }

        // Filter by day
        if ($request->has('day')) {
            $query->where('day', $request->day);
        }

        $schedules = $query->orderByRaw("CASE day WHEN 'senin' THEN 1 WHEN 'selasa' THEN 2 WHEN 'rabu' THEN 3 WHEN 'kamis' THEN 4 WHEN 'jumat' THEN 5 WHEN 'sabtu' THEN 6 END")
            ->orderBy('start_time')
            ->get(['id', 'class_id', 'teacher_id', 'subject', 'day', 'start_time', 'end_time', 'room'])
            ->map(function ($schedule) {
                $schedule->day_of_week = array_search($schedule->day, $this->dayMap) ?: 1;
                return $schedule;
            });

        return response()->json([
            'success' => true,
            'data' => $schedules,
        ]);
    }

    /**
     * Store a newly created schedule - OPTIMIZED
     */
    public function store(Request $request)
    {
        $request->validate([
            'class_id' => 'required|exists:classes,id',
            'teacher_id' => 'required|exists:users,id',
            'subject' => 'required|string|max:255',
            'day_of_week' => 'required|integer|between:1,6',
            'start_time' => 'required',
            'end_time' => 'required',
            'room' => 'nullable|string|max:255',
        ]);

        // Convert day_of_week to day string
        $data = $request->except('day_of_week');
        $data['day'] = $this->dayMap[$request->day_of_week] ?? 'senin';

        $schedule = Schedule::create($data);
        $schedule->load(['classRoom:id,name', 'teacher:id,name']);
        $schedule->day_of_week = $request->day_of_week;

        return response()->json([
            'success' => true,
            'data' => $schedule,
            'message' => 'Jadwal berhasil ditambahkan',
        ], 201);
    }

    /**
     * Display the specified schedule - OPTIMIZED
     */
    public function show(Schedule $schedule)
    {
        $schedule->load(['classRoom:id,name', 'teacher:id,name']);

        return response()->json([
            'success' => true,
            'data' => $schedule,
        ]);
    }

    /**
     * Update the specified schedule - OPTIMIZED
     */
    public function update(Request $request, Schedule $schedule)
    {
        $request->validate([
            'class_id' => 'sometimes|exists:classes,id',
            'teacher_id' => 'sometimes|exists:users,id',
            'subject' => 'sometimes|string|max:255',
            'day_of_week' => 'sometimes|integer|between:1,6',
            'start_time' => 'sometimes',
            'end_time' => 'sometimes',
            'room' => 'nullable|string|max:255',
        ]);

        // Convert day_of_week to day string if provided
        $data = $request->except('day_of_week');
        if ($request->has('day_of_week')) {
            $data['day'] = $this->dayMap[$request->day_of_week] ?? $schedule->day;
        }

        $schedule->fill($data);
        $schedule->save();
        $schedule->load(['classRoom:id,name', 'teacher:id,name']);
        $schedule->day_of_week = array_search($schedule->day, $this->dayMap) ?: 1;

        return response()->json([
            'success' => true,
            'data' => $schedule,
            'message' => 'Jadwal berhasil diupdate',
        ]);
    }

    /**
     * Remove the specified schedule
     */
    public function destroy(Schedule $schedule)
    {
        $schedule->delete();

        return response()->json([
            'success' => true,
            'message' => 'Jadwal berhasil dihapus',
        ]);
    }

    /**
     * Get schedule for student's class - OPTIMIZED
     */
    public function mySchedule(Request $request)
    {
        $user = $request->user();

        Log::info('mySchedule called', [
            'user_id' => $user ? $user->id : null,
            'class_id' => $user ? $user->class_id : null,
        ]);

        if (!$user || !$user->class_id) {
            return response()->json([
                'success' => false,
                'message' => 'Anda belum terdaftar di kelas manapun',
            ], 422);
        }

        $schedules = Schedule::with(['teacher:id,name'])
            ->where('class_id', $user->class_id)
            ->orderByRaw("CASE day WHEN 'senin' THEN 1 WHEN 'selasa' THEN 2 WHEN 'rabu' THEN 3 WHEN 'kamis' THEN 4 WHEN 'jumat' THEN 5 WHEN 'sabtu' THEN 6 END")
            ->orderBy('start_time')
            ->get(['id', 'class_id', 'teacher_id', 'subject', 'day', 'start_time', 'end_time', 'room'])
            ->map(function ($schedule) {
                $schedule->day_of_week = array_search($schedule->day, $this->dayMap) ?: 1;
                return $schedule;
            })
            ->groupBy('day_of_week');

        Log::info('mySchedule response', ['count' => $schedules->count()]);

        return response()->json([
            'success' => true,
            'data' => $schedules,
        ]);
    }

    /**
     * Get teacher's teaching schedule - OPTIMIZED
     */
    public function teacherSchedule(Request $request)
    {
        $user = $request->user();

        $schedules = Schedule::with(['classRoom:id,name'])
            ->where('teacher_id', $user->id)
            ->orderByRaw("CASE day WHEN 'senin' THEN 1 WHEN 'selasa' THEN 2 WHEN 'rabu' THEN 3 WHEN 'kamis' THEN 4 WHEN 'jumat' THEN 5 WHEN 'sabtu' THEN 6 END")
            ->orderBy('start_time')
            ->get(['id', 'class_id', 'teacher_id', 'subject', 'day', 'start_time', 'end_time', 'room'])
            ->map(function ($schedule) {
                $schedule->day_of_week = array_search($schedule->day, $this->dayMap) ?: 1;
                return $schedule;
            })
            ->groupBy('day_of_week');

        return response()->json([
            'success' => true,
            'data' => $schedules,
        ]);
    }
}
