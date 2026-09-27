import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData, migrateAppData } from '../lib/model.ts';
import { additionalStandardRecipes } from '../lib/standard-recipe-catalog.ts';

test('ersetzt das alte Frikassee-Foto einmalig und bewahrt eigene oder entfernte Fotos', () => {
  const current = installStandardRecipes(createEmptyData());
  const recipe = current.recipes.find(
    (r) =>
      r.id ===
      'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-v1',
  )!;
  const oldKey =
    'standard-vegetarisches-huehnerfrikassee-mit-kraeuterseitlingen-image-v1';
  for (const imageKey of [oldKey, 'custom-photo', undefined]) {
    const before = {
      ...current,
      recipes: current.recipes.map((r) =>
        r.id === recipe.id ? { ...r, imageKey, description: 'Meine Notiz' } : r,
      ),
    };
    const after = installStandardRecipes(before);
    const updated = after.recipes.find((r) => r.id === recipe.id)!;
    assert.equal(updated.description, 'Meine Notiz');
    assert.equal(
      updated.imageKey,
      imageKey === oldKey ? recipe.imageKey : imageKey,
    );
    assert.deepEqual(
      newStandardImageKeys(before, after),
      imageKey === oldKey ? [recipe.imageKey] : [],
    );
    assert.strictEqual(installStandardRecipes(after), after);
  }
});
import {
  installStandardRecipes,
  newStandardImageKeys,
  STANDARD_IMAGE_UPDATE_PACK,
} from '../lib/standard-recipes.ts';

function beforeImageUpdate() {
  const current = installStandardRecipes(createEmptyData());
  return {
    ...current,
    installedSamplePacks: current.installedSamplePacks.filter(
      (pack) => pack !== STANDARD_IMAGE_UPDATE_PACK,
    ),
    recipes: current.recipes.map((recipe, index) => {
      if (index < 4) return recipe;
      const { imageKey: _imageKey, ...withoutImage } = recipe;
      return { ...withoutImage, description: 'Eigene Notiz' };
    }),
  };
}

test('ergänzt alle 17 Bilder bereits installierter Rezepte und bewahrt eigene Inhalte', () => {
  const before = beforeImageUpdate();
  const after = installStandardRecipes(before);
  assert.equal(newStandardImageKeys(before, after).length, 17);
  assert.equal(after.recipes.length, 21);
  assert.ok(after.recipes.every((recipe) => recipe.imageKey));
  assert.ok(
    after.recipes
      .slice(4)
      .every((recipe) => recipe.description === 'Eigene Notiz'),
  );
  assert.equal(migrateAppData(after).recipes.length, 21);
  assert.strictEqual(installStandardRecipes(after), after);
});

test('bewahrt eigene Fotos, überspringt gelöschte Rezepte und erneuert bewusst entfernte Bilder nicht', () => {
  const before = beforeImageUpdate();
  before.recipes[4] = {
    ...before.recipes[4],
    imageKey: 'my-photo',
    imageFrame: { x: 0.2, y: 0.3, zoom: 2 },
  };
  const deleted = before.recipes.pop()!;
  const after = installStandardRecipes(before);
  assert.strictEqual(after.recipes[4], before.recipes[4]);
  assert.ok(!after.recipes.some((recipe) => recipe.id === deleted.id));
  assert.equal(newStandardImageKeys(before, after).length, 15);
  const removed = {
    ...after,
    recipes: after.recipes.map((recipe) => ({
      ...recipe,
      imageKey: undefined,
    })),
  };
  assert.strictEqual(installStandardRecipes(removed), removed);
});

test('aktualisiert über Importalias erkannte Rezepte und setzt alte Platzhalter-Bildausschnitte zurück', () => {
  const before = beforeImageUpdate();
  before.recipes[4] = {
    ...before.recipes[4],
    id: 'previously-imported-lasagne',
    shareId: additionalStandardRecipes[3].aliases[0],
    imageFrame: { x: 0, y: 0, zoom: 3 },
  };
  const after = installStandardRecipes(before);
  assert.equal(after.recipes[4].imageFrame, undefined);
  assert.ok(after.recipes[4].imageKey);
  assert.ok(
    newStandardImageKeys(before, after).includes(after.recipes[4].imageKey!),
  );
});
