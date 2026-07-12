import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import EstimateBadge from '../components/EstimateBadge';
import ScreenHeader from '../components/ScreenHeader';
import { MEAL_TYPES, MEAL_TYPE_LABELS } from '../domain/enums';
import type { MealPlanEntry, Recipe } from '../domain/schema';
import { WEEKDAY_LABELS_LONG } from '../plan/week';
import { formatPrice } from '../pricing';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { usePlanStore } from '../state/planStore';
import { usePrefsStore } from '../state/prefsStore';

export default function PlanView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const { plan, status, error, planSource, fallbackNote, load, generate, reshuffleSlot, skipSlot, recipeById } =
    usePlanStore();
  const engine = usePriceEngine();

  useEffect(() => {
    if (status === 'idle') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Einträge nach Tag gruppieren, Mahlzeiten kanonisch sortiert.
  const days = useMemo(() => {
    if (!plan) return [];
    const byDay = new Map<number, MealPlanEntry[]>();
    for (const e of plan.entries) {
      const list = byDay.get(e.dayOfWeek) ?? [];
      list.push(e);
      byDay.set(e.dayOfWeek, list);
    }
    return [...byDay.keys()]
      .sort((a, b) => a - b)
      .map((day) => ({
        day,
        entries: (byDay.get(day) ?? []).sort(
          (a, b) => MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType),
        ),
      }));
  }, [plan]);

  const weekCost = useMemo(() => {
    let total = 0;
    let unmatched = 0;
    let hasAny = false;
    for (const { entries } of days) {
      for (const e of entries) {
        if (!e.recipeId) continue;
        const recipe = recipeById(e.recipeId);
        if (!recipe) continue;
        hasAny = true;
        const est = engine.recipeCost(recipe);
        total += est.total;
        unmatched += est.unmatchedCount;
      }
    }
    return { total, unmatched, hasAny };
  }, [days, engine, recipeById]);

  const generating = status === 'generating';
  const overBudget = prefs.budget > 0 && weekCost.total > prefs.budget;

  return (
    <div>
      <ScreenHeader
        title="Wochenplan"
        subtitle={`${prefs.planDays.length} Tage · ${prefs.mealTypes.length} Mahlzeit(en)/Tag`}
        action={
          <button
            type="button"
            onClick={() => void generate(prefs)}
            disabled={generating}
            className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm active:scale-95 disabled:opacity-60"
          >
            {generating ? 'Generiere …' : plan ? 'Neu generieren' : 'Plan generieren'}
          </button>
        }
      />

      {status === 'error' && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Fehler: {error}</p>
      )}
      {status === 'empty' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Keine Rezepte passen zu deinen Präferenzen/Mahlzeiten. Passe die Filter in den
          Einstellungen an.
        </p>
      )}

      {plan && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-medium ${
              planSource === 'llm' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {planSource === 'llm' ? '✨ KI-generiert' : '📖 Aus Katalog'}
          </span>
          {fallbackNote && <span className="text-amber-600">{fallbackNote}</span>}
        </div>
      )}

      {plan && weekCost.hasAny && (
        <div className="card mb-4 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-600">Geschätzte Wochenkosten</span>
            <EstimateBadge />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${overBudget ? 'text-red-600' : 'text-slate-900'}`}>
              {formatPrice(weekCost.total, prefs.currency)}
            </span>
            {prefs.budget > 0 && (
              <span className="text-sm text-slate-500">
                von {formatPrice(prefs.budget, prefs.currency)} Budget
              </span>
            )}
          </div>
          {prefs.budget > 0 && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${overBudget ? 'bg-red-500' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, (weekCost.total / prefs.budget) * 100)}%` }}
              />
            </div>
          )}
          {weekCost.unmatched > 0 && (
            <p className="mt-2 text-xs text-slate-400">
              {weekCost.unmatched} Zutat(en) ohne Preis — tatsächliche Kosten liegen höher.
            </p>
          )}
        </div>
      )}

      {!plan && status !== 'empty' && status !== 'error' && (
        <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🗓️
          </span>
          <p className="text-slate-600">
            Noch kein Plan für diese Woche. Generiere einen aus deinen Präferenzen — wähle Tage &
            Mahlzeiten in den Einstellungen.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {days.map(({ day, entries }) => (
          <div key={day} className="card p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              {WEEKDAY_LABELS_LONG[day]}
            </span>
            <ul className="mt-2 flex flex-col divide-y divide-slate-100">
              {entries.map((entry) => (
                <MealSlot
                  key={`${day}-${entry.mealType}`}
                  entry={entry}
                  recipe={entry.recipeId ? recipeById(entry.recipeId) : undefined}
                  currency={prefs.currency}
                  engine={engine}
                  onShuffle={() => void reshuffleSlot(day, entry.mealType, prefs)}
                  onSkip={() => void skipSlot(day, entry.mealType)}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function MealSlot({
  entry,
  recipe,
  currency,
  engine,
  onShuffle,
  onSkip,
}: {
  entry: MealPlanEntry;
  recipe: Recipe | undefined;
  currency: import('../domain/enums').Currency;
  engine: import('../pricing').PriceEngine;
  onShuffle: () => void;
  onSkip: () => void;
}) {
  const label = MEAL_TYPE_LABELS[entry.mealType];
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="w-20 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      {recipe ? (
        <>
          <Link to={`/recipe/${recipe.id}`} className="min-w-0 flex-1 active:opacity-70">
            <div className="truncate font-semibold text-slate-900">{recipe.title}</div>
            <div className="text-xs text-slate-500">
              ⏱️ {recipe.prepMinutes + recipe.cookMinutes} Min
              {engine.recipeCost(recipe).matchedCount > 0 &&
                ` · ≈ ${formatPrice(engine.recipeCost(recipe).perServing, currency)}/Portion`}
            </div>
          </Link>
          <button
            type="button"
            aria-label={`${label} am ${entry.dayOfWeek} neu würfeln`}
            onClick={onShuffle}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-slate-400 hover:text-brand-600 active:scale-95"
          >
            🎲
          </button>
          <button
            type="button"
            aria-label={`${label} überspringen`}
            onClick={onSkip}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-slate-300 hover:text-red-500 active:scale-95"
          >
            ✕
          </button>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <span className="text-sm italic text-slate-300">übersprungen</span>
          <button
            type="button"
            aria-label={`${label} füllen`}
            onClick={onShuffle}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-brand-600 ring-1 ring-brand-200 active:scale-95"
          >
            + Rezept
          </button>
        </div>
      )}
    </li>
  );
}
