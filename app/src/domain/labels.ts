import type { Allergy, Appliance, Diet } from './enums';

/** Menschenlesbare Labels für Diäten, Allergien, Geräte (UI-weit genutzt). */
export const DIET_LABELS: Record<Diet, string> = {
  omnivor: 'Omnivor',
  vegetarisch: 'Vegetarisch',
  vegan: 'Vegan',
  pescetarisch: 'Pescetarisch',
};

export const ALLERGY_LABELS: Record<Allergy, string> = {
  gluten: 'Gluten',
  laktose: 'Laktose',
  nüsse: 'Nüsse',
  erdnüsse: 'Erdnüsse',
  ei: 'Ei',
  soja: 'Soja',
  fisch: 'Fisch',
  schalentiere: 'Schalentiere',
  sellerie: 'Sellerie',
  senf: 'Senf',
  sesam: 'Sesam',
};

export const APPLIANCE_LABELS: Record<Appliance, string> = {
  herd: 'Herd',
  backofen: 'Backofen',
  mikrowelle: 'Mikrowelle',
  airfryer: 'Airfryer',
  mixer: 'Mixer',
  pürierstab: 'Pürierstab',
  toaster: 'Toaster',
  wasserkocher: 'Wasserkocher',
};

/** Options-Helfer für Chip-Auswahlen. */
export function toOptions<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((v) => ({ value: v, label: labels[v] }));
}
