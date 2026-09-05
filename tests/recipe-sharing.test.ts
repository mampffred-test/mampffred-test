import assert from 'node:assert/strict';
import test from 'node:test';

import { createSampleRecipes } from '../lib/model.ts';
import {
  formatSharedRecipeText,
  MAX_SHARED_RECIPE_BYTES,
  parseSharedRecipe,
  serializeSharedRecipe,
} from '../lib/recipe-sharing.ts';

test('erstellt einen lesbaren Text als Android-Fallback', () => {
  const recipe = createSampleRecipes()[0];
  const sharedText = formatSharedRecipeText(recipe);

  assert.match(sharedText, new RegExp(`^${recipe.name}`));
  assert.match(sharedText, /Zutaten\n- 100 g Haferflocken/);
  assert.match(sharedText, /Zubereitung\n1\./);
});

test('teilt nur portable Rezeptdaten ohne lokale oder ungeprüfte Metadaten', async () => {
  const source = createSampleRecipes()[0];
  source.imageKey = 'private-local-image';
  source.favorite = true;
  source.tags = ['Vegetarisch', 'Familienessen'];
  source.ingredients[0].foodLink = {
    kind: 'bls',
    foodId: 'private-local-mapping',
  };

  const imported = await parseSharedRecipe(serializeSharedRecipe(source));

  assert.match(imported.shareId, /^imported:[a-f0-9]{64}$/);
  assert.equal(imported.name, source.name);
  assert.equal(imported.imageKey, undefined);
  assert.equal(imported.favorite, undefined);
  assert.equal(imported.nutrition, undefined);
  assert.deepEqual(imported.tags, ['Vegetarisch']);
  assert.ok(imported.ingredients.every((ingredient) => !ingredient.foodLink));
});

test('weist übergroße und formatfremde Rezeptdateien zurück', async () => {
  await assert.rejects(
    () => parseSharedRecipe('x'.repeat(MAX_SHARED_RECIPE_BYTES + 1)),
    /SHARED_RECIPE_TOO_LARGE/,
  );
  await assert.rejects(
    () => parseSharedRecipe('{"format":"something-else"}'),
    /INVALID_SHARED_RECIPE/,
  );
});

test('Datei-Identitäten können weder Beispiele belegen noch Wiederimporte umgehen', async () => {
  const original = JSON.parse(serializeSharedRecipe(createSampleRecipes()[0]));
  const first = await parseSharedRecipe(JSON.stringify(original));
  original.shareId = 'sample-v1:curry';
  assert.equal(
    (await parseSharedRecipe(JSON.stringify(original))).shareId,
    first.shareId,
  );
  assert.equal(
    (await parseSharedRecipe(serializeSharedRecipe(first))).shareId,
    first.shareId,
  );
  original.recipe.name = 'Anderer Inhalt';
  assert.notEqual(
    (await parseSharedRecipe(JSON.stringify(original))).shareId,
    first.shareId,
  );
});
