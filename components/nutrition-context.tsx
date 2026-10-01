import { createContext, useContext } from 'react';
import type { RecipeNutrition, Recipe } from '@/lib/model';

export type RecipeNutritionResolver = (
  recipe: Recipe,
) => RecipeNutrition | undefined;

/** Effective nutrition of a recipe: own values plus a live estimate. */
export const RecipeNutritionContext = createContext<RecipeNutritionResolver>(
  (recipe) => recipe.nutrition,
);

export function useRecipeNutrition() {
  return useContext(RecipeNutritionContext);
}
