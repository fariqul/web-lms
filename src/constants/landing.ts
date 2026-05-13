import type { LandingContent } from '@/types/landing';

export const DEFAULT_LANDING_CONTENT: LandingContent = {
  hero: {
    subtitle: 'SMAN 15 Makassar',
    title: 'Unggul dalam\nPrestasi, Santun\ndalam Budi Pekerti',
    description: 'Membentuk generasi muda yang berprestasi, berkarakter, dan siap menghadapi tantangan masa depan dengan nilai-nilai luhur bangsa.',
    cta_primary: {
      label: 'Masuk LMS',
      href: '/login',
    },
    cta_secondary: {
      label: 'Pengumuman Kelulusan',
      href: '/pengumuman-kelulusan',
    },
    logo_url: '/landing/logo.png',
    background_url: '/landing/background.jpg',
    video_url: '/landing/hero-video.webm',
  },
  about: {
    label: 'Tentang Kami',
    title: 'Profil SMA Negeri 15 Makassar',
    description: 'Sekolah unggulan yang berkomitmen menghasilkan lulusan berkualitas dengan pendidikan holistik yang mengedepankan akademik dan pembentukan karakter.',
    cards: [
      {
        icon: 'V',
        title: 'Visi',
        text: 'Mewujudkan peserta didik yang unggul dalam prestasi, santun dalam budi pekerti, dan berwawasan lingkungan.',
      },
      {
        icon: 'M',
        title: 'Misi',
        text: 'Menyelenggarakan pendidikan berkualitas yang mengintegrasikan nilai akademik, karakter, dan kepedulian lingkungan.',
      },
      {
        icon: 'T',
        title: 'Tujuan',
        text: 'Menghasilkan lulusan yang kompeten, berakhlak mulia, dan siap melanjutkan ke perguruan tinggi terbaik.',
      },
    ],
  },
  programs: {
    label: 'Program Unggulan',
    title: 'Program & Kurikulum',
    description: 'Beragam program pendidikan yang dirancang untuk mengoptimalkan potensi siswa di bidang akademik dan non-akademik.',
    items: [
      {
        title: 'Kurikulum Merdeka',
        description: 'Implementasi Kurikulum Merdeka yang memberikan kebebasan belajar dan mengembangkan kompetensi sesuai minat dan bakat siswa dengan pendekatan student-centered learning.',
      },
      {
        title: 'Program STEM',
        description: 'Pembelajaran Science, Technology, Engineering, and Mathematics yang terintegrasi untuk mempersiapkan siswa menghadapi era digital dan industri 4.0.',
      },
      {
        title: 'Ekstrakurikuler',
        description: 'Lebih dari 20 pilihan ekstrakurikuler di bidang olahraga, seni, sains, dan kepemimpinan untuk mengembangkan bakat dan minat siswa.',
      },
      {
        title: 'Program Akselerasi',
        description: 'Program khusus untuk siswa berprestasi dengan pembelajaran yang lebih mendalam dan persiapan kompetisi tingkat nasional dan internasional.',
      },
    ],
  },
  facilities: {
    label: 'Fasilitas',
    title: 'Fasilitas Lengkap & Modern',
    description: 'Infrastruktur dan fasilitas pendukung pembelajaran yang modern untuk kenyamanan dan efektivitas proses belajar mengajar.',
  },
  registration: {
    label: 'Pendaftaran',
    title: 'Bergabunglah Bersama Kami',
    description: 'Daftarkan diri Anda untuk menjadi bagian dari keluarga besar SMA Negeri 15 Makassar dan raih masa depan gemilang.',
    steps: [
      {
        title: 'Registrasi Online',
        description: 'Isi formulir pendaftaran melalui portal PPDB online',
      },
      {
        title: 'Upload Dokumen',
        description: 'Lengkapi dokumen persyaratan yang dibutuhkan',
      },
      {
        title: 'Seleksi',
        description: 'Mengikuti proses seleksi berdasarkan nilai dan prestasi',
      },
      {
        title: 'Pengumuman',
        description: 'Cek hasil pengumuman kelulusan secara online',
      },
    ],
    cta_label: 'Informasi Lengkap PPDB',
    cta_href: '#',
  },
  footer: {
    about_title: 'SMA Negeri 15 Makassar',
    about_text: 'Sekolah menengah atas negeri yang berkomitmen mencetak generasi unggul, berkarakter, dan berprestasi untuk masa depan Indonesia yang lebih baik.',
    instagram_url: 'https://www.instagram.com/sman15mks.official',
    youtube_url: 'https://www.youtube.com/@SMAN15MAKASSAR',
    info_links: [
      { label: 'Kalender Akademik', href: '#' },
      { label: 'Prestasi Siswa', href: '#' },
      { label: 'Berita & Artikel', href: '#' },
      { label: 'Alumni', href: '#' },
      { label: 'Pengumuman Kelulusan', href: '/pengumuman-kelulusan' },
      { label: 'Masuk LMS', href: '/login' },
    ],
    contact: {
      map_url: 'https://www.google.com/maps?q=SMA+Negeri+15+Makassar',
      lines: [
        'Jl. Ir. Sutami No.7, Bulurokeng',
        'Kec. Biringkanaya, Makassar',
        'Sulawesi Selatan 90243',
      ],
    },
  },
};

export const mergeLandingContent = (
  base: LandingContent,
  override?: Partial<LandingContent> | null
): LandingContent => {
  if (!override) return base;

  return {
    ...base,
    ...override,
    hero: {
      ...base.hero,
      ...override.hero,
      cta_primary: {
        ...base.hero.cta_primary,
        ...override.hero?.cta_primary,
      },
      cta_secondary: {
        ...base.hero.cta_secondary,
        ...override.hero?.cta_secondary,
      },
    },
    about: {
      ...base.about,
      ...override.about,
      cards: Array.isArray(override.about?.cards) ? override.about!.cards : base.about.cards,
    },
    programs: {
      ...base.programs,
      ...override.programs,
      items: Array.isArray(override.programs?.items) ? override.programs!.items : base.programs.items,
    },
    facilities: {
      ...base.facilities,
      ...override.facilities,
    },
    registration: {
      ...base.registration,
      ...override.registration,
      steps: Array.isArray(override.registration?.steps) ? override.registration!.steps : base.registration.steps,
    },
    footer: {
      ...base.footer,
      ...override.footer,
      info_links: Array.isArray(override.footer?.info_links)
        ? override.footer!.info_links
        : base.footer.info_links,
      contact: {
        ...base.footer.contact,
        ...override.footer?.contact,
        lines: Array.isArray(override.footer?.contact?.lines)
          ? override.footer!.contact!.lines
          : base.footer.contact.lines,
      },
    },
  };
};
