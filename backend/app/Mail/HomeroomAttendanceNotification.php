<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class HomeroomAttendanceNotification extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  string  $teacherName  Nama wali kelas
     * @param  string  $className    Nama kelas
     * @param  string  $subjectName  Mata pelajaran sesi absensi
     * @param  string  $date         Tanggal sesi
     * @param  array   $summary      Ringkasan: ['total' => x, 'hadir' => x, 'izin' => x, 'sakit' => x, 'alpha' => x]
     * @param  array   $studentList  Daftar siswa: [['name' => ..., 'status' => ...], ...]
     */
    public function __construct(
        public string $teacherName,
        public string $className,
        public string $subjectName,
        public string $date,
        public array $summary,
        public array $studentList,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Rekap Absensi Kelas {$this->className} - {$this->date}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.homeroom-attendance',
        );
    }
}
