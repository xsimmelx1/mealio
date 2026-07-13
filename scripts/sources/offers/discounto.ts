import { detectFlags } from '../../lib/flags';
import { parseGrammage } from '../../lib/grammage';
import type { OfferSource, RawProduct, StoreOffers } from '../../lib/types';

/**
 * Discounter-/Markt-Angebote über den Aggregator discounto.de (unabhängig von Wettbewerber-APIs
 * der App-Klasse, aber selbst ein Aggregator). Liefert aktuelle Angebote je Markt mit Preis +
 * Gültigkeit. Best-effort/brüchig (HTML) → bei jedem Fehler leeres Ergebnis (nie werfen).
 *
 * Retailer-Namen von discounto → unsere storeIds.
 *
 * LIZENZ / ATTRIBUTION (WICHTIG):
 * discounto.de ist ein kommerzieller Angebots-Aggregator; die Prospekt-/Angebotsdaten stammen von
 * den jeweiligen Händlern. Das ist KEINE offene Datenlizenz (nicht Public Domain wie USDA, nicht
 * ODbL wie Open Food Facts / Open Prices, nicht CC BY-SA wie Wikibooks). Es gibt keine erteilten
 * Weiterverteilungsrechte – vergleichbar mit dem TheMealDB-Vorbehalt (nur Prototyping/Struktur,
 * nicht als ausgelieferter Content annehmen).
 *
 * Konsequenzen, bevor gescrapte discounto-Angebote produktiv ausgeliefert werden:
 *  - Nutzungsbedingungen/robots von discounto.de prüfen (Scraping-Zulässigkeit, Rate-Limits).
 *  - Attribution "Angebotsdaten via discounto.de" an den zentralen Ort (App: Über/Impressum)
 *    eintragen und die Quelle in der README dokumentieren (analog zu den ODbL-/CC-Quellen).
 *  - Im Zweifel Feature-Flag/opt-in und nur Grundpreis-Ableitung statt Rohdaten-Verteilung.
 * Der Adapter ist absichtlich höflich (Pausen, Cap) und schluckt Fehler still (Fallback → []).
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const RETAILER_TO_STORE: Record<string, string> = {
  'aldi süd': 'aldi',
  'aldi nord': 'aldi',
  aldi: 'aldi',
  lidl: 'lidl',
  'penny markt': 'penny',
  penny: 'penny',
  'netto marken-discount': 'netto',
  'netto supermarkt': 'netto',
  netto: 'netto',
  rewe: 'rewe',
  edeka: 'edeka',
  kaufland: 'kaufland',
};

/** Normalisiert einen discounto-Händlernamen auf unsere storeId (oder null). */
export function toStoreId(retailer: string): string | null {
  return RETAILER_TO_STORE[retailer.trim().toLowerCase()] ?? null;
}

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Baut ein RawProduct-Angebot (sale=true) aus discounto-Feldern. */
export function toOffer(name: string, brand: string | null, grammage: string, price: number): RawProduct | null {
  const pkg = parseGrammage(grammage);
  if (!pkg || !(price > 0)) return null;
  return {
    name: name.trim(),
    brand: brand?.trim() || null,
    ean: null,
    price: Math.round(price * 100) / 100,
    size: pkg.size,
    unit: pkg.unit,
    category: '',
    sale: true,
    flags: detectFlags(name, brand),
  };
}

/**
 * Lebensmittel-Angebots-Kategorien von discounto.de, die zu unserem Zutaten-Katalog passen.
 * Jede Kategorieseite (`/Angebot-Kategorie/<slug>/`) listet ausschließlich AKTUELLE Angebote als
 * `<article class="dcn-card-offer" data-retailer=… data-tag=…>` mit Name (inkl. Grammatur), Preis
 * und Händler-Logo (alt=Händlername). Slugs stammen aus `sitemap.ProductGroups.xml` (verifiziert).
 *
 * Das `category`-Label je Slug entspricht der REWE-Taxonomie, mit der der Zutaten-Katalog
 * (`ingredients.catalog.json`) seine `categories`-Filter definiert. So sind discounto-Angebote für
 * kategoriegefilterte Specs (z. B. Butter → "Käse, Eier & Molkerei") überhaupt matchbar. Der
 * Token-/Ausschluss-Filter in `matchProduct` verhindert Fehlzuordnungen innerhalb einer Kategorie.
 */
const FOOD_CATEGORIES: readonly { slug: string; category: string }[] = [
  // Molkerei / Kühlregal
  { slug: 'Butter', category: 'Käse, Eier & Molkerei' },
  { slug: 'Milch', category: 'Käse, Eier & Molkerei' },
  { slug: 'Joghurt', category: 'Käse, Eier & Molkerei' },
  { slug: 'Molkereiprodukte', category: 'Käse, Eier & Molkerei' },
  { slug: 'mozzarella', category: 'Käse, Eier & Molkerei' },
  { slug: 'feta', category: 'Käse, Eier & Molkerei' },
  { slug: 'hirtenkaese', category: 'Käse, Eier & Molkerei' },
  { slug: 'Schnittkaese', category: 'Käse, Eier & Molkerei' },
  { slug: 'Hartkaese', category: 'Käse, Eier & Molkerei' },
  { slug: 'Reibekaese', category: 'Käse, Eier & Molkerei' },
  { slug: 'Eier', category: 'Käse, Eier & Molkerei' },
  // Backen / Kochen
  { slug: 'Mehl', category: 'Kochen & Backen' },
  { slug: 'Zucker', category: 'Kochen & Backen' },
  { slug: 'Backpulver', category: 'Kochen & Backen' },
  { slug: 'Haferflocken', category: 'Kochen & Backen' },
  { slug: 'Reis', category: 'Kochen & Backen' },
  { slug: 'nudeln-pasta', category: 'Kochen & Backen' },
  // Konserven
  { slug: 'dosentomaten', category: 'Fertiggerichte & Konserven' },
  { slug: 'passierte-tomaten', category: 'Fertiggerichte & Konserven' },
  { slug: 'tomatenmark', category: 'Fertiggerichte & Konserven' },
  { slug: 'Gemuesekonserven', category: 'Fertiggerichte & Konserven' },
  { slug: 'Bohnen', category: 'Fertiggerichte & Konserven' },
  { slug: 'Fischkonserven', category: 'Fertiggerichte & Konserven' },
  { slug: 'kokosnussmilch', category: 'Fertiggerichte & Konserven' },
  // Vegan / Ersatz
  { slug: 'Tofu', category: 'Bewusste Ernährung' },
  { slug: 'Sojaprodukte', category: 'Bewusste Ernährung' },
  { slug: 'Fleischersatz', category: 'Bewusste Ernährung' },
  { slug: 'haferdrinks', category: 'Bewusste Ernährung' },
  { slug: 'milchersatz', category: 'Bewusste Ernährung' },
  // Öl / Würze / Brühe (Specs ohne categories-Filter – Label unschädlich)
  { slug: 'Olivenoel', category: 'Grillsaison' },
  { slug: 'Pflanzenoel', category: 'Grillsaison' },
  { slug: 'Speiseoel-Fette', category: 'Grillsaison' },
  { slug: 'sojasauce', category: 'Kochen & Backen' },
  { slug: 'Bruehe-Bouillon', category: 'Kochen & Backen' },
  // Brot
  { slug: 'Brot', category: 'Brot, Cerealien & Aufstriche' },
  // Fleisch / Fisch
  { slug: 'Hackfleisch', category: 'Fleisch & Fisch' },
  { slug: 'haehnchen-hackfleisch', category: 'Fleisch & Fisch' },
  { slug: 'Gefluegel', category: 'Fleisch & Fisch' },
  { slug: 'Fisch', category: 'Fleisch & Fisch' },
];

/** Obergrenze an Kategorieseiten pro Lauf (Höflichkeit + Laufzeit < ~60 s). */
const MAX_CATEGORIES = 50;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Dekodiert die auf discounto vorkommenden HTML-Entities (numerisch + benannte Umlaute). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&auml;/g, 'ä')
    .replace(/&ouml;/g, 'ö')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Auml;/g, 'Ä')
    .replace(/&Ouml;/g, 'Ö')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Extrahiert das erste Match einer Gruppe oder null. */
function firstGroup(re: RegExp, s: string): string | null {
  const m = s.match(re);
  return m ? (m[1] ?? null) : null;
}

/**
 * Parst eine Kategorieseite in RawProduct-Angebote (nur mappbare Händler, Preis>0, Grammatur
 * erkennbar). Jeder Fehler → das jeweilige Angebot wird übersprungen; wirft nie.
 */
export function parseCategoryPage(html: string, category = ''): { storeId: string; product: RawProduct }[] {
  const out: { storeId: string; product: RawProduct }[] = [];
  const cards = html.match(/<article class="dcn-card dcn-card-offer[^"]*"[\s\S]*?<\/article>/g);
  if (!cards) return out;
  for (const card of cards) {
    try {
      // Händler: das Logo-Alt im rechten Badge trägt den lesbaren Namen ("ALDI SÜD", "Penny Markt").
      const retailer = firstGroup(/dcn-badge-right">[\s\S]*?alt="([^"]*)"/, card);
      if (!retailer) continue;
      const storeId = toStoreId(retailer);
      if (!storeId) continue; // Nicht-Discounter/unbekannt (HIT, myTime.de, Norma …) verwerfen.

      const rawName = firstGroup(/card-title[^>]*>([\s\S]*?)<\/a>/, card);
      if (!rawName) continue;
      const name = decodeEntities(rawName).replace(/\s+/g, ' ').trim();
      if (!name) continue;

      const brand = firstGroup(/data-tag="([^"]*)"/, card);

      // Aktueller (Angebots-)Preis: erster Euro-Betrag im card-text-Block (Sonderpreis steht vor
      // dem durchgestrichenen Normalpreis). Fehlt der Preis → Angebot ohne Preis, verwerfen.
      const cardText = firstGroup(/(card-text[\s\S]*?<\/div>)/, card);
      const priceStr = cardText ? firstGroup(/([0-9]+,[0-9]{2})\s*€/, cardText) : null;
      if (!priceStr) continue;
      const price = parseFloat(priceStr.replace(',', '.'));

      // Grammatur steckt im Namen ("… 250 g", "1 kg"). Bindestrich-Schreibweise ("125-g") glätten.
      const grammage = name.replace(/(\d)\s*-\s*(kg|g|gr|ml|l|cl|stück|stk)\b/gi, '$1 $2');
      const product = toOffer(name, brand, grammage, price);
      if (product) {
        product.category = category; // REWE-Taxonomie-Label → matchProduct-Kategorie-Filter
        out.push({ storeId, product });
      }
    } catch {
      // defektes Card-Fragment ignorieren
    }
  }
  return out;
}

/** Aktuelle ISO-Kalenderwoche als Gültigkeits-Label ("KW 29/2026"). */
function isoWeekLabel(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `KW ${week}/${date.getUTCFullYear()}`;
}

/**
 * Angebots-Adapter für discounto.de: crawlt kuratierte Lebensmittel-Kategorieseiten (nur aktuelle
 * Angebote), parst je Karte Händler/Name/Grammatur/Preis und gruppiert nach storeId.
 * Vollständig best-effort: jeder Netz-/Parse-Fehler → betroffener Teil leer, `fetchOffers()` wirft nie.
 */
export function createDiscountoOffers(): OfferSource {
  return {
    sourceName: 'discounto.de',
    validUntil: isoWeekLabel(),
    async fetchOffers(): Promise<StoreOffers[]> {
      const byStore = new Map<string, Map<string, RawProduct>>(); // storeId -> name -> product
      try {
        const cats = FOOD_CATEGORIES.slice(0, MAX_CATEGORIES);
        for (const { slug, category } of cats) {
          const html = await fetchHtml(`https://www.discounto.de/Angebot-Kategorie/${slug}/`);
          await sleep(150 + Math.floor(Math.random() * 150)); // höflich: 150–300 ms Pause
          if (!html) continue;
          for (const { storeId, product } of parseCategoryPage(html, category)) {
            let m = byStore.get(storeId);
            if (!m) {
              m = new Map();
              byStore.set(storeId, m);
            }
            // Dedup je Markt (gleiches Produkt kann in mehreren Kategorien auftauchen):
            // günstigsten Preis behalten.
            const key = product.name.toLowerCase();
            const prev = m.get(key);
            if (!prev || product.price < prev.price) m.set(key, product);
          }
        }
      } catch {
        // Gesamtlauf abgesichert – Teilergebnis (falls vorhanden) trotzdem liefern.
      }
      return [...byStore.entries()].map(([storeId, m]) => ({ storeId, products: [...m.values()] }));
    },
  };
}
