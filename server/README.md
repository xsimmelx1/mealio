# Mealio Server (Backend)

Node + TypeScript + Express. Einziger Ort, an dem externe API-Keys existieren.
Das Frontend spricht ausschließlich mit diesem Backend; Keys verlassen den Server nie.

## Endpunkte

| Methode | Pfad             | Status M4 | Beschreibung |
| ------- | ---------------- | --------- | ------------ |
| GET     | `/health`        | live      | `{ status, uptime, timestamp }`; kein Rate-Limit |
| POST    | `/generate-plan` | Mock      | LLM-Proxy. Body = UserPreferences. Antwort `{ source: "mock", recipes: [] }` |
| POST    | `/nutrition`     | live (M10)| Body `{ ingredients: [{ name, amount, unit }], servings? }` -> `{ perServing: {kcal,protein,carbs,fat} \| null, matchedCount, unmatchedCount, unknownIngredients: string[] }` |
| POST    | `/prices`        | Stub      | Body `{ items: [{ productKey, storeId?, region? }] }` -> `{ items: [{ productKey, price: null, source: "unknown" }] }` |

Alle Bodies werden mit zod validiert. Fehler -> `400 { error: "ValidationError", issues }`.

Echte LLM-Anbindung folgt in M9 (recipe-engine); Preise in M5/M11. Dieses Grundgerüst
liefert Transport, Mock, Retry/Timeout und Caching.

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

## Datenquellen & Lizenzen

Nährwerte (`/nutrition`) und später Preise (`/prices`) stützen sich auf mehrere
Quellen. Attributionen gehören zusätzlich in die App (Über/Impressum).

| Quelle | Nutzung | Lizenz | Pflichten |
| ------ | ------- | ------ | --------- |
| **Lokaler Nährwert-Seed** (`src/nutrition/nutritionSeed.ts`) | Primärquelle, offline | eigene Schätzwerte | keine (keine fremden Daten kopiert) |
| **USDA FoodData Central** | opt-in Online-Lookup (`NUTRITION_ONLINE=1`) | Public Domain | keine; frei, auch kommerziell |
| **Open Food Facts** | opt-in Online-Lookup (Fallback nach USDA) | ODbL | **Attribution + Share-Alike** der Datenbank; Daten nur live abfragen + cachen, NICHT fest ins Repo kopieren |

Weitere Hinweise:

- **Open Food Facts / Open Prices** stehen unter ODbL — bei Weitergabe der
  Datenbank(auszüge) gilt Attribution und Share-Alike. Deshalb werden OFF-Daten nur
  zur Laufzeit abgefragt und im TTL-Cache gehalten, nie als ausgelieferter Content
  ins Repo übernommen.
- **USDA** ist Public Domain und ohne Auflagen nutzbar.
- **TheMealDB** dient allenfalls dem Prototyping/als Strukturvorlage (geteilter
  Test-Key, unklare Weiterverteilung) — nicht als ausgelieferter Content.
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
