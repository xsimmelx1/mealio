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
