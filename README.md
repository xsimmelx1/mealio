# Mealio — Meal-Planning & Rezepte (PWA)

Mobile-first Web-App (PWA) für Wochenplanung, KI-Rezepte, Einkaufsliste und
Preis-/Nährwert-Schätzung. Offline nutzbar; später via Capacitor als Android/iOS-App
verpackbar.

> Eigener Arbeitsname „Mealio". Keine fremden Marken/Logos.

## Monorepo

npm workspaces:

```
/app        # React 18 + TypeScript + Vite PWA (Tailwind, Zustand, Dexie, zod)
/server     # Node + TypeScript + Express (LLM-Proxy, /nutrition, /prices)
/.claude/agents/   # Subagent-Definitionen
```

## Schnellstart

```bash
npm install                 # Root: installiert app + server
cp server/.env.example server/.env   # Keys/Flags eintragen (optional)
npm run dev                 # startet app (:5173) + server (:8787) parallel
```

Einzeln:

```bash
npm run dev:app      # Vite-Dev-Server (http://localhost:5173)
npm run dev:server   # Backend (http://localhost:8787)
npm test             # Tests beider Workspaces (Vitest)
npm run build        # Production-Build (app + server)
```

Die App zeigt beim ersten Start den Onboarding-Wizard. Ohne laufendes Backend bzw.
ohne Netz bleibt die App voll nutzbar (Seed-Katalog + Seed-Preise, „Aus Katalog").

## Leitprinzipien

- Rohe LLM-Ausgabe wird **nie ungeprüft** angezeigt — immer Validierungs-/Repair-Pipeline
  (`server/src/llm/validateRecipe.ts`).
- Nährwerte werden **nie vom LLM geraten**, sondern aus einer Nährwert-DB berechnet
  (`/nutrition`); unbekannt statt 0.
- Preise sind **Schätzwerte** und werden in der UI immer so gekennzeichnet.
- **Keine API-Keys im Frontend** — externe Aufrufe laufen ausschließlich über das Backend
  (`app/src/api/client.ts` → Server).
- **Offline-fähig**: Seed-Rezepte, Seed-Preise und lokale Nährwerte funktionieren ohne Netz.

## Konfiguration

**App** (`app/.env`, optional):

| Variable       | Default                 | Zweck                          |
| -------------- | ----------------------- | ------------------------------ |
| `VITE_API_URL` | `http://localhost:8787` | Basis-URL des Backends          |

**Server** (`server/.env`, siehe `server/.env.example`):

| Variable          | Default    | Zweck                                                    |
| ----------------- | ---------- | -------------------------------------------------------- |
| `PORT`            | `8787`     | Server-Port                                              |
| `APP_ORIGIN`      | `:5173`    | CORS-Allowlist (App-Origin)                              |
| `LLM_API_KEY`     | –          | LLM-Key (fehlt → Mock-Generierung, App bleibt lauffähig) |
| `LLM_MODEL`       | –          | LLM-Modellname                                           |
| `NUTRITION_ONLINE`| `0`        | `1` = USDA/OFF online für Nährwert-Lücken                |
| `FDC_API_KEY`     | `DEMO_KEY` | USDA FoodData Central Key                                |
| `PRICES_ONLINE`   | `0`        | `1` = Open-Prices online für Preis-Lücken                |

Keys gehören **ausschließlich** in `server/.env` (nicht committen; von `.gitignore` abgedeckt).

## Datenquellen & Lizenzen

- **USDA FoodData Central** — Public Domain (Nährwerte, online opt-in).
- **Open Food Facts** — ODbL (Nährwerte ergänzend, online opt-in). Namensnennung + Share-Alike.
- **Open Food Facts „Open Prices"** — ODbL (Online-Preise, opt-in). Namensnennung + Share-Alike.
- **Wikibooks Cookbook** — CC BY-SA (nur als Struktur-/Ideenvorlage; ausgelieferte Rezepte
  sind eigen/geprüft).

Seed-Rezepte, Seed-Preise und lokale Nährwerte sind eigene, geprüfte Schätzwerte (keine
fremden Datenbanken ins Repo kopiert). Online abgerufene ODbL-Daten werden nur live geladen
und gecacht. Attributionen sind zusätzlich in der App unter **Einstellungen → Über Mealio**
sichtbar.

## Disclaimer

Rezepte sind teils KI-generiert. Zutaten, Allergene, Nährwerte, Preise und Garanweisungen
vor dem Kochen/Einkauf selbst prüfen. Keine medizinische oder ernährungsberatende Zusage.

## Live-Deployment (kostenlos)

Frontend und Backend werden getrennt deployt. Das Frontend ist eine statische PWA und
funktioniert bereits allein (offline auf Seed-Daten); das Backend aktiviert nur die
Opt-in-Extras.

**Frontend → Vercel** (Root-Domain, ideal für PWA). Wichtig: **Root Directory = `app`**
setzen (das Frontend baut eigenständig; `app/package.json` enthält alle Abhängigkeiten).
Framework „Vite", Build/Install auf Default lassen (`npm install`, `npm run build`, Output
`dist`) — **keinen** `-w app`-Build eintragen (das schlägt fehl, wenn Root Directory `app`
ist). SPA-Rewrites kommen aus `app/vercel.json`. Env `VITE_API_URL` = Backend-URL setzen,
deployen. Alternativen: Netlify (Base directory `app`, Build `npm run build`, Publish `dist`,
`_redirects`: `/* /index.html 200`) oder Cloudflare Pages (Root/Build directory `app`).

**Backend → Render (free)**. Blueprint liegt in `render.yaml`. Render „New → Blueprint" auf
das Repo, deployen. Render setzt `PORT` selbst; `NUTRITION_ONLINE`/`PRICES_ONLINE`/`FDC_API_KEY`
sind vorkonfiguriert. Nach dem Frontend-Deploy `APP_ORIGIN` = Vercel-URL setzen (CORS).

**Reihenfolge & Verkopplung**: Push → Render deployen (API-URL notieren) → Vercel mit
`VITE_API_URL`=API-URL deployen (Frontend-URL notieren) → Render `APP_ORIGIN`=Frontend-URL.
`VITE_API_URL` wird zur Build-Zeit eingebacken → nach Änderung Vercel-Redeploy.

> **Hinweis KI-Rezepte:** `LLM_API_KEY` bewusst **nicht** setzen. Der `HttpLlmClient` ist
> noch ein Gerüst; mit gesetztem Key würde `/generate-plan` auf `seed-fallback` degradieren.
> Ohne Key erzeugt der `MockLlmClient` gratis schema-konforme, prefs-gerechte Rezepte. Ein
> echter LLM-Provider ist eine spätere, separate Aufgabe (HttpLlmClient implementieren).

Kostenrahmen: Vercel (Hobby) + Render (free) + USDA DEMO_KEY / OFF / Open Prices = **0 €**.

## Capacitor (Android/iOS, später)

Die App ist Capacitor-freundlich gebaut (keine harten `window`/Origin-Annahmen; alle
Netzwerkaufrufe über den zentralen `apiClient` mit `VITE_API_URL`).

```bash
npm i -D @capacitor/core @capacitor/cli
npm i @capacitor/android @capacitor/ios
npx cap init Mealio tech.mealio.app --web-dir app/dist
npm run build -w app
npx cap add android      # bzw. ios
npx cap sync
```

Für reines Android alternativ eine TWA via PWABuilder/Bubblewrap (nutzt das vorhandene
Web-App-Manifest).

## Architektur-Kurzüberblick

- **Domäne**: `app/src/domain` (zod-Schemas = Single Source of Truth), Persistenz in
  IndexedDB via Dexie (`app/src/db`).
- **Plan**: `app/src/plan` (deterministische, seed-basierte Generierung), `RecipeSource`
  ist austauschbar (Seed offline / LLM online mit sauberem Fallback).
- **Preise**: `app/src/pricing` (Manual > Seed > Online), ganze Packungen, Einheiten-
  Normalisierung; unmatched → „unbekannt".
- **Backend**: `server/src` — Endpunkte `/health`, `/generate-plan`, `/nutrition`,
  `/prices`; LLM hinter austauschbarem `llmClient`; TTL-Cache; helmet/CORS/Rate-Limit.
```
