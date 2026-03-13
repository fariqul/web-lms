export function extractNomorTesNumber(nomorTes?: string | null): number {
  if (!nomorTes) return 0;

  const match = nomorTes.match(/-(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export function extractNomorTesSuffix(nomorTes?: string | null): string {
  if (!nomorTes) return '';

  const match = nomorTes.match(/-(\d+)$/);
  return match ? match[1] : '';
}

export function matchesNomorTesQuery(nomorTes: string | undefined | null, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return extractNomorTesSuffix(nomorTes).toLowerCase().includes(normalizedQuery);
}