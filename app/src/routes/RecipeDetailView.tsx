import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adaptRecipeSteps, fetchNutrition } from '../api/client';
import EstimateBadge from '../components/EstimateBadge';
import ChipSingleSelect from '../components/forms/ChipSingleSelect';
import NumberStepper from '../components/forms/NumberStepper';
import Toggle from '../components/forms/Toggle';
import RecipeImage from '../components/RecipeImage';
import { MEAL_STYLE_LABELS, SUPERMARKETS } from '../domain/enums';
import type { Recipe } from '../domain/schema';
import { db } from '../db/db';
import { importCatalogRecipes, toggleFavorite } from '../db/recipeActions';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatAmount, scaleAmount } from '../lib/format';
import { adaptRecipeToDiet, type AdaptResult, type TargetDiet } from '../plan/dietSubstitutions';
import { whySuitable } from '../plan/filterRecipes';
import { formatPrice } from '../pricing';
import { ensureAiEstimates } from '../pricing/aiPrices';
import { ensureRecipeImages } from '../images/recipeImages';
import { useLocalPriceEngine } from '../pricing/useLocalPriceEngine';
import { usePrefsStore } from '../state/prefsStore';

const SUPERMARKET_OPTIONS: { value: string; label: string }[] = SUPERMARKETS.map((s) => ({
  value: s.value,
  label: s.label,
}));

export default function RecipeDetailView() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const navigate = useNavigate();
  const prefs = usePrefsStore((s) => s.prefs);

  const online = useOnlineStatus();
  const recipe = useLiveQuery(() => (recipeId ? db.recipes.get(recipeId) : undefined), [recipeId]);
  const [servings, setServings] = useState<number | null>(null);
  // Ephemere Preis-Linse (Default aus Prefs) — ändert die globalen Prefs NICHT.
  const [store, setStore] = useState(prefs.supermarket);
  const [bio, setBio] = useState(prefs.preferredProductFlags.includes('bio'));
  // Vorschau der Diät-Umstellung (nicht persistiert bis „Speichern").
  const [preview, setPreview] = useState<AdaptResult | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const engine = useLocalPriceEngine(store, bio ? ['bio'] : []);
  const [nutrition, setNutrition] = useState<{ loading: boolean; note: string | null }>({
    loading: false,
    note: null,
  });
  const fetchedRef = useRef<string | null>(null);

  // Fehlende Nährwerte (z. B. KI-Rezepte) online berechnen + in Dexie cachen.
  useEffect(() => {
    if (!recipe || recipe.nutritionPerServing !== null || !online) return;
    if (fetchedRef.current === recipe.id) return;
    fetchedRef.current = recipe.id;
    const recipeId = recipe.id;
    const ingredients = recipe.ingredients;
    const baseServings = recipe.baseServings;
    let cancelled = false;
    setNutrition({ loading: true, note: null });
    fetchNutrition(ingredients, baseServings)
      .then(async (res) => {
        if (cancelled) return;
        if (res.perServing) {
          await db.recipes.update(recipeId, { nutritionPerServing: res.perServing });
          if (cancelled) return;
          setNutrition({
            loading: false,
            note:
              res.unmatchedCount > 0
                ? `${res.unmatchedCount} Zutat(en) ohne Nährwert — Angabe ist eine Untergrenze.`
                : null,
          });
        } else {
          setNutrition({ loading: false, note: 'Nährwerte nicht verfügbar.' });
        }
      })
      .catch(() => {
        if (!cancelled) setNutrition({ loading: false, note: null });
      });
    return () => {
      cancelled = true;
    };
  }, [recipe?.id, recipe?.nutritionPerServing, online]);

  // KI-Preisschätzungen für die Zutaten + echtes Foto sicherstellen.
  useEffect(() => {
    if (recipe && online) {
      void ensureAiEstimates(recipe.ingredients.map((i) => i.name), online);
      void ensureRecipeImages([recipe], online);
    }
  }, [recipe?.id, online]);

  // Beim Wechsel des Rezepts eine offene Umstellungs-Vorschau verwerfen.
  useEffect(() => {
    setPreview(null);
  }, [recipeId]);

  if (recipe === undefined) {
    return <p className="p-4 text-slate-400">Lädt …</p>;
  }
  if (recipe === null) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <span className="text-4xl">🤷</span>
        <p className="text-slate-600">Rezept nicht gefunden.</p>
        <Link to="/plan" className="font-semibold text-brand-600">
          Zum Wochenplan
        </Link>
      </div>
    );
  }

  // Angezeigtes Rezept: Umstellungs-Vorschau, sonst das Original.
  const view = preview?.recipe ?? recipe;

  // Ein Rezept auf eine Diät umstellen: deterministische Zutaten-Ersetzung (offline),
  // danach — wenn online — Kochschritte per KI an die neuen Zutaten anpassen.
  const applyDiet = async (diet: TargetDiet) => {
    const result = adaptRecipeToDiet(recipe, diet);
    setPreview(result);
    if (!online) return;
    setPolishing(true);
    try {
      const steps = await adaptRecipeSteps(result.recipe, diet);
      setPreview((p) => (p ? { ...p, recipe: { ...p.recipe, steps } } : p));
    } catch {
      /* KI-Politur optional — deterministische Schritte bleiben. */
    } finally {
      setPolishing(false);
    }
  };

  // Umgestellte Vorschau als eigenständiges neues Rezept sichern (Original bleibt).
  const saveAdapted = async () => {
    if (!preview) return;
    setSaving(true);
    const now = Date.now();
    const adapted: Recipe = {
      ...preview.recipe,
      id: `adapted-${recipe.id}-${now}`,
      source: 'adapted',
      sourceUrl: recipe.id,
      nutritionPerServing: null,
      estimatedCostPerServing: null,
      isFavorite: false,
      createdAt: now,
    };
    try {
      await importCatalogRecipes([adapted]);
      setPreview(null);
      navigate(`/recipe/${adapted.id}`);
    } finally {
      setSaving(false);
    }
  };

  const activeServings = servings ?? view.baseServings;
  const factor = activeServings / view.baseServings;
  // Zwei Perspektiven: `purchase` = was man an der Kasse zahlt (ganze Packungen — man kann keinen
  // Teelöffel Kurkuma einzeln kaufen), `consumed` = anteiliger Verbrauchswert im Rezept.
  const ingredientsTotal = view.ingredients.reduce(
    (acc, ing) => {
      const scaled = { ...ing, amount: scaleAmount(ing.amount, factor) };
      const c = engine.ingredientCost(scaled);
      const p = engine.ingredientPurchase(scaled);
      if (c.status === 'ok' && c.source) acc.consumed += c.cost;
      if (p.status === 'ok' && p.source) {
        acc.purchase += p.cost;
        acc.matched++;
      }
      return acc;
    },
    { purchase: 0, consumed: 0, matched: 0 },
  );
  const reasons = whySuitable(view, prefs);
  const cost = engine.recipeCost(view);
  const macros = view.nutritionPerServing;

  return (
    <div className="pb-4">
      <Link to="/plan" className="mb-2 inline-block text-sm text-slate-400">
        ← zurück
      </Link>
      <RecipeImage recipe={recipe} className="mb-1" />
      {recipe.imageUrl && recipe.source === 'themealdb' && (
        <p className="mb-3 text-right text-[10px] text-slate-400">Foto: TheMealDB</p>
      )}
      {recipe.imageUrl && recipe.imageAttribution && (
        <p className="mb-3 text-right text-[10px] text-slate-400">
          {recipe.imageSourceUrl ? (
            <a href={recipe.imageSourceUrl} target="_blank" rel="noreferrer" className="underline">
              Foto: {recipe.imageAttribution}
            </a>
          ) : (
            <>Foto: {recipe.imageAttribution}</>
          )}
        </p>
      )}
      {/* Kopf */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{recipe.title}</h1>
          <div className="mt-1 flex flex-wrap gap-1">
            {recipe.mealStyles.map((s) => (
              <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {MEAL_STYLE_LABELS[s]}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          aria-label={recipe.isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          aria-pressed={recipe.isFavorite}
          onClick={() => void toggleFavorite(recipe.id)}
          className="text-3xl active:scale-90"
        >
          {recipe.isFavorite ? '❤️' : '🤍'}
        </button>
      </div>

      {/* Zeiten + Kosten */}
      <div className="card mb-4 flex items-center justify-around p-3 text-center text-sm">
        <div>
          <div className="font-semibold text-slate-900">{recipe.prepMinutes} Min</div>
          <div className="text-xs text-slate-500">Vorbereitung</div>
        </div>
        <div>
          <div className="font-semibold text-slate-900">{recipe.cookMinutes} Min</div>
          <div className="text-xs text-slate-500">Kochen</div>
        </div>
        <div>
          <div className="font-semibold text-slate-900">
            {cost.matchedCount === 0 ? '—' : `≈ ${formatPrice(cost.perServing, prefs.currency)}`}
          </div>
          <div className="text-xs text-slate-500">pro Portion</div>
        </div>
      </div>

      {/* Rezept-Optionen: Preis-Linse (Supermarkt/Bio) + Diät-Umstellung */}
      <div className="card mb-4 flex flex-col gap-4 p-4">
        <div>
          <div className="mb-1.5 text-xs font-medium text-slate-500">Preise für Supermarkt</div>
          <ChipSingleSelect
            options={SUPERMARKET_OPTIONS}
            value={store}
            onChange={setStore}
            ariaLabel="Supermarkt für Preise"
          />
        </div>
        <Toggle
          checked={bio}
          onChange={setBio}
          label="🌱 Bio bevorzugen"
          description="Preise für Bio-Varianten, wo verfügbar."
        />
        <div className="border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-xs font-medium text-slate-500">
            Auf pflanzlich umstellen {polishing && <span className="text-brand-500">· KI passt Schritte an …</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void applyDiet('vegetarisch')}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 active:scale-95"
            >
              🥕 Vegetarisch
            </button>
            <button
              type="button"
              onClick={() => void applyDiet('vegan')}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200 active:scale-95"
            >
              🌿 Vegan
            </button>
            {preview && (
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-500 ring-1 ring-slate-200 active:scale-95"
              >
                ↩︎ Original
              </button>
            )}
          </div>
        </div>

        {preview && (
          <div className="rounded-card bg-emerald-50 p-3">
            <div className="mb-1 text-sm font-semibold text-emerald-800">
              Vorschau: umgestelltes Rezept
              <span className="ml-1 text-xs font-normal text-emerald-700">
                ({online ? 'Schritte KI-angepasst' : 'Schritte automatisch ersetzt'})
              </span>
            </div>
            {preview.substitutions.length > 0 ? (
              <ul className="flex flex-col gap-0.5 text-xs text-emerald-900/80">
                {preview.substitutions.map((s, i) => (
                  <li key={i}>
                    {s.from} → <span className="font-medium">{s.to}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-900/80">Keine tierischen Zutaten gefunden — bereits passend.</p>
            )}
            {preview.unresolved.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1.5 text-xs text-amber-800">
                ⚠️ Kein Ersatz für: {preview.unresolved.join(', ')}. Bitte manuell prüfen.
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void saveAdapted()}
                disabled={saving}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white active:scale-95 disabled:opacity-60"
              >
                {saving ? 'Speichere …' : 'Als neues Rezept speichern'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Warum geeignet */}
      {reasons.length > 0 && (
        <div className="mb-4 rounded-card bg-brand-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-brand-800">Warum geeignet</h2>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <span
                key={r}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-100"
              >
                ✓ {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Portionen */}
      <div className="card mb-4 flex items-center justify-between p-4">
        <span className="text-sm font-semibold text-slate-700">Portionen</span>
        <NumberStepper
          value={activeServings}
          onChange={setServings}
          min={1}
          max={20}
          ariaLabel="Portionen"
        />
      </div>

      {/* Makros pro Portion */}
      <div className="card mb-4 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Nährwerte pro Portion</h2>
        {macros ? (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Macro label="kcal" value={Math.round(macros.kcal)} />
              <Macro label="Eiweiß" value={`${Math.round(macros.protein)} g`} />
              <Macro label="KH" value={`${Math.round(macros.carbs)} g`} />
              <Macro label="Fett" value={`${Math.round(macros.fat)} g`} />
            </div>
            {nutrition.note && <p className="mt-2 text-xs text-slate-400">{nutrition.note}</p>}
          </>
        ) : nutrition.loading ? (
          <p className="text-sm text-slate-400">Nährwerte werden berechnet …</p>
        ) : (
          <p className="text-sm text-slate-400">
            Nährwerte unbekannt{!online ? ' (offline)' : ''}
          </p>
        )}
      </div>

      {/* Zutaten (skaliert) */}
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Zutaten <span className="text-slate-400">({activeServings} Portionen)</span>
          </h2>
          <EstimateBadge />
        </div>
        <div className="mb-1 flex items-baseline justify-end gap-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
          <span className="w-24 text-right">Einkauf</span>
          <span className="w-16 text-right">Anteil</span>
        </div>
        <ul className="flex flex-col divide-y divide-slate-100">
          {view.ingredients.map((ing, i) => {
            const scaled = { ...ing, amount: scaleAmount(ing.amount, factor) };
            const c = engine.ingredientCost(scaled);
            const p = engine.ingredientPurchase(scaled);
            // Kauft man mehr als gebraucht? (ganze Packung größer als der Bedarf → Rest bleibt)
            const leftover = p.status === 'ok' && p.source != null && p.cost - c.cost > 0.01;
            return (
              <li key={`${ing.name}-${i}`} className="flex items-baseline justify-between py-2">
                <span className="min-w-0 flex-1 truncate text-slate-800">{ing.name}</span>
                <span className="ml-2 text-sm tabular-nums text-slate-500">
                  {formatAmount(scaled.amount)} {ing.unit}
                </span>
                <span className="ml-3 w-24 shrink-0 text-right text-sm tabular-nums font-medium text-slate-800">
                  {p.status === 'ok' && p.source ? (
                    <>
                      ≈ {formatPrice(p.cost, prefs.currency)}
                      {leftover && (
                        <span className="block text-[10px] font-normal text-slate-400">
                          {p.packages > 1 ? `${p.packages}× ` : ''}
                          {formatAmount(p.packageSize)} {p.packageUnit}
                        </span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                <span className="ml-3 w-16 shrink-0 text-right text-sm tabular-nums text-slate-400">
                  {c.status === 'ok' && c.source ? `≈ ${formatPrice(c.cost, prefs.currency)}` : '—'}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t border-slate-100 pt-2 text-sm">
          <span className="font-medium text-slate-700">Einkauf gesamt</span>
          <span className="font-semibold text-slate-900">
            {ingredientsTotal.matched === 0
              ? 'unbekannt'
              : `≈ ${formatPrice(ingredientsTotal.purchase, prefs.currency)}`}
          </span>
        </div>
        {ingredientsTotal.matched > 0 && (
          <div className="mt-1 flex items-baseline justify-between text-xs text-slate-400">
            <span>davon in diesem Rezept verbraucht</span>
            <span className="tabular-nums">≈ {formatPrice(ingredientsTotal.consumed, prefs.currency)}</span>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          „Einkauf" = ganze Packungen an der Kasse (z. B. ein ganzes Glas Kurkuma). „Anteil" = der im
          Rezept verbrauchte Wert. Reste bleiben für weitere Gerichte.
        </p>
      </div>

      {/* Zubereitung */}
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Zubereitung</h2>
        <ol className="flex flex-col gap-3">
          {view.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                {i + 1}
              </span>
              <span className="text-slate-700">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Macro({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
