import { useState, type KeyboardEvent } from 'react';

/** Freitext-Tags (z. B. ungeliebte Zutaten). Enter/Komma fügt hinzu. */
export default function TagInput({
  tags,
  onChange,
  placeholder,
  ariaLabel,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    if (!tags.includes(value)) onChange([...tags, value]);
    setDraft('');
  };

  const remove = (value: string) => onChange(tags.filter((t) => t !== value));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length) {
      remove(tags[tags.length - 1]);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-800"
          >
            {tag}
            <button
              type="button"
              aria-label={`${tag} entfernen`}
              onClick={() => remove(tag)}
              className="text-brand-500 hover:text-brand-700"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
      />
    </div>
  );
}
