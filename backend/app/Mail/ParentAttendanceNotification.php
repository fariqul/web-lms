<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ParentAttendanceNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $studentName,
        public string $status,
        public string $subject,
        public string $className,
        public string $date,
        public string $time,
    ) {}

    public function envelope(): Envelope
    {
        $statusLabel = match ($this->status) {
            'hadir' => 'Hadir',
            'izin' => 'Izin',
            'sakit' => 'Sakit',
            'alpha' => 'Tidak Hadir (Alpha)',
            default => ucfirst($this->status),
        };

        return new Envelope(
            subject: "Notifikasi Absensi: {$this->studentName} - {$statusLabel}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.parent-attendance',
        );
    }

    public function statusLabel(): string
    {
        return match ($this->status) {
            'hadir' => 'Hadir ✅',
            'izin' => 'Izin 📋',
            'sakit' => 'Sakit 🏥',
            'alpha' => 'Tidak Hadir (Alpha) ❌',
            default => ucfirst($this->status),
        };
    }

    public function statusColor(): string
    {
        return match ($this->status) {
            'hadir' => '#16a34a',
            'izin' => '#2563eb',
            'sakit' => '#eab308',
            'alpha' => '#dc2626',
            default => '#64748b',
        };
    }
}
