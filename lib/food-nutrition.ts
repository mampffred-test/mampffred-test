import type {
  CustomFood,
  NutrientKey,
  NutritionMetric,
  Recipe,
  RecipeNutrition,
} from './model.ts';

export type FoodReference = {
  needsReview?: boolean;
  id: string;
  name: string;
  aliases: string[];
  source: { dataset: string; version: string; recordId?: string };
  nutrientsPer100g: Partial<Record<NutrientKey, number>>;
  densityGPerMl?: number;
  gramsPerUnit?: Partial<Record<string, number>>;
};

export type IngredientNutritionOverride =
  | { kind: 'food'; foodId: string }
  | {
      kind: 'whole-ingredient';
      nutrients: Partial<Record<NutrientKey, number>>;
    }
  | { kind: 'ignored' };

export type IngredientResolutionStatus =
  | 'automatic'
  | 'user-confirmed'
  | 'custom-value'
  | 'ignored'
  | 'amount-unresolved'
  | 'unresolved';

export type IngredientCalculation = {
  ingredientIndex: number;
  normalizedName: string;
  overrideKey: string;
  status: IngredientResolutionStatus;
  food?: FoodReference;
  grams?: number;
  amountQuality?: 'direct' | 'assumed';
  nutrients: Partial<Record<NutrientKey, number>>;
};

export type RecipeIngredientCalculation = {
  wholeRecipe: Partial<Record<NutrientKey, NutritionMetric>>;
  ingredients: IngredientCalculation[];
  complete: boolean;
  resolvedIngredients: number;
  totalIngredients: number;
  assumedAmounts: number;
  ignoredIngredients: number;
};

export function customFoodToReference(food: CustomFood): FoodReference {
  return {
    ...(food.needsReview ? { needsReview: true } : {}),
    id: `custom:${food.id}`,
    name: food.name,
    aliases: food.aliases,
    source: {
      dataset: 'Eigene Lebensmittel',
      version: food.updatedAt,
      recordId: food.id,
    },
    nutrientsPer100g: food.nutrientsPer100g,
    ...(food.densityGPerMl !== undefined
      ? { densityGPerMl: food.densityGPerMl }
      : {}),
    ...(food.gramsPerUnit !== undefined
      ? { gramsPerUnit: food.gramsPerUnit }
      : {}),
  };
}

export function foodDisplayName(food: FoodReference) {
  return food.aliases[0]?.trim() || food.name.trim();
}

const nutrientKeys: NutrientKey[] = [
  'energyKcal',
  'proteinG',
  'carbohydratesG',
  'fatG',
  'fiberG',
  'sugarG',
  'saltG',
];

const catalogIndexes = new WeakMap<
  readonly FoodReference[],
  Map<string, FoodReference[]>
>();
type CatalogSearchEntry = { food: FoodReference; candidates: string[] };
type CatalogSearchIndex = {
  entries: CatalogSearchEntry[];
  prefixBuckets: Map<string, number[]>;
};

const catalogSearchIndexes = new WeakMap<
  readonly FoodReference[],
  CatalogSearchIndex
>();

function searchPrefix(token: string) {
  return token.slice(0, 1);
}

function buildCatalogSearchIndex(
  catalog: readonly FoodReference[],
): CatalogSearchIndex {
  const prefixBuckets = new Map<string, number[]>();
  const entries = catalog.map((food, index) => {
    const candidates = [food.name, ...food.aliases]
      .map(normalizeIngredientName)
      .filter(Boolean);
    const prefixes = new Set(
      candidates.flatMap((candidate) =>
        candidate.split(' ').map(searchPrefix).filter(Boolean),
      ),
    );
    for (const prefix of prefixes) {
      const bucket = prefixBuckets.get(prefix) ?? [];
      bucket.push(index);
      prefixBuckets.set(prefix, bucket);
    }
    return { food, candidates };
  });
  return { entries, prefixBuckets };
}

function catalogIndex(catalog: readonly FoodReference[]) {
  const cached = catalogIndexes.get(catalog);
  if (cached) return cached;
  const index = new Map<string, FoodReference[]>();
  for (const food of catalog) {
    for (const candidate of [food.name, ...food.aliases]) {
      const key = normalizeIngredientName(candidate);
      if (!key) continue;
      const matches = index.get(key) ?? [];
      if (!matches.some((match) => match.id === food.id)) matches.push(food);
      index.set(key, matches);
    }
  }
  catalogIndexes.set(catalog, index);
  return index;
}

export function normalizeIngredientName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeUnit(value: string) {
  const unit = normalizeIngredientName(value).replace(/\s/g, '');
  const aliases: Record<string, string> = {
    gramm: 'g',
    kilogramm: 'kg',
    kilogram: 'kg',
    milliliter: 'ml',
    liter: 'l',
    litre: 'l',
    stück: 'stueck',
    stuecke: 'stueck',
    stuck: 'stueck',
    scheiben: 'scheibe',
    essloffel: 'el',
    tablespoon: 'el',
    teeloffel: 'tl',
    teaspoon: 'tl',
  };
  return Object.hasOwn(aliases, unit) ? aliases[unit] : unit;
}

const householdVolumeMl: Partial<Record<string, number>> = {
  el: 15,
  tl: 5,
};

export function preferredUnitForFood(food: FoodReference) {
  if (validFactor(food.gramsPerUnit?.stueck)) return 'Stück';
  if (validFactor(food.gramsPerUnit?.scheibe)) return 'Scheibe';
  if (validFactor(food.densityGPerMl)) return 'ml';
  return 'g';
}

function parseAmount(value: string) {
  const compact = value.trim().replace(/\s/g, '');
  if (!compact) return undefined;
  const normalized = /^\d{1,3}(?:\.\d{3})+$/.test(compact)
    ? compact.replaceAll('.', '')
    : compact.replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000
    ? parsed
    : undefined;
}

function validFactor(value: unknown) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 1_000_000
  );
}

export function resolveIngredient(
  name: string,
  catalog: readonly FoodReference[],
  override?: IngredientNutritionOverride,
): { status: IngredientResolutionStatus; food?: FoodReference } {
  if (override?.kind === 'ignored') return { status: 'ignored' };
  if (override?.kind === 'whole-ingredient') return { status: 'custom-value' };
  if (override?.kind === 'food') {
    const food = catalog.find((entry) => entry.id === override.foodId);
    return food && !food.needsReview
      ? { status: 'user-confirmed', food }
      : { status: 'unresolved' };
  }

  const normalized = normalizeIngredientName(name);
  if (!normalized) return { status: 'unresolved' };
  const matches = catalogIndex(catalog).get(normalized) ?? [];
  return matches.length === 1 && !matches[0].needsReview
    ? { status: 'automatic', food: matches[0] }
    : { status: 'unresolved' };
}

/** Returns suggestions for an explicit user choice; it never auto-confirms. */
export function searchFoodReferences(
  query: string,
  catalog: readonly FoodReference[],
  limit = 8,
) {
  const normalized = normalizeIngredientName(query);
  if (!normalized || !Number.isInteger(limit) || limit < 1) return [];
  const queryTokens = normalized.split(' ');
  let searchIndex = catalogSearchIndexes.get(catalog);
  if (!searchIndex) {
    searchIndex = buildCatalogSearchIndex(catalog);
    catalogSearchIndexes.set(catalog, searchIndex);
  }
  const candidateIndexes = queryTokens
    .map((token) => searchIndex.prefixBuckets.get(searchPrefix(token)) ?? [])
    .sort((left, right) => left.length - right.length)[0];
  if (!candidateIndexes?.length) return [];
  return candidateIndexes
    .map((index) => searchIndex.entries[index])
    .flatMap(({ food, candidates }) => {
      let score = 0;
      for (const candidate of candidates) {
        if (candidate === normalized) score = Math.max(score, 1_000);
        else if (candidate.startsWith(normalized)) score = Math.max(score, 800);
        else {
          const candidateTokens = candidate.split(' ');
          const allPresent = queryTokens.every((queryToken) =>
            candidateTokens.some(
              (candidateToken) =>
                (candidateToken.startsWith(queryToken) ||
                  queryToken.startsWith(candidateToken)) &&
                Math.abs(candidateToken.length - queryToken.length) <= 2,
            ),
          );
          if (allPresent)
            score = Math.max(
              score,
              500 - Math.abs(candidate.length - normalized.length),
            );
        }
      }
      if (score > 0 && food.source.dataset === 'Eigene Lebensmittel')
        score += 30;
      return score > 0 ? [{ food, score }] : [];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.food.name.localeCompare(right.food.name),
    )
    .slice(0, Math.min(limit, 20))
    .map(({ food }) => food);
}

export function convertIngredientToGrams(
  amount: string,
  unit: string,
  food?: FoodReference,
): { grams: number; quality: 'direct' | 'assumed' } | undefined {
  const quantity = parseAmount(amount);
  if (quantity === undefined) return undefined;
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit === 'g') return { grams: quantity, quality: 'direct' };
  if (normalizedUnit === 'kg')
    return { grams: quantity * 1_000, quality: 'direct' };
  if (normalizedUnit === 'ml' || normalizedUnit === 'l') {
    if (!validFactor(food?.densityGPerMl)) return undefined;
    const milliliters = normalizedUnit === 'l' ? quantity * 1_000 : quantity;
    return {
      grams: milliliters * (food?.densityGPerMl as number),
      quality: 'assumed',
    };
  }
  const householdMilliliters = Object.hasOwn(householdVolumeMl, normalizedUnit)
    ? householdVolumeMl[normalizedUnit]
    : undefined;
  if (householdMilliliters !== undefined) {
    if (!validFactor(food?.densityGPerMl)) return undefined;
    return {
      grams: quantity * householdMilliliters * (food?.densityGPerMl as number),
      quality: 'assumed',
    };
  }
  const gramsPerUnit = food?.gramsPerUnit?.[normalizedUnit];
  if (!validFactor(gramsPerUnit)) return undefined;
  return { grams: quantity * (gramsPerUnit as number), quality: 'assumed' };
}

function validNutrient(value: unknown) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10_000_000
  );
}

function inputFingerprint(value: string) {
  const hashes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    for (let index = 0; index < hashes.length; index += 1) {
      hashes[index] = Math.imul(
        (hashes[index] ^ codePoint ^ (index * 0x45d9f3b)) >>> 0,
        0x01000193 + index * 2,
      );
    }
  }
  return `mff1-${hashes
    .map((hash) => (hash >>> 0).toString(16).padStart(8, '0'))
    .join('')}`;
}

export function ingredientOverrideKey(recipeId: string, ingredientId: string) {
  return `recipe-${inputFingerprint(`${recipeId}\0${ingredientId}`)}`;
}

export function calculateRecipeFromIngredients(
  recipe: Pick<Recipe, 'id' | 'ingredients'>,
  catalog: readonly FoodReference[],
  overrides: Record<string, IngredientNutritionOverride> = {},
): RecipeIngredientCalculation {
  const ingredients = recipe.ingredients
    .map((ingredient, ingredientIndex) => ({ ingredient, ingredientIndex }))
    .filter(({ ingredient }) => ingredient.name.trim())
    .map(({ ingredient, ingredientIndex }): IngredientCalculation => {
      const normalizedName = normalizeIngredientName(ingredient.name);
      const overrideKey = ingredientOverrideKey(
        recipe.id,
        ingredient.id ?? `ingredient-${ingredientIndex}`,
      );
      const override = overrides[overrideKey];
      const linkedFood = ingredient.foodLink
        ? catalog.find((food) => food.id === ingredient.foodLink?.foodId)
        : undefined;
      const resolution = override
        ? resolveIngredient(ingredient.name, catalog, override)
        : ingredient.foodLink
          ? linkedFood && !linkedFood.needsReview
            ? { status: 'user-confirmed' as const, food: linkedFood }
            : { status: 'unresolved' as const }
          : resolveIngredient(ingredient.name, catalog);
      if (override?.kind === 'whole-ingredient') {
        const nutrients = Object.fromEntries(
          Object.entries(override.nutrients).filter(([, value]) =>
            validNutrient(value),
          ),
        ) as Partial<Record<NutrientKey, number>>;
        return {
          ingredientIndex,
          normalizedName,
          overrideKey,
          status: 'custom-value',
          nutrients,
        };
      }
      if (resolution.status === 'ignored')
        return {
          ingredientIndex,
          normalizedName,
          overrideKey,
          status: 'ignored',
          nutrients: {},
        };
      if (!resolution.food)
        return {
          ingredientIndex,
          normalizedName,
          overrideKey,
          status: 'unresolved',
          nutrients: {},
        };
      const amount = convertIngredientToGrams(
        ingredient.amount,
        ingredient.unit,
        resolution.food,
      );
      if (!amount)
        return {
          ingredientIndex,
          normalizedName,
          overrideKey,
          status: 'amount-unresolved',
          food: resolution.food,
          nutrients: {},
        };
      const nutrients = Object.fromEntries(
        Object.entries(resolution.food.nutrientsPer100g)
          .filter(([, value]) => validNutrient(value))
          .map(([key, value]) => [
            key,
            ((value as number) * amount.grams) / 100,
          ]),
      ) as Partial<Record<NutrientKey, number>>;
      return {
        ingredientIndex,
        normalizedName,
        overrideKey,
        status: resolution.status,
        food: resolution.food,
        grams: amount.grams,
        amountQuality: amount.quality,
        nutrients,
      };
    });

  const included = ingredients.filter((entry) => entry.status !== 'ignored');
  const resolved = included.filter(
    (entry) =>
      entry.status === 'automatic' ||
      entry.status === 'user-confirmed' ||
      entry.status === 'custom-value',
  );
  const wholeRecipe: Partial<Record<NutrientKey, NutritionMetric>> = {};
  const fingerprint = inputFingerprint(
    ingredients
      .map((ingredient) => {
        const original = recipe.ingredients[ingredient.ingredientIndex];
        return [
          original?.amount ?? '',
          original?.unit ?? '',
          original?.name ?? '',
          JSON.stringify(original?.foodLink ?? null),
          JSON.stringify(
            ingredient.food
              ? {
                  id: ingredient.food.id,
                  version: ingredient.food.source.version,
                  nutrientsPer100g: ingredient.food.nutrientsPer100g,
                }
              : null,
          ),
          JSON.stringify(overrides[ingredient.overrideKey] ?? null),
        ]
          .map(normalizeIngredientName)
          .join('|');
      })
      .join('||'),
  );
  for (const key of nutrientKeys) {
    if (
      included.length === 0 ||
      included.some((entry) => !Object.hasOwn(entry.nutrients, key))
    )
      continue;
    const value = included.reduce(
      (sum, entry) => sum + (entry.nutrients[key] as number),
      0,
    );
    if (!validNutrient(value)) continue;
    const declared = included.every((entry) => entry.status === 'custom-value');
    const sources = [
      ...new Map(
        resolved.flatMap((entry) =>
          entry.food
            ? [
                [
                  `${entry.food.source.dataset}\0${entry.food.source.version}`,
                  entry.food.source,
                ] as const,
              ]
            : [],
        ),
      ).values(),
    ];
    wholeRecipe[key] = {
      value,
      quality: declared ? 'declared' : 'estimated',
      source: declared
        ? { kind: 'user' }
        : {
            kind: 'dataset',
            dataset:
              sources.length === 1
                ? (sources[0]?.dataset ?? 'unknown')
                : 'Gemischte Quellen',
            version:
              sources.length === 1
                ? (sources[0]?.version ?? 'unknown')
                : sources
                    .map((source) => `${source.dataset} ${source.version}`)
                    .join(' + '),
            inputFingerprint: fingerprint,
            resolvedIngredients: resolved.length,
            totalIngredients: included.length,
          },
    };
  }

  return {
    wholeRecipe,
    ingredients,
    complete: resolved.length === included.length && included.length > 0,
    resolvedIngredients: resolved.length,
    totalIngredients: included.length,
    assumedAmounts: included.filter(
      (entry) => entry.amountQuality === 'assumed',
    ).length,
    ignoredIngredients: ingredients.filter(
      (entry) => entry.status === 'ignored',
    ).length,
  };
}

/**
 * Keeps explicit user values and replaces only derived/unverified values.
 * An incomplete calculation removes stale automatic values instead of
 * presenting them as if they still described the edited recipe.
 */
export function mergeCalculatedNutrition(
  previous: RecipeNutrition | undefined,
  calculation: RecipeIngredientCalculation,
  updatedAt: string,
): RecipeNutrition | undefined {
  const wholeRecipe: RecipeNutrition['wholeRecipe'] = {};
  for (const key of nutrientKeys) {
    const existing = previous?.wholeRecipe[key];
    if (existing?.source.kind === 'user') wholeRecipe[key] = existing;
    else if (calculation.wholeRecipe[key])
      wholeRecipe[key] = calculation.wholeRecipe[key];
  }
  return Object.keys(wholeRecipe).length
    ? { wholeRecipe, enteredAs: 'whole-recipe', updatedAt }
    : undefined;
}
