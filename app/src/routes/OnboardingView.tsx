import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChipMultiSelect from '../components/forms/ChipMultiSelect';
import ChipSingleSelect from '../components/forms/ChipSingleSelect';
import NumberStepper from '../components/forms/NumberStepper';
import TagInput from '../components/forms/TagInput';
import {
  ALLERGIES,
  APPLIANCES,
  CURRENCIES,
  DIETS,
  MEAL_STYLES,
  MEAL_STYLE_LABELS,
  type Allergy,
  type Appliance,
  type Currency,
  type Diet,
  type MealStyle,
} from '../domain/enums';
import { ALLERGY_LABELS, APPLIANCE_LABELS, DIET_LABELS, toOptions } from '../domain/labels';
import { usePrefsStore } from '../state/prefsStore';

const STEP_COUNT = 7;

export default function OnboardingView() {
  const navigate = useNavigate();
  const prefs = usePrefsStore((s) => s.prefs);
  const updatePrefs = usePrefsStore((s) => s.update);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Lokaler Entwurf, initialisiert aus den bestehenden Prefs.
  const [numberOfPeople, setNumberOfPeople] = useState(prefs.numberOfPeople);
  const [budget, setBudget] = useState(prefs.budget);
  const [currency, setCurrency] = useState<Currency>(prefs.currency);
  const [supermarket, setSupermarket] = useState(prefs.supermarket);
  const [region, setRegion] = useState(prefs.region);
  const [diet, setDiet] = useState<Diet>(prefs.diet);
  const [allergies, setAllergies] = useState<Allergy[]>(prefs.allergies);
  const [avoided, setAvoided] = useState<string[]>(prefs.avoidedIngredients);
  const [styles, setStyles] = useState<MealStyle[]>(prefs.preferredStyles);
  const [appliances, setAppliances] = useState<Appliance[]>(prefs.appliances);

  const toggle = <T extends string>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const finish = async (skipped = false) => {
    setSaving(true);
    try {
      if (skipped) {
        await updatePrefs({ onboardingComplete: true });
      } else {
        await updatePrefs({
          numberOfPeople,
          budget,
          currency,
          supermarket,
          region,
          diet,
          allergies,
          avoidedIngredients: avoided,
          preferredStyles: styles,
          appliances,
          onboardingComplete: true,
        });
      }
      navigate('/plan', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const next = () => (step < STEP_COUNT - 1 ? setStep((s) => s + 1) : finish());
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="mx-auto flex min-h-full max-w-app flex-col bg-cream px-6 pb-8 pt-6">
      {/* Kopf: Fortschritt + Überspringen */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => finish(true)}
          disabled={saving}
          className="text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          Überspringen
        </button>
      </div>

      <div className="flex-1">
        <p className="mb-1 text-sm font-medium text-brand-500">
          Schritt {step + 1} von {STEP_COUNT}
        </p>

        {step === 0 && (
          <StepShell
            emoji="👋"
            title="Willkommen bei Mealio"
            hint="Wie viele Personen kochst du und was ist dein Wochenbudget? Alles später änderbar."
          >
            <Field label="Personen">
              <NumberStepper
                value={numberOfPeople}
                onChange={setNumberOfPeople}
                min={1}
                max={12}
                ariaLabel="Personenzahl"
              />
            </Field>
            <Field label="Wochenbudget">
              <div className="flex items-center gap-4">
                <NumberStepper
                  value={budget}
                  onChange={setBudget}
                  min={0}
                  max={500}
                  step={5}
                  suffix={currency}
                  ariaLabel="Wochenbudget"
                />
              </div>
            </Field>
            <Field label="Währung">
              <ChipSingleSelect
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={currency}
                onChange={setCurrency}
                ariaLabel="Währung"
              />
            </Field>
          </StepShell>
        )}

        {step === 1 && (
          <StepShell
            emoji="🛒"
            title="Wo kaufst du ein?"
            hint="Für passende Preisschätzungen. Optional."
          >
            <Field label="Supermarkt">
              <TextField
                value={supermarket}
                onChange={setSupermarket}
                placeholder="z. B. Aldi, Rewe, Edeka …"
                ariaLabel="Supermarkt"
              />
            </Field>
            <Field label="Region / PLZ">
              <TextField
                value={region}
                onChange={setRegion}
                placeholder="z. B. 10115 oder Berlin"
                ariaLabel="Region oder Postleitzahl"
              />
            </Field>
          </StepShell>
        )}

        {step === 2 && (
          <StepShell emoji="🥗" title="Ernährungsform" hint="Wähle, wie du dich ernährst.">
            <ChipSingleSelect
              options={toOptions(DIETS, DIET_LABELS)}
              value={diet}
              onChange={setDiet}
              ariaLabel="Ernährungsform"
            />
          </StepShell>
        )}

        {step === 3 && (
          <StepShell
            emoji="⚠️"
            title="Allergien"
            hint="Diese Zutaten werden in generierten Rezepten vermieden."
          >
            <ChipMultiSelect
              options={toOptions(ALLERGIES, ALLERGY_LABELS)}
              selected={allergies}
              onToggle={(v) => toggle(allergies, v, setAllergies)}
              ariaLabel="Allergien"
            />
          </StepShell>
        )}

        {step === 4 && (
          <StepShell
            emoji="🙅"
            title="Ungeliebte Zutaten"
            hint="Zutaten, die du nicht magst. Enter oder Komma zum Hinzufügen."
          >
            <TagInput
              tags={avoided}
              onChange={setAvoided}
              placeholder="z. B. koriander"
              ariaLabel="Ungeliebte Zutat hinzufügen"
            />
          </StepShell>
        )}

        {step === 5 && (
          <StepShell
            emoji="✨"
            title="Bevorzugte Stile"
            hint="Woran orientieren sich deine Pläne?"
          >
            <ChipMultiSelect
              options={toOptions(MEAL_STYLES, MEAL_STYLE_LABELS)}
              selected={styles}
              onToggle={(v) => toggle(styles, v, setStyles)}
              ariaLabel="Bevorzugte Meal-Styles"
            />
          </StepShell>
        )}

        {step === 6 && (
          <StepShell
            emoji="🍳"
            title="Küchengeräte"
            hint="Nur Rezepte, die zu deiner Ausstattung passen."
          >
            <ChipMultiSelect
              options={toOptions(APPLIANCES, APPLIANCE_LABELS)}
              selected={appliances}
              onToggle={(v) => toggle(appliances, v, setAppliances)}
              ariaLabel="Küchengeräte"
            />
          </StepShell>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={back}
            disabled={saving}
            className="rounded-full px-5 py-3 font-semibold text-slate-600 ring-1 ring-slate-200 active:scale-95"
          >
            Zurück
          </button>
        )}
        <button
          type="button"
          onClick={next}
          disabled={saving}
          className="flex-1 rounded-full bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm active:scale-95 disabled:opacity-60"
        >
          {step < STEP_COUNT - 1 ? 'Weiter' : saving ? 'Speichern …' : 'Fertig'}
        </button>
      </div>
    </div>
  );
}

function StepShell({
  emoji,
  title,
  hint,
  children,
}: {
  emoji: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">{hint}</p>
      <div className="flex flex-col gap-6">{children}</div>
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

function TextField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
    />
  );
}
