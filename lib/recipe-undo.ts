import type { AppData, Recipe, RecipeDraft } from './model.ts';

export type RemovedRecipe = {
  recipe: Recipe;
  index: number;
  drafts: RecipeDraft[];
  meals: Array<{
    date: string;
    meal: AppData['plan'][number]['meals'][number];
  }>;
};

export function removeRecipe(data: AppData, id: string) {
  const index = data.recipes.findIndex((recipe) => recipe.id === id);
  if (index < 0) return undefined;
  const removed: RemovedRecipe = {
    recipe: data.recipes[index],
    index,
    drafts: data.recipeDrafts.filter(
      (draft) => draft.id === id || draft.baseRecipeId === id,
    ),
    meals: data.plan.flatMap((day) =>
      day.meals
        .filter((meal) => meal.recipeId === id)
        .map((meal) => ({ date: day.date, meal })),
    ),
  };
  return {
    removed,
    next: {
      ...data,
      recipes: data.recipes.filter((recipe) => recipe.id !== id),
      recipeDrafts: data.recipeDrafts.filter(
        (draft) => !removed.drafts.includes(draft),
      ),
      plan: data.plan.map((day) => ({
        ...day,
        meals: day.meals.filter((meal) => meal.recipeId !== id),
      })),
    },
  };
}

// Undo in reverse deletion order, since each index describes that moment's list.
export function restoreRecipes(
  data: AppData,
  removed: readonly RemovedRecipe[],
): AppData {
  let next = data;
  for (const entry of [...removed].reverse()) {
    const recipes = [...next.recipes];
    if (!recipes.some((recipe) => recipe.id === entry.recipe.id))
      recipes.splice(Math.min(entry.index, recipes.length), 0, entry.recipe);
    next = {
      ...next,
      recipes,
      recipeDrafts: [
        ...next.recipeDrafts,
        ...entry.drafts.filter(
          (draft) =>
            !next.recipeDrafts.some((current) => current.id === draft.id),
        ),
      ],
      plan: next.plan.map((day) => ({
        ...day,
        meals: [
          ...day.meals,
          ...entry.meals
            .filter(
              ({ date, meal }) =>
                date === day.date &&
                !day.meals.some((current) => current.slot === meal.slot),
            )
            .map(({ meal }) => meal),
        ],
      })),
    };
  }
  return next;
}

export function removedRecipeImageKeys(removed: readonly RemovedRecipe[]) {
  return [
    ...new Set(
      removed
        .flatMap(({ recipe, drafts }) => [recipe, ...drafts])
        .flatMap((owner) => (owner.imageKey ? [owner.imageKey] : [])),
    ),
  ];
}
