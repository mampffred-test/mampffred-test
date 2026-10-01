import legacyIngredients from './data/standard-ingredients-v1.json' with { type: 'json' };
import type { AppData, Recipe, RecipeIngredient } from './model.ts';
import { additionalStandardRecipes } from './standard-recipe-catalog.ts';
import { createCannelloniRecipe } from './standard-recipes.ts';

export const INGREDIENT_UPGRADE_PACK = 'mampffred-ingredients-v2';

type LegacyIngredient = Pick<
  RecipeIngredient,
  'amount' | 'unit' | 'name' | 'scaleWithServings'
>;

/** Ingredient lists exactly as app versions up to 0.2.1 shipped them. */
export const LEGACY_STANDARD_INGREDIENTS = legacyIngredients as Record<
  string,
  LegacyIngredient[]
>;

function comparable(ingredients: readonly LegacyIngredient[]) {
  return JSON.stringify(
    ingredients.map((ingredient) => [
      ingredient.amount,
      ingredient.unit,
      ingredient.name,
      ingredient.scaleWithServings ?? true,
    ]),
  );
}

function standardRecipes() {
  return [
    { recipe: createCannelloniRecipe(), aliases: [] as string[] },
    ...additionalStandardRecipes,
  ];
}

/**
 * Gives unchanged standard recipes their curated ingredients (clean names,
 * notes, optional flags, catalog links). Recipes the person edited keep
 * their own version, and ingredient IDs stay put so corrections remain.
 */
export function upgradeStandardRecipeIngredients(data: AppData): AppData {
  if (data.installedSamplePacks.includes(INGREDIENT_UPGRADE_PACK)) return data;
  if (data.installedSamplePacks.length >= 100) return data;
  const catalog = standardRecipes();
  const recipes = data.recipes.map((recipe): Recipe => {
    const standard = catalog.find(
      (entry) =>
        entry.recipe.id === recipe.id ||
        entry.recipe.shareId === recipe.shareId ||
        entry.aliases.includes(recipe.shareId),
    );
    const legacy = standard
      ? LEGACY_STANDARD_INGREDIENTS[standard.recipe.id]
      : undefined;
    if (
      !standard ||
      !legacy ||
      standard.recipe.ingredients.length !== recipe.ingredients.length ||
      comparable(recipe.ingredients) !== comparable(legacy)
    )
      return recipe;
    return {
      ...recipe,
      ingredients: standard.recipe.ingredients.map((ingredient, index) => {
        const own = recipe.ingredients[index];
        return {
          ...structuredClone(ingredient),
          ...(own.id ? { id: own.id } : {}),
          // A link the person chose themselves wins over the curated one.
          ...(own.foodLink ? { foodLink: own.foodLink } : {}),
        };
      }),
    };
  });
  return {
    ...data,
    recipes,
    installedSamplePacks: [
      ...data.installedSamplePacks,
      INGREDIENT_UPGRADE_PACK,
    ],
  };
}
