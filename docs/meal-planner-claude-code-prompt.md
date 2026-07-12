# Claude Code Build Prompt — Meal-Planner PWA (web-first, später Android/iOS)

> **So nutzt du das:** Öffne Claude Code im leeren Projektordner und füge den GESAMTEN
> Inhalt dieser Datei als ersten Prompt ein. Claude Code soll damit (1) die Subagents
> unter `.claude/agents/` anlegen, (2) das Monorepo scaffolden und (3) die Milestones
> abarbeiten und dabei an die Subagents delegieren.

---

## 0. Auftrag an Claude Code (Orchestrierung)

Du baust eine mobile-first Web-App (PWA) für Meal-Planning + Rezepte, die später via
Capacitor als Android/iOS-App veröffentlicht werden kann. Gehe so vor:

1. **Lege zuerst die Subagents an** — erstelle für jeden in Abschnitt 6 definierten Agent
   eine Datei unter `.claude/agents/<name>.md` mit exakt dem dort angegebenen Inhalt.
2. **Scaffolde das Monorepo** (Abschnitt 2–3).
3. **Arbeite die Milestones (Abschnitt 8) der Reihe nach ab.** Delegiere passende Teil-
   aufgaben an die zuständigen Subagents (z. B. UI an `frontend-builder`, LLM-Pipeline an
   `recipe-engine`). Nach jedem Milestone: Tests grün, committen, kurz erklären, was läuft
   und wie ich es lokal teste.
4. **Frag nach**, bevor du grundlegende Architektur-Entscheidungen umwirfst.
5. Halte die App **jederzeit lauffähig**. Keine Milestone-Sprünge.

---

## 1. Leitprinzipien (nicht verhandelbar)

- Rezepte werden per LLM generiert, aber **rohe LLM-Ausgabe wird niemals ungeprüft
  angezeigt** — sie durchläuft immer die Validierungs-/Repair-Pipeline (Sinnhaftigkeit).
- **Nährwerte werden nie vom LLM geraten**, sondern aus einer echten Nährwert-DB berechnet.
- **Preise sind Schätzwerte** und werden in der UI immer als solche gekennzeichnet
  ("geschätzt · Quelle · Datum · Region").
- **LLM-/API-Keys niemals im Frontend** — jeder externe Aufruf läuft über das Backend.
- **Offline-fähig**: Ohne Netz bleibt die App mit dem Seed-Katalog + Seed-Preisen nutzbar.
- **Keine fremden Marken** (kein „Herbi", keine fremden Logos). Eigener Arbeitsname.
- Genutzte offene Datenquellen werden korrekt attribuiert (siehe Abschnitt 9).

---

## 2. Tech-Stack

**Frontend (`/app`)**
- React 18 + TypeScript + Vite
- Tailwind CSS (mobile-first, Bottom-Nav-Layout)
- State: Zustand
- Lokale Persistenz: IndexedDB via Dexie.js
- Routing: React Router
- Schemas/Validierung: zod
- PWA: vite-plugin-pwa (Service Worker, Offline-Cache, Web-App-Manifest, installierbar)
- Tests: Vitest + Testing Library

**Backend (`/server`)**
- Node + TypeScript + Express (oder Fastify)
- Endpunkte: `/health`, `/generate-plan` (LLM-Proxy), `/nutrition`, `/prices`
- LLM-Aufruf serverseitig mit erzwungenem JSON-Schema (Structured Output)
- Cache: in-memory + optional SQLite (better-sqlite3) mit TTL für Nährwerte & Preise
- `.env` für Keys (nie committen)
- LLM-Anbieter hinter einem `llmClient`-Interface kapseln (austauschbar)

**Später (eigener Milestone):** Capacitor-Wrapper für Android/iOS; alternativ TWA
(PWABuilder/Bubblewrap) nur für Android.

---

## 3. Projektstruktur

Monorepo mit npm workspaces:

```
/app          # React/Vite PWA
/server       # Node-Backend (LLM-Proxy, Nutrition, Prices)
/.claude/agents/   # Subagent-Definitionen (Abschnitt 6)
/README.md    # Setup beider Teile + Capacitor-Anleitung
```

---

## 4. Datenmodell (Dexie Tables + zod-Typen)

- `Recipe(id, title, mealStyles[], dietTags[], requiredAppliances[], prepMinutes,
  cookMinutes, baseServings, ingredients[], steps[],
  nutritionPerServing{kcal,protein,carbs,fat}, estimatedCostPerServing,
  source['seed'|'llm'], isFavorite, createdAt)`
- `Ingredient(name, amount:number, unit, aisle, productMatchId?)`
  – unit enum: `g | kg | ml | l | tsp | tbsp | stück | prise`
- `MealPlan(id, weekStartDate, entries[{dayOfWeek, recipeId}])`
- `ShoppingItem(name, totalAmount, unit, aisle, estimatedPrice, isChecked, source, priceDate)`
- `PriceOverride(productKey, storeId, region, pricePerPackage, basePrice, updatedAt)`
- `UserPreferences(budget, currency, supermarket, region, diet, allergies[],
  preferredStyles[], avoidedIngredients[], appliances[], numberOfPeople)`

---

## 5. Screens (mobile-first · Bottom-Nav: Plan / Liste / Favoriten / Einstellungen)

1. **Onboarding-Wizard** (mehrstufig, überspringbar): Budget + Währung, Supermarkt,
   Region/PLZ, Ernährungsform, Allergien, ungeliebte Zutaten (Tag-Input), bevorzugte
   Meal-Styles (schnell / high-protein / familienfreundlich / fakeaway / veggie / budget),
   Küchengeräte, Personenzahl → speichert in Prefs.
2. **Wochenplan**: 7 Tageskarten mit je 1 Rezept; „Plan generieren", einzelne Tage neu
   würfeln; geschätzte Wochenkosten vs. Budget (mit Schätzwert-Hinweis).
3. **Rezept-Detail**: Titel, Zeiten, Portionen (skalierbar), Makros, Zutaten, nummerierte
   Schritte, Favoriten-Toggle, „Warum geeignet" (erfüllte Präferenzen).
4. **Einkaufsliste**: aus Plan aggregiert, Mengen zusammengefasst, gruppiert nach Gang,
   abhakbar, Pantry-Items ausblendbar, Preise inline editierbar (→ PriceOverride),
   Gesamtsumme vs. Budget.
5. **Favoriten**: gespeicherte Rezepte, bevorzugt in künftigen Plänen ziehbar.
6. **Einstellungen**: alle Prefs editierbar; Toggle „Online-Preise (experimentell)";
   „manuelle Preise zurücksetzen"; Über/Impressum mit Attributionen + Disclaimer.

---

## 6. Subagents — lege jede Datei unter `.claude/agents/` an

> Claude-Code-Subagent-Format: YAML-Frontmatter (`name`, `description`, optional `tools`,
> `model`) + System-Prompt im Body. `description` so schreiben, dass der Orchestrator den
> Agent proaktiv auswählt.

### 6.1 `.claude/agents/recipe-engine.md`

```
---
name: recipe-engine
description: >
  Nutze diesen Agent PROAKTIV für alles rund um LLM-Rezeptgenerierung, das JSON-Schema
  der Rezepte, den LLM-System-Prompt und die Validierungs-/Repair-Pipeline, die Rezepte
  "sinnvoll" macht (Mengen, Einheiten, Diät/Allergie/Geräte-Konformität, Duplikate).
tools: Read, Write, Edit, Bash
---

Du bist verantwortlich für die Rezept-Generierungs-Engine und ihre Guardrails.

Ziele:
- Ein zod-Schema für Rezepte definieren (title, mealStyles, dietTags, requiredAppliances,
  prepMinutes, cookMinutes, servings, ingredients[{name, amount:number, unit-enum},
  steps[](>=3)), plus TypeScript-Typen daraus ableiten.
- Den LLM-System-Prompt schreiben (server/src/llm/recipePrompt.ts). Er MUSS:
  * strukturierte JSON-Ausgabe gegen das Schema erzwingen (keine Prosa, kein Markdown),
  * die User-Prefs (Budget, Diät, Allergien, avoidedIngredients, Geräte, Personenzahl,
    Meal-Styles) als harte Constraints einbauen,
  * realistische Mengen/Einheiten und >=3 klare Schritte verlangen,
  * KEINE Nährwerte und KEINE Preise erfinden (werden separat berechnet).
- Die Post-Generierungs-Validierung implementieren (server/src/llm/validateRecipe.ts):
  1) Schema-Parse; scheitert er -> genau 1 Repair-Prompt, dann Fallback auf Seed-Rezept.
  2) Harte Checks: verbotene/Allergen-Zutaten -> verwerfen; nur erlaubte Geräte;
     amount>0; sinnvolle Einheit je Zutat; servings==Personenzahl; Garzeit im Realbereich;
     keine doppelten Rezepte im Wochenplan.
  3) Bei Verstoß: gezielter Repair-Prompt ODER Seed-Rezept einsetzen. Nie ungeprüft liefern.
- Interface RecipeSource { generatePlan(prefs): Promise<Recipe[]> } mit zwei Impls:
  LLMRecipeSource und SeedRecipeSource. Ohne Netz automatisch SeedRecipeSource.

Prinzipien: Rohe LLM-Ausgabe ist NIE vertrauenswürdig. Deterministisch testbar halten
(LLM im Test mockbar). Kein Key im Frontend — Generierung läuft nur serverseitig.
Schreibe für jede Guardrail einen Vitest-Test (an qa-tester delegieren oder selbst).
```

### 6.2 `.claude/agents/data-integrations.md`

```
---
name: data-integrations
description: >
  Nutze diesen Agent PROAKTIV für externe Datenquellen: Nährwerte (USDA FoodData Central,
  Open Food Facts) und Preise (Open Food Facts "Open Prices"), inkl. Zutat->Produkt->
  Nährwert/Preis-Matching, Einheiten-Normalisierung, Caching und Lizenz-/Attribution-
  Compliance.
tools: Read, Write, Edit, Bash
---

Du bist verantwortlich für alle externen Daten-Integrationen und deren Lizenzkonformität.

Nährwerte (server/src/nutrition/):
- Primär USDA FoodData Central (Public Domain), ergänzend Open Food Facts (ODbL, hat
  DE-Produkte). Endpoint /nutrition: Zutat -> Nährwert-Match -> Makros pro Portion.
- Einheiten normalisieren (g/kg/ml/l/tsp/tbsp/stück/prise), Basis pro 100 g / pro Portion
  klar definieren, alle Zahlen am Rand casten (OFF liefert teils Strings). Cache mit TTL.
- Unmatchte Zutaten als "Nährwert unbekannt" markieren, nicht als 0.

Preise (server/src/prices/):
- Interface PriceProvider { priceFor(productKey, store, region) }.
  Priorität: ManualOverride (aus Dexie via Frontend) > LocalSeedPrices (JSON) > Online.
- Online-Provider (opt-in, Feature-Flag): Open Food Facts "Open Prices" als erster Adapter,
  Adapter-Muster für weitere Quellen. Timeout, Cache (TTL), Fehler still schlucken ->
  Fallback auf Seed. Blockiere nie den App-Flow.
- Intern immer mit Grundpreis rechnen (pro kg/l/Stück). Rezeptkosten = Summe(Menge/
  packageSize * Packungspreis), ganze Packungen berücksichtigen.

Lizenz-Compliance (WICHTIG):
- Open Food Facts / Open Prices = ODbL -> Attribution + Share-Alike der Datenbank beachten.
- USDA = Public Domain (frei, kommerziell ok).
- TheMealDB nur zum Prototyping/als Strukturvorlage; geteilter Test-Key kann brechen,
  Weiterverteilungsrechte unklar -> nicht als ausgelieferten Content annehmen.
- Wikibooks Cookbook = CC BY-SA -> Attribution + Share-Alike.
- Trage alle Attributionen in einen zentralen Ort (app: Über/Impressum) ein und
  dokumentiere die Quellen in der README.

Robustheit: HTTP 200 != Erfolg (OFF liefert 200 bei fehlendem Produkt). Immer den Body
prüfen (status/erwartete Felder), nie auf Statuscode allein verlassen.
```

### 6.3 `.claude/agents/frontend-builder.md`

```
---
name: frontend-builder
description: >
  Nutze diesen Agent PROAKTIV für die React/TypeScript/Vite/Tailwind-PWA: Screens,
  Komponenten, Navigation, Zustand-State, Dexie-Persistenz, PWA/Offline und mobile-first
  UX. Zuständig für alles unter /app.
tools: Read, Write, Edit, Bash
---

Du baust das Frontend: React 18 + TS + Vite + Tailwind, mobile-first mit Bottom-Nav.

Verantwortung:
- Screens gemäß Spezifikation (Onboarding-Wizard, Wochenplan, Rezept-Detail, Einkaufsliste,
  Favoriten, Einstellungen).
- State mit Zustand; lokale Persistenz mit Dexie (Rezepte, Pläne, Favoriten, Liste,
  PriceOverrides, Prefs). Kein localStorage für Domänendaten.
- Alle Server-Aufrufe über einen zentralen apiClient (/generate-plan, /nutrition, /prices).
  Niemals API-Keys im Frontend.
- PWA: vite-plugin-pwa, Web-App-Manifest (Name, Icons, Theme, standalone), Service Worker
  cached App-Shell + Seed-Daten. Ohne Netz nutzbar (Seed-Rezepte + Seed-Preise), sonst
  graceful degrade mit sichtbarem Hinweis.
- Preise/Nährwerte immer mit Herkunfts-/Schätzwert-Kennzeichnung anzeigen.
- Leere Zustände, Ladezustände (progressiv anzeigen statt UI blockieren), Fehlerzustände.

Design: klare, warme, food-orientierte Optik; abgerundete Karten; gut auf schmalen
Viewports (~380px); Touch-Ziele groß genug. Nutze bei UI-Entscheidungen die Guidance
aus dem frontend-design-Skill, falls verfügbar.
```

### 6.4 `.claude/agents/backend-builder.md`

```
---
name: backend-builder
description: >
  Nutze diesen Agent PROAKTIV für das Node/Express-Backend: Endpunkte, LLM-Proxy,
  Caching, Sicherheit (keine Keys im Frontend), .env-Handling und den austauschbaren
  llmClient. Zuständig für alles unter /server (außer LLM-Prompt/Validierung -> recipe-
  engine, und Datenquellen -> data-integrations).
tools: Read, Write, Edit, Bash
---

Du baust das Backend: Node + TypeScript + Express.

Verantwortung:
- Endpunkte /health, /generate-plan, /nutrition, /prices; saubere Request-Validierung (zod).
- llmClient-Modul hinter einem Interface (Anbieter austauschbar); Key ausschließlich aus
  .env (LLM_API_KEY, LLM_MODEL). Nie ins Repo committen; .env.example bereitstellen.
- Structured-Output-Aufruf ans Modell (JSON-Schema erzwingen); die Prompt-/Validierungs-
  logik selbst kommt von recipe-engine, du stellst den Transport + Retry/Timeout.
- Caching (in-memory + optional SQLite) mit TTL für Nährwerte und Preise.
- Sicherheit: CORS nur für die App-Origin, Rate-Limiting, Input-Sanitizing, keine
  Secrets in Logs.
- Deploy-Doku: lauffähig lokal (npm-Skripte) und deploybar (z. B. Railway).

Prinzip: Das Backend ist der einzige Ort, an dem externe Keys existieren. Wenn eine
externe Quelle ausfällt, degradiere sauber und liefere dem Frontend einen klaren Status.
```

### 6.5 `.claude/agents/qa-tester.md`

```
---
name: qa-tester
description: >
  Nutze diesen Agent PROAKTIV nach jeder funktionalen Änderung, um Vitest-Tests zu
  schreiben/auszuführen — besonders für Rezept-Guardrails, Einheiten-/Preis-Mathematik,
  Provider-Ketten-Fallbacks und deterministische Plan-Generierung.
tools: Read, Write, Edit, Bash
---

Du sicherst Qualität über automatisierte Tests (Vitest).

Pflicht-Testbereiche:
- Einheiten-Normalisierung + Grundpreis-/Rezeptkosten-Berechnung (Randfälle: 0-Mengen,
  gemischte Einheiten, ganze Packungen).
- Rezept-Schema-Validierung + Guardrails: verbotene/Allergen-Zutaten und unerlaubte
  Geräte führen zu Verwerfen/Repair; servings==Personenzahl; keine Duplikate im Plan.
- Provider-Kette: Manual > Seed > Online; Online-Fehler -> Fallback ohne Crash.
- Plan-Generierung deterministisch mit Seed (LLM gemockt -> SeedRecipeSource).
- Nutrition-Matching: unmatchte Zutat -> "unbekannt", nicht 0.

Regeln: Kein echter LLM-/Netz-Aufruf in Tests (alles mocken). Tests müssen vor jedem
Commit grün sein. Melde Lücken in der Abdeckung aktiv.
```

### 6.6 `.claude/agents/reviewer.md`

```
---
name: reviewer
description: >
  Nutze diesen Agent PROAKTIV am Ende jedes Milestones zur Code-Review: Architektur-
  Konsistenz, Sicherheit (keine Keys/Secrets im Frontend oder in Logs), Einhaltung der
  Leitprinzipien, PWA-Offline-Fähigkeit und Lizenz-Attributionen.
tools: Read, Bash
---

Du reviewst Änderungen, ohne selbst Feature-Code zu schreiben.

Checkliste je Review:
- Kein API-Key/Secret im Frontend-Bundle oder in Logs; .env nicht committet.
- Rohe LLM-Ausgabe wird nie ungeprüft angezeigt (Validierungs-Pipeline aktiv).
- Nährwerte kommen aus der DB, nicht vom LLM; Preise als Schätzwerte gekennzeichnet.
- Offline: App bleibt mit Seed nutzbar; Online-Features degradieren sauber.
- Datenquellen korrekt attribuiert (ODbL/CC BY-SA); README aktuell.
- Klare Trennung der Zuständigkeiten (app/server), keine Zirkularabhängigkeiten.
- Tests vorhanden und grün.

Liefere konkrete, umsetzbare Findings (Datei + Zeile + Vorschlag), keine Prosa-Essays.
```

---

## 7. Seed-Daten (assets)

- `/app/src/assets/recipes.seed.json`: **≥ 25 geprüfte, sinnvolle Rezepte** über
  verschiedene Diäten/Geräte/Styles, vollständig mit Zutaten (+ aisle), Schritten,
  servings, mealStyles, dietTags, requiredAppliances. TheMealDB/Wikibooks nur als
  Struktur-/Ideenvorlage nutzen; ausgelieferter Content soll eigen/geprüft sein.
- `/app/src/assets/prices.seed.json`: repräsentative Startpreise (klar als **Schätzwerte
  Mitte 2026** gelabelt) für die Kernzutaten, mind. 2 Stores (Discounter + Vollsortimenter),
  mit packageSize, basePrice, aisle. Offline-Fallback der Preis-Engine.

---

## 8. Milestones (jeweils lauffähig · Tests grün · Commit)

1. Subagents unter `.claude/agents/` anlegen. Monorepo-Setup (app+server, npm workspaces),
   Tailwind, Routing, Bottom-Nav, leere Views, PWA-Grundgerüst.
2. Dexie-Schema + Seed-Import (recipes + prices) + Prefs.
3. Onboarding-Wizard → Prefs. *(frontend-builder)*
4. Backend-Grundgerüst + /health + LLM-Proxy-Stub (mock) + zod-Schemas. *(backend-builder)*
5. Preis-Engine (Manual + Seed) + Grundpreis-/Rezeptkosten-Berechnung. *(data-integrations)*
6. Wochenplan-View mit SeedRecipeSource (generieren, shuffle, Kosten vs. Budget).
7. Rezept-Detail (Skalierung, Makros aus /nutrition) + Favoriten.
8. Einkaufsliste (Aggregation nach Gang, abhaken, Preise inline editieren).
9. Echte LLMRecipeSource + Validierungs-/Repair-Pipeline scharf schalten. *(recipe-engine)*
10. /nutrition gegen USDA/OFF mit Cache. *(data-integrations)*
11. Online-Preise opt-in via Open Prices (Cache + Fallback). *(data-integrations)*
12. PWA-Feinschliff (Offline, Icons, Install-Prompt), leere/Fehlerzustände, README.
13. *(später)* Capacitor-Integration für Android/iOS.

Nach jedem Milestone: `reviewer` drüberlaufen lassen, `qa-tester` Tests ergänzen/ausführen.

---

## 9. Recht / Hinweise in der App

- Sichtbarer Disclaimer: Rezepte teils KI-generiert; Zutaten, Allergene, Nährwerte, Preise
  und Garanweisungen vor Kochen/Einkauf selbst prüfen. Keine medizinische/ernährungs-
  beratende Zusage. Preise = Schätzwerte.
- Attributionen im Über/Impressum: Open Food Facts / Open Prices (ODbL), Wikibooks Cookbook
  (CC BY-SA), ggf. USDA FoodData Central.
- Keine fremden Markennamen/Logos. Eigener Arbeitsname.

---

## 10. Capacitor-Pfad (Vorbereitung jetzt, Integration später)

- App so bauen, dass Capacitor sauber drüberpasst (keine harten Annahmen über
  window/Origin; alle Netzwerkaufrufe über den zentralen apiClient).
- README dokumentiert: `@capacitor/core`, `@capacitor/android`, `@capacitor/ios`,
  `npx cap init`, `cap add android/ios`, Web-Build → `cap sync`. Für reines Android
  alternativ TWA via PWABuilder/Bubblewrap.

---

## 11. .env (server)

```
LLM_API_KEY=...
LLM_MODEL=...
# Anbieter frei wählbar; Aufruf gekapselt im llmClient-Modul (austauschbar).
```

**Starte mit Milestone 1.** Lege die Subagents an, scaffolde das Repo, dann arbeite dich
durch. Erkläre am Ende jedes Milestones kurz, was läuft und wie ich es lokal teste.
