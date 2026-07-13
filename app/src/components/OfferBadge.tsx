/** Kennzeichnet einen aktuellen Angebotspreis (grün). */
export default function OfferBadge({ validUntil, className = '' }: { validUntil?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ${className}`}
      title={validUntil ? `Angebot gültig bis ${validUntil}` : 'Aktueller Angebotspreis'}
    >
      🏷️ Angebot
    </span>
  );
}
