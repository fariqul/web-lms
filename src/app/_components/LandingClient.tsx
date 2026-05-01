'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import s from '../page.module.css';

/* ─── Scroll Reveal Hook ─── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const children = el.querySelectorAll(`.${s.scrollReveal}`);
    if (children.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(s.scrollRevealVisible);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    children.forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/* SVG icon components for facilities */
const FacilityIcons: Record<string, React.ReactNode> = {
  lab_sains: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6M10 3v6.5L4 18.5C3.3 19.6 4.1 21 5.4 21h13.2c1.3 0 2.1-1.4 1.4-2.5L14 9.5V3"/><path d="M8.5 14h7"/></svg>
  ),
  lab_komputer: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  ),
  perpustakaan: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></svg>
  ),
  lapangan: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/><path d="M2 12h20"/><path d="M6 4.5c2.5 3 6 5 6 7.5s-3.5 4.5-6 7.5"/><path d="M18 4.5c-2.5 3-6 5-6 7.5s3.5 4.5 6 7.5"/></svg>
  ),
  aula: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/><path d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01"/></svg>
  ),
  kantin: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M6 1v3M10 1v3M14 1v3"/></svg>
  ),
  musholla: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 9h3v12h14V9h3L12 2z"/><path d="M12 6a2 2 0 0 1 0 4"/><path d="M9 22v-5a3 3 0 0 1 6 0v5"/></svg>
  ),
};

const FACILITIES = [
  { key: 'lab_sains', name: 'Laboratorium Sains' },
  { key: 'lab_komputer', name: 'Lab Komputer' },
  { key: 'perpustakaan', name: 'Perpustakaan Digital' },
  { key: 'lapangan', name: 'Lapangan Olahraga' },
  { key: 'aula', name: 'Aula Serbaguna' },
  { key: 'kantin', name: 'Kantin Sehat' },
  { key: 'musholla', name: 'Musholla Modern' },
];

const PROGRAMS = [
  {
    num: '01',
    title: 'Kurikulum Merdeka',
    desc: 'Implementasi Kurikulum Merdeka yang memberikan kebebasan belajar dan mengembangkan kompetensi sesuai minat dan bakat siswa dengan pendekatan student-centered learning.',
  },
  {
    num: '02',
    title: 'Program STEM',
    desc: 'Pembelajaran Science, Technology, Engineering, and Mathematics yang terintegrasi untuk mempersiapkan siswa menghadapi era digital dan industri 4.0.',
  },
  {
    num: '03',
    title: 'Ekstrakurikuler',
    desc: 'Lebih dari 20 pilihan ekstrakurikuler di bidang olahraga, seni, sains, dan kepemimpinan untuk mengembangkan bakat dan minat siswa.',
  },
  {
    num: '04',
    title: 'Program Akselerasi',
    desc: 'Program khusus untuk siswa berprestasi dengan pembelajaran yang lebih mendalam dan persiapan kompetisi tingkat nasional dan internasional.',
  },
];

const STEPS = [
  { num: 1, title: 'Registrasi Online', desc: 'Isi formulir pendaftaran melalui portal PPDB online' },
  { num: 2, title: 'Upload Dokumen', desc: 'Lengkapi dokumen persyaratan yang dibutuhkan' },
  { num: 3, title: 'Seleksi', desc: 'Mengikuti proses seleksi berdasarkan nilai dan prestasi' },
  { num: 4, title: 'Pengumuman', desc: 'Cek hasil pengumuman kelulusan secara online' },
];

/* ═══════════════════ COMPONENT ═══════════════════ */

export default function LandingClient() {
  const wrapperRef = useScrollReveal();
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Smooth scroll for anchor links */
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={s.landing} ref={wrapperRef}>
      {/* ═══ Navigation ═══ */}
      <nav className={`${s.nav} ${navScrolled ? s.navScrolled : ''}`}>
        <div className={s.navContainer}>
          <button onClick={() => scrollTo('home')} className={s.logoBtn}>
            <Image
              src="/landing/logo.png"
              alt="Logo SMA Negeri 15 Makassar"
              width={42}
              height={42}
              className={s.logo}
              priority
            />
            <div className={s.schoolName}>
              SMA NEGERI 15<br />MAKASSAR
            </div>
          </button>

          <ul className={s.navLinks}>
            <li><button onClick={() => scrollTo('home')} className={s.navLink}>Beranda</button></li>
            <li><button onClick={() => scrollTo('about')} className={s.navLink}>Profil</button></li>
            <li><button onClick={() => scrollTo('programs')} className={s.navLink}>Program</button></li>
            <li><button onClick={() => scrollTo('facilities')} className={s.navLink}>Fasilitas</button></li>
            <li><button onClick={() => scrollTo('registration')} className={s.navLink}>Pendaftaran</button></li>
            <li>
              <Link href="/login" className={s.navCta}>
                Masuk LMS
              </Link>
            </li>
          </ul>

          {/* Mobile menu button (hamburger icon via CSS) */}
          <button className={s.mobileMenuBtn} aria-label="Menu" onClick={() => scrollTo('home')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <section className={s.hero} id="home">
        <div className={s.heroContainer}>
          <div className={s.heroContent}>
            <div className={s.heroSubtitle}>SMAN 15 Makassar</div>
            <h1 className={s.heroTitle}>
              Unggul dalam<br />Prestasi, Santun<br />dalam Budi Pekerti
            </h1>
            <p className={s.heroDescription}>
              Membentuk generasi muda yang berprestasi, berkarakter, dan siap menghadapi
              tantangan masa depan dengan nilai-nilai luhur bangsa.
            </p>
            <div className={s.ctaButtons}>
              <Link href="/login" className={s.btnPrimary}>
                Masuk LMS
              </Link>
              <Link href="/pengumuman-kelulusan" className={s.btnSecondary}>
                Pengumuman Kelulusan
              </Link>
            </div>
          </div>
          <div className={s.heroVisual}>
            <video
              className={s.heroVideo}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
            >
              <source src="/landing/hero-video.webm" type="video/webm" />
            </video>
          </div>
        </div>
      </section>

      {/* ═══ About ═══ */}
      <section className={s.about} id="about">
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <div className={s.sectionLabel}>Tentang Kami</div>
            <h2 className={s.sectionTitle}>Profil SMA Negeri 15 Makassar</h2>
            <p className={s.sectionDescription}>
              Sekolah unggulan yang berkomitmen menghasilkan lulusan berkualitas dengan pendidikan
              holistik yang mengedepankan akademik dan pembentukan karakter.
            </p>
          </div>
          <div className={s.aboutGrid}>
            {[
              { icon: 'V', title: 'Visi', text: 'Mewujudkan peserta didik yang unggul dalam prestasi, santun dalam budi pekerti, dan berwawasan lingkungan.' },
              { icon: 'M', title: 'Misi', text: 'Menyelenggarakan pendidikan berkualitas yang mengintegrasikan nilai akademik, karakter, dan kepedulian lingkungan.' },
              { icon: 'T', title: 'Tujuan', text: 'Menghasilkan lulusan yang kompeten, berakhlak mulia, dan siap melanjutkan ke perguruan tinggi terbaik.' },
            ].map((card) => (
              <div key={card.icon} className={`${s.aboutCard} ${s.scrollReveal}`}>
                <div className={s.aboutIcon}>{card.icon}</div>
                <h3 className={s.aboutCardTitle}>{card.title}</h3>
                <p className={s.aboutCardText}>{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Programs ═══ */}
      <section className={s.programs} id="programs">
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <div className={s.sectionLabel}>Program Unggulan</div>
            <h2 className={s.sectionTitle}>Program &amp; Kurikulum</h2>
            <p className={s.sectionDescription}>
              Beragam program pendidikan yang dirancang untuk mengoptimalkan potensi siswa
              di bidang akademik dan non-akademik.
            </p>
          </div>
          <div className={s.programsGrid}>
            {PROGRAMS.map((p) => (
              <div key={p.num} className={`${s.programCard} ${s.scrollReveal}`}>
                <div className={s.programNumber}>{p.num}</div>
                <h3 className={s.programCardTitle}>{p.title}</h3>
                <p className={s.programCardText}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Facilities ═══ */}
      <section className={s.facilities} id="facilities">
        <div className={s.container}>
          <div className={s.sectionHeader}>
            <div className={s.sectionLabel}>Fasilitas</div>
            <h2 className={s.sectionTitle}>Fasilitas Lengkap &amp; Modern</h2>
            <p className={s.sectionDescription}>
              Infrastruktur dan fasilitas pendukung pembelajaran yang modern untuk kenyamanan
              dan efektivitas proses belajar mengajar.
            </p>
          </div>
          <div className={s.facilitiesGrid}>
            {FACILITIES.map((f) => (
              <div key={f.key} className={`${s.facilityCard} ${s.scrollReveal}`}>
                <div className={s.facilityIcon}>{FacilityIcons[f.key]}</div>
                <h3 className={s.facilityName}>{f.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Registration ═══ */}
      <section className={s.registration} id="registration">
        <div className={s.container}>
          <div className={s.registrationContent}>
            <div className={s.sectionHeader}>
              <div className={s.registrationLabel}>Pendaftaran</div>
              <h2 className={s.registrationTitle}>Bergabunglah Bersama Kami</h2>
              <p className={s.registrationDesc}>
                Daftarkan diri Anda untuk menjadi bagian dari keluarga besar SMA Negeri 15
                Makassar dan raih masa depan gemilang.
              </p>
            </div>
            <div className={s.stepsGrid}>
              {STEPS.map((step) => (
                <div key={step.num} className={`${s.step} ${s.scrollReveal}`}>
                  <div className={s.stepNumber}>{step.num}</div>
                  <h3 className={s.stepTitle}>{step.title}</h3>
                  <p className={s.stepText}>{step.desc}</p>
                </div>
              ))}
            </div>
            <div className={s.ctaFinal}>
              <a href="#" className={s.btnPrimaryDark}>Informasi Lengkap PPDB</a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className={s.footer}>
        <div className={s.footerContent}>
          <div>
            <h3 className={s.footerAboutTitle}>SMA Negeri 15 Makassar</h3>
            <p className={s.footerAboutText}>
              Sekolah menengah atas negeri yang berkomitmen mencetak generasi unggul, berkarakter,
              dan berprestasi untuk masa depan Indonesia yang lebih baik.
            </p>
            <div className={s.socialLinks}>
              <a href="https://www.instagram.com/sman15mks.official" target="_blank" rel="noopener noreferrer" className={s.socialLink} aria-label="Instagram">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/></svg>
              </a>
              <a href="https://www.youtube.com/@SMAN15MAKASSAR" target="_blank" rel="noopener noreferrer" className={s.socialLink} aria-label="YouTube">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M549.655 124.083c-6.281-23.65-24.787-42.276-48.284-48.597C458.781 64 288 64 288 64S117.22 64 74.629 75.486c-23.497 6.322-42.003 24.947-48.284 48.597-11.412 42.867-11.412 132.305-11.412 132.305s0 89.438 11.412 132.305c6.281 23.65 24.787 41.5 48.284 47.821C117.22 448 288 448 288 448s170.78 0 213.371-11.486c23.497-6.321 42.003-24.171 48.284-47.821 11.412-42.867 11.412-132.305 11.412-132.305s0-89.438-11.412-132.305zm-317.51 213.508V175.185l142.739 81.205-142.739 81.201z"/></svg>
              </a>
            </div>
          </div>

          <div>
            <h4 className={s.footerSectionTitle}>Menu</h4>
            <ul className={s.footerList}>
              <li><button onClick={() => scrollTo('home')} className={s.footerLink}>Beranda</button></li>
              <li><button onClick={() => scrollTo('about')} className={s.footerLink}>Profil Sekolah</button></li>
              <li><button onClick={() => scrollTo('programs')} className={s.footerLink}>Program</button></li>
              <li><button onClick={() => scrollTo('facilities')} className={s.footerLink}>Fasilitas</button></li>
              <li><button onClick={() => scrollTo('registration')} className={s.footerLink}>Pendaftaran</button></li>
            </ul>
          </div>

          <div>
            <h4 className={s.footerSectionTitle}>Informasi</h4>
            <ul className={s.footerList}>
              <li><a href="#" className={s.footerLink}>Kalender Akademik</a></li>
              <li><a href="#" className={s.footerLink}>Prestasi Siswa</a></li>
              <li><a href="#" className={s.footerLink}>Berita &amp; Artikel</a></li>
              <li><a href="#" className={s.footerLink}>Alumni</a></li>
              <li><Link href="/pengumuman-kelulusan" className={s.footerLink}>Pengumuman Kelulusan</Link></li>
              <li><Link href="/login" className={s.footerLink}>Masuk LMS</Link></li>
            </ul>
          </div>

          <div>
            <h4 className={s.footerSectionTitle}>Kontak</h4>
            <ul className={s.footerList}>
              <li><a href="https://www.google.com/maps?q=SMA+Negeri+15+Makassar" target="_blank" rel="noopener noreferrer" className={s.footerLink}>Jl. Ir. Sutami No.7, Bulurokeng</a></li>
              <li>Kec. Biringkanaya, Makassar</li>
              <li>Sulawesi Selatan 90243</li>
            </ul>
          </div>
        </div>
        <div className={s.footerBottom}>
          <p>&copy; {new Date().getFullYear()} SMA Negeri 15 Makassar. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
