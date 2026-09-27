import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData, migrateAppData } from '../lib/model.ts';
import {
  installStandardRecipes,
  standardRecipeCount,
} from '../lib/standard-recipes.ts';
import { scaledIngredientAmount } from '../lib/ingredient-amount.ts';
import {
  parseSharedRecipe,
  serializeSharedRecipe,
  formatSharedRecipeText,
} from '../lib/recipe-sharing.ts';
import { reconcileWeekShopping } from '../lib/week-shopping.ts';

const data = () => installStandardRecipes(createEmptyData());
const pasta = () =>
  data().recipes.find((recipe) => recipe.name === 'Feta-Pasta aus dem Ofen')!;

test('Feta-Pasta skaliert für 2 bis 4 Portionen ausschließlich Nudeln', () => {
  const recipe = pasta();
  for (const servings of [2, 3, 4]) {
    const amounts = recipe.ingredients.map((i) =>
      scaledIngredientAmount(
        i.amount,
        servings / recipe.servings,
        i.scaleWithServings,
      ),
    );
    assert.equal(amounts[0], String(125 * servings));
    assert.deepEqual(
      amounts.slice(1),
      recipe.ingredients.slice(1).map((i) => i.amount),
    );
  }
  assert.equal(scaledIngredientAmount('500', 0.5), '250');
  assert.equal(scaledIngredientAmount('500', 0.5, true), '250');
});

test('Portionseinstellungen überleben Speichern, Migration und Rezeptweitergabe', async () => {
  const original = data();
  const restored = migrateAppData(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(
    restored.recipes
      .find((r) => r.id === pasta().id)!
      .ingredients.map((i) => i.scaleWithServings),
    [true, false, false, false, false, false, false],
  );
  const imported = await parseSharedRecipe(serializeSharedRecipe(pasta()));
  assert.deepEqual(
    imported.ingredients.map((i) => i.scaleWithServings),
    pasta().ingredients.map((i) => i.scaleWithServings),
  );
  assert.match(
    formatSharedRecipeText(imported),
    /Menge bleibt bei Portionsänderung gleich/,
  );
  const invalid = JSON.parse(JSON.stringify(original));
  invalid.recipes[0].ingredients[0].scaleWithServings = 'false';
  assert.throws(() => migrateAppData(invalid), /INVALID_APP_DATA/);
});

test('Wocheneinkauf berechnet feste Mengen pro Kochvorgang und passt nur Nudeln an', () => {
  const recipe = pasta();
  const input = {
    ...createEmptyData(),
    recipes: [recipe],
    plan: [
      {
        date: '2026-09-28',
        meals: [
          { slot: 'Abendessen' as const, recipeId: recipe.id, servings: 2 },
        ],
      },
    ],
  };
  const once = reconcileWeekShopping(input, '2026-09-28');
  assert.ok(once.shopping.some((i) => i.name.startsWith('250 g Nudeln')));
  assert.ok(once.shopping.some((i) => i.name === '500 g Cherrytomaten'));
  assert.ok(once.shopping.some((i) => i.name === '200 g Feta'));
  input.plan.push({
    date: '2026-09-29',
    meals: [{ slot: 'Abendessen', recipeId: recipe.id, servings: 3 }],
  });
  const twice = reconcileWeekShopping(input, '2026-09-28');
  assert.ok(twice.shopping.some((i) => i.name.startsWith('625 g Nudeln')));
  assert.ok(twice.shopping.some((i) => i.name === '1.000 g Cherrytomaten'));
  assert.ok(twice.shopping.some((i) => i.name === '400 g Feta'));
});

test('bestehende vier Standards erhalten genau 17 Ergänzungen ohne Überschreiben', () => {
  const all = data();
  const previous = {
    ...all,
    recipes: all.recipes
      .slice(0, 4)
      .map((r) => ({ ...r, description: 'Eigene Änderung' })),
    installedSamplePacks: all.installedSamplePacks.slice(0, 4),
  };
  const updated = installStandardRecipes(previous);
  assert.equal(updated.recipes.length, 21);
  assert.equal(standardRecipeCount(updated), 21);
  assert.deepEqual(updated.recipes.slice(0, 4), previous.recipes);
  assert.strictEqual(installStandardRecipes(updated), updated);
  const deleted = { ...updated, recipes: updated.recipes.slice(0, 4) };
  assert.strictEqual(installStandardRecipes(deleted), deleted);
});
