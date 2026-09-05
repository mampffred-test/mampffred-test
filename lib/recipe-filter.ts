import type { Recipe } from './model.ts';

export type RecipeFilter =
  | 'Alle'
  | 'Favoriten'
  | 'Schnell'
  | 'Vegetarisch'
  | 'Vegan'
  | 'Gesund';

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

export function filterRecipes(
  recipes: readonly Recipe[],
  query: string,
  filter: RecipeFilter,
) {
  const normalizedQuery = normalizeSearchText(query.trim());

  return recipes.filter((recipe) => {
    const tags = visibleRecipeTags(recipe);
    const matchesFilter =
      filter === 'Alle' ||
      (filter === 'Favoriten'
        ? recipe.favorite
        : filter === 'Vegetarisch'
          ? tags.includes('Vegetarisch') || tags.includes('Vegan')
          : tags.includes(filter));
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;

    return [
      recipe.name,
      recipe.description,
      ...visibleRecipeTags(recipe),
      ...recipe.ingredients.map((ingredient) => ingredient.name),
    ].some((value) => normalizeSearchText(value).includes(normalizedQuery));
  });
}
