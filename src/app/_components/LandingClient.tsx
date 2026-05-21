'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { facilityAPI, getSecureFileUrl, landingPageAPI, newsAPI } from '@/services/api';
import { DEFAULT_LANDING_CONTENT, mergeLandingContent } from '@/constants/landing';
import type { LandingContent } from '@/types/landing';
import type { NewsItem } from '@/types/news';
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

type FacilityApiPhoto = {
  id: number;
  path: string;
  position: number;
};

type FacilityApiItem = {
  id: number;
  name: string;
  description?: string | null;
  display_order: number;
  is_active: boolean;
  photos?: FacilityApiPhoto[];
};

type FacilityPhoto = {
  id: number;
  src: string;
  thumb: string;
  alt: string;
};

type FacilityItem = {
  id: number;
  name: string;
  description?: string | null;
  photos: FacilityPhoto[];
};

const fallbackNews: NewsItem[] = [
  {
    id: 1,
    title: 'Tim Olimpiade Sains SMA Negeri 15 Raih Medali Emas di Kompetisi Nasional 2026',
    slug: 'prestasi-olimpiade-sains-2026',
    category: 'prestasi',
    excerpt: 'Empat siswa berhasil membawa pulang medali emas dan perak dalam ajang Olimpiade Sains Nasional di Jakarta.',
    image: 'https://images.unsplash.com/photo-1523050854058-8df90110c476?w=800&q=80',
    is_featured: true,
    published_at_human: '20 Mei 2026',
  },
  {
    id: 2,
    title: 'Jadwal PPDB 2026/2027 Telah Dibuka, Simak Persyaratannya',
    slug: 'ppdb-2026-2027',
    category: 'pendaftaran',
    excerpt: 'Informasi lengkap jadwal dan persyaratan PPDB untuk calon siswa baru SMA Negeri 15 Makassar.',
    image: 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=400&q=80',
    published_at_human: '18 Mei 2026',
  },
  {
    id: 3,
    title: 'Festival Seni dan Budaya SMAN 15 Sukses Digelar',
    slug: 'festival-seni-2026',
    category: 'kegiatan',
    excerpt: 'Kegiatan tahunan menampilkan kreasi seni dan budaya siswa dengan antusiasme tinggi.',
    image: 'https://images.unsplash.com/photo-1544928147-79a2dbc1f389?w=400&q=80',
    published_at_human: '15 Mei 2026',
  },
  {
    id: 4,
    title: 'Workshop Kurikulum Merdeka untuk Guru dan Tenaga Pendidik',
    slug: 'workshop-kurikulum-merdeka',
    category: 'akademik',
    excerpt: 'Pelatihan intensif untuk memperkuat implementasi kurikulum merdeka di SMA 15 Makassar.',
    image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400&q=80',
    published_at_human: '12 Mei 2026',
  },
];

const NEWS_PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1523050854058-8df90110c476?w=800&q=80';

const mapFacilityItem = (facility: FacilityApiItem): FacilityItem => {
  const photos = (facility.photos || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((photo) => {
      const safeUrl = getSecureFileUrl(photo.path);
      return {
        id: photo.id,
        src: safeUrl,
        thumb: safeUrl,
        alt: facility.name,
      };
    });

  return {
    id: facility.id,
    name: facility.name,
    description: facility.description || null,
    photos,
  };
};

const getNewsCategoryLabel = (category: string) => {
  switch (category) {
    case 'prestasi':
      return 'Prestasi';
    case 'kegiatan':
      return 'Kegiatan';
    case 'akademik':
      return 'Akademik';
    case 'pendaftaran':
      return 'Pendaftaran';
    default:
      return 'Umum';
  }
};

const formatNewsDate = (item: NewsItem) => {
  if (item.published_at_human) return item.published_at_human;
  if (!item.published_at) return '';
  const parsed = new Date(item.published_at);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};


/* ═══════════════════ COMPONENT ═══════════════════ */

export default function LandingClient() {
  const wrapperRef = useScrollReveal();
  const [landingContent, setLandingContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [navScrolled, setNavScrolled] = useState(false);
  const [facilities, setFacilities] = useState<FacilityItem[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(true);
  const [facilitiesError, setFacilitiesError] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [activeFacilityId, setActiveFacilityId] = useState<number | null>(null);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const activeFacility = activeFacilityId
    ? facilities.find((facility) => facility.id === activeFacilityId) || null
    : null;
  const activePhotos = activeFacility?.photos || [];
  const hasPhotos = activePhotos.length > 0;
  const hero = landingContent.hero;
  const about = landingContent.about;
  const programs = landingContent.programs;
  const facilitiesCopy = landingContent.facilities;
  const registration = landingContent.registration;
  const footer = landingContent.footer;
  const heroLogoUrl = hero.logo_url ? getSecureFileUrl(hero.logo_url) : '';
  const heroBackgroundUrl = hero.background_url ? getSecureFileUrl(hero.background_url) : '';
  const heroVideoUrl = hero.video_url ? getSecureFileUrl(hero.video_url) : '';
  const heroVideoSrc = heroVideoUrl || '/landing/hero-video.webm';
  const heroVideoType = heroVideoSrc.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
  const heroTitleLines = hero.title.split('\n');
  const hasNews = newsItems.length > 0;
  const displayNews = hasNews ? newsItems : fallbackNews;
  const featuredNews = displayNews.find((item) => item.is_featured) || displayNews[0];
  const otherNews = displayNews.filter((item) => item.id !== featuredNews?.id).slice(0, 3);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 80);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadLandingContent = async () => {
      try {
        const response = await landingPageAPI.getPublic();
        const data = response.data?.data as Partial<LandingContent> | undefined;
        if (mounted) {
          setLandingContent(mergeLandingContent(DEFAULT_LANDING_CONTENT, data || null));
        }
      } catch {
        if (mounted) {
          setLandingContent(DEFAULT_LANDING_CONTENT);
        }
      }
    };

    loadLandingContent();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadNews = async () => {
      setNewsLoading(true);
      setNewsError(null);
      try {
        const response = await newsAPI.getPublic({ limit: 4 });
        const rows = response.data?.data || [];
        const list = Array.isArray(rows) ? rows : [];
        if (mounted) {
          setNewsItems(list);
        }
      } catch {
        if (mounted) {
          setNewsItems([]);
          setNewsError('Berita belum tersedia.');
        }
      } finally {
        if (mounted) {
          setNewsLoading(false);
        }
      }
    };

    loadNews();
    return () => {
      mounted = false;
    };
  }, []);

  const goPrevPhoto = useCallback(() => {
    if (activePhotos.length === 0) return;
    setActivePhotoIndex((prev) => (prev - 1 + activePhotos.length) % activePhotos.length);
  }, [activePhotos.length]);

  const goNextPhoto = useCallback(() => {
    if (activePhotos.length === 0) return;
    setActivePhotoIndex((prev) => (prev + 1) % activePhotos.length);
  }, [activePhotos.length]);

  useEffect(() => {
    if (!activeFacilityId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGallery();
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevPhoto();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNextPhoto();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeFacilityId, goPrevPhoto, goNextPhoto]);

  useEffect(() => {
    if (!activeFacilityId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      modalCloseRef.current?.focus();
    }, 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [activeFacilityId]);

  /* Smooth scroll for anchor links */
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    let mounted = true;

    const loadFacilities = async () => {
      setFacilitiesLoading(true);
      setFacilitiesError(null);

      try {
        const response = await facilityAPI.getPublic();
        const rows = response.data?.data || [];
        const mapped = Array.isArray(rows)
          ? rows.map((facility: FacilityApiItem) => mapFacilityItem(facility))
          : [];
        if (mounted) {
          setFacilities(mapped);
        }
      } catch {
        if (mounted) {
          setFacilities([]);
          setFacilitiesError('Gagal memuat fasilitas. Silakan coba lagi nanti.');
        }
      } finally {
        if (mounted) {
          setFacilitiesLoading(false);
        }
      }
    };

    loadFacilities();
    return () => {
      mounted = false;
    };
  }, []);

  const openGallery = (facility: FacilityItem) => {
    setActiveFacilityId(facility.id);
    setActivePhotoIndex(0);
  };

  const closeGallery = () => {
    setActiveFacilityId(null);
    setActivePhotoIndex(0);
  };

  const renderCtaLink = (cta: { label: string; href: string }, className: string) => {
    if (!cta?.label) return null;
    const href = cta.href || '#';
    const isExternal = href.startsWith('http');
    if (isExternal) {
      return (
        <a href={href} className={className} target="_blank" rel="noopener noreferrer">
          {cta.label}
        </a>
      );
    }
    return (
      <Link href={href} className={className}>
        {cta.label}
      </Link>
    );
  };

  return (
    <div className={s.landing} ref={wrapperRef}>
      {/* ═══ Navigation ═══ */}
      <nav className={`${s.nav} ${navScrolled ? s.navScrolled : ''}`}>
        <div className={s.navContainer}>
          <button onClick={() => scrollTo('home')} className={s.logoBtn}>
            <Image
              src={heroLogoUrl || '/landing/logo.png'}
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
            <li><button onClick={() => scrollTo('news')} className={s.navLink}>Berita</button></li>
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
      <section
        className={s.hero}
        id="home"
        style={heroBackgroundUrl ? {
          backgroundImage: `linear-gradient(135deg, rgba(61, 53, 128, 0.93) 0%, rgba(22, 18, 64, 0.96) 100%), url('${heroBackgroundUrl}')`,
        } : undefined}
      >
        <div className={s.heroContainer}>
          <div className={s.heroContent}>
            <div className={s.heroSubtitle}>{hero.subtitle}</div>
            <h1 className={s.heroTitle}>
              {heroTitleLines.map((line, idx) => (
                <span key={`${line}-${idx}`}>
                  {line}
                  {idx < heroTitleLines.length - 1 && <br />}
                </span>
              ))}
            </h1>
            <p className={s.heroDescription}>
              {hero.description}
            </p>
            <div className={s.ctaButtons}>
              {renderCtaLink(hero.cta_primary, s.btnPrimary)}
              {renderCtaLink(hero.cta_secondary, s.btnSecondary)}
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
              <source src={heroVideoSrc} type={heroVideoType} />
            </video>
          </div>
        </div>
      </section>

      {/* ═══ About ═══ */}
      <section className={s.about} id="about">
        <div className={s.container}>
          <div className={s.sectionHeader} style={{ textAlign: 'center', width: '100%' }}>
            <div className={s.sectionLabel} style={{ textAlign: 'center' }}>{about.label}</div>
            <h2 className={s.sectionTitle} style={{ textAlign: 'center' }}>{about.title}</h2>
            <p className={s.sectionDescription} style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
              {about.description}
            </p>
          </div>
          <div className={s.aboutGrid}>
            {about.cards.map((card, idx) => (
              <div key={`${card.title}-${idx}`} className={`${s.aboutCard} ${s.scrollReveal}`}>
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
          <div className={s.sectionHeader} style={{ textAlign: 'center', width: '100%' }}>
            <div className={s.sectionLabel} style={{ textAlign: 'center' }}>{programs.label}</div>
            <h2 className={s.sectionTitle} style={{ textAlign: 'center' }}>{programs.title}</h2>
            <p className={s.sectionDescription} style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
              {programs.description}
            </p>
          </div>
          <div className={s.programsGrid}>
            {programs.items.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className={`${s.programCard} ${s.scrollReveal}`}>
                <div className={s.programNumber}>{String(idx + 1).padStart(2, '0')}</div>
                <h3 className={s.programCardTitle}>{item.title}</h3>
                <p className={s.programCardText}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Facilities ═══ */}
      <section className={s.facilities} id="facilities">
        <div className={s.container}>
          <div className={s.sectionHeader} style={{ textAlign: 'center', width: '100%' }}>
            <div className={s.sectionLabel} style={{ textAlign: 'center' }}>{facilitiesCopy.label}</div>
            <h2 className={s.sectionTitle} style={{ textAlign: 'center' }}>{facilitiesCopy.title}</h2>
            <p className={s.sectionDescription} style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
              {facilitiesCopy.description}
            </p>
          </div>
          <div className={s.facilitiesGrid}>
            {facilitiesLoading && Array.from({ length: 7 }).map((_, idx) => (
              <div key={`facility-skeleton-${idx}`} className={`${s.facilityCard} ${s.scrollReveal}`} aria-hidden="true">
                <div className={s.facilityThumb}>
                  <div className={s.facilityThumbSkeleton} />
                </div>
                <div className={s.facilityTitle}>Memuat...</div>
              </div>
            ))}

            {!facilitiesLoading && facilities.length === 0 && (
              <div className={`${s.facilityCard} ${s.scrollReveal}`}>
                <div className={s.facilityThumb}>
                  <div className={s.facilityThumbSkeleton} />
                </div>
                <div className={s.facilityTitle}>{facilitiesError || 'Belum ada fasilitas.'}</div>
              </div>
            )}

            {!facilitiesLoading && facilities.map((facility) => {
              const cardPhoto = facility.photos?.[0];
              const hasCardPhoto = Boolean(cardPhoto);
              const overlayText = hasCardPhoto ? 'Lihat Foto' : 'Foto Belum Tersedia';

              return (
                <button
                  key={facility.id}
                  type="button"
                  className={`${s.facilityCard} ${s.scrollReveal}`}
                  onClick={() => openGallery(facility)}
                  aria-label={`Lihat foto ${facility.name}`}
                  aria-haspopup="dialog"
                  aria-expanded={activeFacilityId === facility.id}
                >
                  <div className={s.facilityThumb}>
                    {cardPhoto ? (
                      <img
                        src={cardPhoto.thumb || cardPhoto.src}
                        alt={cardPhoto.alt || facility.name}
                        className={s.facilityThumbImage}
                        loading="lazy"
                      />
                    ) : (
                      <div className={s.facilityThumbSkeleton} aria-hidden="true" />
                    )}
                    <div className={s.facilityOverlay}>
                      <div className={s.facilityOverlayIcon}>
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h3l2-2h6l2 2h3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                      </div>
                      <div className={s.facilityOverlayText}>{overlayText}</div>
                    </div>
                  </div>
                  <div className={s.facilityTitle}>{facility.name}</div>
                </button>
              );
            })}
          </div>
        </div>
        {activeFacility && (
          <div
            className={s.facilityModalBackdrop}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeGallery();
            }}
          >
            <div
              className={s.facilityModal}
              role="dialog"
              aria-modal="true"
              aria-label={`Galeri ${activeFacility.name}`}
            >
              <div className={s.facilityModalHeader}>
                <div>
                  <div className={s.facilityModalLabel}>Galeri Fasilitas</div>
                  <h3 className={s.facilityModalTitle}>{activeFacility.name}</h3>
                </div>
                <button
                  ref={modalCloseRef}
                  type="button"
                  className={s.facilityModalClose}
                  onClick={closeGallery}
                  aria-label="Tutup galeri"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6l-12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className={s.facilityModalBody}>
                <div className={s.facilityHero}>
                  {facilitiesLoading && (
                    <div className={s.facilityHeroSkeleton} />
                  )}
                  {!facilitiesLoading && !hasPhotos && (
                    <div className={s.facilityHeroError}>Belum ada foto untuk fasilitas ini.</div>
                  )}
                  {!facilitiesLoading && hasPhotos && (
                    <img
                      src={activePhotos[activePhotoIndex]?.src}
                      alt={activePhotos[activePhotoIndex]?.alt || activeFacility.name}
                      className={s.facilityHeroImage}
                    />
                  )}
                  <button
                    type="button"
                    className={s.facilityNavButton}
                    onClick={goPrevPhoto}
                    aria-label="Foto sebelumnya"
                    disabled={!hasPhotos}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={`${s.facilityNavButton} ${s.facilityNavButtonNext}`}
                    onClick={goNextPhoto}
                    aria-label="Foto berikutnya"
                    disabled={!hasPhotos}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className={s.facilityThumbStrip}>
                  {facilitiesLoading && (
                    <div className={s.facilityThumbSkeletonRow}>
                      {Array.from({ length: 4 }).map((_, idx) => (
                        <div key={`thumb-skeleton-${idx}`} className={s.facilityThumbSkeleton} />
                      ))}
                    </div>
                  )}
                  {!facilitiesLoading && hasPhotos && (
                    <div className={s.facilityThumbRow}>
                      {activePhotos.map((photo, idx) => (
                        <button
                          key={`${activeFacility.id}-${idx}`}
                          type="button"
                          className={`${s.facilityThumbButton} ${idx === activePhotoIndex ? s.facilityThumbActive : ''}`}
                          onClick={() => setActivePhotoIndex(idx)}
                          aria-label={`Foto ${idx + 1}`}
                        >
                          <img src={photo.thumb} alt={photo.alt || ''} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ═══ News / Berita ═══ */}
      <section className={s.news} id="news">
        <div className={s.container}>
          <div className={s.sectionHeader} style={{ textAlign: 'center', width: '100%' }}>
            <div className={s.sectionLabel} style={{ textAlign: 'center' }}>Berita & Informasi</div>
            <h2 className={s.sectionTitle} style={{ textAlign: 'center' }}>Kabar Terbaru Sekolah</h2>
            <p className={s.sectionDescription} style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
              Ikuti perkembangan terbaru seputar kegiatan, prestasi, dan informasi penting dari SMA Negeri 15 Makassar.
            </p>
          </div>
          {!newsLoading && !hasNews ? (
            <div className="text-center text-slate-500 text-sm">
              {newsError || 'Belum ada berita yang dipublikasikan.'}
            </div>
          ) : (
            <div className={s.newsLayout}>
              {/* Featured Article */}
              {featuredNews && (
                <Link
                  href={`/berita/${featuredNews.slug}`}
                  className={`${s.newsFeatured} ${s.scrollReveal}`}
                >
                  <img
                    src={featuredNews.image ? getSecureFileUrl(featuredNews.image) : NEWS_PLACEHOLDER_IMAGE}
                    alt={featuredNews.title}
                    className={s.newsFeaturedImage}
                    loading="lazy"
                  />
                  <div className={s.newsFeaturedOverlay}>
                    <span className={s.newsCategoryBadge}>{getNewsCategoryLabel(featuredNews.category)}</span>
                    <h3 className={s.newsFeaturedTitle}>{featuredNews.title}</h3>
                    <p className={s.newsFeaturedExcerpt}>
                      {featuredNews.excerpt || 'Baca kabar terbaru dari SMA Negeri 15 Makassar.'}
                    </p>
                    <div className={s.newsMeta}>
                      <span>{formatNewsDate(featuredNews)}</span>
                      <span className={s.newsMetaDot} />
                      <span>Baca selengkapnya</span>
                    </div>
                  </div>
                </Link>
              )}

              {/* Recent Articles Grid */}
              <div className={s.newsGrid}>
                {otherNews.map((item) => (
                  <Link key={item.id} href={`/berita/${item.slug}`} className={`${s.newsCard} ${s.scrollReveal}`}>
                    <div className={s.newsCardThumb}>
                      <img
                        src={item.image ? getSecureFileUrl(item.image) : NEWS_PLACEHOLDER_IMAGE}
                        alt={item.title}
                        className={s.newsCardThumbImage}
                        loading="lazy"
                      />
                    </div>
                    <div className={s.newsCardBody}>
                      <span className={s.newsCategoryBadgeSmall}>{getNewsCategoryLabel(item.category)}</span>
                      <h4 className={s.newsCardTitle}>{item.title}</h4>
                      <div className={`${s.newsMeta} ${s.newsMetaDark}`}>
                        <span>{formatNewsDate(item)}</span>
                        <span className={s.newsMetaDot} />
                        <span>Baca selengkapnya</span>
                      </div>
                      <div className={s.newsReadMore}>
                        Baca selengkapnya <span className={s.newsReadMoreArrow}>→</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ Registration ═══ */}
      <section className={s.registration} id="registration">
        <div className={s.container}>
          <div className={s.registrationContent}>
            <div className={s.sectionHeader} style={{ textAlign: 'center', width: '100%' }}>
              <div className={s.registrationLabel} style={{ textAlign: 'center' }}>{registration.label}</div>
              <h2 className={s.registrationTitle} style={{ textAlign: 'center' }}>{registration.title}</h2>
              <p className={s.registrationDesc} style={{ textAlign: 'center', marginLeft: 'auto', marginRight: 'auto' }}>
                {registration.description}
              </p>
            </div>
            <div className={s.stepsGrid}>
              {registration.steps.map((step, idx) => (
                <div key={`${step.title}-${idx}`} className={`${s.step} ${s.scrollReveal}`}>
                  <div className={s.stepNumber}>{idx + 1}</div>
                  <h3 className={s.stepTitle}>{step.title}</h3>
                  <p className={s.stepText}>{step.description}</p>
                </div>
              ))}
            </div>
            <div className={s.ctaFinal}>
              {registration.cta_href.startsWith('http') ? (
                <a href={registration.cta_href} className={s.btnPrimaryDark} target="_blank" rel="noopener noreferrer">
                  {registration.cta_label}
                </a>
              ) : (
                <Link href={registration.cta_href || '#'} className={s.btnPrimaryDark}>
                  {registration.cta_label}
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className={s.footer}>
        <div className={s.footerContent}>
          <div>
            <h3 className={s.footerAboutTitle}>{footer.about_title}</h3>
            <p className={s.footerAboutText}>{footer.about_text}</p>
            <div className={s.socialLinks}>
              <a href={footer.instagram_url} target="_blank" rel="noopener noreferrer" className={s.socialLink} aria-label="Instagram">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/></svg>
              </a>
              <a href={footer.youtube_url} target="_blank" rel="noopener noreferrer" className={s.socialLink} aria-label="YouTube">
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
              <li><button onClick={() => scrollTo('news')} className={s.footerLink}>Berita</button></li>
              <li><button onClick={() => scrollTo('registration')} className={s.footerLink}>Pendaftaran</button></li>
            </ul>
          </div>

          <div>
            <h4 className={s.footerSectionTitle}>Informasi</h4>
            <ul className={s.footerList}>
              {footer.info_links.map((link, idx) => {
                const href = link.href || '#';
                const isExternal = href.startsWith('http');
                if (isExternal) {
                  return (
                    <li key={`${link.label}-${idx}`}>
                      <a href={href} className={s.footerLink} target="_blank" rel="noopener noreferrer">
                        {link.label}
                      </a>
                    </li>
                  );
                }
                return (
                  <li key={`${link.label}-${idx}`}>
                    <Link href={href} className={s.footerLink}>
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <h4 className={s.footerSectionTitle}>Kontak</h4>
            <ul className={s.footerList}>
              {footer.contact.lines.map((line, idx) => (
                <li key={`${line}-${idx}`}>
                  {idx === 0 ? (
                    <a href={footer.contact.map_url} target="_blank" rel="noopener noreferrer" className={s.footerLink}>
                      {line}
                    </a>
                  ) : (
                    line
                  )}
                </li>
              ))}
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
