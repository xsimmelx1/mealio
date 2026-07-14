import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import { loadSeedPrices } from '../db/seed';
import { storeTypeFor, type ProductFlag } from '../domain/enums';
import { usePrefsStore } from '../state/prefsStore';
import { buildAiEngineMap } from './aiPrices';
import { PriceEngine } from './priceEngine';

/**
 * Wie {@link usePriceEngine}, aber mit explizit übergebenem Supermarkt und zusätzlichen
 * Label-Flags — für Ansichten, die das Rezept LOKAL für einen gewählten Markt / Bio
 * neu bepreisen, ohne die globalen Prefs zu ändern. Overrides + KI-Preise kommen weiterhin
 * live aus Dexie. Der Default-Wert von `storeId`/`extraFlags` sollte aus den Prefs stammen.
 */
export function useLocalPriceEngine(storeId: string, extraFlags: ProductFlag[] = []): PriceEngine {
  const prefsFlags = usePrefsStore((s) => s.prefs.preferredProductFlags);
  const overrides = useLiveQuery(() => db.priceOverrides.toArray(), [], []);
  const aiEntries = useLiveQuery(() => db.aiPrices.toArray(), [], []);
  // Flags stabil serialisieren, damit useMemo nicht bei jeder Render-Identität neu baut.
  const flagsKey = [...new Set([...prefsFlags, ...extraFlags])].sort().join(',');
  return useMemo(
    () => {
      const preferredProductFlags = flagsKey ? (flagsKey.split(',') as ProductFlag[]) : [];
      return new PriceEngine(loadSeedPrices(), overrides ?? [], {
        preferredStore: storeId,
        preferredStoreType: storeTypeFor(storeId) ?? undefined,
        aiPrices: buildAiEngineMap(aiEntries ?? []),
        preferredProductFlags,
      });
    },
    [overrides, aiEntries, storeId, flagsKey],
  );
}
