import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import EstimateBadge from '../components/EstimateBadge';
import RecipeImage from '../components/RecipeImage';
import ScreenHeader from '../components/ScreenHeader';
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  PRODUCT_FLAGS,
  PRODUCT_FLAG_ICON,
  SUPERMARKETS,
} from '../domain/enums';
import { PRODUCT_FLAG_LABELS } from '../domain/labels';
import type { MealPlanEntry, Recipe } from '../domain/schema';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { isBudgetTight, suggestedBudget } from '../plan/budget';
import { WEEKDAY_LABELS_LONG } from '../plan/week';
import { formatPrice } from '../pricing';
import { ensureAiEstimates } from '../pricing/aiPrices';
import { ensureRecipeImages } from '../images/recipeImages';
import { compareAllStores } from '../pricing/storeTotals';
import { aggregateShoppingItems } from '../shopping/aggregate';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { usePlanStore } from '../state/planStore';
import { usePrefsStore } from '../state/prefsStore';

export default function PlanView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const updatePrefs = usePrefsStore((s) => s.update);
  const {
    plan,
    catalog,
    status,
    error,
    planSource,
    fallbackNote,
    load,
    generate,
    reshuffleSlot,
    reshuffleSlotCheaper,
    skipSlot,
    recipeById,
  } = usePlanStore();
  const engine = usePriceEngine();
  const online = useOnlineStatus();
  const costOf = (r: Recipe): number => engine.recipeCost(r).total;

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

  // Teuerster belegter Slot (für Markierung bei Budget-Überschreitung).
  const mostExpensive = useMemo(() => {
    let best: { day: number; mealType: string; cost: number } | null = null;
    for (const { day, entries } of days) {
      for (const e of entries) {
        const recipe = e.recipeId ? recipeById(e.recipeId) : undefined;
        if (!recipe) continue;
        const cost = engine.recipeCost(recipe).total;
        if (!best || cost > best.cost) best = { day, mealType: e.mealType, cost };
      }
    }
    return best;
  }, [days, engine, recipeById]);

  // KI-Preisschätzungen für alle Plan-Zutaten sicherstellen (Engine nutzt sie live).
  useEffect(() => {
    if (!plan || !online) return;
    const recipes = plan.entries
      .map((e) => (e.recipeId ? recipeById(e.recipeId) : undefined))
      .filter((r): r is Recipe => !!r);
    void ensureAiEstimates(
      recipes.flatMap((r) => r.ingredients.map((i) => i.name)),
      online,
    );
    void ensureRecipeImages(recipes, online);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, catalog.length, online]);

  // Kosten pro Tag (Summe der Slot-Kosten).
  const dayTotals = useMemo(() => {
    const map = new Map<number, number>();
    for (const { day, entries } of days) {
      let sum = 0;
      for (const e of entries) {
        const recipe = e.recipeId ? recipeById(e.recipeId) : undefined;
        if (recipe) sum += engine.recipeCost(recipe).total;
      }
      map.set(day, sum);
    }
    return map;
  }, [days, engine, recipeById]);

  // Supermarkt-Vergleich für den gesamten Plan (günstigster Markt; Details unter /compare).
  const storeCompare = useMemo(() => {
    if (!plan || !catalog.length) return null;
    const items = aggregateShoppingItems(plan, catalog, engine);
    const cmp = compareAllStores(items, engine);
    return cmp.cheapest ? cmp : null;
  }, [plan, catalog, engine]);

  const generating = status === 'generating';
  const overBudget = prefs.budget > 0 && weekCost.total > prefs.budget;
  const budgetTight = isBudgetTight(prefs);

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

      {/* Supermarkt-Umschalter: rechnet Kosten/Vergleich live um */}
      <div className="mb-4">
        <div className="mb-1 text-xs font-medium text-slate-500">Preise für Supermarkt</div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {SUPERMARKETS.map((s) => {
            const active = prefs.supermarket === s.value;
            return (
              <button
                key={s.value || 'egal'}
                type="button"
                onClick={() => void updatePrefs({ supermarket: s.value })}
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-brand-500 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schnellfilter: bevorzugte Produkt-Labels (Bio/Vegan/…) — rechnet Preise/Vergleich live um */}
      <div className="mb-4">
        <div className="mb-1 text-xs font-medium text-slate-500">Bevorzugte Labels</div>
        <div className="-mx-1 flex flex-wrap gap-1 px-1">
          {PRODUCT_FLAGS.map((f) => {
            const active = prefs.preferredProductFlags.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() =>
                  void updatePrefs({
                    preferredProductFlags: active
                      ? prefs.preferredProductFlags.filter((x) => x !== f)
                      : [...prefs.preferredProductFlags, f],
                  })
                }
                aria-pressed={active}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                }`}
              >
                {PRODUCT_FLAG_ICON[f]} {PRODUCT_FLAG_LABELS[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Klar abgesetzter Einzelgericht-Einstieg (kein Teil des Wochenplans) */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-card border border-dashed border-brand-200 bg-brand-50/50 p-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-brand-800">Nur schnell etwas kochen?</div>
          <div className="text-xs text-brand-700/70">Ein Gericht + Einkauf, ohne Wochenplan.</div>
        </div>
        <Link
          to="/quick"
          className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-brand-200 active:scale-95"
        >
          ⚡ Einzelgericht
        </Link>
      </div>

      <div className="mb-4 border-t border-slate-100" />

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
          {budgetTight && (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Budget ist sehr knapp — realistisch sind ~{suggestedBudget(prefs)} {prefs.currency}.
              Tipp: „💸 günstiger" an teuren Tagen tauscht gegen preiswertere Rezepte.
            </p>
          )}
          {storeCompare?.cheapest && (
            <Link
              to="/compare"
              className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 active:opacity-70"
            >
              <div className="text-sm">
                <span className="text-xs font-medium text-slate-500">Günstigster Markt:</span>{' '}
                <span className="font-semibold text-emerald-700">{storeCompare.cheapest.label}</span>{' '}
                <span className="font-semibold text-slate-800">
                  {formatPrice(storeCompare.cheapest.total, prefs.currency)}
                </span>
                {storeCompare.savings > 0 && (
                  <span className="ml-1 text-xs text-slate-400">
                    (−{formatPrice(storeCompare.savings, prefs.currency)} ggü. teuerstem)
                  </span>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold text-brand-600">Alle 7 Märkte →</span>
            </Link>
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

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {days.map(({ day, entries }) => (
          <div key={day} className="card p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
                {WEEKDAY_LABELS_LONG[day]}
              </span>
              {(dayTotals.get(day) ?? 0) > 0 && (
                <span className="text-xs text-slate-500">
                  Tag: ≈ {formatPrice(dayTotals.get(day) ?? 0, prefs.currency)}
                </span>
              )}
            </div>
            <ul className="mt-2 flex flex-col divide-y divide-slate-100">
              {entries.map((entry) => (
                <MealSlot
                  key={`${day}-${entry.mealType}`}
                  entry={entry}
                  recipe={entry.recipeId ? recipeById(entry.recipeId) : undefined}
                  currency={prefs.currency}
                  engine={engine}
                  isExpensive={
                    overBudget &&
                    mostExpensive?.day === day &&
                    mostExpensive?.mealType === entry.mealType
                  }
                  onShuffle={() => void reshuffleSlot(day, entry.mealType, prefs)}
                  onCheaper={() => void reshuffleSlotCheaper(day, entry.mealType, prefs, costOf)}
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
  isExpensive,
  onShuffle,
  onCheaper,
  onSkip,
}: {
  entry: MealPlanEntry;
  recipe: Recipe | undefined;
  currency: import('../domain/enums').Currency;
  engine: import('../pricing').PriceEngine;
  isExpensive?: boolean;
  onShuffle: () => void;
  onCheaper: () => void;
  onSkip: () => void;
}) {
  const label = MEAL_TYPE_LABELS[entry.mealType];
  return (
    <li className="flex items-center gap-2 py-2">
      <span className="w-20 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      {recipe ? (
        <>
          <div className="h-10 w-10 shrink-0">
            <RecipeImage recipe={recipe} aspect="aspect-square" />
          </div>
          <Link to={`/recipe/${recipe.id}`} className="min-w-0 flex-1 active:opacity-70">
            <div className="truncate font-semibold text-slate-900">
              {recipe.title}
              {isExpensive && (
                <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                  teuerste
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">
              ⏱️ {recipe.prepMinutes + recipe.cookMinutes} Min
              {engine.recipeCost(recipe).matchedCount > 0 &&
                ` · ≈ ${formatPrice(engine.recipeCost(recipe).perServing, currency)}/Portion`}
            </div>
          </Link>
          <button
            type="button"
            aria-label={`${label} günstiger`}
            title="Günstigeres Rezept wählen"
            onClick={onCheaper}
            className="shrink-0 rounded-full px-2 py-1 text-sm text-slate-400 hover:text-emerald-600 active:scale-95"
          >
            💸
          </button>
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
