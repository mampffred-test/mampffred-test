import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyData,
  createSampleRecipes,
  migrateAppData,
} from '../lib/model.ts';
import {
  createCannelloniRecipe,
  installStandardRecipe,
  STANDARD_RECIPE_PACK,
} from '../lib/standard-recipes.ts';
import { cannelloniImage } from '../lib/standard-recipe-image.ts';

test('installiert das vollständige Standardrezept einmalig und erhält bestehende Rezepte', async () => {
  const original = createEmptyData();
  original.recipes = createSampleRecipes();
  const next = installStandardRecipe(original);
  assert.equal(original.recipes.length, 6);
  assert.equal(next.recipes.length, 7);
  assert.deepEqual(next.recipes.slice(0, 6), original.recipes);
  assert.equal(migrateAppData(next).recipes.length, 7);
  assert.strictEqual(installStandardRecipe(next), next);
  const recipe = next.recipes.at(-1)!;
  assert.equal(recipe.servings, 4);
  assert.equal(
    recipe.ingredients.find((i) => i.name.includes('Spinat'))?.amount,
    '450',
  );
  const image = cannelloniImage();
  assert.equal(image.type, 'image/jpeg');
  const bytes = new Uint8Array(await image.arrayBuffer());
  assert.deepEqual(bytes.slice(0, 3), new Uint8Array([255, 216, 255]));
  assert.ok(image.size > 10_000 && image.size < 1_000_000);
});

test('gelöschte Standardrezepte erscheinen nicht erneut, eigene Änderungen bleiben erhalten', () => {
  const installed = installStandardRecipe(createEmptyData());
  const deleted = { ...installed, recipes: [] };
  assert.strictEqual(installStandardRecipe(deleted), deleted);
  const edited = { ...createCannelloniRecipe(), name: 'Mein Rezept' };
  const existing = { ...createEmptyData(), recipes: [edited] };
  const next = installStandardRecipe(existing);
  assert.deepEqual(next.recipes, [edited]);
  assert.ok(next.installedSamplePacks.includes(STANDARD_RECIPE_PACK));
});

test('volle Sammlungen bleiben unverändert und gültig', () => {
  const data = createEmptyData();
  data.recipes = Array.from({ length: 1000 }, (_, i) => ({
    ...createCannelloniRecipe(),
    id: `recipe-${i}`,
    shareId: `custom:${i}`,
    imageKey: undefined,
  }));
  assert.strictEqual(installStandardRecipe(data), data);
  const fullPacks = {
    ...createEmptyData(),
    installedSamplePacks: Array.from({ length: 100 }, (_, i) => `pack-${i}`),
  };
  assert.strictEqual(installStandardRecipe(fullPacks), fullPacks);
});
