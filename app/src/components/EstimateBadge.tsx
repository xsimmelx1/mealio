/**
 * Kennzeichnet einen Wert als Schätzung. Leitprinzip: Preise sind immer als
 * Schätzwerte erkennbar ("geschätzt · Quelle · Datum").
 */
export default function EstimateBadge({
  source,
  className = '',
}: {
  source?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ${className}`}
      title="Preise sind Schätzwerte und können abweichen. Vor dem Einkauf prüfen."
    >
      ≈ geschätzt{source ? ` · ${source}` : ''}
    </span>
  );
}
