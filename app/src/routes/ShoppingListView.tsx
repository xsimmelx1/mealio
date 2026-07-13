import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPrices, type OnlinePrice } from '../api/client';
import EstimateBadge from '../components/EstimateBadge';
import ScreenHeader from '../components/ScreenHeader';
import { AISLES, AISLE_LABELS } from '../domain/enums';
import type { ShoppingItem } from '../domain/schema';
import { db } from '../db/db';
import { setPackagePriceOverride } from '../db/priceActions';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatPrice } from '../pricing';
import { buildAiOnlineMap, ensureAiEstimates } from '../pricing/aiPrices';
import { normalizeName } from '../pricing/productMatch';
import { compareAllStores } from '../pricing/storeTotals';
import type { PriceEngine } from '../pricing/priceEngine';
import { usePriceEngine } from '../pricing/usePriceEngine';
import { onlineItemCost } from '../shopping/onlinePrice';
import { usePlanStore } from '../state/planStore';
import { usePrefsStore } from '../state/prefsStore';
import { useShoppingStore } from '../state/shoppingStore';

export default function ShoppingListView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const engine = usePriceEngine();
  const online = useOnlineStatus();
  const { plan, catalog, status, load } = usePlanStore();
  const { items, showPantry, rebuild, toggleCheck, togglePantry, setShowPantry } =
    useShoppingStore();
  const [onlineMap, setOnlineMap] = useState<Record<string, OnlinePrice>>({});

  useEffect(() => {
    if (status === 'idle') void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Neu aggregieren, wenn Plan, Katalog oder Preise (Engine) sich ändern.
  useEffect(() => {
    // .catch: schluckt u. a. DatabaseClosedError, falls die DB beim Unmount/Teardown
    // schließt, während der Read noch läuft (blockiert den Flow nie).
    if (plan && catalog.length) void rebuild(plan, catalog, engine).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, catalog.length, engine]);

  // KI-Preisschätzungen (shared Dexie-Cache, live) — Fallback für preislose Positionen.
  const aiEntries = useLiveQuery(() => db.aiPrices.toArray(), [], []);
  const aiMap = useMemo(() => buildAiOnlineMap(aiEntries ?? []), [aiEntries]);

  // Online-Preise (opt-in, niedrigste Priorität): nur Positionen OHNE lokalen Preis.
  const unpricedKeys = items
    .filter((i) => i.estimatedPrice == null)
    .map((i) => `${i.productKey ?? i.id}${i.name}`)
    .join(',');
  useEffect(() => {
    // Ohne Netz nichts nachladen (offline bleibt "unbekannt").
    if (!online) {
      setOnlineMap({});
      return;
    }
    const unpriced = items.filter((i) => i.estimatedPrice == null);
    if (unpriced.length === 0) {
      setOnlineMap({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const map: Record<string, OnlinePrice> = {};
      // 1) Echte Online-Preise (Open Prices) — nur wenn opt-in aktiviert.
      if (prefs.onlinePricesEnabled) {
        try {
          const results = await fetchPrices(
            unpriced.map((i) => ({ key: i.productKey ?? i.id, query: i.name })),
          );
          for (const r of results) if (r.source === 'open-prices') map[r.key] = r;
        } catch {
          /* optional */
        }
      }
      // 2) KI-Schätzung als Standard-Fallback für alle weiterhin preislosen Positionen.
      await ensureAiEstimates(unpriced.map((i) => i.name), online);
      if (!cancelled) setOnlineMap(map);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unpricedKeys, prefs.onlinePricesEnabled, online]);

  // Open Prices (nach productKey/id) hat Vorrang; sonst KI-Schätzung (nach normalisiertem Namen).
  const onlineFor = (item: ShoppingItem): OnlinePrice | undefined =>
    onlineMap[item.productKey ?? item.id] ?? aiMap[normalizeName(item.name)];

  // Supermarkt-Vergleich: günstigster Markt für diese Liste; Details unter /compare.
  const storeCompare = useMemo(() => compareAllStores(items, engine), [items, engine]);

  const visible = showPantry ? items : items.filter((i) => !i.isPantry);
  const byAisle = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const it of visible) {
      const list = map.get(it.aisle) ?? [];
      list.push(it);
      map.set(it.aisle, list);
    }
    return AISLES.filter((a) => map.has(a)).map((a) => ({ aisle: a, items: map.get(a)! }));
  }, [visible]);

  const summary = useMemo(() => {
    let total = 0;
    let unknown = 0;
    let onlineFilled = 0;
    for (const it of items) {
      if (it.isPantry) continue;
      if (it.estimatedPrice != null) {
        total += it.estimatedPrice;
        continue;
      }
      const online = onlineMap[it.productKey ?? it.id];
      const onlineCost = online ? onlineItemCost(it, online) : null;
      if (onlineCost != null) {
        total += onlineCost;
        onlineFilled++;
      } else {
        unknown++;
      }
    }
    return { total, unknown, onlineFilled };
  }, [items, onlineMap]);

  const overBudget = prefs.budget > 0 && summary.total > prefs.budget;

  if (!plan) {
    return (
      <div>
        <ScreenHeader title="Einkaufsliste" subtitle="Aus dem Plan zusammengefasst" />
        <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <span className="text-4xl">🛒</span>
          <p className="text-slate-600">Noch kein Wochenplan vorhanden.</p>
          <Link to="/plan" className="font-semibold text-brand-600">
            Plan generieren
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader
        title="Einkaufsliste"
        subtitle="Aus dem Plan zusammengefasst"
        action={
          <button
            type="button"
            onClick={() => setShowPantry(!showPantry)}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200 active:scale-95"
          >
            {showPantry ? 'Vorrat ausblenden' : 'Vorrat zeigen'}
          </button>
        }
      />

      {/* Summe */}
      <div className="card mb-4 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-600">Geschätzte Summe</span>
          <EstimateBadge source={`Stand 2026-07`} />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${overBudget ? 'text-red-600' : 'text-slate-900'}`}>
            {formatPrice(summary.total, prefs.currency)}
          </span>
          {prefs.budget > 0 && (
            <span className="text-sm text-slate-500">
              von {formatPrice(prefs.budget, prefs.currency)}
            </span>
          )}
        </div>
        {summary.unknown > 0 && (
          <p className="mt-1 text-xs text-slate-400">
            {summary.unknown} Position(en) ohne Preis — Summe ist eine Untergrenze.
          </p>
        )}
        {summary.onlineFilled > 0 && (
          <p className="mt-1 text-xs text-slate-400">
            {summary.onlineFilled} Position(en) online/per KI geschätzt.
          </p>
        )}
      </div>

      {/* Supermarkt-Vergleich */}
      {storeCompare.cheapest && (
        <Link to="/compare" className="card mb-4 flex items-center justify-between gap-2 p-4 active:opacity-70">
          <div>
            <div className="mb-0.5 flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Supermarkt-Vergleich</span>
              <EstimateBadge />
            </div>
            <div className="text-sm">
              <span className="text-xs text-slate-500">Günstigster:</span>{' '}
              <span className="font-semibold text-emerald-700">{storeCompare.cheapest.label}</span>{' '}
              <span className="font-semibold text-slate-800">
                {formatPrice(storeCompare.cheapest.total, prefs.currency)}
              </span>
              {storeCompare.savings > 0 && (
                <span className="ml-1 text-xs text-slate-400">
                  −{formatPrice(storeCompare.savings, prefs.currency)}
                </span>
              )}
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold text-brand-600">Alle 7 Märkte →</span>
        </Link>
      )}

      {/* Gruppen nach Gang */}
      <div className="flex flex-col gap-4">
        {byAisle.map(({ aisle, items: group }) => (
          <section key={aisle}>
            <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-brand-500">
              {AISLE_LABELS[aisle]}
            </h2>
            <ul className="card divide-y divide-slate-100">
              {group.map((item) => (
                <ShoppingRow
                  key={item.id}
                  item={item}
                  engine={engine}
                  currency={prefs.currency}
                  online={onlineFor(item)}
                  onToggleCheck={() => void toggleCheck(item.id)}
                  onTogglePantry={() => void togglePantry(item.id)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ShoppingRow({
  item,
  engine,
  currency,
  online,
  onToggleCheck,
  onTogglePantry,
}: {
  item: ShoppingItem;
  engine: PriceEngine;
  currency: import('../domain/enums').Currency;
  online?: OnlinePrice;
  onToggleCheck: () => void;
  onTogglePantry: () => void;
}) {
  const resolved = item.productKey ? engine.resolve(item.productKey) : null;
  const onlineCost = item.estimatedPrice == null && online ? onlineItemCost(item, online) : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => {
    if (!resolved) return;
    setDraft(String(resolved.pricePerPackage));
    setEditing(true);
  };

  const save = async () => {
    const value = parseFloat(draft.replace(',', '.'));
    if (item.productKey && Number.isFinite(value) && value >= 0) {
      await setPackagePriceOverride(item.productKey, value, engine);
    }
    setEditing(false);
  };

  return (
    <li className={`flex items-center gap-3 p-3 ${item.isChecked ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={item.isChecked}
        onChange={onToggleCheck}
        aria-label={`${item.name} abhaken`}
        className="h-5 w-5 shrink-0 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
      />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-slate-800 ${item.isChecked ? 'line-through' : ''}`}>
          {item.name}
          {item.isPantry && <span className="ml-2 text-xs text-slate-400">Vorrat</span>}
        </div>
        <div className="text-xs text-slate-400">
          {formatAmountShort(item.totalAmount)} {item.unit}
          {resolved && (
            <>
              {' · '}
              {editing ? (
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft}
                  autoFocus
                  aria-label={`Packungspreis ${item.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void save()}
                  onKeyDown={(e) => e.key === 'Enter' && void save()}
                  className="w-16 rounded border border-brand-300 px-1 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="underline decoration-dotted"
                  aria-label={`Preis von ${item.name} bearbeiten`}
                >
                  {formatPrice(resolved.pricePerPackage, currency)}/Pkg
                  {resolved.source === 'manual' && ' ✎'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-sm font-semibold text-slate-900">
          {item.estimatedPrice != null ? (
            `≈ ${formatPrice(item.estimatedPrice, currency)}`
          ) : onlineCost != null ? (
            <span title={online?.source === 'ai' ? 'KI-Schätzung' : 'Online-Schätzung (Open Prices)'}>
              ≈ {formatPrice(onlineCost, currency)}
              <span className="ml-1 text-[10px] font-normal text-sky-500">
                {online?.source === 'ai' ? 'KI' : 'online'}
              </span>
            </span>
          ) : (
            '—'
          )}
        </div>
        <button
          type="button"
          onClick={onTogglePantry}
          className="text-xs text-slate-400 hover:text-brand-600"
        >
          {item.isPantry ? 'einkaufen' : 'hab ich'}
        </button>
      </div>
    </li>
  );
}

function formatAmountShort(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}
