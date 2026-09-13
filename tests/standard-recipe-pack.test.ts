import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData, migrateAppData } from '../lib/model.ts';
import {
  installStandardRecipe,
  installStandardRecipes,
  newStandardImageKeys,
} from '../lib/standard-recipes.ts';
import { additionalStandardRecipes } from '../lib/standard-recipe-catalog.ts';
import { loadStandardRecipeImages } from '../lib/standard-recipe-images.ts';
import {
  parseSharedRecipe,
  serializeSharedRecipe,
} from '../lib/recipe-sharing.ts';

test('neue Nutzer erhalten alle vier Rezepte mit vollständigen JPEG-Bildern', async () => {
  const empty = createEmptyData();
  const installed = installStandardRecipes(empty);
  assert.equal(installed.recipes.length, 4);
  assert.equal(installed.installedSamplePacks.length, 4);
  assert.equal(migrateAppData(installed).recipes.length, 4);
  assert.deepEqual(empty.recipes, []);
  const keys = newStandardImageKeys(empty, installed);
  const images = await loadStandardRecipeImages(keys);
  assert.equal(Object.keys(images).length, 4);
  for (const key of keys) {
    const image = images[key];
    assert.equal(image.type, 'image/jpeg');
    assert.ok(image.size > 10_000 && image.size < 1_000_000);
    assert.deepEqual(
      new Uint8Array(await image.arrayBuffer()).slice(0, 3),
      new Uint8Array([255, 216, 255]),
    );
  }
  assert.equal(
    installed.recipes.find((r) => r.name.includes('Rote-Bete'))?.ingredients[0]
      .amount,
    '500',
  );
  assert.equal(
    installed.recipes
      .find((r) => r.name.includes('Spaghetti'))
      ?.ingredients.find((i) => i.name.includes('Kräuter'))?.amount,
    '30',
  );
});

test('Updates ergänzen nur die drei neuen Rezepte und respektieren gelöschte Cannelloni', () => {
  const old = installStandardRecipe(createEmptyData());
  const updated = installStandardRecipes(old);
  assert.equal(updated.recipes.length, 4);
  assert.strictEqual(updated.recipes[0], old.recipes[0]);
  assert.equal(newStandardImageKeys(old, updated).length, 3);
  const deletedCannelloni = { ...old, recipes: [] };
  const withoutCannelloni = installStandardRecipes(deletedCannelloni);
  assert.equal(withoutCannelloni.recipes.length, 3);
  assert.ok(
    withoutCannelloni.recipes.every((r) => !r.name.includes('Cannelloni')),
  );
  const deletedAll = { ...updated, recipes: [] };
  assert.strictEqual(installStandardRecipes(deletedAll), deletedAll);
  assert.strictEqual(installStandardRecipes(updated), updated);
});

test('bereits importierte Premium-Rezepte bleiben ohne Duplikate oder Bildüberschreibung erhalten', async () => {
  const old = installStandardRecipe(createEmptyData());
  const imported = await Promise.all(
    additionalStandardRecipes.map(async ({ recipe, aliases }, i) => {
      const parsed = await parseSharedRecipe(serializeSharedRecipe(recipe));
      assert.ok(
        aliases.includes(parsed.shareId),
        'Alias must match the real import content hash',
      );
      return {
        ...parsed,
        id: 'import-' + i,
        name: 'Meine bearbeitete Fassung ' + i,
        imageKey: 'my-image-' + i,
      };
    }),
  );
  const current = { ...old, recipes: [...old.recipes, ...imported] };
  const next = installStandardRecipes(current);
  assert.equal(next.recipes.length, 4);
  assert.deepEqual(next.recipes, current.recipes);
  assert.deepEqual(newStandardImageKeys(current, next), []);
  assert.equal(next.installedSamplePacks.length, 4);
});

test('ursprüngliche lokale Rezepte behalten ihre eigenen Inhalte', () => {
  const old = installStandardRecipe(createEmptyData());
  const originals = additionalStandardRecipes.map(({ recipe, aliases }, i) => ({
    ...recipe,
    id: 'original-' + i,
    shareId: aliases[0],
    description: 'Eigene Notizen',
  }));
  const current = { ...old, recipes: [...old.recipes, ...originals] };
  assert.deepEqual(installStandardRecipes(current).recipes, current.recipes);
});

test('bei wenig Platz wird nur erfolgreich hinzugefügten Rezepten eine Installationsmarkierung gegeben', () => {
  const old = installStandardRecipe(createEmptyData());
  const current = {
    ...old,
    recipes: Array.from({ length: 999 }, (_, i) => ({
      ...old.recipes[0],
      id: 'existing-' + i,
      shareId: 'existing:' + i,
    })),
  };
  const next = installStandardRecipes(current);
  assert.equal(next.recipes.length, 1000);
  assert.equal(next.installedSamplePacks.length, 2);
  assert.strictEqual(installStandardRecipes(next), next);
  const withRoom = { ...next, recipes: next.recipes.slice(2) };
  assert.equal(installStandardRecipes(withRoom).installedSamplePacks.length, 4);
});
