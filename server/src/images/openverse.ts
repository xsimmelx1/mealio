/**
 * Rezeptbild-Suche über Openverse (openverse.org) — offene, CC-lizenzierte Bildersuche,
 * KEIN API-Key nötig, unabhängig. Liefert ein passendes Foto zum Rezepttitel inkl.
 * Attribution (CC verlangt Namensnennung). Bei Fehler/keinem Treffer -> null (nie werfen).
 */
const ENDPOINT = 'https://api.openverse.org/v1/images/';
const UA = 'herbi-meal-app/1.0 (recipe image lookup)';

export interface RecipeImageResult {
  imageUrl: string;
  attribution: string;
  sourceUrl: string;
  license: string;
}

interface OvResult {
  url?: string;
  thumbnail?: string;
  title?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Adjektive/Füllwörter, die die Bildersuche unnötig verengen. */
const STOPWORDS = new Set([
  'schnelle', 'schneller', 'schnelles', 'cremiges', 'cremige', 'cremiger', 'einfache', 'einfaches',
  'einfacher', 'würziges', 'würzige', 'herzhafte', 'herzhaftes', 'bunter', 'bunte', 'buntes',
  'mediterrane', 'mediterranes', 'klassische', 'klassischer', 'klassisches', 'leichte', 'leichtes',
  'knusprige', 'knuspriger', 'saftige', 'saftiger', 'fruchtiger', 'fruchtige', 'mit', 'und', 'im',
]);

/** Erzeugt Such-Varianten von spezifisch -> allgemein (voller Titel, Kerngericht, Hauptbegriff). */
export function queryVariants(title: string): string[] {
  const full = title.trim();
  // Alles ab " mit "/" und " abschneiden (Beilagen), Bindestriche -> Leerzeichen.
  const core = full.split(/\s+(?:mit|und|im|in|an|auf)\s+/i)[0].replace(/-/g, ' ').trim();
  const words = core.split(/\s+/).filter((w) => !STOPWORDS.has(w.toLowerCase()));
  const trimmed = words.join(' ');
  const main = words.slice(0, 2).join(' '); // die 1-2 aussagekräftigsten Wörter
  return [...new Set([full, trimmed, main].filter((s) => s.length >= 3))];
}

async function searchOnce(q: string, timeoutMs: number): Promise<OvResult | null> {
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&license_type=commercial&page_size=5&mature=false`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as { results?: OvResult[] };
    return (data.results ?? []).find((r) => r.thumbnail || r.url) ?? null;
  } catch {
    return null;
  }
}

/** Sucht das beste passende Foto zu einem Rezepttitel (spezifisch -> allgemein). */
export async function searchRecipeImage(query: string, timeoutMs = 6000): Promise<RecipeImageResult | null> {
  if (!query.trim()) return null;
  let hit: OvResult | null = null;
  for (const q of queryVariants(query)) {
    hit = await searchOnce(q, timeoutMs);
    if (hit) break;
  }
  if (!hit) return null;
  const imageUrl = hit.thumbnail || hit.url!;
  const lic = `CC ${(hit.license ?? '').toUpperCase()}${hit.license_version ? ` ${hit.license_version}` : ''}`.trim();
  const creator = hit.creator ? ` von ${hit.creator}` : '';
  return {
    imageUrl,
    attribution: `„${hit.title ?? query}"${creator} · ${lic} · Openverse`,
    sourceUrl: hit.foreign_landing_url ?? '',
    license: hit.license ?? '',
  };
}
