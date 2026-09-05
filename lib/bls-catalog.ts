import rawCatalog from './data/bls-4.0.min.json' with { type: 'json' };
import type { FoodReference } from './food-nutrition.ts';

export const BLS_MANIFEST = {
  dataset: 'BLS',
  version: '4.0',
  releaseYear: 2025,
  license: 'CC BY 4.0',
  attribution:
    'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank.',
  doi: 'https://doi.org/10.25826/Data20251217-134202-0',
  sourceUrl: 'https://blsdb.de/download',
  sourceSha256:
    '12b7a6ba62807ec9b301eb276f897dc85f99b2292311618dec3749a12d984c91',
  runtimeSha256:
    'e95695243c7f593d6ddcaa4b819680a93c9788a933ac4887b8623c91a1dee50a',
} as const;

const aliasesByCode: Record<string, string[]> = {
  C133000: ['Haferflocken'],
  C352000: ['Reis', 'weißer Reis', 'Langkornreis'],
  C660000: ['Haferdrink', 'Hafermilch'],
  E111100: ['Ei', 'Eier', 'Hühnerei'],
  F110100: ['Apfel', 'Äpfel'],
  F503100: ['Banane', 'Bananen'],
  F601100: ['Zitrone', 'Zitronen'],
  F602100: ['Limette', 'Limetten'],
  G061000: ['Basilikum'],
  G211100: ['Spinat'],
  G312100: ['Brokkoli', 'Broccoli'],
  G480100: ['Zwiebel', 'Zwiebeln', 'Speisezwiebel'],
  G490100: ['Knoblauch'],
  G520100: ['Gurke', 'Salatgurke'],
  G543100: ['Paprika', 'rote Paprika'],
  G570902: ['Mais', 'Dosenmais'],
  G561100: ['Tomate', 'Tomaten'],
  G582100: ['Zucchini'],
  G620100: ['Karotte', 'Karotten', 'Möhre', 'Möhren'],
  H154000: ['Kokosmilch'],
  H725100: ['Linsen', 'Linse', 'braune Linsen'],
  H730000: ['Rote Linse', 'Rote Linsen'],
  H742902: ['Kidneybohnen', 'Kidneybohne'],
  H861000: ['Tofu'],
  K110100: ['Kartoffel', 'Kartoffeln'],
  K701100: ['Champignon', 'Champignons'],
  M012200: ['Feta', 'Schafskäse'],
  M032100: ['Mozzarella'],
  M111300: ['Vollmilch', 'Milch'],
  M173900: ['Schlagsahne', 'Sahne'],
  M306400: ['Parmesan'],
  M402600: ['Gouda'],
  Q120000: ['Olivenöl'],
  Q611000: ['Butter'],
  S111000: ['Zucker'],
  S120000: ['Honig'],
  V416100: ['Hähnchenbrust', 'Hähnchenbrustfilet'],
};

type CompactFood = [
  code: string,
  name: string,
  energyKcal: number | null,
  proteinG: number | null,
  fatG: number | null,
  carbohydratesG: number | null,
  fiberG: number | null,
  sugarG: number | null,
  saltG: number | null,
];

const nutrientKeys = [
  'energyKcal',
  'proteinG',
  'fatG',
  'carbohydratesG',
  'fiberG',
  'sugarG',
  'saltG',
] as const;

function toFood(row: CompactFood): FoodReference {
  const [code, name, ...values] = row;
  const nutrientsPer100g = Object.fromEntries(
    nutrientKeys.flatMap((key, index) => {
      const value = values[index];
      return value === null ? [] : [[key, value]];
    }),
  );
  return {
    id: `bls-4.0:${code}`,
    name,
    aliases: aliasesByCode[code] ?? [],
    source: { dataset: 'BLS', version: '4.0', recordId: code },
    nutrientsPer100g,
  };
}

if (rawCatalog.schemaVersion !== 1 || rawCatalog.foods.length !== 7_140)
  throw new Error('INVALID_BLS_CATALOG');

export const blsCatalog: readonly FoodReference[] = (
  rawCatalog.foods as CompactFood[]
).map(toFood);
