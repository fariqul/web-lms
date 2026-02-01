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
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
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
        ];
    }
}
