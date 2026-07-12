interface Option<T extends string> {
  value: T;
  label: string;
}

/** Touch-freundliche Einfachauswahl als „Chips". */
export default function ChipSingleSelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition active:scale-95 ${
              active
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-slate-200'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
