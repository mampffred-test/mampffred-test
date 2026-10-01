import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEmptyData,
  createSampleRecipes,
  type RecipeDraft,
} from '../lib/model.ts';
import {
  validateDataUpdate,
  referencedImageKeys,
  DATA_LIMITS,
} from '../lib/data-updates.ts';

test('volle Sammlungen bleiben nach abgelehnten Änderungen gültig und bearbeitbar', () => {
  const data = createEmptyData();
  const recipe = createSampleRecipes()[0];
  data.recipes = Array.from({ length: DATA_LIMITS.recipes }, (_, i) => ({
    ...recipe,
    id: `r${i}`,
    shareId: `s${i}`,
  }));
  assert.throws(
    () =>
      validateDataUpdate(data, (current) => ({
        ...current,
        recipes: [...current.recipes, { ...recipe, id: 'new', shareId: 'new' }],
      })),
    /höchstens/,
  );
  assert.equal(data.recipes.length, DATA_LIMITS.recipes);
  assert.equal(
    validateDataUpdate(data, (current) => ({
      ...current,
      recipes: current.recipes.map((r, i) =>
        i ? r : { ...r, name: 'Bearbeitet' },
      ),
    })).recipes[0].name,
    'Bearbeitet',
  );
  assert.throws(
    () =>
      validateDataUpdate(data, (current) => ({
        ...current,
        recipes: [current.recipes[0], current.recipes[0]],
      })),
    /INVALID_APP_DATA/,
  );
});

test('eigene Lebensmittel und Entwürfe werden vor Zustandsübernahme begrenzt', () => {
  const data = createEmptyData();
  const timestamp = '2026-09-05T00:00:00.000Z';
  data.customFoods = Array.from(
    { length: DATA_LIMITS.customFoods },
    (_, i) => ({
      id: `food${i}`,
      name: 'Lebensmittel',
      aliases: [],
      nutrientsPer100g: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  assert.throws(
    () =>
      validateDataUpdate(data, (current) => ({
        ...current,
        customFoods: [
          ...current.customFoods,
          { ...current.customFoods[0], id: 'new' },
        ],
      })),
    /höchstens/,
  );
  const { shareId: _, ...r } = createSampleRecipes()[0];
  data.recipeDrafts = Array.from(
    { length: DATA_LIMITS.recipeDrafts },
    (_, i) =>
      ({
        ...r,
        id: `draft${i}`,
        foodOverrides: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }) satisfies RecipeDraft,
  );
  assert.throws(
    () =>
      validateDataUpdate(data, (current) => ({
        ...current,
        recipeDrafts: [
          ...current.recipeDrafts,
          { ...current.recipeDrafts[0], id: 'new' },
        ],
      })),
    /höchstens/,
  );
  assert.doesNotThrow(() => validateDataUpdate(data, data));
});

test('Bildreferenzen umfassen Rezepte und sämtliche Entwürfe', () => {
  const data = createEmptyData();
  const { shareId: _, ...recipe } = createSampleRecipes()[0];
  data.recipeDrafts = [
    {
      ...recipe,
      imageKey: 'shared',
      foodOverrides: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  assert.equal(referencedImageKeys(data).has('shared'), true);
});

test('behält unveränderte Objekte, damit Zwischenspeicher gültig bleiben', () => {
  const current = validateDataUpdate(createEmptyData(), (data) => ({
    ...data,
    recipes: createSampleRecipes(),
    foodAliases: { 'mein kase': 'mf:feta' },
  }));
  const next = validateDataUpdate(current, (data) => ({
    ...data,
    recipes: data.recipes.map((recipe, index) =>
      index === 0 ? { ...recipe, favorite: !recipe.favorite } : recipe,
    ),
  }));
  assert.notStrictEqual(next.recipes[0], current.recipes[0]);
  assert.equal(next.recipes[0].favorite, !current.recipes[0].favorite);
  assert.strictEqual(next.recipes[1], current.recipes[1]);
  assert.strictEqual(
    next.recipes[1].ingredients[0],
    current.recipes[1].ingredients[0],
  );
  assert.strictEqual(next.foodAliases, current.foodAliases);
  assert.strictEqual(next.customFoods, current.customFoods);
  assert.strictEqual(next.foodOverrides, current.foodOverrides);
  assert.strictEqual(next.pantry, current.pantry);
});
