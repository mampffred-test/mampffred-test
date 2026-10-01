import { migrateAppData, type AppData } from './model.ts';

export const DATA_LIMITS = {
  recipes: 1_000,
  recipeDrafts: 100,
  customFoods: 1_000,
  shopping: 10_000,
  plan: 3_660,
} as const;

export function validateDataUpdate(
  current: AppData,
  update: AppData | ((current: AppData) => AppData),
) {
  const next = typeof update === 'function' ? update(current) : update;
  const labels = {
    recipes: 'Rezepte',
    recipeDrafts: 'Entwürfe',
    customFoods: 'eigene Lebensmittel',
    shopping: 'Einkaufsartikel',
    plan: 'geplante Tage',
  };
  for (const key of Object.keys(DATA_LIMITS) as Array<
    keyof typeof DATA_LIMITS
  >) {
    if (next[key].length > DATA_LIMITS[key])
      throw new Error(
        `Es sind höchstens ${DATA_LIMITS[key].toLocaleString('de-DE')} ${labels[key]} möglich. Bitte entferne zuerst einen Eintrag.`,
      );
  }
  return preserveUnchanged(current, migrateAppData(next));
}

function sameJson(left: unknown, right: unknown) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Validation rebuilds every object. Reusing the previous objects for content
 * that did not change keeps identity-based caches (nutrition estimates,
 * search indexes) valid, which matters on slow phones.
 */
function preserveUnchanged(previous: AppData, next: AppData): AppData {
  const previousRecipes = new Map(
    previous.recipes.map((recipe) => [recipe.id, recipe]),
  );
  const recipes = next.recipes.map((recipe) => {
    const before = previousRecipes.get(recipe.id);
    return before && sameJson(before, recipe) ? before : recipe;
  });
  const keep = <
    K extends 'customFoods' | 'foodOverrides' | 'foodAliases' | 'pantry',
  >(
    key: K,
  ) => (sameJson(previous[key], next[key]) ? previous[key] : next[key]);
  return {
    ...next,
    recipes:
      recipes.length === previous.recipes.length &&
      recipes.every((recipe, index) => recipe === previous.recipes[index])
        ? previous.recipes
        : recipes,
    customFoods: keep('customFoods'),
    foodOverrides: keep('foodOverrides'),
    foodAliases: keep('foodAliases'),
    pantry: keep('pantry'),
  };
}

export function referencedImageKeys(data: AppData) {
  return new Set(
    [...data.recipes, ...data.recipeDrafts].flatMap((entry) =>
      entry.imageKey ? [entry.imageKey] : [],
    ),
  );
}
