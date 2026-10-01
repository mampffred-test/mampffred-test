import {
  catalogFoodById,
  matchCatalogFood,
  matchCatalogFoods,
} from './food-catalog.ts';
import type { Recipe, RecipeIngredient } from './model.ts';

export type RecipeFilter =
  | 'Alle'
  | 'Favoriten'
  | 'Schnell'
  | 'Vegetarisch'
  | 'Vegan'
  | 'Gesund'
  | 'Proteinreich';

export const reusableRecipeTags = [
  'Schnell',
  'Vegetarisch',
  'Vegan',
  'Gesund',
] as const;

export function visibleRecipeTags(recipe: Pick<Recipe, 'tags'>) {
  const tags = new Set(recipe.tags.map((tag) => normalizeSearchText(tag)));
  return reusableRecipeTags.filter((tag) => tags.has(normalizeSearchText(tag)));
}

function normalizeSearchText(value: string) {
  return value
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('Ä', 'Ae')
    .replaceAll('Ö', 'Oe')
    .replaceAll('Ü', 'Ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('de-DE');
}

const ingredientFoodCache = new WeakMap<RecipeIngredient, Set<string>>();

/** Catalog foods of an ingredient, cached per ingredient object. */
function ingredientFoodIds(ingredient: RecipeIngredient) {
  let ids = ingredientFoodCache.get(ingredient);
  if (!ids) {
    const linked =
      ingredient.foodLink?.kind === 'catalog'
        ? catalogFoodById(ingredient.foodLink.foodId)
        : undefined;
    ids = new Set(
      (linked ? [linked] : matchCatalogFoods(ingredient.name)).map(
        (food) => food.id,
      ),
    );
    ingredientFoodCache.set(ingredient, ids);
  }
  return ids;
}

export function filterRecipes(
  recipes: readonly Recipe[],
  query: string,
  filter: RecipeFilter,
  options: { isHighProtein?: (recipe: Recipe) => boolean } = {},
) {
  const normalizedQuery = normalizeSearchText(query.trim());
  // "Kirschtomaten" also finds recipes that say "Cherrytomaten".
  const queryFood =
    normalizedQuery.length >= 3 ? matchCatalogFood(query.trim()) : undefined;

  return recipes.filter((recipe) => {
    const tags = visibleRecipeTags(recipe);
    const matchesFilter =
      filter === 'Alle' ||
      (filter === 'Favoriten'
        ? recipe.favorite
        : filter === 'Proteinreich'
          ? (options.isHighProtein?.(recipe) ?? false)
          : filter === 'Vegetarisch'
            ? tags.includes('Vegetarisch') || tags.includes('Vegan')
            : tags.includes(filter));
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;
    if (
      queryFood &&
      recipe.ingredients.some((ingredient) =>
        ingredientFoodIds(ingredient).has(queryFood.id),
      )
    )
      return true;

    return [
      recipe.name,
      recipe.description,
      ...visibleRecipeTags(recipe),
      ...recipe.ingredients.map((ingredient) => ingredient.name),
    ].some((value) => normalizeSearchText(value).includes(normalizedQuery));
  });
}
