import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import EstimateBadge from '../components/EstimateBadge';
import ScreenHeader from '../components/ScreenHeader';
import { MEAL_STYLE_LABELS } from '../domain/enums';
import type { Recipe } from '../domain/schema';
import { WEEKDAY_LABELS_LONG } from '../plan/week';
import { formatPrice } from '../pricing';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { usePlanStore } from '../state/planStore';
import { usePrefsStore } from '../state/prefsStore';

export default function PlanView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const { plan, status, error, planSource, fallbackNote, load, generate, reshuffleDay, recipeById } =
    usePlanStore();
  const engine = usePriceEngine();

  useEffect(() => {
    if (status === 'idle') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(() => {
    if (!plan) return [];
    return Array.from({ length: 7 }, (_, day) => {
      const entry = plan.entries.find((e) => e.dayOfWeek === day);
      const recipe = entry ? recipeById(entry.recipeId) : undefined;
      return { day, recipe };
    });
  }, [plan, recipeById]);

  const weekCost = useMemo(() => {
    let total = 0;
    let unmatched = 0;
    let hasAny = false;
    for (const { recipe } of days) {
      if (!recipe) continue;
      hasAny = true;
      const est = engine.recipeCost(recipe);
      total += est.total;
      unmatched += est.unmatchedCount;
    }
    return { total, unmatched, hasAny };
  }, [days, engine]);

  const generating = status === 'generating';
  const overBudget = prefs.budget > 0 && weekCost.total > prefs.budget;

  return (
    <div>
      <ScreenHeader
        title="Wochenplan"
        subtitle="7 Tage, ein Rezept pro Tag"
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
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          Fehler: {error}
        </p>
      )}

      {status === 'empty' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Keine Rezepte passen zu deinen Präferenzen. Lockere Filter in den Einstellungen.
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

      {/* Budget-Übersicht */}
      {plan && weekCost.hasAny && (
        <div className="card mb-4 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-slate-600">Geschätzte Wochenkosten</span>
            <EstimateBadge />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold ${overBudget ? 'text-red-600' : 'text-slate-900'}`}
            >
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

      {/* Leerer Zustand */}
      {!plan && status !== 'empty' && status !== 'error' && (
        <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🗓️
          </span>
          <p className="text-slate-600">
            Noch kein Plan für diese Woche. Generiere einen aus deinen Präferenzen.
          </p>
        </div>
      )}

      {/* Tageskarten */}
      <ul className="flex flex-col gap-3">
        {days.map(({ day, recipe }) => (
          <li key={day} className="card p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                {WEEKDAY_LABELS_LONG[day]}
              </span>
              {recipe && (
                <button
                  type="button"
                  aria-label={`${WEEKDAY_LABELS_LONG[day]} neu würfeln`}
                  onClick={() => void reshuffleDay(day, prefs)}
                  className="rounded-full px-2 py-1 text-sm text-slate-400 hover:text-brand-600 active:scale-95"
                >
                  🎲 neu
                </button>
              )}
            </div>
            {recipe ? (
              <DayRecipe recipe={recipe} currency={prefs.currency} engine={engine} />
            ) : (
              <p className="text-sm text-slate-400">—</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayRecipe({
  recipe,
  currency,
  engine,
}: {
  recipe: Recipe;
  currency: import('../domain/enums').Currency;
  engine: import('../pricing').PriceEngine;
}) {
  const est = engine.recipeCost(recipe);
  const priceLabel =
    est.matchedCount === 0
      ? 'Preis unbekannt'
      : `≈ ${formatPrice(est.perServing, currency)}/Portion`;
  return (
    <Link to={`/recipe/${recipe.id}`} className="block active:opacity-70">
      <h3 className="text-lg font-semibold text-slate-900">{recipe.title}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
        <span>⏱️ {recipe.prepMinutes + recipe.cookMinutes} Min</span>
        <span>· {priceLabel}</span>
        {recipe.mealStyles.slice(0, 2).map((s) => (
          <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
            {MEAL_STYLE_LABELS[s]}
          </span>
        ))}
      </div>
    </Link>
  );
}
