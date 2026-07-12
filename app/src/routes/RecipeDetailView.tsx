import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EstimateBadge from '../components/EstimateBadge';
import NumberStepper from '../components/forms/NumberStepper';
import { AISLE_LABELS, MEAL_STYLE_LABELS } from '../domain/enums';
import { db } from '../db/db';
import { toggleFavorite } from '../db/recipeActions';
import { formatAmount, scaleAmount } from '../lib/format';
import { whySuitable } from '../plan/filterRecipes';
import { formatPrice } from '../pricing';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { usePrefsStore } from '../state/prefsStore';

export default function RecipeDetailView() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const prefs = usePrefsStore((s) => s.prefs);
  const engine = usePriceEngine();

  const recipe = useLiveQuery(() => (recipeId ? db.recipes.get(recipeId) : undefined), [recipeId]);
  const [servings, setServings] = useState<number | null>(null);

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

  const activeServings = servings ?? recipe.baseServings;
  const factor = activeServings / recipe.baseServings;
  const reasons = whySuitable(recipe, prefs);
  const cost = engine.recipeCost(recipe);
  const macros = recipe.nutritionPerServing;

  return (
    <div className="pb-4">
      {/* Kopf */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Link to="/plan" className="text-sm text-slate-400">
            ← zurück
          </Link>
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
          <div className="grid grid-cols-4 gap-2 text-center">
            <Macro label="kcal" value={Math.round(macros.kcal)} />
            <Macro label="Eiweiß" value={`${Math.round(macros.protein)} g`} />
            <Macro label="KH" value={`${Math.round(macros.carbs)} g`} />
            <Macro label="Fett" value={`${Math.round(macros.fat)} g`} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nährwerte unbekannt</p>
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
        <ul className="flex flex-col divide-y divide-slate-100">
          {recipe.ingredients.map((ing, i) => (
            <li key={`${ing.name}-${i}`} className="flex items-baseline justify-between py-2">
              <span className="text-slate-800">{ing.name}</span>
              <span className="text-sm tabular-nums text-slate-500">
                {formatAmount(scaleAmount(ing.amount, factor))} {ing.unit}
                <span className="ml-2 text-xs text-slate-300">{AISLE_LABELS[ing.aisle]}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Zubereitung */}
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Zubereitung</h2>
        <ol className="flex flex-col gap-3">
          {recipe.steps.map((step, i) => (
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
