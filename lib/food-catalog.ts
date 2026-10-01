import { BLS_MANIFEST } from './bls-manifest.ts';
import catalogNutrients from './data/food-catalog-nutrients.json' with { type: 'json' };
import {
  FOOD_CATALOG,
  FOOD_CATALOG_VERSION,
  type AisleId,
  type CatalogEntry,
} from './food-catalog-data.ts';
import type { FoodReference } from './food-nutrition.ts';
import type { NutrientKey } from './model.ts';
import { canonicalUnit, MASS_G, VOLUME_ML, type UnitKey } from './units.ts';

export type {
  AisleId,
  CatalogEntry as CatalogFood,
} from './food-catalog-data.ts';

export const CATALOG_ID_PREFIX = 'mf:';

export const AISLES: ReadonlyArray<{ id: AisleId; label: string }> = [
  { id: 'obst-gemuese', label: 'Obst & Gemüse' },
  { id: 'brot', label: 'Brot & Backwaren' },
  { id: 'kuehlregal', label: 'Milch & Kühlregal' },
  { id: 'fleisch-fisch', label: 'Fleisch & Fisch' },
  { id: 'veggie', label: 'Tofu & Veggie' },
  { id: 'trocken', label: 'Nudeln, Reis & Getreide' },
  { id: 'konserven', label: 'Konserven & Gläser' },
  { id: 'backen', label: 'Backzutaten' },
  { id: 'wuerzen', label: 'Öl, Gewürze & Saucen' },
  { id: 'fruehstueck', label: 'Frühstück, Nüsse & Süßes' },
  { id: 'tiefkuehl', label: 'Tiefkühl' },
  { id: 'getraenke', label: 'Getränke' },
  { id: 'drogerie', label: 'Drogerie & Haushalt' },
  { id: 'sonstiges', label: 'Sonstiges' },
];

export const catalogFoods: readonly CatalogEntry[] = FOOD_CATALOG;

export const CATALOG_PANTRY_PRESET: readonly string[] = FOOD_CATALOG.filter(
  (food) => food.pantry === 'often',
).map((food) => food.id);

const byId = new Map(FOOD_CATALOG.map((food) => [food.id, food]));

/** Accepts a plain catalog id ("zwiebel") or a reference id ("mf:zwiebel"). */
export function catalogFoodById(id: string): CatalogEntry | undefined {
  return byId.get(
    id.startsWith(CATALOG_ID_PREFIX) ? id.slice(CATALOG_ID_PREFIX.length) : id,
  );
}

export function catalogReferenceId(food: Pick<CatalogEntry, 'id'>) {
  return `${CATALOG_ID_PREFIX}${food.id}`;
}

export function aisleLabel(id: AisleId) {
  return AISLES.find((aisle) => aisle.id === id)?.label ?? 'Sonstiges';
}

/** Grams of one purchasable pack, if the food is sold in packs. */
export function packGrams(food: CatalogEntry): number | undefined {
  const sell = food.sell;
  if (!sell || typeof sell !== 'object') return undefined;
  if (sell.g) return sell.g;
  if (sell.ml) return sell.ml * (food.density ?? 1);
  if (sell.pieces && food.g?.stueck) return sell.pieces * food.g.stueck;
  return undefined;
}

const DEFAULT_UNIT_GRAMS: Partial<Record<UnitKey, number>> = {
  prise: 0.5,
  msp: 0.3,
  handvoll: 30,
  spritzer: 1,
  schuss: 10,
};

export type GramConversion = { grams: number; quality: 'direct' | 'assumed' };

/** Converts an amount in any recipe unit to grams for one catalog food. */
export function foodGrams(
  food: CatalogEntry,
  amount: number,
  unitText: string,
): GramConversion | undefined {
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const parsed = canonicalUnit(unitText);
  if (parsed === undefined) return undefined;
  const unit: UnitKey = parsed === '' ? 'stueck' : parsed;
  const mass = MASS_G[unit];
  if (mass) return { grams: amount * mass, quality: 'direct' };
  const explicit = food.g?.[unit];
  if (explicit) return { grams: amount * explicit, quality: 'assumed' };
  if (typeof food.sell === 'object' && food.sell.unit === unit) {
    const pack = packGrams(food);
    if (pack) return { grams: amount * pack, quality: 'assumed' };
  }
  const millilitres = VOLUME_ML[unit];
  if (millilitres)
    return {
      grams: amount * millilitres * (food.density ?? 1),
      quality: 'assumed',
    };
  const fallback = DEFAULT_UNIT_GRAMS[unit];
  if (fallback) return { grams: amount * fallback, quality: 'assumed' };
  return undefined;
}

const NUTRIENT_ORDER: NutrientKey[] = [
  'energyKcal',
  'proteinG',
  'fatG',
  'carbohydratesG',
  'fiberG',
  'sugarG',
  'saltG',
];

let referencesCache: FoodReference[] | undefined;

/** Catalog foods that contribute nutrients, in the shared reference shape. */
export function catalogFoodReferences(): readonly FoodReference[] {
  if (referencesCache) return referencesCache;
  const table = catalogNutrients as Record<string, Array<number | null>>;
  referencesCache = FOOD_CATALOG.flatMap((food): FoodReference[] => {
    if (food.nutrition === false || !food.bls) return [];
    const row = table[food.bls];
    if (!row) return [];
    const nutrientsPer100g = Object.fromEntries(
      NUTRIENT_ORDER.flatMap((key, index) =>
        typeof row[index] === 'number' ? [[key, row[index]]] : [],
      ),
    );
    const pack = packGrams(food);
    return [
      {
        id: catalogReferenceId(food),
        name: food.name,
        aliases: [food.plural, ...(food.syn ?? [])].filter(
          (alias): alias is string => Boolean(alias),
        ),
        source: { dataset: 'BLS', version: '4.0', recordId: food.bls },
        nutrientsPer100g,
        densityGPerMl: food.density ?? 1,
        gramsPerUnit: {
          ...(typeof food.sell === 'object' && pack
            ? { [food.sell.unit]: pack }
            : {}),
          ...food.g,
        },
      },
    ];
  });
  return referencesCache;
}

/** The catalog's nutrients are copied from this BLS release. */
export const CATALOG_SOURCE = {
  dataset: 'Mampffred-Katalog',
  version: FOOD_CATALOG_VERSION,
  nutrients: BLS_MANIFEST,
} as const;

// ---------------------------------------------------------------------------
// Name matching

/** Folds case, umlauts and punctuation: "Bio-Zitrone" -> "bio zitrone". */
export function foldFoodName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const nameIndex = new Map<string, CatalogEntry>();
for (const food of FOOD_CATALOG)
  for (const label of [food.name, food.plural, ...(food.syn ?? [])]) {
    if (!label) continue;
    const key = foldFoodName(label);
    if (!nameIndex.has(key)) nameIndex.set(key, food);
    const squashed = key.replace(/ /g, '');
    if (!nameIndex.has(squashed)) nameIndex.set(squashed, food);
  }

function lookup(key: string) {
  if (!key) return undefined;
  return nameIndex.get(key) ?? nameIndex.get(key.replace(/ /g, ''));
}

const LEADING_MARKER =
  /^(?:optional|etwas|ca|circa|evtl|eventuell|einige|wenig|ein paar|ggf|bio|(?:frisch|klein|gross|mittelgross|jung|reif|zart|weiter|gut|fein|grob|mild|halb)(?:e|er|es|en|em)?)\s+/;
const TRAILING_QUALIFIER =
  /\s+(?:nach (?:belieben|geschmack|bedarf|wahl)|zum .*|zur .*|fur .*|aus (?:dem|der) .*|optional.*|als .*|menge ca|beziehungsweise .*|bzw .*|alternativ.*|oder .*|und oder .*|ca \d.*|je .*|falls .*|vom .*|von .*|in (?:stucken|scheiben|wurfeln|ringen).*)$/;

function stripQualifiers(value: string) {
  let current = value;
  for (let guard = 0; guard < 8; guard += 1) {
    const next = current
      .replace(LEADING_MARKER, '')
      .replace(TRAILING_QUALIFIER, '')
      .trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

function singularVariants(value: string) {
  const variants: string[] = [];
  for (const suffix of ['n', 'en', 'e', 's', 'er'])
    if (value.endsWith(suffix) && value.length - suffix.length >= 3)
      variants.push(value.slice(0, -suffix.length));
  return variants;
}

const FROZEN = /\b(?:tk|tiefgekuhlt|tiefgefroren|tiefkuhl\w*)\b/;

function phraseCandidates(raw: string, strict: boolean) {
  const lower = raw.toLocaleLowerCase('de-DE');
  const withoutParens = lower.replace(/\([^)]*\)?/g, ' ');
  const cut = withoutParens.split(/[,;]/)[0];
  const core = stripQualifiers(foldFoodName(cut));
  const exact = [
    ...new Set(
      [
        foldFoodName(lower),
        foldFoodName(withoutParens),
        foldFoodName(cut),
        core,
      ].filter(Boolean),
    ),
  ];
  // Dropping words ("Thai-Basilikum" -> "Basilikum") only finds a relative.
  const approximate: string[] = [];
  if (!strict) {
    const words = core.split(' ').filter(Boolean);
    for (let start = 1; start < words.length; start += 1)
      approximate.push(words.slice(start).join(' '));
    for (let end = words.length - 1; end >= 1; end -= 1)
      approximate.push(words.slice(0, end).join(' '));
  }
  return {
    frozen: FROZEN.test(foldFoodName(lower)),
    candidates: [
      ...exact.map((value) => ({ value, approximate: false })),
      ...[...new Set(approximate)]
        .filter((value) => value && !exact.includes(value))
        .map((value) => ({ value, approximate: true })),
    ],
  };
}

type PhraseMatch = { food: CatalogEntry; approximate: boolean };

function matchPhrase(raw: string, strict = false): PhraseMatch | undefined {
  const { frozen, candidates } = phraseCandidates(raw, strict);
  for (const { value: candidate, approximate } of candidates) {
    const base = candidate.replace(FROZEN, ' ').replace(/\s+/g, ' ').trim();
    const attempts = [
      ...(frozen ? [`${base} tk`] : []),
      candidate,
      ...(frozen ? singularVariants(base).map((value) => `${value} tk`) : []),
      ...singularVariants(candidate),
    ];
    for (const attempt of attempts) {
      const food = lookup(attempt);
      if (food) return { food, approximate };
    }
  }
  return undefined;
}

const LIST_SEPARATOR = /\s*(?:,|;|&|\bund\/oder\b|\bund\b|\bsowie\b)\s*/;

/**
 * Matches an ingredient name to catalog foods. Lists like "Salz und Pfeffer"
 * expand to several foods, but only when every part is recognised; otherwise
 * the name is treated as one food with notes ("Tomaten, in Scheiben").
 */
export function matchCatalogFoods(name: string): CatalogEntry[] {
  return matchCatalogFoodsDetailed(name).foods;
}

/**
 * Like matchCatalogFoods, but also says whether the match is only a relative
 * found by dropping words. Shopping keeps such items under their own name.
 */
export function matchCatalogFoodsDetailed(name: string): {
  foods: CatalogEntry[];
  approximate: boolean;
} {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 300)
    return { foods: [], approximate: false };
  const listText = trimmed
    .toLocaleLowerCase('de-DE')
    .replace(/\([^)]*\)?/g, ' ')
    .replace(/\s+nach (?:belieben|geschmack|bedarf|wahl)\b.*$/, '');
  // Only real enumerations ("Salz und Pfeffer") are lists; "Nudeln, Spaghetti
  // oder Locken" is one food with examples.
  const isEnumeration = /\b(?:und|sowie)\b|&/.test(listText);
  const parts = isEnumeration
    ? listText.split(LIST_SEPARATOR).filter((part) => part.trim())
    : [];
  if (parts.length > 1) {
    const matches = parts.map((part) => matchPhrase(part, true));
    if (matches.every(Boolean))
      return {
        foods: [
          ...new Set(matches.map((match) => (match as PhraseMatch).food)),
        ],
        approximate: false,
      };
  }
  const match = matchPhrase(trimmed);
  return match
    ? { foods: [match.food], approximate: match.approximate }
    : { foods: [], approximate: false };
}

export function matchCatalogFood(name: string): CatalogEntry | undefined {
  return matchCatalogFoods(name)[0];
}

/** Display name for an amount: "Zwiebel" for 1, "Zwiebeln" for 2. */
export function foodDisplayLabel(food: CatalogEntry, count = 1) {
  return count > 1 + 1e-9 ? (food.plural ?? food.name) : food.name;
}

const searchEntries = FOOD_CATALOG.map((food) => ({
  food,
  labels: [food.name, food.plural, ...(food.syn ?? [])]
    .filter((label): label is string => Boolean(label))
    .map(foldFoodName),
}));

/** Typeahead over everyday foods: exact, then prefix, then word prefix. */
export function searchCatalogFoods(query: string, limit = 8): CatalogEntry[] {
  const folded = foldFoodName(query);
  if (!folded) return [];
  const scored = searchEntries.flatMap(({ food, labels }) => {
    let score = 0;
    labels.forEach((label, index) => {
      const primary = index === 0 ? 5 : 0;
      if (label === folded) score = Math.max(score, 100 + primary);
      else if (label.startsWith(folded))
        score = Math.max(score, 80 + primary - label.length / 100);
      else if (label.split(' ').some((word) => word.startsWith(folded)))
        score = Math.max(score, 60 + primary);
      else if (folded.length >= 4 && label.includes(folded))
        score = Math.max(score, 40 + primary);
    });
    return score ? [{ food, score }] : [];
  });
  return scored
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.food.name.localeCompare(right.food.name, 'de-DE'),
    )
    .slice(0, Math.max(1, Math.min(limit, 20)))
    .map((entry) => entry.food);
}
