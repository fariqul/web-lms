export type NewsCategory = 'prestasi' | 'kegiatan' | 'akademik' | 'pendaftaran' | 'umum';

export type NewsAuthor = {
  id: number;
  name: string;
};

export type NewsItem = {
  id: number;
  title: string;
  slug: string;
  category: NewsCategory;
  excerpt?: string | null;
  content?: string | null;
  image?: string | null;
  author?: string | NewsAuthor | null;
  is_featured?: boolean;
  is_published?: boolean;
  published_at?: string | null;
  published_at_human?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type NewsPayload = {
  title: string;
  category: NewsCategory;
  excerpt?: string;
  content?: string;
  is_featured?: boolean;
  is_published?: boolean;
};
