import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ChipSingleSelect from '../components/forms/ChipSingleSelect';
import EstimateBadge from '../components/EstimateBadge';
import RecipeImage from '../components/RecipeImage';
import ScreenHeader from '../components/ScreenHeader';
import { MEAL_TYPES, MEAL_TYPE_LABELS, type MealType } from '../domain/enums';
import type { Recipe } from '../domain/schema';
import { db } from '../db/db';
import { formatAmount, scaleAmount } from '../lib/format';
import { eligibleForMeal } from '../plan/filterRecipes';
import { mulberry32, seededShuffle } from '../plan/generatePlan';
import { formatPrice } from '../pricing';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { toBase } from '../pricing/units';
import { usePrefsStore } from '../state/prefsStore';

/**
 * Einzelgericht-Schnellmodus: ein Gericht für EINE Mahlzeit vorschlagen — mit Zutaten
 * und Kosten, unabhängig vom Wochenplan. Für „ich koche jetzt nur eine Sache".
 */
export default function QuickMealView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const engine = usePriceEngine();
  const [catalog, setCatalog] = useState<Recipe[]>([]);

  useEffect(() => {
    let cancelled = false;
    void db.recipes
      .toArray()
      .then((r) => {
        if (!cancelled) setCatalog(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const [mealType, setMealType] = useState<MealType>(prefs.mealTypes[0] ?? 'abendessen');
  const [nonce, setNonce] = useState(1);

  const recipe = useMemo(() => {
    const pool = eligibleForMeal(catalog, prefs, mealType);
    if (pool.length === 0) return null;
    return seededShuffle(pool, mulberry32(nonce))[0];
  }, [catalog, prefs, mealType, nonce]);

  const servings = prefs.numberOfPeople;
  const factor = recipe ? servings / recipe.baseServings : 1;

  // Ganzer Einkauf (ganze Packungen) für die skalierte Menge.
  const wholeShop = useMemo(() => {
    if (!recipe) return { cost: 0, unknown: 0 };
    let cost = 0;
    let unknown = 0;
    for (const ing of recipe.ingredients) {
      const key = engine.keyForIngredient(ing);
      if (!key) {
        unknown++;
        continue;
      }
      const base = toBase(ing.amount * factor, ing.unit);
      const w = engine.wholePackageCost(key, base.qty, base.dim);
      if (w.cost == null) unknown++;
      else cost += w.cost;
    }
    return { cost: Math.round(cost * 100) / 100, unknown };
  }, [recipe, engine, factor]);

  return (
    <div>
      <ScreenHeader
        title="Schnell: 1 Gericht"
        subtitle="Ein Gericht + Einkauf, ohne Wochenplan"
        action={
          <Link to="/plan" className="text-sm text-brand-600">
            Zum Plan
          </Link>
        }
      />

      <div className="card mb-4 p-4">
        <span className="mb-2 block text-sm font-semibold text-slate-700">Mahlzeit</span>
        <ChipSingleSelect
          options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_TYPE_LABELS[m] }))}
          value={mealType}
          onChange={(v) => {
            setMealType(v);
            setNonce((n) => n + 1);
          }}
          ariaLabel="Mahlzeit"
        />
      </div>

      {!recipe ? (
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-4xl">🤷</span>
          <p className="text-slate-600">
            Kein passendes Rezept für diese Mahlzeit + deine Präferenzen. Wähle eine andere
            Mahlzeit oder lockere Filter in den Einstellungen.
          </p>
        </div>
      ) : (
        <div className="card p-4">
          <RecipeImage recipe={recipe} className="mb-3" aspect="aspect-[3/1]" />
          <div className="flex items-start justify-between gap-3">
            <Link to={`/recipe/${recipe.id}`} className="min-w-0 active:opacity-70">
              <h2 className="text-lg font-bold text-slate-900">{recipe.title}</h2>
              <p className="text-sm text-slate-500">
                ⏱️ {recipe.prepMinutes + recipe.cookMinutes} Min · {servings} Portionen
              </p>
            </Link>
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="shrink-0 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white active:scale-95"
            >
              🎲 anderes
            </button>
          </div>

          {/* Makros */}
          {recipe.nutritionPerServing && (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <Macro label="kcal" value={Math.round(recipe.nutritionPerServing.kcal)} />
              <Macro label="Eiweiß" value={`${Math.round(recipe.nutritionPerServing.protein)}g`} />
              <Macro label="KH" value={`${Math.round(recipe.nutritionPerServing.carbs)}g`} />
              <Macro label="Fett" value={`${Math.round(recipe.nutritionPerServing.fat)}g`} />
            </div>
          )}

          {/* Kosten */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-brand-800">
                ≈ {formatPrice(wholeShop.cost, prefs.currency)} Einkauf
              </div>
              <div className="text-xs text-brand-700/70">
                {engine.recipeCost(recipe).matchedCount > 0
                  ? `≈ ${formatPrice(engine.recipeCost(recipe).perServing, prefs.currency)}/Portion`
                  : 'Preis unbekannt'}
              </div>
            </div>
            <EstimateBadge />
          </div>
          {wholeShop.unknown > 0 && (
            <p className="mt-1 text-xs text-slate-400">
              {wholeShop.unknown} Zutat(en) ohne Preis — Einkauf ist eine Untergrenze.
            </p>
          )}

          {/* Zutaten */}
          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Zutaten</h3>
          <ul className="flex flex-col divide-y divide-slate-100">
            {recipe.ingredients.map((ing, i) => (
              <li key={`${ing.name}-${i}`} className="flex items-baseline justify-between py-1.5">
                <span className="text-slate-800">{ing.name}</span>
                <span className="text-sm tabular-nums text-slate-500">
                  {formatAmount(scaleAmount(ing.amount, factor))} {ing.unit}
                </span>
              </li>
            ))}
          </ul>

          <Link
            to={`/recipe/${recipe.id}`}
            className="mt-4 block text-center text-sm font-semibold text-brand-600"
          >
            Zubereitung ansehen →
          </Link>
        </div>
      )}
    </div>
  );
}

function Macro({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 py-1.5">
      <div className="font-bold text-slate-900">{value}</div>
      <div className="text-slate-500">{label}</div>
    </div>
  );
}
