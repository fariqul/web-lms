import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/dashboard/',
          '/ujian/',
          '/ujian-siswa/',
          '/quiz/',
          '/quiz-siswa/',
          '/scan-qr/',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://libelslms.my.id/sitemap.xml',
  };
}
