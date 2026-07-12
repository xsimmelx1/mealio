# Mealio Server (Backend)

Node + TypeScript + Express. Einziger Ort, an dem externe API-Keys existieren.
Das Frontend spricht ausschließlich mit diesem Backend; Keys verlassen den Server nie.

## Endpunkte

| Methode | Pfad             | Status M4 | Beschreibung |
| ------- | ---------------- | --------- | ------------ |
| GET     | `/health`        | live      | `{ status, uptime, timestamp }`; kein Rate-Limit |
| POST    | `/generate-plan` | Mock      | LLM-Proxy. Body = UserPreferences. Antwort `{ source: "mock", recipes: [] }` |
| POST    | `/nutrition`     | Stub      | Body `{ ingredients: [{ name, amount, unit }] }` -> `{ items: [{ name, status: "unknown" }] }` |
| POST    | `/prices`        | Stub      | Body `{ items: [{ productKey, storeId?, region? }] }` -> `{ items: [{ productKey, price: null, source: "unknown" }] }` |

Alle Bodies werden mit zod validiert. Fehler -> `400 { error: "ValidationError", issues }`.

Echte LLM-Anbindung folgt in M9 (recipe-engine), Nährwerte in M10 (data-integrations),
Preise in M5/M11. Dieses Grundgerüst liefert nur Transport, Mock, Retry/Timeout und Caching.

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
