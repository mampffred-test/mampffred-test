import assert from 'node:assert/strict';
import test from 'node:test';
import { createSampleRecipes } from '../lib/model.ts';
import { filterRecipes, visibleRecipeTags } from '../lib/recipe-filter.ts';

test('recipe search includes ingredients and ignores German diacritics', () => {
  const recipes = createSampleRecipes();
  const byIngredient = filterRecipes(recipes, 'gemuesebruehe', 'Alle');

  assert.deepEqual(
    byIngredient.map((recipe) => recipe.name),
    ['Kürbis-Linsensuppe'],
  );
});

test('recipe filters combine with the search query', () => {
  const recipes = createSampleRecipes().map((recipe, index) => ({
    ...recipe,
    favorite: index === 0,
  }));
  const favorite = recipes[0];

  assert.deepEqual(filterRecipes(recipes, favorite.name, 'Favoriten'), [
    favorite,
  ]);
  assert.deepEqual(filterRecipes(recipes, 'nicht vorhanden', 'Favoriten'), []);
});

test('reusable filters include vegan recipes and hide one-off display tags', () => {
  const recipes = createSampleRecipes();

  assert.deepEqual(
    filterRecipes(recipes, '', 'Vegan').map((recipe) => recipe.name),
    ['Kürbis-Linsensuppe'],
  );
  assert.ok(
    filterRecipes(recipes, '', 'Vegetarisch').some(
      (recipe) => recipe.name === 'Kürbis-Linsensuppe',
    ),
  );
  assert.deepEqual(visibleRecipeTags(recipes[1]), ['Vegetarisch']);
});

test('kuratierte Tags werden unabhängig von Großschreibung erkannt', () => {
  const recipe = {
    ...createSampleRecipes()[0],
    tags: ['VEGAN', 'gesund', 'Familienessen'],
  };

  assert.deepEqual(visibleRecipeTags(recipe), ['Vegan', 'Gesund']);
  assert.deepEqual(filterRecipes([recipe], '', 'Gesund'), [recipe]);
  assert.deepEqual(filterRecipes([recipe], 'Familienessen', 'Alle'), []);
});
