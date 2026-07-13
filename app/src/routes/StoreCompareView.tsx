import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import EstimateBadge from '../components/EstimateBadge';
import ScreenHeader from '../components/ScreenHeader';
import { STORE_IDS } from '../domain/enums';
import type { Recipe } from '../domain/schema';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatPrice } from '../pricing';
import { ensureAiEstimates } from '../pricing/aiPrices';
import { budgetReach, compareAllStores } from '../pricing/storeTotals';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { aggregateShoppingItems } from '../shopping/aggregate';
import { usePlanStore } from '../state/planStore';
import { usePrefsStore } from '../state/prefsStore';

/** "2025-09" -> "09/2025" für die Stand-Kennzeichnung. */
function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-');
  return m && y ? `${m}/${y}` : ym;
}

/**
 * Supermarkt-Vergleich für den gesamten Wochenplan: Was kostet der Warenkorb bei jedem
 * der 7 Märkte, welcher passt ins Budget und wie weit reicht das Budget je Markt?
 * Preise = kuratierter Katalog je Markt (echte Marken) + KI-Schätzung (×Marktindex) als Fallback.
 */
export default function StoreCompareView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const { plan, catalog, status, load, recipeById } = usePlanStore();
  const engine = usePriceEngine();
  const online = useOnlineStatus();
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (status === 'idle') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // KI-Preisschätzungen für alle Plan-Zutaten sicherstellen (Engine nutzt sie live).
  useEffect(() => {
    if (!plan || !online) return;
    const names = plan.entries
      .map((e) => (e.recipeId ? recipeById(e.recipeId) : undefined))
      .filter((r): r is Recipe => !!r)
      .flatMap((r) => r.ingredients.map((i) => i.name));
    void ensureAiEstimates(names, online);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, catalog.length, online]);

  const comparison = useMemo(() => {
    if (!plan || !catalog.length) return null;
    const items = aggregateShoppingItems(plan, catalog, engine);
    return compareAllStores(items, engine);
  }, [plan, catalog, engine]);

  const budget = prefs.budget;
  const plannedDays = prefs.planDays.length || 1;

  return (
    <div>
      <ScreenHeader
        title="Supermarkt-Vergleich"
        subtitle="Was dein Wochenplan bei jedem Markt kostet"
        action={
          <Link
            to="/plan"
            className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-brand-200 active:scale-95"
          >
            ← Plan
          </Link>
        }
      />

      {!comparison && (
        <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-4xl" aria-hidden>
            🛒
          </span>
          <p className="text-slate-600">Noch kein Wochenplan. Erstelle zuerst einen Plan.</p>
          <Link to="/plan" className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
            Zum Plan
          </Link>
        </div>
      )}

      {comparison && !comparison.cheapest && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Keine Position im Plan war bepreisbar. Generiere einen Plan mit gematchten Zutaten
          {online ? '' : ' (KI-Schätzung braucht Internet)'}.
        </p>
      )}

      {comparison?.cheapest && (
        <>
          {/* Budget-Hinweis */}
          {budget > 0 && (
            <p className="mb-3 text-sm text-slate-500">
              Dein Wochenbudget: <span className="font-semibold text-slate-700">{formatPrice(budget, prefs.currency)}</span> ·{' '}
              {comparison.cheapest.total <= budget ? (
                <span className="text-emerald-700">
                  passt bei {comparison.stores.filter((s) => s.total <= budget).length} von {comparison.stores.length} Märkten
                </span>
              ) : (
                <span className="text-red-600">reicht bei keinem Markt für den ganzen Plan</span>
              )}
            </p>
          )}

          {/* Ranking je Markt */}
          <ul className="flex flex-col gap-2">
            {comparison.stores.map((s, i) => {
              const reach = budgetReach(s.total, budget, plannedDays);
              const overBudget = budget > 0 && s.total > budget;
              const deltaToCheapest = Math.round((s.total - comparison.cheapest!.total) * 100) / 100;
              const barPct = comparison.maxTotal > 0 ? (s.total / comparison.maxTotal) * 100 : 0;
              return (
                <li key={s.storeId} className="card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="font-semibold text-slate-800">{s.label}</span>
                      {i === 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          günstigster
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-lg font-bold ${overBudget ? 'text-red-600' : 'text-slate-900'}`}>
                        {formatPrice(s.total, prefs.currency)}
                      </span>
                      {i > 0 && deltaToCheapest > 0 && (
                        <span className="ml-1 text-xs text-slate-400">+{formatPrice(deltaToCheapest, prefs.currency)}</span>
                      )}
                    </div>
                  </div>

                  {/* Kosten-Balken relativ zum teuersten Markt */}
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${i === 0 ? 'bg-emerald-500' : overBudget ? 'bg-red-400' : 'bg-brand-400'}`}
                      style={{ width: `${Math.max(6, barPct)}%` }}
                    />
                  </div>

                  {/* Budget-Reichweite + Schätz-Hinweis */}
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={reach.fits ? 'text-emerald-700' : 'text-amber-700'}>
                      {budget <= 0
                        ? `${s.pricedCount} Positionen`
                        : reach.fits
                          ? '✓ ganzer Plan im Budget'
                          : `Budget reicht für ≈ ${reach.coveredDays} von ${plannedDays} Tagen`}
                    </span>
                    <span className="flex items-center gap-1">
                      {s.realCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                          title="Echte Quelle (REWE-Datensatz)"
                        >
                          ✓ {s.realCount}× echt{s.priceDate ? ` · ${fmtMonth(s.priceDate)}` : ''}
                        </span>
                      )}
                      {s.pricedCount - s.realCount > 0 && (
                        <EstimateBadge source={`${s.pricedCount - s.realCount}× geschätzt`} />
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-slate-400">
            Ersparnis günstigster vs. teuerster Markt:{' '}
            <span className="font-semibold text-emerald-700">{formatPrice(comparison.savings, prefs.currency)}</span>.
            <br />
            <span className="text-emerald-700">✓ echt</span> = reale REWE-Daten (mit Stand);{' '}
            <span className="text-amber-700">≈ geschätzt</span> = abgeleitet. Vor dem Einkauf prüfen.
          </p>

          {/* Produkt-Tabelle je Markt */}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="mt-4 w-full rounded-card border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 active:scale-[0.99]"
          >
            {showTable ? 'Produkt-Tabelle ausblenden' : `Preise je Produkt & Markt anzeigen (${comparison.pricedItemCount})`}
          </button>

          {showTable && (
            <div className="mt-2 overflow-x-auto rounded-card border border-slate-200">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left font-semibold text-slate-600">
                      Produkt
                    </th>
                    {STORE_IDS.map((id) => (
                      <th key={id} className="px-2 py-2 text-right font-semibold text-slate-600">
                        {comparison.stores.find((s) => s.storeId === id)?.label ?? id}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows
                    .filter((r) => STORE_IDS.some((id) => r.byStore[id].cost != null))
                    .map((r) => {
                      const costs = STORE_IDS.map((id) => r.byStore[id].cost).filter(
                        (c): c is number => c != null,
                      );
                      const min = costs.length ? Math.min(...costs) : null;
                      return (
                        <tr key={r.item.id} className="border-t border-slate-100">
                          <td className="sticky left-0 z-10 bg-white px-2 py-2 text-slate-700">{r.item.name}</td>
                          {STORE_IDS.map((id) => {
                            const line = r.byStore[id];
                            const isMin = min != null && line.cost === min;
                            return (
                              <td
                                key={id}
                                className={`px-2 py-2 text-right ${isMin ? 'font-semibold text-emerald-700' : 'text-slate-600'}`}
                              >
                                {line.cost == null ? (
                                  <span className="text-slate-300">–</span>
                                ) : (
                                  <span title={line.productName ?? undefined}>
                                    <div>
                                      {line.dataSource === 'real' && (
                                        <span className="text-emerald-600" title="echt">✓ </span>
                                      )}
                                      {formatPrice(line.cost, prefs.currency)}
                                    </div>
                                    {line.brand && <div className="text-[10px] text-slate-400">{line.brand}</div>}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
