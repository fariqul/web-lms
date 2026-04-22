<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Violation extends Model
{
    use HasFactory;

    protected $fillable = [
        'exam_result_id',
        'student_id',
        'exam_id',
        'type',
        'description',
        'screenshot',
        'recorded_at',
        'timestamp',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
        'timestamp' => 'datetime',
    ];

    // Violation types
    const TYPE_TAB_SWITCH = 'tab_switch';
    const TYPE_WINDOW_BLUR = 'window_blur';
    const TYPE_COPY_PASTE = 'copy_paste';
    const TYPE_RIGHT_CLICK = 'right_click';
    const TYPE_SHORTCUT_KEY = 'shortcut_key';
    const TYPE_SCREEN_CAPTURE = 'screen_capture';
    const TYPE_MULTIPLE_FACE = 'multiple_face';
    const TYPE_NO_FACE = 'no_face';
    const TYPE_HEAD_TURN = 'head_turn';
    const TYPE_EYE_GAZE = 'eye_gaze';
    const TYPE_IDENTITY_MISMATCH = 'identity_mismatch';
    // Mobile-specific violation types
    const TYPE_SPLIT_SCREEN = 'split_screen';
    const TYPE_FLOATING_APP = 'floating_app';
    const TYPE_PIP_MODE = 'pip_mode';
    const TYPE_SUSPICIOUS_RESIZE = 'suspicious_resize';
    const TYPE_SCREENSHOT_ATTEMPT = 'screenshot_attempt';
    const TYPE_VIRTUAL_CAMERA = 'virtual_camera';
    const TYPE_CAMERA_OFF = 'camera_off';
    const TYPE_FULLSCREEN_EXIT = 'fullscreen_exit';

    public function examResult()
    {
        return $this->belongsTo(ExamResult::class);
    }

    public function student()
    {
        return $this->belongsTo(User::class, 'student_id');
    }

    public function exam()
    {
        return $this->belongsTo(Exam::class);
    }

    public static function getTypes()
    {
        return [
            self::TYPE_TAB_SWITCH => 'Pindah Tab',
            self::TYPE_WINDOW_BLUR => 'Keluar Jendela',
            self::TYPE_COPY_PASTE => 'Copy/Paste',
            self::TYPE_RIGHT_CLICK => 'Klik Kanan',
            self::TYPE_SHORTCUT_KEY => 'Shortcut Keyboard',
            self::TYPE_SCREEN_CAPTURE => 'Screen Capture',
            self::TYPE_MULTIPLE_FACE => 'Wajah Ganda',
            self::TYPE_NO_FACE => 'Tidak Ada Wajah',
            self::TYPE_HEAD_TURN => 'Kepala Menoleh',
            self::TYPE_EYE_GAZE => 'Mata Menyimpang',
            self::TYPE_IDENTITY_MISMATCH => 'Identitas Wajah Tidak Cocok',
            self::TYPE_SPLIT_SCREEN => 'Split Screen',
            self::TYPE_FLOATING_APP => 'Aplikasi Mengambang',
            self::TYPE_PIP_MODE => 'Mode Picture-in-Picture',
            self::TYPE_SUSPICIOUS_RESIZE => 'Resize Mencurigakan',
            self::TYPE_SCREENSHOT_ATTEMPT => 'Percobaan Screenshot',
            self::TYPE_VIRTUAL_CAMERA => 'Kamera Virtual',
            self::TYPE_CAMERA_OFF => 'Kamera Dimatikan',
            self::TYPE_FULLSCREEN_EXIT => 'Keluar Fullscreen',
        ];
    }
}
