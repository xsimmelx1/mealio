import { useState } from 'react';
import ChipMultiSelect from '../components/forms/ChipMultiSelect';
import ChipSingleSelect from '../components/forms/ChipSingleSelect';
import NumberStepper from '../components/forms/NumberStepper';
import TagInput from '../components/forms/TagInput';
import Toggle from '../components/forms/Toggle';
import ScreenHeader from '../components/ScreenHeader';
import {
  ALLERGIES,
  APPLIANCES,
  CURRENCIES,
  DIETS,
  MEAL_STYLES,
  MEAL_STYLE_LABELS,
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
} from '../domain/enums';
import { ALLERGY_LABELS, APPLIANCE_LABELS, DIET_LABELS, toOptions } from '../domain/labels';
import { resetPriceOverrides } from '../db/priceActions';
import { WEEKDAY_LABELS } from '../plan/week';
import { usePrefsStore } from '../state/prefsStore';

const DAY_OPTIONS = WEEKDAY_LABELS.map((label, i) => ({ value: String(i), label }));

export default function SettingsView() {
  const prefs = usePrefsStore((s) => s.prefs);
  const update = usePrefsStore((s) => s.update);
  const [resetDone, setResetDone] = useState(false);

  const toggleIn = <T extends string>(list: readonly T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader title="Einstellungen" subtitle="Präferenzen, Preise, Über" />

      {/* Haushalt */}
      <Section title="Haushalt">
        <Row label="Personen">
          <NumberStepper
            value={prefs.numberOfPeople}
            onChange={(v) => void update({ numberOfPeople: v })}
            min={1}
            max={12}
            ariaLabel="Personenzahl"
          />
        </Row>
        <Row label="Wochenbudget">
          <NumberStepper
            value={prefs.budget}
            onChange={(v) => void update({ budget: v })}
            min={0}
            max={500}
            step={5}
            suffix={prefs.currency}
            ariaLabel="Wochenbudget"
          />
        </Row>
        <Field label="Währung">
          <ChipSingleSelect
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            value={prefs.currency}
            onChange={(v) => void update({ currency: v })}
            ariaLabel="Währung"
          />
        </Field>
      </Section>

      {/* Planung */}
      <Section title="Planung">
        <Field label="Wochentage">
          <ChipMultiSelect
            options={DAY_OPTIONS}
            selected={prefs.planDays.map(String)}
            onToggle={(v) =>
              void update({
                planDays: prefs.planDays.includes(Number(v))
                  ? prefs.planDays.filter((d) => d !== Number(v))
                  : [...prefs.planDays, Number(v)],
              })
            }
            ariaLabel="Wochentage"
          />
        </Field>
        <Field label="Mahlzeiten pro Tag">
          <ChipMultiSelect
            options={toOptions(MEAL_TYPES, MEAL_TYPE_LABELS)}
            selected={prefs.mealTypes}
            onToggle={(v) => void update({ mealTypes: toggleIn(prefs.mealTypes, v) })}
            ariaLabel="Mahlzeiten"
          />
        </Field>
      </Section>

      {/* Ernährung */}
      <Section title="Ernährung">
        <Field label="Ernährungsform">
          <ChipSingleSelect
            options={toOptions(DIETS, DIET_LABELS)}
            value={prefs.diet}
            onChange={(v) => void update({ diet: v })}
            ariaLabel="Ernährungsform"
          />
        </Field>
        <Field label="Allergien">
          <ChipMultiSelect
            options={toOptions(ALLERGIES, ALLERGY_LABELS)}
            selected={prefs.allergies}
            onToggle={(v) => void update({ allergies: toggleIn(prefs.allergies, v) })}
            ariaLabel="Allergien"
          />
        </Field>
        <Field label="Ungeliebte Zutaten">
          <TagInput
            tags={prefs.avoidedIngredients}
            onChange={(t) => void update({ avoidedIngredients: t })}
            placeholder="z. B. koriander"
            ariaLabel="Ungeliebte Zutat"
          />
        </Field>
        <Field label="Bevorzugte Stile">
          <ChipMultiSelect
            options={toOptions(MEAL_STYLES, MEAL_STYLE_LABELS)}
            selected={prefs.preferredStyles}
            onToggle={(v) => void update({ preferredStyles: toggleIn(prefs.preferredStyles, v) })}
            ariaLabel="Bevorzugte Meal-Styles"
          />
        </Field>
        <Field label="Küchengeräte">
          <ChipMultiSelect
            options={toOptions(APPLIANCES, APPLIANCE_LABELS)}
            selected={prefs.appliances}
            onToggle={(v) => void update({ appliances: toggleIn(prefs.appliances, v) })}
            ariaLabel="Küchengeräte"
          />
        </Field>
      </Section>

      {/* Experimentell */}
      <Section title="Experimentell">
        <Toggle
          label="KI-Rezepte"
          description="Rezepte per KI generieren (online). Sonst geprüfter Katalog."
          checked={prefs.aiRecipesEnabled}
          onChange={(v) => void update({ aiRecipesEnabled: v })}
        />
        <Toggle
          label="Online-Preise"
          description="Preisschätzungen aus offenen Quellen (experimentell)."
          checked={prefs.onlinePricesEnabled}
          onChange={(v) => void update({ onlinePricesEnabled: v })}
        />
      </Section>

      {/* Daten */}
      <Section title="Preise & Daten">
        <button
          type="button"
          onClick={async () => {
            await resetPriceOverrides();
            setResetDone(true);
          }}
          className="rounded-full px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 active:scale-95"
        >
          Manuelle Preise zurücksetzen
        </button>
        {resetDone && <p className="text-xs text-emerald-600">Zurückgesetzt.</p>}
      </Section>

      {/* Über / Disclaimer */}
      <Section title="Über Mealio">
        <p className="text-xs leading-relaxed text-slate-500">
          <strong className="text-slate-600">Hinweis:</strong> Rezepte sind teils KI-generiert.
          Zutaten, Allergene, Nährwerte, Preise und Garanweisungen bitte vor dem Kochen/Einkauf
          selbst prüfen. Keine medizinische oder ernährungsberatende Zusage. Preise sind
          Schätzwerte (Stand Mitte 2026) und können regional/zeitlich abweichen.
        </p>

        <div>
          <h3 className="mb-1 text-xs font-semibold text-slate-600">Datenquellen & Lizenzen</h3>
          <ul className="flex flex-col gap-1 text-xs text-slate-500">
            {ATTRIBUTIONS.map((a) => (
              <li key={a.name}>
                <span className="font-medium text-slate-600">{a.name}</span> — {a.license}
                <br />
                <span className="text-slate-400">{a.note}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            Nährwert-, Rezept- und Preis-Seed-Daten sind eigene, geprüfte Schätzwerte. Online
            abgerufene Open-Food-Facts-/Open-Prices-Daten unterliegen der ODbL (Namensnennung &
            Share-Alike). Eigener Arbeitsname „Mealio" — keine fremden Marken.
          </p>
        </div>
      </Section>
    </div>
  );
}

const ATTRIBUTIONS: { name: string; license: string; note: string }[] = [
  {
    name: 'USDA FoodData Central',
    license: 'Public Domain',
    note: 'Nährwertdaten (online, opt-in).',
  },
  {
    name: 'Open Food Facts',
    license: 'ODbL',
    note: 'Nährwerte ergänzend (online, opt-in).',
  },
  {
    name: 'Open Food Facts — Open Prices',
    license: 'ODbL',
    note: 'Online-Preisschätzungen (opt-in).',
  },
  {
    name: 'Wikibooks Cookbook',
    license: 'CC BY-SA',
    note: 'Als Struktur-/Ideenvorlage; ausgelieferte Rezepte sind eigen/geprüft.',
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-brand-500">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </div>
  );
}
