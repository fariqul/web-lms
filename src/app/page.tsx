import type { Metadata } from 'next';
import LandingClient from './_components/LandingClient';

/* ─── Page-level metadata (overrides layout.tsx for this route) ─── */
export const metadata: Metadata = {
  title: 'SMA Negeri 15 Makassar — Unggul dalam Prestasi, Santun dalam Budi Pekerti',
  description:
    'Website resmi SMA Negeri 15 Makassar. Sekolah unggulan dengan program Kurikulum Merdeka, STEM, dan 20+ ekstrakurikuler. Jl. Ir. Sutami No.7, Bulurokeng, Kec. Biringkanaya, Makassar.',
  keywords: [
    'SMA Negeri 15 Makassar',
    'SMAN 15 Makassar',
    'sekolah menengah atas makassar',
    'PPDB Makassar',
    'LMS SMA 15',
    'sekolah unggulan makassar',
    'kurikulum merdeka makassar',
  ],
  alternates: {
    canonical: 'https://www.libelslms.my.id',
  },
  openGraph: {
    title: 'SMA Negeri 15 Makassar',
    description:
      'Unggul dalam Prestasi, Santun dalam Budi Pekerti — Sekolah unggulan di Makassar dengan fasilitas modern dan program pendidikan berkualitas.',
    url: 'https://www.libelslms.my.id',
    siteName: 'SMA Negeri 15 Makassar',
    type: 'website',
    locale: 'id_ID',
    images: [
      {
        url: 'https://www.libelslms.my.id/landing/logo.png',
        width: 512,
        height: 512,
        alt: 'Logo SMA Negeri 15 Makassar',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'SMA Negeri 15 Makassar',
    description: 'Unggul dalam Prestasi, Santun dalam Budi Pekerti',
    images: ['https://www.libelslms.my.id/landing/logo.png'],
  },
};

/* ─── JSON-LD Structured Data (EducationalOrganization) ─── */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: 'SMA Negeri 15 Makassar',
  alternateName: 'SMAN 15 Makassar',
  url: 'https://www.libelslms.my.id',
  logo: 'https://www.libelslms.my.id/landing/logo.png',
  image: 'https://www.libelslms.my.id/landing/logo.png',
  description:
    'Sekolah menengah atas negeri di Makassar yang berkomitmen mencetak generasi unggul, berkarakter, dan berprestasi.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Jl. Ir. Sutami No.7, Bulurokeng',
    addressLocality: 'Makassar',
    addressRegion: 'Sulawesi Selatan',
    postalCode: '90243',
    addressCountry: 'ID',
  },
  sameAs: [
    'https://www.instagram.com/sman15mks.official',
    'https://www.youtube.com/@SMAN15MAKASSAR',
  ],
};

/* ─── Server Component (SSR for SEO) ─── */
export default function LandingPage() {
  return (
    <>
      {/* JSON-LD injected server-side — visible to all crawlers */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Client component for interactivity (still SSR'd by Next.js) */}
      <LandingClient />
    </>
  );
}
