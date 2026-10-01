import assert from 'node:assert/strict';
import test from 'node:test';

import { catalogFoodReferences } from '../lib/food-catalog.ts';
import {
  calculateRecipeFromIngredients,
  isHighProtein,
  recipeNutritionEstimate,
} from '../lib/food-nutrition.ts';
import { createSampleRecipes, type Recipe } from '../lib/model.ts';
import { additionalStandardRecipes } from '../lib/standard-recipe-catalog.ts';
import { createCannelloniRecipe } from '../lib/standard-recipes.ts';

const foods = catalogFoodReferences();

function recipe(ingredients: Recipe['ingredients'], servings = 2): Recipe {
  return {
    id: 'test',
    shareId: 'test:test',
    name: 'Testrezept',
    description: '',
    minutes: 20,
    servings,
    tags: [],
    ingredients: ingredients.map((ingredient, index) => ({
      ...ingredient,
      id: ingredient.id ?? `ingredient-${index}`,
    })),
    steps: [],
    imageCell: 0,
  };
}

test('alle eingebauten Rezepte bekommen vollständige Nährwerte aus dem Katalog', () => {
  const recipes = [
    createCannelloniRecipe(),
    ...additionalStandardRecipes.map((entry) => entry.recipe),
    ...createSampleRecipes(),
  ];
  for (const entry of recipes) {
    const result = calculateRecipeFromIngredients(entry, foods);
    assert.equal(
      result.complete,
      true,
      `${entry.name}: ${result.ingredients
        .filter(
          (item) =>
            item.status === 'unresolved' || item.status === 'amount-unresolved',
        )
        .map((item) => entry.ingredients[item.ingredientIndex].name)
        .join(', ')}`,
    );
    const protein = result.wholeRecipe.proteinG?.value ?? 0;
    assert.ok(protein / entry.servings > 3, `${entry.name}: ${protein}`);
  }
});

test('Gewürze und Wasser zählen als vernachlässigbar statt zu blockieren', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      { amount: '200', unit: 'g', name: 'Rote Linsen' },
      { amount: '', unit: '', name: 'Salz und Pfeffer' },
      { amount: '500', unit: 'ml', name: 'Wasser' },
    ]),
    foods,
  );
  assert.equal(result.complete, true);
  assert.equal(result.ingredients[1].status, 'negligible');
  assert.equal(result.ingredients[2].status, 'negligible');
  assert.ok(Math.abs((result.wholeRecipe.proteinG?.value ?? 0) - 51.2) < 0.01);
});

test('optionale Zutaten und Zutaten ohne Menge werden ausgewiesen, nicht geraten', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      { amount: '200', unit: 'g', name: 'Feta' },
      { amount: '75', unit: 'g', name: 'Optional: Mais' },
      { amount: '1', unit: 'EL', name: 'Pesto', optional: true },
      { amount: '', unit: '', name: 'Etwas Öl zum Anbraten' },
    ]),
    foods,
  );
  assert.equal(result.complete, true);
  assert.equal(result.ingredients[1].status, 'optional');
  assert.equal(result.ingredients[2].status, 'optional');
  assert.equal(result.ingredients[3].status, 'no-amount');
  assert.equal(result.notCountedIngredients, 3);
  assert.ok(Math.abs((result.wholeRecipe.proteinG?.value ?? 0) - 31.36) < 0.01);
});

test('versteht Brüche und Haushaltsmengen über Stückgewichte', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      { amount: '½', unit: 'Stück', name: 'Zwiebel' },
      { amount: '2', unit: 'Zehen', name: 'Knoblauch' },
      { amount: '2', unit: 'EL', name: 'Olivenöl' },
    ]),
    foods,
  );
  assert.equal(result.complete, true);
  assert.equal(result.assumedAmounts, 3);
});

test('gelernte Zuordnungen gelten für jedes Rezept mit diesem Namen', () => {
  const result = calculateRecipeFromIngredients(
    recipe([{ amount: '100', unit: 'g', name: 'Mein Spezialkäse' }]),
    foods,
    {},
    { foodAliases: { 'mein spezialkase': 'mf:feta' } },
  );
  assert.equal(result.ingredients[0].status, 'user-confirmed');
  assert.ok(Math.abs((result.wholeRecipe.proteinG?.value ?? 0) - 15.68) < 0.01);
});

test('unbekannte Zutaten mit Menge blockieren weiterhin die Schätzung', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      { amount: '200', unit: 'g', name: 'Feta' },
      { amount: '50', unit: 'g', name: 'Zauberwurz' },
    ]),
    foods,
  );
  assert.equal(result.complete, false);
  assert.equal(result.wholeRecipe.proteinG, undefined);
});

test('liefert eine wirksame Rezeptschätzung und schützt eigene Angaben', () => {
  const base = recipe([{ amount: '400', unit: 'g', name: 'Tofu' }]);
  const estimate = recipeNutritionEstimate(base, { foods });
  assert.ok(
    Math.abs((estimate?.wholeRecipe.proteinG?.value ?? 0) - 62.04) < 0.01,
  );
  assert.equal(estimate?.wholeRecipe.proteinG?.quality, 'estimated');
  const declared = recipeNutritionEstimate(
    {
      ...base,
      nutrition: {
        enteredAs: 'whole-recipe',
        updatedAt: '2026-10-01T10:00:00.000Z',
        wholeRecipe: {
          proteinG: {
            value: 70,
            quality: 'declared',
            source: { kind: 'user' },
          },
        },
      },
    },
    { foods },
  );
  assert.equal(declared?.wholeRecipe.proteinG?.value, 70);
  assert.ok((declared?.wholeRecipe.energyKcal?.value ?? 0) > 0);
  // Gleiche Eingabe liefert dasselbe Objekt (kein Neuberechnen beim Rendern).
  assert.equal(recipeNutritionEstimate(base, { foods }), estimate);
});

test('markiert proteinreiche Portionen nach Energieanteil oder Menge', () => {
  assert.equal(isHighProtein({ proteinG: 25, energyKcal: 600 }), true);
  assert.equal(isHighProtein({ proteinG: 18, energyKcal: 300 }), true);
  assert.equal(isHighProtein({ proteinG: 12, energyKcal: 500 }), false);
  assert.equal(isHighProtein({ proteinG: 12 }), false);
});
