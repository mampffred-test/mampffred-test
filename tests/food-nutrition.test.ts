import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRecipeFromIngredients,
  customFoodToReference,
  convertIngredientToGrams,
  ingredientOverrideKey,
  mergeCalculatedNutrition,
  preferredUnitForFood,
  resolveIngredient,
  searchFoodReferences,
  type FoodReference,
} from '../lib/food-nutrition.ts';
import type { Recipe } from '../lib/model.ts';

const foods: FoodReference[] = [
  {
    id: 'bls:lentils-red-dry',
    name: 'Linse rot getrocknet',
    aliases: ['rote linsen', 'rote linse'],
    source: { dataset: 'BLS', version: '4.0' },
    nutrientsPer100g: { proteinG: 24 },
  },
  {
    id: 'bls:coconut-milk',
    name: 'Kokosmilch Konserve',
    aliases: ['kokosmilch'],
    source: { dataset: 'BLS', version: '4.0' },
    densityGPerMl: 1.02,
    nutrientsPer100g: { proteinG: 2 },
  },
  {
    id: 'bls:pepper-red',
    name: 'Paprikaschote rot roh',
    aliases: ['rote paprika'],
    source: { dataset: 'BLS', version: '4.0' },
    gramsPerUnit: { stueck: 150 },
    nutrientsPer100g: { proteinG: 1.1 },
  },
];

function recipe(ingredients: Recipe['ingredients']): Recipe {
  return {
    id: 'test',
    shareId: 'test:test',
    name: 'Testrezept',
    description: '',
    minutes: 20,
    servings: 2,
    tags: [],
    ingredients: ingredients.map((ingredient, index) => ({
      ...ingredient,
      id: ingredient.id ?? `ingredient-${index}`,
    })),
    steps: ['Zubereiten'],
    imageCell: 0,
  };
}

test('ordnet nur eindeutige normalisierte Namen und Aliasse automatisch zu', () => {
  const exact = resolveIngredient('  ROTE-LINSEN  ', foods);
  assert.equal(exact.status, 'automatic');
  assert.equal(exact.food?.id, 'bls:lentils-red-dry');

  const ambiguous = resolveIngredient('Linse', foods);
  assert.equal(ambiguous.status, 'unresolved');
  assert.equal(ambiguous.food, undefined);
});

test('eine lokale Nutzerzuordnung hat Vorrang vor der Automatik', () => {
  const resolved = resolveIngredient('Kokosmilch', foods, {
    kind: 'food',
    foodId: 'bls:pepper-red',
  });
  assert.equal(resolved.status, 'user-confirmed');
  assert.equal(resolved.food?.id, 'bls:pepper-red');
});

test('eine direkt gewählte Lebensmittel-ID bleibt trotz sichtbarer Umbenennung eindeutig', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      {
        amount: '100',
        unit: 'g',
        name: 'Mein Reis',
        foodLink: { kind: 'bls', foodId: 'bls:lentils-red-dry' },
      },
    ]),
    foods,
  );
  assert.equal(result.complete, true);
  assert.equal(result.ingredients[0]?.status, 'user-confirmed');
  assert.equal(result.wholeRecipe.proteinG?.value, 24);
});

test('ändert den Herkunftsfingerprint bei einer anderen direkten Lebensmittelwahl', () => {
  const first = calculateRecipeFromIngredients(
    recipe([
      {
        amount: '100',
        unit: 'g',
        name: 'Auswahl',
        foodLink: { kind: 'bls', foodId: 'bls:lentils-red-dry' },
      },
    ]),
    foods,
  ).wholeRecipe.proteinG?.source;
  const second = calculateRecipeFromIngredients(
    recipe([
      {
        amount: '100',
        unit: 'g',
        name: 'Auswahl',
        foodLink: { kind: 'bls', foodId: 'bls:pepper-red' },
      },
    ]),
    foods,
  ).wholeRecipe.proteinG?.source;
  assert.equal(first?.kind, 'dataset');
  assert.equal(second?.kind, 'dataset');
  if (first?.kind === 'dataset' && second?.kind === 'dataset')
    assert.notEqual(first.inputFingerprint, second.inputFingerprint);
});

test('wandelt eigene Lebensmittel in stabile lokale Katalogeinträge um', () => {
  const food = customFoodToReference({
    id: 'usr-basmati',
    name: 'Mein Basmatireis',
    aliases: ['Basmati'],
    nutrientsPer100g: { proteinG: 8.2 },
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
  });
  assert.equal(food.id, 'custom:usr-basmati');
  assert.equal(food.source.dataset, 'Eigene Lebensmittel');
  const result = calculateRecipeFromIngredients(
    recipe([
      {
        amount: '100',
        unit: 'g',
        name: 'Mein Basmatireis',
        foodLink: { kind: 'custom', foodId: 'custom:usr-basmati' },
      },
    ]),
    [food, ...foods],
  );
  assert.equal(result.wholeRecipe.proteinG?.value, 8.2);
});

test('liefert ähnliche Lebensmittel nur als manuell auswählbare Kandidaten', () => {
  const matches = searchFoodReferences('Linsen rot', foods);
  assert.equal(matches[0]?.id, 'bls:lentils-red-dry');
  assert.deepEqual(searchFoodReferences('', foods), []);
  assert.deepEqual(searchFoodReferences('völlig unbekannt', foods), []);
});

test('rechnet Gewicht direkt, Volumen und Stück aber nur mit Lebensmittelfaktor um', () => {
  assert.deepEqual(convertIngredientToGrams('250', 'g'), {
    grams: 250,
    quality: 'direct',
  });
  assert.deepEqual(convertIngredientToGrams('1,5', 'kg'), {
    grams: 1500,
    quality: 'direct',
  });
  assert.deepEqual(convertIngredientToGrams('1.000', 'g'), {
    grams: 1000,
    quality: 'direct',
  });
  assert.deepEqual(convertIngredientToGrams('400', 'ml', foods[1]), {
    grams: 408,
    quality: 'assumed',
  });
  assert.deepEqual(convertIngredientToGrams('1', 'Stück', foods[2]), {
    grams: 150,
    quality: 'assumed',
  });
  assert.deepEqual(convertIngredientToGrams('2', 'EL', foods[1]), {
    grams: 30.6,
    quality: 'assumed',
  });
  assert.deepEqual(convertIngredientToGrams('3', 'TL', foods[1]), {
    grams: 15.3,
    quality: 'assumed',
  });
  assert.equal(convertIngredientToGrams('100', 'ml', foods[0]), undefined);
  assert.equal(convertIngredientToGrams('1', 'EL', foods[0]), undefined);
  assert.equal(convertIngredientToGrams('1', 'Handvoll', foods[0]), undefined);
});

test('schlägt die passendste belegte Einheit nach Lebensmittelfaktor vor', () => {
  assert.equal(preferredUnitForFood(foods[0]), 'g');
  assert.equal(preferredUnitForFood(foods[1]), 'ml');
  assert.equal(preferredUnitForFood(foods[2]), 'Stück');
});

test('berechnet Nährwerte pro Rezept und weist Annahmen nachvollziehbar aus', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      { amount: '200', unit: 'g', name: 'Rote Linsen' },
      { amount: '1', unit: 'Stück', name: 'Rote Paprika' },
    ]),
    foods,
  );

  assert.equal(result.complete, true);
  assert.equal(result.resolvedIngredients, 2);
  assert.equal(result.assumedAmounts, 1);
  assert.equal(result.wholeRecipe.proteinG?.value, 49.65);
  assert.equal(result.wholeRecipe.proteinG?.quality, 'estimated');
});

test('fingerprintet dieselben Zutaten stabil und Änderungen unterschiedlich', () => {
  const first = calculateRecipeFromIngredients(
    recipe([{ amount: '200', unit: 'g', name: 'Rote Linsen' }]),
    foods,
  ).wholeRecipe.proteinG?.source;
  const same = calculateRecipeFromIngredients(
    recipe([{ amount: '200', unit: 'g', name: 'Rote Linsen' }]),
    foods,
  ).wholeRecipe.proteinG?.source;
  const changed = calculateRecipeFromIngredients(
    recipe([{ amount: '201', unit: 'g', name: 'Rote Linsen' }]),
    foods,
  ).wholeRecipe.proteinG?.source;
  assert.equal(first?.kind, 'dataset');
  assert.equal(same?.kind, 'dataset');
  assert.equal(changed?.kind, 'dataset');
  if (
    first?.kind !== 'dataset' ||
    same?.kind !== 'dataset' ||
    changed?.kind !== 'dataset'
  )
    return;
  assert.match(first.inputFingerprint, /^mff1-[0-9a-f]{32}$/);
  assert.equal(first.inputFingerprint, same.inputFingerprint);
  assert.notEqual(first.inputFingerprint, changed.inputFingerprint);
});

test('unbekannte Zutaten senken die Abdeckung und werden niemals als null gezählt', () => {
  const result = calculateRecipeFromIngredients(
    recipe([
      { amount: '200', unit: 'g', name: 'Rote Linsen' },
      { amount: '1', unit: 'Prise', name: 'Zaubergewürz' },
    ]),
    foods,
  );

  assert.equal(result.complete, false);
  assert.equal(result.resolvedIngredients, 1);
  assert.equal(result.totalIngredients, 2);
  assert.equal(result.wholeRecipe.proteinG, undefined);
  assert.equal(result.ingredients[1]?.status, 'unresolved');
});

test('ignoriert leere Editorzeilen und weist bewusst ausgelassene Zutaten aus', () => {
  const currentRecipe = recipe([
    { amount: '200', unit: 'g', name: 'Rote Linsen' },
    { amount: '', unit: '', name: '   ' },
    { amount: '1', unit: 'Prise', name: 'Zaubergewürz' },
  ]);
  const result = calculateRecipeFromIngredients(currentRecipe, foods, {
    [ingredientOverrideKey(currentRecipe.id, 'ingredient-2')]: {
      kind: 'ignored',
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.totalIngredients, 1);
  assert.equal(result.resolvedIngredients, 1);
  assert.equal(result.ignoredIngredients, 1);
  assert.equal(result.ingredients.length, 2);
  assert.equal(result.wholeRecipe.proteinG?.value, 48);
});

test('ein eigener Zutaten-Gesamtwert funktioniert ohne Umrechnung und bleibt gekennzeichnet', () => {
  const currentRecipe = recipe([
    { amount: 'etwas', unit: '', name: 'Currypaste' },
  ]);
  const result = calculateRecipeFromIngredients(currentRecipe, foods, {
    [ingredientOverrideKey(currentRecipe.id, 'ingredient-0')]: {
      kind: 'whole-ingredient',
      nutrients: { proteinG: 3 },
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.wholeRecipe.proteinG?.value, 3);
  assert.equal(result.wholeRecipe.proteinG?.quality, 'declared');
  assert.equal(result.ingredients[0]?.status, 'custom-value');
});

test('wendet einen eigenen Zutatenwert niemals auf ein anderes Rezept an', () => {
  const firstRecipe = recipe([
    { amount: 'etwas', unit: '', name: 'Currypaste' },
  ]);
  const secondRecipe = { ...firstRecipe, id: 'anderes-rezept' };
  const overrides = {
    [ingredientOverrideKey(firstRecipe.id, 'ingredient-0')]: {
      kind: 'whole-ingredient' as const,
      nutrients: { proteinG: 3 },
    },
  };
  assert.equal(
    calculateRecipeFromIngredients(firstRecipe, foods, overrides).complete,
    true,
  );
  assert.equal(
    calculateRecipeFromIngredients(secondRecipe, foods, overrides).complete,
    false,
  );
});

test('trennt gleichnamige Zutatenzeilen über stabile IDs', () => {
  const currentRecipe = recipe([
    { id: 'erste-linse', amount: '100', unit: 'g', name: 'Rote Linsen' },
    { id: 'zweite-linse', amount: '100', unit: 'g', name: 'Rote Linsen' },
  ]);
  const result = calculateRecipeFromIngredients(currentRecipe, foods, {
    [ingredientOverrideKey(currentRecipe.id, 'erste-linse')]: {
      kind: 'whole-ingredient',
      nutrients: { proteinG: 3 },
    },
  });

  assert.equal(result.complete, true);
  assert.equal(result.ingredients[0]?.status, 'custom-value');
  assert.equal(result.ingredients[1]?.status, 'automatic');
  assert.equal(result.wholeRecipe.proteinG?.value, 27);
});

test('automatische Berechnung ergänzt Werte, überschreibt aber nie Nutzerwerte', () => {
  const sourceRecipe = recipe([
    { amount: '200', unit: 'g', name: 'Rote Linsen' },
  ]);
  sourceRecipe.nutrition = {
    wholeRecipe: {
      proteinG: {
        value: 60,
        quality: 'declared',
        source: { kind: 'user' },
      },
    },
    enteredAs: 'whole-recipe',
    updatedAt: '2026-09-03T10:00:00.000Z',
  };
  const calculation = calculateRecipeFromIngredients(sourceRecipe, foods);
  const nutrition = mergeCalculatedNutrition(
    sourceRecipe.nutrition,
    calculation,
    '2026-09-03T11:00:00.000Z',
  );

  assert.equal(nutrition?.wholeRecipe.proteinG?.value, 60);
  assert.equal(nutrition?.wholeRecipe.proteinG?.source.kind, 'user');
});

test('entfernt veraltete Automatikwerte, sobald eine Rezeptzutat unaufgelöst ist', () => {
  const previous = {
    wholeRecipe: {
      proteinG: {
        value: 48,
        quality: 'estimated' as const,
        source: {
          kind: 'dataset' as const,
          dataset: 'BLS',
          version: '4.0',
          inputFingerprint: 'alt',
          resolvedIngredients: 1,
          totalIngredients: 1,
        },
      },
    },
    enteredAs: 'whole-recipe' as const,
    updatedAt: '2026-09-03T10:00:00.000Z',
  };
  const calculation = calculateRecipeFromIngredients(
    recipe([{ amount: 'etwas', unit: '', name: 'Unbekannt' }]),
    foods,
  );
  assert.equal(
    mergeCalculatedNutrition(previous, calculation, '2026-09-03T11:00:00.000Z'),
    undefined,
  );
});
