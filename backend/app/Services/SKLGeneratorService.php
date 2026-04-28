<?php

namespace App\Services;

use App\Models\StudentGraduation;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

class SKLGeneratorService
{
    /**
     * Generate SKL (Surat Keterangan Lulus) as PDF
     * Returns the file path for storage
     */
    public static function generateSKL(StudentGraduation $graduation): string
    {
        $student = $graduation->student;
        $class = $graduation->class;
        $decidedBy = $graduation->decidedBy;
        $schoolName = config('app.school_name', 'SMA 15 MAKASSAR');
        $schoolAddress = config('app.school_address', 'Makassar');

        // Sanitize filename untuk keamanan
        $sanitizedName = preg_replace('/[^a-zA-Z0-9-_]/', '_', strtolower($student->name));
        $filename = "SKL_{$student->id}_{$sanitizedName}_" . now()->format('YmdHis') . ".pdf";

        // Generate HTML content untuk PDF
        $htmlContent = self::generateHTMLContent($student, $class, $decidedBy, $schoolName, $schoolAddress);

        // Store HTML ke temporary file untuk dikonversi ke PDF
        $tempHtmlPath = storage_path("app/temp/{$filename}.html");
        if (!is_dir(storage_path("app/temp"))) {
            mkdir(storage_path("app/temp"), 0755, true);
        }
        file_put_contents($tempHtmlPath, $htmlContent);

        // Path untuk output PDF
        $pdfPath = "public/skl/{$filename}";
        $pdfFullPath = storage_path("app/{$pdfPath}");
        if (!is_dir(storage_path("app/public/skl"))) {
            mkdir(storage_path("app/public/skl"), 0755, true);
        }

        // Generate PDF menggunakan wkhtmltopdf atau alternatif
        // Untuk environment tanpa wkhtmltopdf, generate HTML saja untuk dimuat browser
        // Atau gunakan package TCPDF/DomPDF

        // Saat ini store path HTML, dan akan di-generate saat download
        // Alternative: gunakan package seperti barryvdh/laravel-dompdf
        
        // Untuk now, kita store HTML path
        $htmlPathForStorage = "skl/{$filename}.html";
        Storage::disk('public')->put($htmlPathForStorage, $htmlContent);

        return $htmlPathForStorage;
    }

    /**
     * Generate HTML content untuk SKL
     */
    private static function generateHTMLContent(User $student, $class, ?User $decidedBy = null, string $schoolName = '', string $schoolAddress = ''): string
    {
        $generateDate = now()->format('d F Y');
        $studentName = $student->name;
        $studentNisn = $student->nisn ?? '-';
        $studentNis = $student->nis ?? '-';
        $className = $class->name ?? '-';
        $akademikYear = $class->academic_year ?? '2025/2026';
        $adminName = $decidedBy?->name ?? 'Admin';

        return <<<HTML
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Surat Keterangan Lulus</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: 'Times New Roman', Times, serif;
                    line-height: 1.6;
                    color: #333;
                    background-color: #fff;
                }
                .container {
                    max-width: 210mm;
                    height: 297mm;
                    margin: 0 auto;
                    padding: 20mm;
                    background-color: white;
                }
                .header {
                    text-align: center;
                    margin-bottom: 30px;
                    border-bottom: 2px solid #000;
                    padding-bottom: 15px;
                }
                .header h1 {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .header p {
                    font-size: 12px;
                    margin: 3px 0;
                }
                .title {
                    text-align: center;
                    font-size: 16px;
                    font-weight: bold;
                    margin: 30px 0;
                    text-transform: uppercase;
                }
                .content {
                    font-size: 12px;
                    line-height: 1.8;
                    margin: 30px 0;
                }
                .content p {
                    margin-bottom: 15px;
                    text-align: justify;
                }
                .student-info {
                    margin: 25px 0;
                    border: 1px solid #000;
                    padding: 15px;
                }
                .info-row {
                    display: flex;
                    margin-bottom: 10px;
                    font-size: 12px;
                }
                .info-label {
                    width: 150px;
                    font-weight: bold;
                }
                .info-separator {
                    width: 10px;
                    text-align: center;
                }
                .info-value {
                    flex: 1;
                }
                .signature-section {
                    margin-top: 40px;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                    text-align: center;
                    font-size: 11px;
                }
                .signature-box {
                    border-top: 1px solid #000;
                    padding-top: 50px;
                    min-height: 80px;
                }
                .signature-title {
                    font-weight: bold;
                    margin-bottom: 5px;
                }
                .signature-line {
                    margin-top: 40px;
                    min-height: 30px;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        margin: 0;
                        padding: 20mm;
                        page-break-after: always;
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>{$schoolName}</h1>
                    <p>{$schoolAddress}</p>
                </div>

                <div class="title">
                    Surat Keterangan Lulus
                </div>

                <div class="content">
                    <p>
                        Dengan ini kami menyatakan bahwa:<br><br>
                    </p>

                    <div class="student-info">
                        <div class="info-row">
                            <div class="info-label">Nama Siswa</div>
                            <div class="info-separator">:</div>
                            <div class="info-value">{$studentName}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">NISN</div>
                            <div class="info-separator">:</div>
                            <div class="info-value">{$studentNisn}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">NIS</div>
                            <div class="info-separator">:</div>
                            <div class="info-value">{$studentNis}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Kelas</div>
                            <div class="info-separator">:</div>
                            <div class="info-value">{$className}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Tahun Akademik</div>
                            <div class="info-separator">:</div>
                            <div class="info-value">{$akademikYear}</div>
                        </div>
                    </div>

                    <p>
                        Adalah siswa yang telah menyelesaikan semua persyaratan akademik pada 
                        {$akademikYear} dan dinyatakan <strong>LULUS</strong> dari 
                        {$schoolName}.
                    </p>

                    <p>
                        Surat keterangan ini diberikan sebagai bukti kelulusan dan dapat digunakan 
                        sebagaimana diperlukan.
                    </p>

                    <p style="margin-top: 30px;">
                        Diterbitkan di Makassar<br>
                        Tanggal: {$generateDate}
                    </p>
                </div>

                <div class="signature-section">
                    <div class="signature-box">
                        <div class="signature-title">Kepala Sekolah</div>
                        <div class="signature-line"></div>
                    </div>
                    <div class="signature-box">
                        <div class="signature-title">Wakil Kepala Akademik</div>
                        <div class="signature-line"></div>
                    </div>
                </div>

                <p style="text-align: center; font-size: 10px; margin-top: 50px; color: #666;">
                    Generated on {$generateDate}
                </p>
            </div>
        </body>
        </html>
        HTML;
    }

    /**
     * Download SKL file
     */
    public static function downloadSKL(StudentGraduation $graduation)
    {
        if (!$graduation->skl_path || !Storage::disk('public')->exists($graduation->skl_path)) {
            throw new \Exception('SKL file not found');
        }

        $filename = basename($graduation->skl_path);
        $filePath = storage_path("app/{$graduation->skl_path}");
        return response()->download($filePath, $filename);
    }
}
