/**
 * Parst die menschlichen Grammatur-Strings der Quellen (z. B. REWE) in eine
 * Basiseinheit: Masse -> g, Volumen -> ml, Stück -> stück.
 * Beispiele: "500g (1 kg = 1,98 €)", "1kg", "185ml", "0,50l", "4x150g",
 *            "1 Stück ca. 320 g", "10 Stück", "1,5 l".
 * Gibt null zurück, wenn nichts Sinnvolles erkennbar ist.
 */
export type BaseUnit = 'g' | 'ml' | 'stück';

export interface ParsedPackage {
  size: number; // in Basiseinheit
  unit: BaseUnit;
}

const num = (s: string): number => parseFloat(s.replace(',', '.'));

/** Wandelt einen Wert+Einheit in die Basiseinheit (g/ml/stück). */
function toBase(value: number, rawUnit: string): ParsedPackage | null {
  const u = rawUnit.toLowerCase();
  if (u === 'kg') return { size: value * 1000, unit: 'g' };
  if (u === 'g' || u === 'gr' || u === 'gramm') return { size: value, unit: 'g' };
  if (u === 'l' || u === 'liter') return { size: value * 1000, unit: 'ml' };
  if (u === 'ml') return { size: value, unit: 'ml' };
  if (u === 'cl') return { size: value * 10, unit: 'ml' };
  if (/^(st|stk|stück|stueck)/.test(u)) return { size: value, unit: 'stück' };
  return null;
}

export function parseGrammage(raw: string): ParsedPackage | null {
  if (!raw) return null;
  // Grundpreis-Zusatz "(1 kg = 1,98 €)" etc. entfernen.
  const s = raw.replace(/\([^)]*\)/g, ' ').trim();

  // Explizite Masse/Volumen bevorzugen (auch bei "1 Stück ca. 320 g").
  // Multipack "4x150g" -> 600 g.
  const multi = s.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramm|l|liter|ml|cl)\b/i);
  if (multi) {
    const base = toBase(num(multi[2]), multi[3]);
    if (base) return { size: Math.round(base.size * parseInt(multi[1], 10) * 100) / 100, unit: base.unit };
  }

  const caMass = s.match(/(?:ca\.?\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramm|l|liter|ml|cl)\b/i);
  if (caMass) {
    const base = toBase(num(caMass[1]), caMass[2]);
    if (base) return { size: Math.round(base.size * 100) / 100, unit: base.unit };
  }

  // Stückzahl ("10 Stück", "1 Bund", "1 St").
  const stk = s.match(/(\d+)\s*(stück|stueck|stk|st|bund)\b/i);
  if (stk) return { size: parseInt(stk[1], 10), unit: 'stück' };

  return null;
}
