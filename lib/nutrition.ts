import type { AppData, NutrientKey, Recipe } from './model.ts';
import { addLocalDays } from './local-date.ts';

export const NUTRIENT_KEYS = [
  'energyKcal',
  'proteinG',
  'carbohydratesG',
  'fatG',
  'fiberG',
  'sugarG',
  'saltG',
] as const satisfies readonly NutrientKey[];

export type NutritionQuality = 'declared' | 'estimated';

export type AggregatedNutrient = {
  /** Null means that no defensible total is available. */
  value: number | null;
  coveredMeals: number;
  totalMeals: number;
  coverage: number;
  quality: NutritionQuality | null;
};

export type WeeklyNutrition = {
  weekStart: string;
  weekEnd: string;
  mealCount: number;
  nutrients: Record<NutrientKey, AggregatedNutrient>;
};

export type RecipeSuggestion = {
  recipeId: string;
  nutrient: NutrientKey;
  gap: number;
  contributionPerServing: number;
  quality: NutritionQuality;
  /** A deterministic relevance value, not a health assessment. */
  score: number;
};

type NutrientAccumulator = {
  value: number;
  coveredMeals: number;
  hasEstimatedValue: boolean;
};

function finiteInRange(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validServings(value: unknown, allowZero = false) {
  return finiteInRange(value, allowZero ? 0 : Number.MIN_VALUE, 10_000);
}

function nutrientValue(
  recipe: Recipe,
  key: NutrientKey,
  allowDatasetValues: boolean,
) {
  const wholeRecipe = recipe.nutrition?.wholeRecipe;
  if (!wholeRecipe || !Object.hasOwn(wholeRecipe, key)) return undefined;
  const nutrient = wholeRecipe[key];
  if (
    !nutrient ||
    (nutrient.source.kind === 'dataset' && !allowDatasetValues) ||
    nutrient.source.kind === 'imported-unverified' ||
    !finiteInRange(nutrient.value, 0, 10_000_000) ||
    (nutrient.quality !== 'declared' && nutrient.quality !== 'estimated')
  )
    return undefined;
  return nutrient;
}

function effectiveServings(
  meal: { servings: number; trackedServings?: number },
  defaultTrackedServings: number,
) {
  if (meal.trackedServings !== undefined)
    return validServings(meal.trackedServings, true)
      ? meal.trackedServings
      : undefined;
  if (!validServings(meal.servings)) return undefined;
  return validServings(defaultTrackedServings)
    ? Math.min(defaultTrackedServings, meal.servings)
    : undefined;
}

function emptyNutrients(totalMeals: number) {
  return Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [
      key,
      {
        value: null,
        coveredMeals: 0,
        totalMeals,
        coverage: 0,
        quality: null,
      } satisfies AggregatedNutrient,
    ]),
  ) as Record<NutrientKey, AggregatedNutrient>;
}

/**
 * Aggregates seven local calendar days. trackedServings overrides planned
 * servings when it is present. Invalid or missing nutrient data lowers
 * coverage and is never converted into a numeric zero.
 */
export function aggregateNutritionWeek(
  data: AppData,
  weekStart: string,
): WeeklyNutrition {
  const weekEnd = addLocalDays(weekStart, 6);
  const recipeById = new Map(data.recipes.map((recipe) => [recipe.id, recipe]));
  const meals = data.plan
    .filter((day) => day.date >= weekStart && day.date <= weekEnd)
    .flatMap((day) => day.meals)
    .filter(
      (meal) =>
        effectiveServings(
          meal,
          data.nutritionSettings.defaultTrackedServings,
        ) !== 0,
    );
  const totalMeals = meals.length;
  if (totalMeals === 0)
    return {
      weekStart,
      weekEnd,
      mealCount: 0,
      nutrients: emptyNutrients(0),
    };

  const accumulators = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => [
      key,
      { value: 0, coveredMeals: 0, hasEstimatedValue: false },
    ]),
  ) as Record<NutrientKey, NutrientAccumulator>;

  for (const meal of meals) {
    const recipe = recipeById.get(meal.recipeId);
    const servings = effectiveServings(
      meal,
      data.nutritionSettings.defaultTrackedServings,
    );
    if (!recipe || servings === undefined || !validServings(recipe.servings))
      continue;
    const portionFactor = servings / recipe.servings;
    if (!Number.isFinite(portionFactor) || portionFactor < 0) continue;
    for (const key of NUTRIENT_KEYS) {
      const nutrient = nutrientValue(
        recipe,
        key,
        data.nutritionSettings.automaticEstimates,
      );
      if (!nutrient) continue;
      const contribution = nutrient.value * portionFactor;
      if (!Number.isFinite(contribution) || contribution < 0) continue;
      const accumulator = accumulators[key];
      accumulator.value += contribution;
      accumulator.coveredMeals += 1;
      if (nutrient.quality === 'estimated')
        accumulator.hasEstimatedValue = true;
    }
  }

  const nutrients = Object.fromEntries(
    NUTRIENT_KEYS.map((key) => {
      const accumulator = accumulators[key];
      const complete = accumulator.coveredMeals === totalMeals;
      return [
        key,
        {
          value: complete ? accumulator.value : null,
          coveredMeals: accumulator.coveredMeals,
          totalMeals,
          coverage: accumulator.coveredMeals / totalMeals,
          quality: complete
            ? accumulator.hasEstimatedValue
              ? 'estimated'
              : 'declared'
            : null,
        } satisfies AggregatedNutrient,
      ];
    }),
  ) as Record<NutrientKey, AggregatedNutrient>;

  return { weekStart, weekEnd, mealCount: totalMeals, nutrients };
}

/** Aggregates exactly one local calendar day with the same trust rules. */
export function aggregateNutritionDay(data: AppData, date: string) {
  const summary = aggregateNutritionWeek(
    {
      ...data,
      plan: data.plan.filter((day) => day.date === date),
    },
    date,
  );
  return { ...summary, weekEnd: date };
}

/**
 * Produces neutral, local recipe candidates only for goals backed by complete
 * weekly data. It does not diagnose, prescribe, or infer a medical need.
 */
export function suggestRecipesForWeek(
  data: AppData,
  week: WeeklyNutrition,
  limit = 3,
): RecipeSuggestion[] {
  if (!data.nutritionSettings?.enabled || !Number.isInteger(limit) || limit < 1)
    return [];
  const goals = data.nutritionSettings.goals;
  if (!Array.isArray(goals) || week.mealCount === 0) return [];
  const plannedRecipeIds = new Set(
    data.plan
      .filter((day) => day.date >= week.weekStart && day.date <= week.weekEnd)
      .flatMap((day) => day.meals.map((meal) => meal.recipeId)),
  );

  const suggestions: RecipeSuggestion[] = [];
  for (const goal of goals) {
    if (
      !goal ||
      !goal.enabled ||
      goal.period !== 'week' ||
      !NUTRIENT_KEYS.includes(goal.nutrient)
    )
      continue;
    const key = goal.nutrient;
    const minimum = goal.minimum;
    const aggregate = week.nutrients[key];
    if (
      !finiteInRange(minimum, Number.MIN_VALUE, 10_000_000) ||
      aggregate.coverage !== 1 ||
      aggregate.value === null
    )
      continue;
    const goalMinimum = minimum as number;
    const gap = goalMinimum - aggregate.value;
    // Ignore rounding noise and marginal differences.
    if (!Number.isFinite(gap) || gap <= goalMinimum * 0.05) continue;

    for (const recipe of data.recipes) {
      if (plannedRecipeIds.has(recipe.id)) continue;
      if (!validServings(recipe.servings)) continue;
      const nutrient = nutrientValue(
        recipe,
        key,
        data.nutritionSettings.automaticEstimates,
      );
      if (!nutrient) continue;
      const contributionPerServing = nutrient.value / recipe.servings;
      if (!finiteInRange(contributionPerServing, Number.MIN_VALUE, 10_000_000))
        continue;
      const closeness =
        Math.min(contributionPerServing, gap) /
        Math.max(contributionPerServing, gap);
      const qualityWeight = nutrient.quality === 'declared' ? 1 : 0.9;
      suggestions.push({
        recipeId: recipe.id,
        nutrient: key,
        gap,
        contributionPerServing,
        quality: nutrient.quality,
        score: closeness * qualityWeight,
      });
    }
  }

  return suggestions
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.recipeId.localeCompare(right.recipeId) ||
        left.nutrient.localeCompare(right.nutrient),
    )
    .slice(0, limit);
}
