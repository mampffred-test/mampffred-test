import { ingredientOverrideKey } from './food-nutrition.ts';
import type {
  FoodOverride,
  RecipeDraft,
  RecipeIngredient,
} from './model.ts';

export function hasMeaningfulRecipeDraft(draft: RecipeDraft) {
  return Boolean(
    draft.name.trim() ||
      draft.description.trim() ||
      draft.ingredients.some((ingredient) => ingredient.name.trim()) ||
      draft.steps.some((step) => step.trim()) ||
      draft.imageKey,
  );
}

export function upsertRecipeDraft(
  drafts: readonly RecipeDraft[],
  draft: RecipeDraft,
) {
  const existingIndex = drafts.findIndex((entry) => entry.id === draft.id);
  if (existingIndex < 0) return [draft, ...drafts];
  return drafts.map((entry, index) => (index === existingIndex ? draft : entry));
}

export function removeRecipeDraft(
  drafts: readonly RecipeDraft[],
  draftId: string,
) {
  return drafts.filter((draft) => draft.id !== draftId);
}

export function replaceRecipeFoodOverrides(
  globalOverrides: Readonly<Record<string, FoodOverride>>,
  recipeId: string,
  previousIngredients: readonly RecipeIngredient[],
  nextIngredients: readonly RecipeIngredient[],
  scopedOverrides: Readonly<Record<string, FoodOverride>>,
) {
  const recipeKeys = new Set(
    [...previousIngredients, ...nextIngredients].map((ingredient, index) =>
      ingredientOverrideKey(
        recipeId,
        ingredient.id ?? `ingredient-${index}`,
      ),
    ),
  );
  return {
    ...Object.fromEntries(
      Object.entries(globalOverrides).filter(([key]) => !recipeKeys.has(key)),
    ),
    ...Object.fromEntries(
      Object.entries(scopedOverrides).filter(([key]) => recipeKeys.has(key)),
    ),
  };
}
