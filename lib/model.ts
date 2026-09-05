import { validateImageFrame } from './image-frame.ts';
import {
  addLocalDays,
  parseLocalDate,
  startOfLocalWeek,
} from './local-date.ts';

export type MealSlot = 'Frühstück' | 'Mittagessen' | 'Abendessen';

export const APP_SCHEMA_VERSION = 6 as const;

export type NutrientKey =
  | 'energyKcal'
  | 'proteinG'
  | 'carbohydratesG'
  | 'fatG'
  | 'fiberG'
  | 'sugarG'
  | 'saltG';

export type NutritionMetric = {
  value: number;
  quality: 'declared' | 'estimated';
  source:
    | { kind: 'user' }
    | {
        kind: 'dataset';
        dataset: string;
        version: string;
        inputFingerprint: string;
        resolvedIngredients: number;
        totalIngredients: number;
      }
    | { kind: 'imported-unverified' };
};

export type RecipeNutrition = {
  wholeRecipe: Partial<Record<NutrientKey, NutritionMetric>>;
  enteredAs: 'per-serving' | 'whole-recipe';
  updatedAt: string;
};

export type NutritionGoal = {
  nutrient: NutrientKey;
  period: 'week';
  minimum: number;
  enabled: boolean;
};

export type NutritionSettings = {
  enabled: boolean;
  automaticEstimates: boolean;
  promptDismissed: boolean;
  defaultTrackedServings: number;
  goals: NutritionGoal[];
};

export type FoodOverride =
  | { kind: 'food'; foodId: string }
  | {
      kind: 'whole-ingredient';
      nutrients: Partial<Record<NutrientKey, number>>;
    }
  | { kind: 'ignored' };

export type FoodLink =
  | { kind: 'bls'; foodId: string }
  | { kind: 'custom'; foodId: string };

export type CustomFood = {
  needsReview?: boolean;
  id: string;
  name: string;
  aliases: string[];
  nutrientsPer100g: Partial<Record<NutrientKey, number>>;
  densityGPerMl?: number;
  gramsPerUnit?: Partial<Record<string, number>>;
  createdAt: string;
  updatedAt: string;
};

export type RecipeIngredient = {
  id?: string;
  amount: string;
  unit: string;
  name: string;
  foodLink?: FoodLink;
};

export type Recipe = {
  id: string;
  shareId: string;
  name: string;
  description: string;
  minutes: number;
  servings: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  steps: string[];
  imageCell: number;
  imageKey?: string;
  imageFrame?: import('./image-frame.ts').ImageFrame;
  favorite?: boolean;
  nutrition?: RecipeNutrition;
};

export type RecipeDraft = Omit<Recipe, 'shareId'> & {
  baseRecipeId?: string;
  foodOverrides: Record<string, FoodOverride>;
  createdAt: string;
  updatedAt: string;
};

export type PlannedMeal = {
  slot: MealSlot;
  recipeId: string;
  servings: number;
  trackedServings?: number;
};

export type PlannedDay = {
  date: string;
  meals: PlannedMeal[];
};

export type ShoppingItem = {
  id: string;
  name: string;
  category:
    | 'Gemüse & Obst'
    | 'Kühlregal'
    | 'Vorrat'
    | 'Backwaren'
    | 'Sonstiges';
  checked: boolean;
  source?: string;
  origin:
    | { kind: 'manual' }
    | { kind: 'recipe'; recipeId: string }
    | {
        kind: 'week';
        weekStart: string;
        groupKey: string;
        sources: Array<{
          date: string;
          slot: MealSlot;
          recipeId: string;
        }>;
        fingerprint: string;
      };
  needsReview?: boolean;
};

export type AppData = {
  schemaVersion: typeof APP_SCHEMA_VERSION;
  recipes: Recipe[];
  plan: PlannedDay[];
  shopping: ShoppingItem[];
  onboardingDone: boolean;
  installedSamplePacks: string[];
  nutritionSettings: NutritionSettings;
  foodOverrides: Record<string, FoodOverride>;
  customFoods: CustomFood[];
  recipeDrafts: RecipeDraft[];
  lastBackup?: string;
};

export const seedRecipes: Recipe[] = [
  {
    id: 'porridge',
    shareId: 'sample-v1:porridge',
    name: 'Haferporridge mit Beeren',
    description: 'Cremiger Haferbrei mit frischen Beeren und einem Hauch Zimt.',
    minutes: 10,
    servings: 2,
    tags: ['Schnell', 'Vegetarisch', 'Frühstück'],
    ingredients: [
      { amount: '100', unit: 'g', name: 'Haferflocken' },
      { amount: '300', unit: 'ml', name: 'Haferdrink' },
      { amount: '150', unit: 'g', name: 'Beeren' },
      { amount: '1', unit: 'Prise', name: 'Zimt' },
    ],
    steps: [
      'Haferflocken und Haferdrink aufkochen.',
      'Bei kleiner Hitze cremig rühren.',
      'Mit Beeren und Zimt servieren.',
    ],
    imageCell: 0,
    favorite: true,
  },
  {
    id: 'curry',
    shareId: 'sample-v1:curry',
    name: 'Linsen-Curry mit Reis',
    description: 'Würziges Linsen-Curry mit buntem Gemüse und Kokosmilch.',
    minutes: 30,
    servings: 4,
    tags: ['Vegetarisch', 'Familienessen'],
    ingredients: [
      { amount: '250', unit: 'g', name: 'Rote Linsen' },
      { amount: '250', unit: 'g', name: 'Reis' },
      { amount: '1', unit: 'Stück', name: 'Paprika' },
      { amount: '1', unit: 'Stück', name: 'Zucchini' },
      { amount: '400', unit: 'ml', name: 'Kokosmilch' },
      { amount: '2', unit: 'EL', name: 'Currypaste' },
    ],
    steps: [
      'Reis nach Packungsangabe garen.',
      'Gemüse würfeln und anbraten.',
      'Linsen, Kokosmilch und Currypaste zugeben.',
      'Etwa 15 Minuten köcheln lassen und abschmecken.',
    ],
    imageCell: 1,
    favorite: true,
  },
  {
    id: 'oven-veg',
    shareId: 'sample-v1:oven-veg',
    name: 'Ofengemüse mit Feta & Brot',
    description: 'Buntes Ofengemüse, würziger Feta und knuspriges Brot.',
    minutes: 35,
    servings: 2,
    tags: ['Vegetarisch', 'Einfach'],
    ingredients: [
      { amount: '1', unit: 'Stück', name: 'Paprika' },
      { amount: '1', unit: 'Stück', name: 'Zucchini' },
      { amount: '2', unit: 'Stück', name: 'Zwiebeln' },
      { amount: '150', unit: 'g', name: 'Feta' },
      { amount: '4', unit: 'Scheiben', name: 'Brot' },
    ],
    steps: [
      'Gemüse schneiden und würzen.',
      '25 Minuten bei 200 °C backen.',
      'Feta darübergeben und mit Brot servieren.',
    ],
    imageCell: 2,
  },
  {
    id: 'gratin',
    shareId: 'sample-v1:gratin',
    name: 'Kartoffelauflauf',
    description: 'Cremiger Auflauf mit Kartoffeln, Zwiebeln und Käse.',
    minutes: 50,
    servings: 4,
    tags: ['Vegetarisch', 'Familienessen'],
    ingredients: [
      { amount: '800', unit: 'g', name: 'Kartoffeln' },
      { amount: '200', unit: 'ml', name: 'Sahne' },
      { amount: '150', unit: 'g', name: 'Geriebener Käse' },
      { amount: '1', unit: 'Stück', name: 'Zwiebel' },
    ],
    steps: [
      'Kartoffeln in dünne Scheiben hobeln.',
      'Mit Zwiebeln und Sahne einschichten.',
      'Mit Käse bestreuen und goldbraun backen.',
    ],
    imageCell: 3,
  },
  {
    id: 'pasta',
    shareId: 'sample-v1:pasta',
    name: 'Tomaten-Mozzarella-Pasta',
    description: 'Schnelle Pasta mit Kirschtomaten, Mozzarella und Basilikum.',
    minutes: 25,
    servings: 3,
    tags: ['Schnell', 'Vegetarisch'],
    ingredients: [
      { amount: '350', unit: 'g', name: 'Penne' },
      { amount: '300', unit: 'g', name: 'Kirschtomaten' },
      { amount: '200', unit: 'g', name: 'Mozzarella' },
      { amount: '1', unit: 'Bund', name: 'Basilikum' },
    ],
    steps: [
      'Pasta bissfest kochen.',
      'Tomaten kurz anbraten.',
      'Alles mit Mozzarella und Basilikum vermengen.',
    ],
    imageCell: 4,
  },
  {
    id: 'soup',
    shareId: 'sample-v1:soup',
    name: 'Kürbis-Linsensuppe',
    description: 'Samtige Suppe mit Kürbis, roten Linsen und knusprigem Brot.',
    minutes: 35,
    servings: 4,
    tags: ['Vegan', 'Suppe'],
    ingredients: [
      { amount: '600', unit: 'g', name: 'Hokkaido-Kürbis' },
      { amount: '150', unit: 'g', name: 'Rote Linsen' },
      { amount: '1', unit: 'l', name: 'Gemüsebrühe' },
      { amount: '4', unit: 'Scheiben', name: 'Brot' },
    ],
    steps: [
      'Kürbis würfeln und anschwitzen.',
      'Linsen und Brühe zugeben.',
      '25 Minuten köcheln und fein pürieren.',
    ],
    imageCell: 5,
  },
];

export function createSeedData(): AppData {
  const now = new Date();
  const monday = startOfLocalWeek(now);
  const plan = Array.from({ length: 7 }, (_, index) => {
    const date = addLocalDays(monday, index);
    const recipeIds = [
      'porridge',
      'curry',
      'oven-veg',
      'gratin',
      'pasta',
      'soup',
    ];
    return {
      date,
      meals: [
        {
          slot: 'Frühstück' as const,
          recipeId:
            index % 2 ? 'porridge' : recipeIds[index % recipeIds.length],
          servings: 1,
          trackedServings: 1,
        },
        {
          slot: 'Mittagessen' as const,
          recipeId: recipeIds[(index + 1) % recipeIds.length],
          servings: 1,
          trackedServings: 1,
        },
        {
          slot: 'Abendessen' as const,
          recipeId: recipeIds[(index + 2) % recipeIds.length],
          servings: 1,
          trackedServings: 1,
        },
      ],
    };
  });

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    recipes: createSampleRecipes(),
    plan,
    shopping: [
      ['Paprika', 'Gemüse & Obst', 'Gemüse-Curry'],
      ['Zucchini', 'Gemüse & Obst', 'Gemüse-Curry'],
      ['Karotten', 'Gemüse & Obst', 'Gemüse-Curry'],
      ['Zwiebeln', 'Gemüse & Obst', 'Kartoffelauflauf'],
      ['Tomaten', 'Gemüse & Obst', 'Pasta'],
      ['Feta', 'Kühlregal', 'Ofengemüse'],
      ['Sahne', 'Kühlregal', 'Kartoffelauflauf'],
      ['Mozzarella', 'Kühlregal', 'Pasta'],
      ['Reis', 'Vorrat', 'Linsen-Curry'],
      ['Kokosmilch', 'Vorrat', 'Linsen-Curry'],
      ['Rote Linsen', 'Vorrat', 'Linsensuppe'],
      ['Brot', 'Backwaren', 'Ofengemüse'],
    ].map(([name, category, source], index) => ({
      id: `item-${index}`,
      name,
      category: category as ShoppingItem['category'],
      source,
      checked: index === 1 || index === 8,
      origin: { kind: 'manual' },
    })),
    onboardingDone: false,
    installedSamplePacks: ['mampffred-samples-v1'],
    nutritionSettings: {
      enabled: false,
      automaticEstimates: false,
      promptDismissed: false,
      defaultTrackedServings: 1,
      goals: [],
    },
    foodOverrides: {},
    customFoods: [],
    recipeDrafts: [],
  };
}

export function createEmptyData(): AppData {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    recipes: [],
    plan: [],
    shopping: [],
    onboardingDone: false,
    installedSamplePacks: [],
    nutritionSettings: {
      enabled: false,
      automaticEstimates: false,
      promptDismissed: false,
      defaultTrackedServings: 1,
      goals: [],
    },
    foodOverrides: {},
    customFoods: [],
    recipeDrafts: [],
  };
}

export function createSampleRecipes() {
  return seedRecipes.map((recipe) => ({
    ...recipe,
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.map((ingredient, index) => ({
      ...ingredient,
      id: ingredient.id ?? `${recipe.id}-ingredient-${index + 1}`,
    })),
    steps: [...recipe.steps],
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function expectString(value: unknown) {
  if (typeof value !== 'string' || value.length > 5_000)
    throw new Error('INVALID_APP_DATA');
  return value;
}

function expectNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('INVALID_APP_DATA');
  return value;
}

function expectBoundedNumber(value: unknown, maximum = 10_000_000) {
  const result = expectNumber(value);
  if (result < 0 || result > maximum) throw new Error('INVALID_APP_DATA');
  return result;
}

function expectStringArray(value: unknown) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length > 5_000)
  )
    throw new Error('INVALID_APP_DATA');
  return [...value] as string[];
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

function migrateNutritionSource(
  value: unknown,
  legacy: boolean,
): NutritionMetric['source'] {
  if (legacy && value === undefined) return { kind: 'user' };
  if (!isRecord(value)) throw new Error('INVALID_APP_DATA');
  if (value.kind === 'user' || value.kind === 'imported-unverified')
    return { kind: value.kind };
  if (value.kind !== 'dataset') throw new Error('INVALID_APP_DATA');
  const dataset = expectString(value.dataset);
  const version = expectString(value.version);
  const inputFingerprint = expectString(value.inputFingerprint);
  const resolvedIngredients = expectBoundedNumber(
    value.resolvedIngredients,
    500,
  );
  const totalIngredients = expectBoundedNumber(value.totalIngredients, 500);
  if (
    !dataset ||
    !version ||
    !inputFingerprint ||
    !Number.isInteger(resolvedIngredients) ||
    !Number.isInteger(totalIngredients) ||
    resolvedIngredients > totalIngredients
  )
    throw new Error('INVALID_APP_DATA');
  return {
    kind: 'dataset',
    dataset,
    version,
    inputFingerprint,
    resolvedIngredients,
    totalIngredients,
  };
}

function migrateRecipeNutrition(
  value: unknown,
  legacy: boolean,
): RecipeNutrition | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.wholeRecipe))
    throw new Error('INVALID_APP_DATA');
  const wholeRecipe: RecipeNutrition['wholeRecipe'] = {};
  for (const [key, metricValue] of Object.entries(value.wholeRecipe)) {
    if (!nutrientKeys.includes(key as NutrientKey) || !isRecord(metricValue))
      throw new Error('INVALID_APP_DATA');
    const quality = metricValue.quality;
    if (quality !== 'declared' && quality !== 'estimated')
      throw new Error('INVALID_APP_DATA');
    wholeRecipe[key as NutrientKey] = {
      value: expectBoundedNumber(metricValue.value),
      quality,
      source: migrateNutritionSource(metricValue.source, legacy),
    };
  }
  const enteredAs = value.enteredAs;
  const updatedAt = expectString(value.updatedAt);
  if (
    (enteredAs !== 'per-serving' && enteredAs !== 'whole-recipe') ||
    !Number.isFinite(Date.parse(updatedAt))
  )
    throw new Error('INVALID_APP_DATA');
  return { wholeRecipe, enteredAs, updatedAt };
}

function migrateFoodLink(value: unknown): FoodLink {
  if (!isRecord(value) || (value.kind !== 'bls' && value.kind !== 'custom'))
    throw new Error('INVALID_APP_DATA');
  const foodId = expectString(value.foodId);
  if (!foodId || foodId.length > 200) throw new Error('INVALID_APP_DATA');
  return { kind: value.kind, foodId };
}

function migrateRecipe(value: unknown, legacyNutrition: boolean): Recipe {
  if (!isRecord(value)) throw new Error('INVALID_APP_DATA');
  if (!Array.isArray(value.ingredients) || !Array.isArray(value.steps))
    throw new Error('INVALID_APP_DATA');
  if (
    value.ingredients.length > 500 ||
    value.steps.length > 500 ||
    !Array.isArray(value.tags) ||
    value.tags.length > 50
  )
    throw new Error('INVALID_APP_DATA');
  const id = expectString(value.id);
  const recipe: Recipe = {
    id,
    shareId:
      typeof value.shareId === 'string'
        ? expectString(value.shareId)
        : `local:${id}`,
    name: expectString(value.name),
    description: expectString(value.description),
    minutes: expectNumber(value.minutes),
    servings: expectNumber(value.servings),
    tags: expectStringArray(value.tags),
    ingredients: value.ingredients.map((ingredient, index) => {
      if (!isRecord(ingredient)) throw new Error('INVALID_APP_DATA');
      const ingredientId =
        typeof ingredient.id === 'string'
          ? expectString(ingredient.id)
          : `${id}-ingredient-${index + 1}`;
      const amount = expectString(ingredient.amount);
      const unit = expectString(ingredient.unit);
      const name = expectString(ingredient.name);
      if (
        !ingredientId ||
        ingredientId.length > 200 ||
        amount.length > 100 ||
        unit.length > 100 ||
        name.length > 500
      )
        throw new Error('INVALID_APP_DATA');
      return {
        id: ingredientId,
        amount,
        unit,
        name,
        ...(ingredient.foodLink !== undefined
          ? { foodLink: migrateFoodLink(ingredient.foodLink) }
          : {}),
      };
    }),
    steps: expectStringArray(value.steps),
    imageCell: expectNumber(value.imageCell),
    ...(value.imageFrame !== undefined
      ? { imageFrame: validateImageFrame(value.imageFrame) }
      : {}),
    ...(typeof value.imageKey === 'string'
      ? { imageKey: expectString(value.imageKey) }
      : {}),
    ...(typeof value.favorite === 'boolean'
      ? { favorite: value.favorite }
      : {}),
    ...(value.nutrition !== undefined
      ? { nutrition: migrateRecipeNutrition(value.nutrition, legacyNutrition) }
      : {}),
  };
  const ingredientIds = recipe.ingredients.map((ingredient) => ingredient.id);
  if (
    !recipe.id ||
    recipe.id.length > 200 ||
    !recipe.shareId ||
    recipe.shareId.length > 200 ||
    !recipe.name.trim() ||
    recipe.name.length > 200 ||
    recipe.description.length > 5_000 ||
    !Number.isInteger(recipe.minutes) ||
    recipe.minutes < 1 ||
    recipe.minutes > 10_080 ||
    !Number.isInteger(recipe.servings) ||
    recipe.servings < 1 ||
    recipe.servings > 1_000 ||
    !Number.isInteger(recipe.imageCell) ||
    recipe.imageCell < 0 ||
    recipe.imageCell > 5 ||
    ingredientIds.some((ingredientId) => !ingredientId) ||
    new Set(ingredientIds).size !== ingredientIds.length
  )
    throw new Error('INVALID_APP_DATA');
  return recipe;
}

const mealSlots: MealSlot[] = ['Frühstück', 'Mittagessen', 'Abendessen'];
const shoppingCategories: ShoppingItem['category'][] = [
  'Gemüse & Obst',
  'Kühlregal',
  'Vorrat',
  'Backwaren',
  'Sonstiges',
];

function migrateShoppingOrigin(value: unknown): ShoppingItem['origin'] {
  if (value === undefined) return { kind: 'manual' };
  if (!isRecord(value)) throw new Error('INVALID_APP_DATA');
  if (value.kind === 'manual') return { kind: 'manual' };
  if (value.kind === 'recipe') {
    const recipeId = expectString(value.recipeId);
    if (!recipeId || recipeId.length > 200) throw new Error('INVALID_APP_DATA');
    return { kind: 'recipe', recipeId };
  }
  if (value.kind !== 'week' || !Array.isArray(value.sources))
    throw new Error('INVALID_APP_DATA');
  const weekStart = expectString(value.weekStart);
  parseLocalDate(weekStart);
  if (value.sources.length > 500) throw new Error('INVALID_APP_DATA');
  return {
    kind: 'week',
    weekStart,
    groupKey: expectString(value.groupKey),
    fingerprint: expectString(value.fingerprint),
    sources: value.sources.map((source) => {
      if (!isRecord(source)) throw new Error('INVALID_APP_DATA');
      const date = expectString(source.date);
      const slot = expectString(source.slot) as MealSlot;
      const recipeId = expectString(source.recipeId);
      parseLocalDate(date);
      if (!mealSlots.includes(slot) || !recipeId || recipeId.length > 200)
        throw new Error('INVALID_APP_DATA');
      return { date, slot, recipeId };
    }),
  };
}

function migrateNutritionSettings(value: unknown): NutritionSettings {
  if (value === undefined)
    return {
      enabled: false,
      automaticEstimates: false,
      promptDismissed: false,
      defaultTrackedServings: 1,
      goals: [],
    };
  if (
    !isRecord(value) ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.goals) ||
    value.goals.length > 20
  )
    throw new Error('INVALID_APP_DATA');
  const defaultTrackedServings = expectBoundedNumber(
    value.defaultTrackedServings,
    1_000,
  );
  if (defaultTrackedServings <= 0) throw new Error('INVALID_APP_DATA');
  const usedGoals = new Set<string>();
  const goals = value.goals.map((goal): NutritionGoal => {
    if (!isRecord(goal) || typeof goal.enabled !== 'boolean')
      throw new Error('INVALID_APP_DATA');
    const nutrient = expectString(goal.nutrient) as NutrientKey;
    const period = expectString(goal.period);
    if (
      !nutrientKeys.includes(nutrient) ||
      (period !== 'day' && period !== 'week') ||
      usedGoals.has(`${nutrient}:${period}`)
    )
      throw new Error('INVALID_APP_DATA');
    usedGoals.add(`${nutrient}:${period}`);
    const minimum =
      goal.minimum === undefined
        ? undefined
        : expectBoundedNumber(goal.minimum);
    if (
      period !== 'week' ||
      minimum === undefined ||
      minimum <= 0 ||
      goal.maximum !== undefined
    )
      throw new Error('INVALID_APP_DATA');
    return {
      nutrient,
      period: 'week',
      enabled: goal.enabled,
      minimum,
    };
  });
  return {
    enabled: value.enabled,
    automaticEstimates:
      typeof value.automaticEstimates === 'boolean'
        ? value.automaticEstimates
        : false,
    promptDismissed:
      typeof value.promptDismissed === 'boolean'
        ? value.promptDismissed
        : false,
    defaultTrackedServings,
    goals,
  };
}

function migrateFoodOverrides(value: unknown): Record<string, FoodOverride> {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > 1_000)
    throw new Error('INVALID_APP_DATA');
  return Object.fromEntries(
    Object.entries(value).map(([key, override]) => {
      if (!key || key.length > 200 || !isRecord(override))
        throw new Error('INVALID_APP_DATA');
      if (override.kind === 'ignored')
        return [key, { kind: 'ignored' } satisfies FoodOverride];
      if (override.kind === 'food') {
        const foodId = expectString(override.foodId);
        if (!foodId || foodId.length > 200) throw new Error('INVALID_APP_DATA');
        return [key, { kind: 'food', foodId } satisfies FoodOverride];
      }
      if (override.kind !== 'whole-ingredient' || !isRecord(override.nutrients))
        throw new Error('INVALID_APP_DATA');
      const nutrients: Partial<Record<NutrientKey, number>> = {};
      for (const [nutrient, nutrientValue] of Object.entries(
        override.nutrients,
      )) {
        if (!nutrientKeys.includes(nutrient as NutrientKey))
          throw new Error('INVALID_APP_DATA');
        nutrients[nutrient as NutrientKey] = expectBoundedNumber(nutrientValue);
      }
      return [
        key,
        { kind: 'whole-ingredient', nutrients } satisfies FoodOverride,
      ];
    }),
  );
}

function migrateCustomFoods(value: unknown): CustomFood[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1_000)
    throw new Error('INVALID_APP_DATA');
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry) || !isRecord(entry.nutrientsPer100g))
      throw new Error('INVALID_APP_DATA');
    const id = expectString(entry.id);
    const name = expectString(entry.name);
    const createdAt = expectString(entry.createdAt);
    const updatedAt = expectString(entry.updatedAt);
    if (
      !id ||
      id.length > 200 ||
      ids.has(id) ||
      !name.trim() ||
      name.length > 200 ||
      !Number.isFinite(Date.parse(createdAt)) ||
      !Number.isFinite(Date.parse(updatedAt))
    )
      throw new Error('INVALID_APP_DATA');
    ids.add(id);
    const nutrientsPer100g: CustomFood['nutrientsPer100g'] = {};
    for (const [nutrient, nutrientValue] of Object.entries(
      entry.nutrientsPer100g,
    )) {
      if (!nutrientKeys.includes(nutrient as NutrientKey))
        throw new Error('INVALID_APP_DATA');
      const value = expectBoundedNumber(nutrientValue);
      const maximum = nutrient === 'energyKcal' ? 1_000 : 100;
      if (value > maximum) throw new Error('INVALID_APP_DATA');
      nutrientsPer100g[nutrient as NutrientKey] = value;
    }
    const aliases =
      entry.aliases === undefined ? [] : expectStringArray(entry.aliases);
    if (aliases.length > 50) throw new Error('INVALID_APP_DATA');
    let gramsPerUnit: CustomFood['gramsPerUnit'];
    if (entry.gramsPerUnit !== undefined) {
      if (!isRecord(entry.gramsPerUnit)) throw new Error('INVALID_APP_DATA');
      const pairs = Object.entries(entry.gramsPerUnit);
      if (pairs.length > 50) throw new Error('INVALID_APP_DATA');
      gramsPerUnit = Object.fromEntries(
        pairs.map(([unit, amount]) => {
          if (!unit.trim() || unit.length > 100)
            throw new Error('INVALID_APP_DATA');
          return [unit, expectBoundedNumber(amount, 1_000_000)];
        }),
      );
    }
    return {
      id,
      name,
      aliases,
      nutrientsPer100g,
      ...(entry.needsReview === true ? { needsReview: true } : {}),
      ...(entry.densityGPerMl !== undefined
        ? {
            densityGPerMl: expectBoundedNumber(entry.densityGPerMl, 100),
          }
        : {}),
      ...(gramsPerUnit ? { gramsPerUnit } : {}),
      createdAt,
      updatedAt,
    };
  });
}

function migrateRecipeDrafts(
  value: unknown,
  legacyNutrition: boolean,
  recipeIds: ReadonlySet<string>,
): RecipeDraft[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('INVALID_APP_DATA');
  const draftIds = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error('INVALID_APP_DATA');
    const id = expectString(entry.id);
    const rawName = expectString(entry.name);
    const createdAt = expectString(entry.createdAt);
    const updatedAt = expectString(entry.updatedAt);
    const baseRecipeId =
      typeof entry.baseRecipeId === 'string'
        ? expectString(entry.baseRecipeId)
        : undefined;
    if (
      !id ||
      id.length > 200 ||
      draftIds.has(id) ||
      !Number.isFinite(Date.parse(createdAt)) ||
      !Number.isFinite(Date.parse(updatedAt)) ||
      (baseRecipeId !== undefined && !recipeIds.has(baseRecipeId))
    )
      throw new Error('INVALID_APP_DATA');
    draftIds.add(id);
    const recipe = migrateRecipe(
      {
        ...entry,
        id,
        shareId: `draft:${id}`,
        name: rawName.trim() ? rawName : 'Entwurf',
        imageCell: entry.imageCell ?? 0,
      },
      legacyNutrition,
    );
    const { shareId: _, ...draftRecipe } = recipe;
    return {
      ...draftRecipe,
      name: rawName,
      ...(baseRecipeId ? { baseRecipeId } : {}),
      foodOverrides: migrateFoodOverrides(entry.foodOverrides),
      createdAt,
      updatedAt,
    };
  });
}

export function migrateAppData(value: unknown): AppData {
  if (!isRecord(value)) throw new Error('INVALID_APP_DATA');
  const version = value.schemaVersion ?? 1;
  if (
    version !== 1 &&
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== APP_SCHEMA_VERSION
  )
    throw new Error('UNSUPPORTED_SCHEMA_VERSION');
  if (
    !Array.isArray(value.recipes) ||
    !Array.isArray(value.plan) ||
    !Array.isArray(value.shopping) ||
    value.recipes.length > 1_000 ||
    value.plan.length > 3_660 ||
    value.shopping.length > 10_000 ||
    typeof value.onboardingDone !== 'boolean'
  )
    throw new Error('INVALID_APP_DATA');

  const recipes = value.recipes.map((recipe) =>
    migrateRecipe(recipe, version !== APP_SCHEMA_VERSION),
  );
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const recipeIds = new Set(recipeMap.keys());
  const shareIds = new Set(recipes.map((recipe) => recipe.shareId));
  if (recipeIds.size !== recipes.length || shareIds.size !== recipes.length)
    throw new Error('INVALID_APP_DATA');
  const imageKeys = recipes.flatMap((recipe) =>
    recipe.imageKey ? [recipe.imageKey] : [],
  );
  if (new Set(imageKeys).size !== imageKeys.length)
    throw new Error('INVALID_APP_DATA');
  const planDates = new Set<string>();
  const plan = value.plan.map((day) => {
    if (!isRecord(day) || !Array.isArray(day.meals))
      throw new Error('INVALID_APP_DATA');
    const date = expectString(day.date);
    parseLocalDate(date);
    if (planDates.has(date)) throw new Error('INVALID_APP_DATA');
    planDates.add(date);
    const usedSlots = new Set<MealSlot>();
    return {
      date,
      meals: day.meals.map((meal) => {
        if (!isRecord(meal)) throw new Error('INVALID_APP_DATA');
        const slot = expectString(meal.slot) as MealSlot;
        const recipeId = expectString(meal.recipeId);
        const recipe = recipeMap.get(recipeId);
        const servings =
          meal.servings === undefined
            ? recipe?.servings
            : expectBoundedNumber(meal.servings, 1_000);
        const trackedServings =
          meal.trackedServings === undefined
            ? undefined
            : expectBoundedNumber(meal.trackedServings, 1_000);
        if (
          !mealSlots.includes(slot) ||
          !recipe ||
          usedSlots.has(slot) ||
          servings === undefined ||
          servings <= 0 ||
          trackedServings === 0 ||
          (trackedServings !== undefined && trackedServings > servings)
        )
          throw new Error('INVALID_APP_DATA');
        usedSlots.add(slot);
        return {
          slot,
          recipeId,
          servings,
          ...(trackedServings !== undefined ? { trackedServings } : {}),
        };
      }),
    };
  });
  const shoppingIds = new Set<string>();
  const shopping = value.shopping.map((item): ShoppingItem => {
    if (!isRecord(item) || typeof item.checked !== 'boolean')
      throw new Error('INVALID_APP_DATA');
    const category = expectString(item.category) as ShoppingItem['category'];
    if (!shoppingCategories.includes(category))
      throw new Error('INVALID_APP_DATA');
    const id = expectString(item.id);
    if (!id || id.length > 200 || shoppingIds.has(id))
      throw new Error('INVALID_APP_DATA');
    shoppingIds.add(id);
    return {
      id,
      name: expectString(item.name),
      category,
      checked: item.checked,
      origin: migrateShoppingOrigin(item.origin),
      ...(typeof item.source === 'string'
        ? { source: expectString(item.source) }
        : {}),
      ...(typeof item.needsReview === 'boolean'
        ? { needsReview: item.needsReview }
        : {}),
    };
  });
  const installedSamplePacks =
    value.installedSamplePacks === undefined
      ? []
      : expectStringArray(value.installedSamplePacks);
  if (
    installedSamplePacks.length > 100 ||
    new Set(installedSamplePacks).size !== installedSamplePacks.length
  )
    throw new Error('INVALID_APP_DATA');

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    recipes,
    plan,
    shopping,
    onboardingDone: value.onboardingDone,
    installedSamplePacks,
    nutritionSettings: migrateNutritionSettings(value.nutritionSettings),
    // V4 keys were based on free text and cannot be mapped unambiguously.
    // V5 already uses stable ingredient IDs and can be retained safely.
    foodOverrides:
      version === APP_SCHEMA_VERSION || version === 5
        ? migrateFoodOverrides(value.foodOverrides)
        : {},
    customFoods:
      version === APP_SCHEMA_VERSION
        ? migrateCustomFoods(value.customFoods)
        : [],
    recipeDrafts:
      version === APP_SCHEMA_VERSION
        ? migrateRecipeDrafts(value.recipeDrafts, false, recipeIds)
        : [],
    ...(typeof value.lastBackup === 'string' &&
    Number.isFinite(Date.parse(value.lastBackup))
      ? { lastBackup: value.lastBackup }
      : {}),
  };
}
