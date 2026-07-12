interface Option<T extends string> {
  value: T;
  label: string;
}

/** Touch-freundliche Mehrfachauswahl als „Chips". */
export default function ChipMultiSelect<T extends string>({
  options,
  selected,
  onToggle,
  ariaLabel,
}: {
  options: readonly Option<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(opt.value)}
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
