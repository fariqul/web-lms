import { NextResponse } from 'next/server';

type UnsplashPhoto = {
  urls?: {
    regular?: string;
    small?: string;
    thumb?: string;
    full?: string;
  };
  alt_description?: string | null;
  description?: string | null;
};

type UnsplashResponse = {
  results?: UnsplashPhoto[];
};

const UNSPLASH_ENDPOINT = 'https://api.unsplash.com/search/photos';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim();
  const perPageParam = searchParams.get('per_page');
  const orientation = searchParams.get('orientation') || 'landscape';

  if (!query) {
    return NextResponse.json(
      { success: false, message: 'Parameter query wajib diisi.' },
      { status: 400 }
    );
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return NextResponse.json(
      { success: false, message: 'Kunci Unsplash belum dikonfigurasi di server.' },
      { status: 500 }
    );
  }

  const parsedPerPage = Number(perPageParam || 4);
  const safePerPage = Number.isFinite(parsedPerPage)
    ? Math.min(Math.max(parsedPerPage, 1), 12)
    : 4;

  const url = `${UNSPLASH_ENDPOINT}?query=${encodeURIComponent(query)}&per_page=${safePerPage}&orientation=${encodeURIComponent(orientation)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: 'Gagal mengambil foto dari Unsplash.' },
        { status: response.status }
      );
    }

    const data = (await response.json()) as UnsplashResponse;
    const photos = (data.results || [])
      .slice(0, safePerPage)
      .map((photo, idx) => {
        const regular = photo.urls?.regular || photo.urls?.full || '';
        const thumb = photo.urls?.small || photo.urls?.thumb || regular;
        return {
          src: regular,
          thumb,
          alt: photo.alt_description || photo.description || `Foto fasilitas ${idx + 1}`,
        };
      })
      .filter((photo) => Boolean(photo.src));

    return NextResponse.json({ success: true, photos });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: 'Terjadi kesalahan saat mengambil data foto.' },
      { status: 500 }
    );
  }
}
