/** Formatiert eine Menge hübsch: max. 2 Nachkommastellen, ohne unnötige Nullen. */
export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded
    .toLocaleString('de-DE', { maximumFractionDigits: 2 })
    .replace(/ /g, ' ');
}

/** Skaliert eine Menge um den Portionsfaktor. */
export function scaleAmount(amount: number, factor: number): number {
  return amount * factor;
}
