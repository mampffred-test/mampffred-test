export type UnitKey =
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'cl'
  | 'dl'
  | 'el'
  | 'tl'
  | 'msp'
  | 'prise'
  | 'stueck'
  | 'scheibe'
  | 'zehe'
  | 'bund'
  | 'dose'
  | 'packung'
  | 'becher'
  | 'glas'
  | 'tasse'
  | 'handvoll'
  | 'spritzer'
  | 'schuss'
  | 'zweig'
  | 'blatt'
  | 'wuerfel'
  | 'knolle'
  | 'kopf'
  | 'stange'
  | 'schale'
  | 'beutel'
  | 'flasche'
  | 'rolle'
  | 'tube'
  | 'topf'
  | 'netz'
  | 'tafel';

type UnitInfo = { singular: string; plural: string; aliases: string[] };

const UNITS: Record<UnitKey, UnitInfo> = {
  g: { singular: 'g', plural: 'g', aliases: ['gramm', 'gr'] },
  kg: { singular: 'kg', plural: 'kg', aliases: ['kilogramm', 'kilo'] },
  ml: { singular: 'ml', plural: 'ml', aliases: ['milliliter'] },
  l: { singular: 'l', plural: 'l', aliases: ['liter', 'ltr'] },
  cl: { singular: 'cl', plural: 'cl', aliases: ['zentiliter'] },
  dl: { singular: 'dl', plural: 'dl', aliases: ['deziliter'] },
  el: { singular: 'EL', plural: 'EL', aliases: ['essloffel', 'essloeffel'] },
  tl: { singular: 'TL', plural: 'TL', aliases: ['teeloffel', 'teeloeffel'] },
  msp: {
    singular: 'Msp.',
    plural: 'Msp.',
    aliases: ['messerspitze', 'messerspitzen'],
  },
  prise: { singular: 'Prise', plural: 'Prisen', aliases: [] },
  stueck: {
    singular: 'Stück',
    plural: 'Stück',
    aliases: ['stuck', 'stk', 'stucke'],
  },
  scheibe: { singular: 'Scheibe', plural: 'Scheiben', aliases: [] },
  zehe: { singular: 'Zehe', plural: 'Zehen', aliases: [] },
  bund: { singular: 'Bund', plural: 'Bund', aliases: ['bunde'] },
  dose: { singular: 'Dose', plural: 'Dosen', aliases: [] },
  packung: {
    singular: 'Packung',
    plural: 'Packungen',
    aliases: ['pck', 'pkg', 'packchen', 'paeckchen', 'pack'],
  },
  becher: { singular: 'Becher', plural: 'Becher', aliases: [] },
  glas: { singular: 'Glas', plural: 'Gläser', aliases: [] },
  tasse: { singular: 'Tasse', plural: 'Tassen', aliases: [] },
  handvoll: {
    singular: 'Handvoll',
    plural: 'Handvoll',
    aliases: ['hand voll'],
  },
  spritzer: { singular: 'Spritzer', plural: 'Spritzer', aliases: [] },
  schuss: { singular: 'Schuss', plural: 'Schuss', aliases: [] },
  zweig: { singular: 'Zweig', plural: 'Zweige', aliases: [] },
  blatt: { singular: 'Blatt', plural: 'Blätter', aliases: [] },
  wuerfel: { singular: 'Würfel', plural: 'Würfel', aliases: [] },
  knolle: { singular: 'Knolle', plural: 'Knollen', aliases: [] },
  kopf: { singular: 'Kopf', plural: 'Köpfe', aliases: [] },
  stange: { singular: 'Stange', plural: 'Stangen', aliases: [] },
  schale: { singular: 'Schale', plural: 'Schalen', aliases: [] },
  beutel: { singular: 'Beutel', plural: 'Beutel', aliases: [] },
  flasche: { singular: 'Flasche', plural: 'Flaschen', aliases: [] },
  rolle: { singular: 'Rolle', plural: 'Rollen', aliases: [] },
  tube: { singular: 'Tube', plural: 'Tuben', aliases: [] },
  topf: { singular: 'Topf', plural: 'Töpfe', aliases: [] },
  netz: { singular: 'Netz', plural: 'Netze', aliases: [] },
  tafel: { singular: 'Tafel', plural: 'Tafeln', aliases: [] },
};

/** Folds umlauts and punctuation so "Stück", "Stk." and "stueck" compare equal. */
export function foldUnitText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/[.]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const unitIndex = new Map<string, UnitKey>();
for (const [key, info] of Object.entries(UNITS) as Array<[UnitKey, UnitInfo]>) {
  for (const label of [key, info.singular, info.plural, ...info.aliases])
    unitIndex.set(foldUnitText(label), key);
}

/**
 * Canonical key of a unit text. Empty text is the empty unit ('');
 * unknown units return undefined so callers can keep them as free text.
 */
export function canonicalUnit(value: string): UnitKey | '' | undefined {
  const folded = foldUnitText(value);
  if (!folded) return '';
  return unitIndex.get(folded) ?? unitIndex.get(folded.replace(/ /g, ''));
}

export function isUnitKey(value: string): value is UnitKey {
  return Object.hasOwn(UNITS, value);
}

/** Display label for a unit key, singular for amounts up to one. */
export function unitLabel(unit: UnitKey, amount = 1) {
  const info = UNITS[unit];
  return amount > 1 + 1e-9 ? info.plural : info.singular;
}

/** Millilitres per household volume unit. */
export const VOLUME_ML: Partial<Record<UnitKey, number>> = {
  ml: 1,
  l: 1_000,
  cl: 10,
  dl: 100,
  el: 15,
  tl: 5,
  tasse: 200,
};

export const MASS_G: Partial<Record<UnitKey, number>> = {
  g: 1,
  kg: 1_000,
};
