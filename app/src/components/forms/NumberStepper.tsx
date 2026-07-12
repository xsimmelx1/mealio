/** Plus/Minus-Stepper für ganzzahlige Werte (Personen, Budget-Schritte). */
export default function NumberStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  suffix,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  ariaLabel?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <div className="inline-flex items-center gap-4" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} verringern` : 'Verringern'}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="h-11 w-11 rounded-full bg-white text-xl font-bold text-brand-600 shadow-sm ring-1 ring-slate-200 active:scale-95 disabled:opacity-40"
      >
        −
      </button>
      <span className="min-w-16 text-center text-2xl font-bold tabular-nums text-slate-900">
        {value}
        {suffix ? <span className="ml-1 text-base font-medium text-slate-500">{suffix}</span> : null}
      </span>
      <button
        type="button"
        aria-label={ariaLabel ? `${ariaLabel} erhöhen` : 'Erhöhen'}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="h-11 w-11 rounded-full bg-white text-xl font-bold text-brand-600 shadow-sm ring-1 ring-slate-200 active:scale-95 disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
