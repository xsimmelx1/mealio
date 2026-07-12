# Mealio Server (Backend)

Node + TypeScript + Express. Einziger Ort, an dem externe API-Keys existieren.
Das Frontend spricht ausschließlich mit diesem Backend; Keys verlassen den Server nie.

## Endpunkte

| Methode | Pfad             | Status M4 | Beschreibung |
| ------- | ---------------- | --------- | ------------ |
| GET     | `/health`        | live      | `{ status, uptime, timestamp }`; kein Rate-Limit |
| POST    | `/generate-plan` | Mock      | LLM-Proxy. Body = UserPreferences. Antwort `{ source: "mock", recipes: [] }` |
| POST    | `/import-recipes`| live      | Import aus TheMealDB + Gemini-Normalisierung ins Deutsche. Body `{ category?, count? }` -> `{ source: "themealdb", attribution, recipes: Recipe[] }` |
| POST    | `/nutrition`     | live (M10)| Body `{ ingredients: [{ name, amount, unit }], servings? }` -> `{ perServing: {kcal,protein,carbs,fat} \| null, matchedCount, unmatchedCount, unknownIngredients: string[] }` |
| POST    | `/prices`        | live (M11)| Body `{ items: [{ key, query?, region? }] }` -> `{ items: [{ key, pricePerPackage, packageSize, packageUnit, currency, source, updatedAt }] }` |

Alle Bodies werden mit zod validiert. Fehler -> `400 { error: "ValidationError", issues }`.

Echte LLM-Anbindung folgt in M9 (recipe-engine). Dieses Grundgerüst liefert Transport,
Mock, Retry/Timeout und Caching.

### `/nutrition` im Detail (M10)

- Erlaubte Einheiten: `g | kg | ml | l | tsp | tbsp | stück | prise`.
- `servings` (Default 1): `perServing` = Summe der Makros ALLER gematchten Zutaten
  geteilt durch `servings`. Nur wenn KEINE Zutat gematcht wurde -> `perServing: null`
  (es wird nie 0 als Nährwert behauptet). Nicht gematchte Namen stehen in
  `unknownIngredients` ("Nährwert unbekannt", nicht 0).
- Zahlen sind auf 1 Nachkommastelle gerundet.
- Einheiten-Normalisierung auf Gramm: Masse direkt (`kg`×1000); Volumen 1 ml ≈ 1 g
  (`l`×1000, `tsp`=5 ml, `tbsp`=15 ml); `prise` ≈ 0,5 g; `stück` über hinterlegtes
  Stückgewicht (`gramsPerPiece`) im Seed — fehlt es, gilt die Zutat als unbekannt.
- Primärquelle ist der lokale Nährwert-Seed (`src/nutrition/nutritionSeed.ts`), damit
  der Endpunkt vollständig offline funktioniert. Online-Lookups sind opt-in
  (`NUTRITION_ONLINE=1`) und werden mit TTL gecacht.

### `/import-recipes` im Detail

- Request: `POST /import-recipes` mit `{ category?: string, count?: number }`.
  `count` Default 6, max 10. `category` z. B. `Breakfast`, `Vegetarian`, `Vegan`,
  `Seafood`, `Pasta`, `Chicken`, `Beef`, `Dessert`; leer -> zufällige Rezepte.
- Response: `{ source: "themealdb", attribution: "Rezepte via TheMealDB (themealdb.com)",
  recipes: Recipe[] }`. Jedes `Recipe` hat exakt das `/generate-plan`-Feldformat
  (title, mealStyles, mealTypes, dietTags, requiredAppliances, prepMinutes, cookMinutes,
  baseServings, ingredients, steps, `nutritionPerServing: null`) und zusätzlich
  optional `sourceUrl` (Link-Back auf das Originalrezept). Deutsch, unsere Einheiten.
- **Ablauf:** Kategorie -> `filter.php` (idMeal-Liste) + `lookup.php` (Volldaten);
  ODER `count`× `random.php`. Je Roh-Rezept: Gemini übersetzt/normalisiert ins
  Rezeptschema -> Schema-Parse -> harte Checks (`checkRecipe`). `baseServings` wird
  auf 2 gesetzt (Mengen grob skaliert).
- **Sauberes Degradieren:** Fehler pro Rezept (Gemini 429/Quota, Parse-Fehler,
  TheMealDB-Lookup) werden EINZELN abgefangen -> dieses Rezept wird übersprungen, nie
  die ganze Anfrage. Ohne echtes Gemini (Mock/kein `LLM_API_KEY`) wird NUR strukturell
  gemappt (Maße umgerechnet, ohne Übersetzung) statt zu blockieren.
- **Robustheit:** TheMealDB liefert HTTP 200 mit `{"meals": null}` bei keinem Treffer
  -> Body/erwartete Felder werden immer geprüft, nie nur der Statuscode. Timeout je
  Aufruf. Ergebnisse werden je Kategorie mit TTL gecacht (gegen wiederholte
  Gemini-/TheMealDB-Last).
- **Lizenz:** freier Test-Key `1`; Link-Back-Pflicht (via `sourceUrl`). Es werden KEINE
  Bilder importiert (nur Text/Struktur). Kommerzieller Einsatz erwartet einen
  Patreon-Produktionskey; der geteilte Test-Key kann ohne Vorwarnung brechen.

### `/prices` im Detail (M11)

- Request: `POST /prices` mit `{ items: [{ key, query?, region? }] }`. `key` ist der
  stabile productKey (z. B. Barcode), `query` ein optionaler Anzeigename/Suchbegriff.
- Response: genau ein Ergebnis pro Request-Item (gleiche Reihenfolge/keys) mit
  `{ key, pricePerPackage: number|null, packageSize: number|null,
  packageUnit: "g"|"ml"|"stück"|null, currency, source: "open-prices"|"unknown", updatedAt }`.
- **Priorität/Rolle:** Online-Preise sind die NIEDRIGSTE Quelle
  (Manual > LocalSeed > Online) und bepreisen vor allem Zutaten, die NICHT im lokalen
  Seed liegen. Die Priorität entscheidet das Frontend; der Server liefert nur den
  Online-Adapter.
- **Opt-in:** Ohne `PRICES_ONLINE=1` liefert jedes Item sofort
  `{ pricePerPackage: null, …, source: "unknown", updatedAt: null }` — kein Netz-Aufruf,
  App-Flow wird nie blockiert. Es wird nie geraten.
- **Quelle:** Open Food Facts **Open Prices** (`prices.openfoodfacts.org`, ODbL). Der
  Adapter ist barcode-zentriert (`product_code`); ohne Barcode-artigen `key`/`query`
  gibt es keinen Lookup (null). Aus den jüngsten Preisen wird der Median als plausibler
  Packungspreis genommen, Packungsgröße/-einheit aus dem Produkt (falls vorhanden).
- **Robustheit:** HTTP 200 heißt nicht Treffer (leere `items` möglich) -> Body prüfen;
  Zahlen defensiv casten (Open Prices liefert Preise teils als Strings); Timeout je
  Provider; Fehler werden still geschluckt -> Fallback auf `unknown`. Treffer und
  Negativ-Treffer werden mit TTL gecacht (Negativ-Cache gegen wiederholte Abfragen).
- **Erweiterbar:** weitere Quellen als zusätzliche `PriceProvider` ergänzbar und im
  Service in Prioritätsreihenfolge einhängbar.

## Lokal starten

```bash
# im Repo-Root
cp server/.env.example server/.env   # optional; Defaults reichen für den Mock-Betrieb
npm run dev:server                   # tsx watch, Default-Port 8787
```

Smoke-Test: `curl http://localhost:8787/health`

### npm-Skripte (im Workspace `server`)

| Skript              | Zweck |
| ------------------- | ----- |
| `npm run dev -w server`   | Dev-Server mit Auto-Reload (tsx watch) |
| `npm run build -w server` | TypeScript -> `dist/` |
| `npm run start -w server` | Startet `dist/index.js` (nach build) |
| `npm run test -w server`  | Vitest (supertest gegen die App) |
| `npm run lint -w server`  | `tsc --noEmit` |

## Umgebung (.env)

`.env` wird NICHT committet (siehe `.gitignore`). Vorlage: `.env.example`.

| Variable       | Default                 | Zweck |
| -------------- | ----------------------- | ----- |
| `PORT`         | `8787`                  | HTTP-Port |
| `APP_ORIGIN`   | `http://localhost:5173` | erlaubte CORS-Origin(s), kommagetrennt (Alias: `CORS_ORIGIN`) |
| `LLM_PROVIDER` | `mock`                  | `mock` erzwingt den Mock-Client |
| `LLM_API_KEY`  | leer                    | ohne Key -> automatischer Mock-Fallback |
| `LLM_MODEL`    | `gemini-1.5-flash`      | Modellname für den HTTP-Client |
| `NUTRITION_ONLINE` | `0`                 | `1` aktiviert opt-in Online-Nährwert-Lookups (USDA -> OFF) |
| `FDC_API_KEY`  | `DEMO_KEY`              | USDA FoodData Central API-Key (Public Domain); Default ist rate-limitiert |
| `PRICES_ONLINE` | `0`                    | `1` aktiviert opt-in Online-Preise (Open Food Facts "Open Prices", ODbL). Ohne Flag liefert `/prices` sofort `source:"unknown"` |

## Datenquellen & Lizenzen

Nährwerte (`/nutrition`) und später Preise (`/prices`) stützen sich auf mehrere
Quellen. Attributionen gehören zusätzlich in die App (Über/Impressum).

| Quelle | Nutzung | Lizenz | Pflichten |
| ------ | ------- | ------ | --------- |
| **Lokaler Nährwert-Seed** (`src/nutrition/nutritionSeed.ts`) | Primärquelle, offline | eigene Schätzwerte | keine (keine fremden Daten kopiert) |
| **USDA FoodData Central** | opt-in Online-Lookup (`NUTRITION_ONLINE=1`) | Public Domain | keine; frei, auch kommerziell |
| **Open Food Facts** | opt-in Online-Lookup (Fallback nach USDA) | ODbL | **Attribution + Share-Alike** der Datenbank; Daten nur live abfragen + cachen, NICHT fest ins Repo kopieren |
| **Open Food Facts — Open Prices** | opt-in Online-Preise (`PRICES_ONLINE=1`) für `/prices` | ODbL | **Attribution + Share-Alike** der Datenbank; Daten nur live abfragen + cachen (TTL), NICHT fest ins Repo kopieren |
| **TheMealDB** | Rezept-Import (`/import-recipes`), live abgefragt + via Gemini normalisiert | freier Test-Key `1` | **Link-Back-Pflicht** (via `sourceUrl`); KEINE Bilder importieren (nur Text/Struktur); kommerziell -> Patreon-Produktionskey; Test-Key kann brechen |

Weitere Hinweise:

- **Open Food Facts / Open Prices** stehen unter ODbL — bei Weitergabe der
  Datenbank(auszüge) gilt Attribution und Share-Alike. Deshalb werden OFF-Daten nur
  zur Laufzeit abgefragt und im TTL-Cache gehalten, nie als ausgelieferter Content
  ins Repo übernommen.
- **USDA** ist Public Domain und ohne Auflagen nutzbar.
- **TheMealDB** ist die Rezept-Quelle für `/import-recipes` (freier Test-Key `1`).
  Pflicht ist ein Link-Back auf das Originalrezept (`sourceUrl`); Bilder werden NICHT
  importiert (nur Text/Struktur, danach via Gemini ins Deutsche normalisiert). Der
  geteilte Test-Key kann ohne Vorwarnung brechen und die Weiterverteilungsrechte sind
  unklar — kommerzieller Einsatz erwartet einen Patreon-Produktionskey. Die Attribution
  ("Rezepte via TheMealDB") gehört zusätzlich in die App (Über/Impressum).
- **Wikibooks Cookbook** wäre CC BY-SA (Attribution + Share-Alike), falls genutzt.

Robustheit: HTTP 200 bedeutet nicht Erfolg (OFF liefert 200 auch ohne Produkt) —
die Provider prüfen immer den Body/erwartete Felder und casten Zahlen defensiv
(OFF liefert Nährwerte teils als Strings).

## Sicherheit

- `helmet` (sichere Default-Header), `x-powered-by` deaktiviert.
- CORS nur für `APP_ORIGIN`; unbekannte Origins werden abgelehnt.
- `express-rate-limit`: 60 Requests/Minute pro IP auf allen Routen außer `/health`.
- JSON-Body-Limit 256 kB.
- Redigierender Logger: bekannte Secret-Keys (API-Keys, Tokens) erscheinen nie im Log.
- Sauberes Degradieren: fällt der LLM-Aufruf aus, antwortet `/generate-plan`
  weiterhin mit `source: "mock"`.

## Deploy (z. B. Railway)

1. Neues Railway-Projekt aus dem Repo; Root-Verzeichnis = Repo-Root (npm workspaces).
2. Build-Command: `npm ci && npm run build -w server`
3. Start-Command: `npm run start -w server`
4. Variablen setzen: `PORT` (Railway injiziert i. d. R. `PORT`), `APP_ORIGIN`
   (Origin der deployten PWA), später `LLM_API_KEY` / `LLM_MODEL`.
5. Health-Check-Pfad: `/health`.

`trust proxy` ist gesetzt, damit Rate-Limiting hinter dem Railway-Proxy die echte
Client-IP verwendet.
