import {
  catalogFoodById,
  foldFoodName,
  matchCatalogFoods,
} from './food-catalog.ts';
import type { Recipe, RecipeIngredient } from './model.ts';

export type Leftover = {
  foodId: string;
  grams: number;
  /** "¾ Zucchini", "ca. 170 g Feta". */
  label: string;
  /** Part of a pack or piece that is left, 0–1. */
  share: number;
};

const LEFTOVER_POINTS = 3;
const ingredientCache = new WeakMap<RecipeIngredient, string[]>();

function ingredientFoodIds(
  ingredient: RecipeIngredient,
  foodAliases: Record<string, string>,
) {
  let ids = ingredientCache.get(ingredient);
  if (!ids) {
    const linked =
      ingredient.foodLink?.kind === 'catalog'
        ? catalogFoodById(ingredient.foodLink.foodId)
        : undefined;
    const learned = foodAliases[foldFoodName(ingredient.name)];
    const learnedFood = learned ? catalogFoodById(learned) : undefined;
    ids = (
      linked
        ? [linked]
        : learnedFood
          ? [learnedFood]
          : matchCatalogFoods(ingredient.name)
    ).map((food) => food.id);
    ingredientCache.set(ingredient, ids);
  }
  return ids;
}

/** Catalog foods a recipe uses. */
export function recipeFoodIds(
  recipe: Recipe,
  foodAliases: Record<string, string>,
) {
  return new Set(
    recipe.ingredients.flatMap((ingredient) =>
      ingredientFoodIds(ingredient, foodAliases),
    ),
  );
}

/** How well a recipe uses up leftovers; each leftover food counts once. */
export function leftoverBonus(
  recipe: Recipe,
  leftovers: ReadonlySet<string>,
  foodAliases: Record<string, string>,
) {
  const foods = [...recipeFoodIds(recipe, foodAliases)].filter((id) =>
    leftovers.has(id),
  );
  return { score: foods.length * LEFTOVER_POINTS, foods };
}
