# Preis-Katalog-Generator (`scripts/`)

Erzeugt `app/src/assets/prices.seed.json` aus **echten** Preisquellen und leitet fehlende
Märkte/Zutaten transparent als Schätzung ab. Läuft offline-first: das Ergebnis ist eine
eingecheckte JSON, die die App im Bundle ausliefert (keine Server-DB, kein Runtime-Scraping).

## Ausführen
```bash
npm run gen:prices                       # neuestes verfügbares REWE-Datum
REWE_START_DATE=2025-09-09 npm run gen:prices   # bestimmtes Startdatum
REWE_REGION=schleswig-holstein npm run gen:prices
```
Der Generator validiert jede Zeile gegen `SeedPriceSchema` (`app/src/domain/schema.ts`) und
schreibt einen Report (echte Treffer je Markt).

## Architektur (Adapter-Framework)
- `sources/*.ts` — je Quelle ein Adapter, der `PriceSource` (`lib/types.ts`) implementiert
  (`fetchProducts()` liefert normalisierte `RawProduct[]`). Aktuell: `rewe.ts`.
- `ingredients.catalog.json` — kuratierte Zutat→Produkt-Spezifikationen (Suchbegriffe,
  Kategorie, Ausschlüsse, Größenbereich). Gegen echte Daten verifiziert (keine Fehltreffer).
- `lib/match.ts` — wählt je Zutat das repräsentative echte Standardprodukt (Scoring:
  Eigenmarke, klarer Name, günstiger Grundpreis). Kein Treffer → bleibt Schätzung.
- `lib/derive.ts` — leitet Märkte/Zutaten ohne echten Treffer aus dem REWE-Anker ab
  (`STORE_FACTOR`), gekennzeichnet als `dataSource: 'estimate'`.
- `genPrices.ts` — orchestriert, validiert, schreibt, berichtet.

Jede Zeile trägt `dataSource` (`real`/`estimate`), bei `real` zusätzlich `priceDate`,
`productName`, `ean`. Die App kennzeichnet das im Supermarkt-Vergleich (✓ echt · Stand … / ≈ geschätzt).

### Angebote, Labels & Scores
- **Angebote**: REWE-Angebotsartikel (Datensatz-`sale`) werden als eigene, günstigere Zeilen mit
  `isOffer: true` erzeugt. Zusätzlich liefert der Angebots-Adapter `sources/offers/discounto.ts`
  aktuelle **Discounter-/Markt-Angebote** (Aldi/Lidl/Penny/Netto/Kaufland/…) vom Aggregator
  discounto.de (Kategorieseiten). Angebote werden nur übernommen, wenn sie pro Grundeinheit
  **günstiger als der Anker** sind (echte Deals, keine Fehlzuordnungen). Die Engine nutzt den
  effektiven Bestpreis und zeigt den Normalpreis durchgestrichen.
  **Attribution/Recht:** discounto.de ist ein kommerzieller Aggregator (keine offene Lizenz) — vor
  produktiver Auslieferung ToS/robots prüfen und „Angebotsdaten via discounto.de" im Impressum
  ausweisen. Aldi-*Normalpreise* bleiben unverfügbar (nur Angebote).
- **Labels** (`flags`: bio/fairtrade/vegan/regional): aus Name/Marke (`lib/flags.ts`) + Open Food Facts.
- **Open Food Facts** (`sources/off.ts`, ODbL): reichert echte Zeilen per EAN um Fairtrade/Bio/Vegan
  sowie Nutri-/Eco-Score an; Ergebnis in `scripts/cache/off.json` gecacht.
- Nutzer-Präferenz `preferredProductFlags`: ist ein Label aktiv, bevorzugt die Engine wo verfügbar die
  gelabelte Variante (sonst Fallback), inkl. Badges im Vergleich/Liste.

## SC-Fallback-Grundlage (einmalig)
`npm run gen:fallback` zieht **einmalig** echte per-Markt-Preise (inkl. Discounter + Frischware)
von der offenen JSON-API von supermarktcompare.de für alle Katalog-Zutaten und schreibt
`app/src/assets/fallbackPrices.json` (gecacht in `scripts/cache/sc.json`). `gen:prices` ersetzt
damit abgeleitete Schätzungen durch echte SC-Preise, wo weder REWE- noch Angebotsdaten vorliegen —
mit Plausibilitäts-Band (0,25×–4× Anker) + Post-Pass, der pro Zutat die Grundpreis-Spreizung ≤5 hält.
Bewusst getrennt vom Live-Lauf (gebackene Grundlage, keine Live-Abhängigkeit).
**Attribution/Recht:** supermarktcompare.de ist ein kommerzieller Aggregator (keine offene Lizenz) —
vor produktiver Auslieferung ToS prüfen und Quelle im Impressum nennen.

## Weitere Quellen andocken
Neuen Adapter in `sources/` anlegen (`PriceSource`), in `genPrices.ts` einhängen und die
echten Treffer je `storeId` bevorzugt vor der Ableitung verwenden. Kandidaten:
- **Open Food Facts** (ODbL) — Produktstammdaten/Marken/EAN (keine Preise) zur Anreicherung.
- **Lidl.de** (JSON-API erreichbar), **Kaufland/Edeka**-Onlineshops (Bot-Schutz beachten).
- **Bonial/discounto** — Angebote (derzeit ausgeklammert).

## Datenquellen, Aktualität & Recht
- **REWE**: offener Community-Datensatz `rewe.nicoo.org` (Apache-2.0-Tooling), Tages-CSV je
  Region. Enthält das reguläre Onlinesortiment inkl. Marke/EAN. Die Preisdaten sind REWE-Eigentum.
- **Discounter-Normalpreise** (Aldi/Lidl/…) sind öffentlich nicht verfügbar → bleiben Schätzung,
  bis ein eigener Scraper bzw. Kassenbon-Crowdsourcing dazukommt.
- Aktualisierung: monatlicher GitHub-Actions-Job (`.github/workflows/update-prices.yml`) öffnet
  bei Änderungen einen PR.
- **Hinweis:** Preise sind Schätz-/Stichtagswerte, in der App als solche gekennzeichnet. Bei
  öffentlicher/kommerzieller Nutzung Quellen-ToS und Attribution neu bewerten.
