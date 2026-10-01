import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyData, migrateAppData, type Recipe } from '../lib/model.ts';
import { additionalStandardRecipes } from '../lib/standard-recipe-catalog.ts';
import {
  INGREDIENT_UPGRADE_PACK,
  LEGACY_STANDARD_INGREDIENTS,
  upgradeStandardRecipeIngredients,
} from '../lib/standard-recipe-upgrade.ts';
import {
  createCannelloniRecipe,
  installStandardRecipes,
} from '../lib/standard-recipes.ts';
import { matchCatalogFoods } from '../lib/food-catalog.ts';

const standard = () => [
  createCannelloniRecipe(),
  ...additionalStandardRecipes.map((entry) => entry.recipe),
];

/** A recipe as an older app version installed and stored it. */
function legacyCopy(recipe: Recipe): Recipe {
  const legacy = LEGACY_STANDARD_INGREDIENTS[recipe.id];
  return {
    ...structuredClone(recipe),
    ingredients: legacy.map((ingredient, index) => ({
      ...ingredient,
      id: `${recipe.id}-ingredient-${index + 1}`,
    })),
  };
}

test('jede Standardzutat ist sauber benannt und mit dem Katalog verknüpft', () => {
  for (const recipe of standard())
    for (const ingredient of recipe.ingredients) {
      assert.ok(
        ingredient.foodLink?.kind === 'catalog' ||
          matchCatalogFoods(ingredient.name).length > 1,
        `${recipe.name}: ${ingredient.name}`,
      );
      assert.doesNotMatch(ingredient.name, /\(|optional/i, ingredient.name);
    }
});

test('aktualisiert unveränderte Standardrezepte und behält Zutaten-IDs', () => {
  const data = createEmptyData();
  data.recipes = standard().map(legacyCopy);
  const upgraded = upgradeStandardRecipeIngredients(data);
  assert.ok(upgraded.installedSamplePacks.includes(INGREDIENT_UPGRADE_PACK));
  for (const [index, recipe] of upgraded.recipes.entries()) {
    const fresh = standard()[index];
    assert.deepEqual(
      recipe.ingredients.map((ingredient) => {
        const copy = { ...ingredient };
        delete copy.id;
        return copy;
      }),
      fresh.ingredients,
      recipe.name,
    );
    assert.deepEqual(
      recipe.ingredients.map((ingredient) => ingredient.id),
      data.recipes[index].ingredients.map((ingredient) => ingredient.id),
    );
  }
  assert.doesNotThrow(() => migrateAppData(upgraded));
});

test('lässt selbst bearbeitete Standardrezepte unangetastet', () => {
  const data = createEmptyData();
  const edited = legacyCopy(createCannelloniRecipe());
  edited.ingredients[0] = { ...edited.ingredients[0], amount: '300' };
  data.recipes = [edited];
  const upgraded = upgradeStandardRecipeIngredients(data);
  assert.deepEqual(upgraded.recipes[0], edited);
  assert.ok(upgraded.installedSamplePacks.includes(INGREDIENT_UPGRADE_PACK));
});

test('läuft nur einmal und gehört zur normalen Installation', () => {
  const data = createEmptyData();
  data.recipes = [legacyCopy(createCannelloniRecipe())];
  const once = upgradeStandardRecipeIngredients(data);
  assert.equal(upgradeStandardRecipeIngredients(once), once);
  const installed = installStandardRecipes(createEmptyData());
  assert.ok(installed.installedSamplePacks.includes(INGREDIENT_UPGRADE_PACK));
});

test('behält beim Aktualisieren selbst gewählte Zuordnungen', () => {
  const data = createEmptyData();
  const legacy = legacyCopy(createCannelloniRecipe());
  legacy.ingredients[1] = {
    ...legacy.ingredients[1],
    foodLink: { kind: 'custom', foodId: 'custom:mein-frischkaese' },
  };
  data.recipes = [legacy];
  const upgraded = upgradeStandardRecipeIngredients(data);
  assert.deepEqual(upgraded.recipes[0].ingredients[1].foodLink, {
    kind: 'custom',
    foodId: 'custom:mein-frischkaese',
  });
  assert.equal(upgraded.recipes[0].ingredients[0].foodLink?.kind, 'catalog');
});
