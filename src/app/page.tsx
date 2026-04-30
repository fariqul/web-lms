'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import s from './page.module.css';

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

/* ═══════════════════ FACILITIES DATA ═══════════════════ */
const FACILITIES = [
  { icon: '🏫', name: 'Ruang Kelas Ber-AC' },
  { icon: '🔬', name: 'Laboratorium Sains' },
  { icon: '💻', name: 'Lab Komputer' },
  { icon: '📚', name: 'Perpustakaan Digital' },
  { icon: '⚽', name: 'Lapangan Olahraga' },
  { icon: '🎭', name: 'Aula Serbaguna' },
  { icon: '🍽️', name: 'Kantin Sehat' },
  { icon: '🕌', name: 'Musholla Modern' },
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

export default function LandingPage() {
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
              <div key={f.name} className={`${s.facilityCard} ${s.scrollReveal}`}>
                <div className={s.facilityIcon}>{f.icon}</div>
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
              <a href="#" className={s.socialLink} aria-label="Facebook">FB</a>
              <a href="#" className={s.socialLink} aria-label="Instagram">IG</a>
              <a href="#" className={s.socialLink} aria-label="YouTube">YT</a>
              <a href="#" className={s.socialLink} aria-label="Twitter">TW</a>
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
              <li><Link href="/login" className={s.footerLink}>Masuk LMS</Link></li>
            </ul>
          </div>

          <div>
            <h4 className={s.footerSectionTitle}>Kontak</h4>
            <ul className={s.footerList}>
              <li>Jl. Pendidikan No. 15</li>
              <li>Makassar, Sulawesi Selatan</li>
              <li>Telp: (0411) XXX-XXXX</li>
              <li>Email: info@sman15mks.sch.id</li>
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
