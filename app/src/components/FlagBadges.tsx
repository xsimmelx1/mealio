import { PRODUCT_FLAG_ICON, type ProductFlag } from '../domain/enums';
import { PRODUCT_FLAG_LABELS } from '../domain/labels';

/** Kleine Badges für Produkt-Eigenschaften (Bio/Fairtrade/Vegan/Regional). */
export default function FlagBadges({
  flags,
  compact = false,
  className = '',
}: {
  flags?: ProductFlag[];
  /** Nur Icons (für enge Tabellenzellen). */
  compact?: boolean;
  className?: string;
}) {
  if (!flags || flags.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {flags.map((f) =>
        compact ? (
          <span key={f} title={PRODUCT_FLAG_LABELS[f]} aria-label={PRODUCT_FLAG_LABELS[f]}>
            {PRODUCT_FLAG_ICON[f]}
          </span>
        ) : (
          <span
            key={f}
            className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
          >
            {PRODUCT_FLAG_ICON[f]} {PRODUCT_FLAG_LABELS[f]}
          </span>
        ),
      )}
    </span>
  );
}
