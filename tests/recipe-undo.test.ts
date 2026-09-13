import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData } from '../lib/model.ts';
import { installStandardRecipes } from '../lib/standard-recipes.ts';
import {
  removeRecipe,
  restoreRecipes,
  removedRecipeImageKeys,
} from '../lib/recipe-undo.ts';

function fixture() {
  const data = installStandardRecipes(createEmptyData());
  const recipe = data.recipes[0];
  data.recipeDrafts = [
    {
      ...recipe,
      id: 'draft',
      baseRecipeId: recipe.id,
      imageKey: 'draft-image',
      foodOverrides: {},
      createdAt: '2026-09-13',
      updatedAt: '2026-09-13',
    },
  ];
  data.plan = [
    {
      date: '2026-09-13',
      meals: [
        { slot: 'Mittagessen', recipeId: recipe.id, servings: 2 },
        { slot: 'Abendessen', recipeId: data.recipes[1].id, servings: 4 },
      ],
    },
  ];
  return data;
}

test('mehrere direkte Löschungen lassen sich gemeinsam vollständig rückgängig machen', () => {
  const original = fixture();
  const first = removeRecipe(original, original.recipes[0].id)!;
  const second = removeRecipe(first.next, original.recipes[1].id)!;
  const third = removeRecipe(second.next, original.recipes[3].id)!;
  assert.equal(third.next.recipes.length, 1);
  assert.equal(third.next.recipeDrafts.length, 0);
  assert.equal(third.next.plan[0].meals.length, 0);
  const removed = [first.removed, second.removed, third.removed];
  const restored = restoreRecipes(third.next, removed);
  assert.deepEqual(restored.recipes, original.recipes);
  assert.deepEqual(restored.recipeDrafts, original.recipeDrafts);
  assert.deepEqual(
    [...restored.plan[0].meals].sort((a, b) => a.slot.localeCompare(b.slot)),
    [...original.plan[0].meals].sort((a, b) => a.slot.localeCompare(b.slot)),
  );
  assert.deepEqual(restoreRecipes(restored, removed), restored);
  assert.ok(removedRecipeImageKeys(removed).includes('draft-image'));
  for (const entry of removed)
    assert.ok(removedRecipeImageKeys(removed).includes(entry.recipe.imageKey!));
  assert.equal(original.recipes.length, 4);
});

test('Rückgängig behält neue Rezepte, geänderte Entwürfe und neu belegte Mahlzeiten', () => {
  const data = fixture();
  const deletion = removeRecipe(data, data.recipes[0].id)!;
  const updatedDraft = { ...data.recipeDrafts[0], name: 'Neu bearbeitet' };
  deletion.next.recipeDrafts.push(updatedDraft);
  const newRecipe = { ...data.recipes[0], id: 'new', shareId: 'new' };
  deletion.next.recipes.push(newRecipe);
  deletion.next.plan[0].meals.push({
    slot: 'Mittagessen',
    recipeId: 'new',
    servings: 1,
  });
  const restored = restoreRecipes(deletion.next, [deletion.removed]);
  assert.ok(restored.recipes.includes(newRecipe));
  assert.deepEqual(restored.recipeDrafts, [updatedDraft]);
  assert.equal(
    restored.plan[0].meals.find((meal) => meal.slot === 'Mittagessen')
      ?.recipeId,
    'new',
  );
  assert.equal(removeRecipe(restored, 'missing'), undefined);
});

test('gemeinsam verwendete Bilder werden nur einmal für Rückgängig zurückgehalten', () => {
  const data = fixture();
  data.recipes[1].imageKey = data.recipes[0].imageKey;
  const first = removeRecipe(data, data.recipes[0].id)!;
  const second = removeRecipe(first.next, data.recipes[1].id)!;
  assert.deepEqual(removedRecipeImageKeys([first.removed, second.removed]), [
    data.recipes[0].imageKey,
    'draft-image',
  ]);
});
