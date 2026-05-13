<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LandingPageController extends Controller
{
    private const CACHE_KEY = 'landing_page_content';
    private const SETTING_KEY = 'landing_page_content';

    public function publicShow()
    {
        return response()->json([
            'success' => true,
            'data' => $this->getContent(),
        ]);
    }

    public function show()
    {
        return response()->json([
            'success' => true,
            'data' => $this->getContent(),
        ]);
    }

    public function update(Request $request)
    {
        $request->validate([
            'content' => 'required|string',
            'logo' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:2048',
            'hero_background' => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
            'hero_video' => 'nullable|file|mimetypes:video/mp4,video/webm|max:20480',
        ]);

        $payload = json_decode($request->input('content'), true);
        if (!is_array($payload)) {
            return response()->json([
                'success' => false,
                'message' => 'Format konten tidak valid.',
            ], 422);
        }

        $existing = $this->getContent();
        $content = $this->normalizeContent($payload);

        if ($request->hasFile('logo')) {
            $content['hero']['logo_url'] = $this->storeLandingFile($request->file('logo'), 'logo');
            $this->deleteLandingFile($existing['hero']['logo_url'] ?? null);
        }

        if ($request->hasFile('hero_background')) {
            $content['hero']['background_url'] = $this->storeLandingFile($request->file('hero_background'), 'background');
            $this->deleteLandingFile($existing['hero']['background_url'] ?? null);
        }

        if ($request->hasFile('hero_video')) {
            $content['hero']['video_url'] = $this->storeLandingFile($request->file('hero_video'), 'hero-video');
            $this->deleteLandingFile($existing['hero']['video_url'] ?? null);
        }

        SystemSetting::updateOrCreate(
            ['setting_key' => self::SETTING_KEY],
            ['setting_value' => json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]
        );

        Cache::forget(self::CACHE_KEY);

        return response()->json([
            'success' => true,
            'message' => 'Konten beranda berhasil diperbarui.',
            'data' => $content,
        ]);
    }

    private function getContent(): array
    {
        return Cache::rememberForever(self::CACHE_KEY, function () {
            try {
                $raw = SystemSetting::query()
                    ->where('setting_key', self::SETTING_KEY)
                    ->value('setting_value');
            } catch (\Throwable $e) {
                return $this->defaultContent();
            }

            if (!$raw) {
                return $this->defaultContent();
            }

            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                return $this->defaultContent();
            }

            return $this->normalizeContent($decoded);
        });
    }

    private function normalizeContent(array $content): array
    {
        $default = $this->defaultContent();

        $hero = isset($content['hero']) && is_array($content['hero']) ? $content['hero'] : [];
        $about = isset($content['about']) && is_array($content['about']) ? $content['about'] : [];
        $programs = isset($content['programs']) && is_array($content['programs']) ? $content['programs'] : [];
        $facilities = isset($content['facilities']) && is_array($content['facilities']) ? $content['facilities'] : [];
        $registration = isset($content['registration']) && is_array($content['registration']) ? $content['registration'] : [];
        $footer = isset($content['footer']) && is_array($content['footer']) ? $content['footer'] : [];

        $normalized = $default;

        $normalized['hero'] = array_merge($default['hero'], $hero);
        $normalized['hero']['cta_primary'] = array_merge(
            $default['hero']['cta_primary'],
            isset($hero['cta_primary']) && is_array($hero['cta_primary']) ? $hero['cta_primary'] : []
        );
        $normalized['hero']['cta_secondary'] = array_merge(
            $default['hero']['cta_secondary'],
            isset($hero['cta_secondary']) && is_array($hero['cta_secondary']) ? $hero['cta_secondary'] : []
        );

        $normalized['about'] = array_merge($default['about'], $about);
        if (array_key_exists('cards', $about) && is_array($about['cards'])) {
            $normalized['about']['cards'] = $this->normalizeList($about['cards'], ['icon', 'title', 'text']);
        }

        $normalized['programs'] = array_merge($default['programs'], $programs);
        if (array_key_exists('items', $programs) && is_array($programs['items'])) {
            $normalized['programs']['items'] = $this->normalizeList($programs['items'], ['title', 'description']);
        }

        $normalized['facilities'] = array_merge($default['facilities'], $facilities);

        $normalized['registration'] = array_merge($default['registration'], $registration);
        if (array_key_exists('steps', $registration) && is_array($registration['steps'])) {
            $normalized['registration']['steps'] = $this->normalizeList($registration['steps'], ['title', 'description']);
        }

        $normalized['footer'] = array_merge($default['footer'], $footer);
        if (array_key_exists('info_links', $footer) && is_array($footer['info_links'])) {
            $normalized['footer']['info_links'] = $this->normalizeList($footer['info_links'], ['label', 'href']);
        }
        if (array_key_exists('contact', $footer) && is_array($footer['contact'])) {
            $normalized['footer']['contact'] = array_merge($default['footer']['contact'], $footer['contact']);
            if (array_key_exists('lines', $footer['contact']) && is_array($footer['contact']['lines'])) {
                $normalized['footer']['contact']['lines'] = $this->normalizeStringList($footer['contact']['lines']);
            }
        }

        return $normalized;
    }

    private function normalizeList(array $items, array $fields): array
    {
        $normalized = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $row = [];
            foreach ($fields as $field) {
                $value = $item[$field] ?? '';
                $row[$field] = is_string($value) ? trim($value) : '';
            }
            $normalized[] = $row;
        }
        return $normalized;
    }

    private function normalizeStringList(array $items): array
    {
        $normalized = [];
        foreach ($items as $item) {
            if (!is_string($item)) {
                continue;
            }
            $trimmed = trim($item);
            if ($trimmed !== '') {
                $normalized[] = $trimmed;
            }
        }
        return $normalized;
    }

    private function storeLandingFile($file, string $prefix): string
    {
        $extension = $file->getClientOriginalExtension() ?: 'dat';
        $filename = $prefix . '_' . now()->format('Ymd_His') . '_' . Str::random(6) . '.' . $extension;
        return $file->storeAs('landing', $filename, 'public');
    }

    private function deleteLandingFile(?string $path): void
    {
        if (!$path || str_starts_with($path, '/') || str_starts_with($path, 'http')) {
            return;
        }
        if (Storage::disk('public')->exists($path)) {
            Storage::disk('public')->delete($path);
        }
    }

    private function defaultContent(): array
    {
        return [
            'hero' => [
                'subtitle' => 'SMAN 15 Makassar',
                'title' => "Unggul dalam\nPrestasi, Santun\ndalam Budi Pekerti",
                'description' => 'Membentuk generasi muda yang berprestasi, berkarakter, dan siap menghadapi tantangan masa depan dengan nilai-nilai luhur bangsa.',
                'cta_primary' => [
                    'label' => 'Masuk LMS',
                    'href' => '/login',
                ],
                'cta_secondary' => [
                    'label' => 'Pengumuman Kelulusan',
                    'href' => '/pengumuman-kelulusan',
                ],
                'logo_url' => '/landing/logo.png',
                'background_url' => '/landing/background.jpg',
                'video_url' => '/landing/hero-video.webm',
            ],
            'about' => [
                'label' => 'Tentang Kami',
                'title' => 'Profil SMA Negeri 15 Makassar',
                'description' => 'Sekolah unggulan yang berkomitmen menghasilkan lulusan berkualitas dengan pendidikan holistik yang mengedepankan akademik dan pembentukan karakter.',
                'cards' => [
                    [
                        'icon' => 'V',
                        'title' => 'Visi',
                        'text' => 'Mewujudkan peserta didik yang unggul dalam prestasi, santun dalam budi pekerti, dan berwawasan lingkungan.',
                    ],
                    [
                        'icon' => 'M',
                        'title' => 'Misi',
                        'text' => 'Menyelenggarakan pendidikan berkualitas yang mengintegrasikan nilai akademik, karakter, dan kepedulian lingkungan.',
                    ],
                    [
                        'icon' => 'T',
                        'title' => 'Tujuan',
                        'text' => 'Menghasilkan lulusan yang kompeten, berakhlak mulia, dan siap melanjutkan ke perguruan tinggi terbaik.',
                    ],
                ],
            ],
            'programs' => [
                'label' => 'Program Unggulan',
                'title' => 'Program & Kurikulum',
                'description' => 'Beragam program pendidikan yang dirancang untuk mengoptimalkan potensi siswa di bidang akademik dan non-akademik.',
                'items' => [
                    [
                        'title' => 'Kurikulum Merdeka',
                        'description' => 'Implementasi Kurikulum Merdeka yang memberikan kebebasan belajar dan mengembangkan kompetensi sesuai minat dan bakat siswa dengan pendekatan student-centered learning.',
                    ],
                    [
                        'title' => 'Program STEM',
                        'description' => 'Pembelajaran Science, Technology, Engineering, and Mathematics yang terintegrasi untuk mempersiapkan siswa menghadapi era digital dan industri 4.0.',
                    ],
                    [
                        'title' => 'Ekstrakurikuler',
                        'description' => 'Lebih dari 20 pilihan ekstrakurikuler di bidang olahraga, seni, sains, dan kepemimpinan untuk mengembangkan bakat dan minat siswa.',
                    ],
                    [
                        'title' => 'Program Akselerasi',
                        'description' => 'Program khusus untuk siswa berprestasi dengan pembelajaran yang lebih mendalam dan persiapan kompetisi tingkat nasional dan internasional.',
                    ],
                ],
            ],
            'facilities' => [
                'label' => 'Fasilitas',
                'title' => 'Fasilitas Lengkap & Modern',
                'description' => 'Infrastruktur dan fasilitas pendukung pembelajaran yang modern untuk kenyamanan dan efektivitas proses belajar mengajar.',
            ],
            'registration' => [
                'label' => 'Pendaftaran',
                'title' => 'Bergabunglah Bersama Kami',
                'description' => 'Daftarkan diri Anda untuk menjadi bagian dari keluarga besar SMA Negeri 15 Makassar dan raih masa depan gemilang.',
                'steps' => [
                    [
                        'title' => 'Registrasi Online',
                        'description' => 'Isi formulir pendaftaran melalui portal PPDB online',
                    ],
                    [
                        'title' => 'Upload Dokumen',
                        'description' => 'Lengkapi dokumen persyaratan yang dibutuhkan',
                    ],
                    [
                        'title' => 'Seleksi',
                        'description' => 'Mengikuti proses seleksi berdasarkan nilai dan prestasi',
                    ],
                    [
                        'title' => 'Pengumuman',
                        'description' => 'Cek hasil pengumuman kelulusan secara online',
                    ],
                ],
                'cta_label' => 'Informasi Lengkap PPDB',
                'cta_href' => '#',
            ],
            'footer' => [
                'about_title' => 'SMA Negeri 15 Makassar',
                'about_text' => 'Sekolah menengah atas negeri yang berkomitmen mencetak generasi unggul, berkarakter, dan berprestasi untuk masa depan Indonesia yang lebih baik.',
                'instagram_url' => 'https://www.instagram.com/sman15mks.official',
                'youtube_url' => 'https://www.youtube.com/@SMAN15MAKASSAR',
                'info_links' => [
                    ['label' => 'Kalender Akademik', 'href' => '#'],
                    ['label' => 'Prestasi Siswa', 'href' => '#'],
                    ['label' => 'Berita & Artikel', 'href' => '#'],
                    ['label' => 'Alumni', 'href' => '#'],
                    ['label' => 'Pengumuman Kelulusan', 'href' => '/pengumuman-kelulusan'],
                    ['label' => 'Masuk LMS', 'href' => '/login'],
                ],
                'contact' => [
                    'map_url' => 'https://www.google.com/maps?q=SMA+Negeri+15+Makassar',
                    'lines' => [
                        'Jl. Ir. Sutami No.7, Bulurokeng',
                        'Kec. Biringkanaya, Makassar',
                        'Sulawesi Selatan 90243',
                    ],
                ],
            ],
        ];
    }
}
