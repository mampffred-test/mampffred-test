import assert from 'node:assert/strict';
import test from 'node:test';

import {
  addLocalDays,
  formatLocalDate,
  parseLocalDate,
  startOfLocalWeek,
} from '../lib/local-date.ts';
import {
  APP_SCHEMA_VERSION,
  createEmptyData,
  createSeedData,
  migrateAppData,
} from '../lib/model.ts';

test('formatiert einen lokalen Kalendertag ohne UTC-Verschiebung', () => {
  assert.equal(formatLocalDate(new Date(2026, 8, 1, 0, 30)), '2026-09-01');
});

test('addiert Kalendertage über Monats-, Jahres- und DST-Grenzen', () => {
  assert.equal(addLocalDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addLocalDays('2027-12-31', 1), '2028-01-01');
  assert.equal(addLocalDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addLocalDays('2026-10-24', 1), '2026-10-25');
});

test('berechnet Montag als lokalen Wochenanfang', () => {
  assert.equal(startOfLocalWeek(new Date(2026, 8, 3, 0, 30)), '2026-08-31');
});

test('weist ungültige Kalendertage zurück', () => {
  assert.throws(() => parseLocalDate('2026-02-30'), /INVALID_LOCAL_DATE/);
  assert.throws(() => parseLocalDate('03.09.2026'), /INVALID_LOCAL_DATE/);
});

test('weist unmögliche Plandaten bei der Migration zurück', () => {
  const data = createSeedData();
  data.plan[0].date = '2026-99-99';
  assert.throws(() => migrateAppData(data), /INVALID_LOCAL_DATE/);
});

test('migriert einen unversionierten Legacy-Zustand ohne Datumsänderung', () => {
  const current = createSeedData();
  const { schemaVersion: _, ...legacy } = current;
  const migrated = migrateAppData(legacy);
  assert.equal(migrated.schemaVersion, APP_SCHEMA_VERSION);
  assert.deepEqual(
    migrated.plan.map((day) => day.date),
    current.plan.map((day) => day.date),
  );
});

test('startet ohne versteckte Demo- oder Nutzerdaten', () => {
  const empty = createEmptyData();
  assert.equal(empty.schemaVersion, APP_SCHEMA_VERSION);
  assert.deepEqual(empty.recipes, []);
  assert.deepEqual(empty.plan, []);
  assert.deepEqual(empty.shopping, []);
  assert.deepEqual(empty.installedSamplePacks, []);
  assert.equal(empty.nutritionSettings.enabled, false);
  assert.equal(empty.nutritionSettings.promptDismissed, false);
  assert.equal(empty.nutritionSettings.automaticEstimates, false);
  assert.deepEqual(empty.foodOverrides, {});
  assert.deepEqual(empty.customFoods, []);
  assert.deepEqual(empty.recipeDrafts, []);
});

test('bewahrt eigene Lebensmittel, direkte Zuordnungen und lokale Entwürfe', () => {
  const data = createEmptyData();
  const timestamp = '2026-09-03T10:00:00.000Z';
  data.customFoods.push({
    id: 'usr-basmati',
    name: 'Mein Basmatireis',
    aliases: [],
    nutrientsPer100g: { energyKcal: 350, proteinG: 8.2 },
    gramsPerUnit: { tasse: 180 },
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  data.recipeDrafts.push({
    id: 'draft-1',
    name: '',
    description: '',
    minutes: 30,
    servings: 2,
    tags: [],
    ingredients: [
      {
        id: 'ingredient-1',
        amount: '200',
        unit: 'g',
        name: 'Mein Basmatireis',
        foodLink: { kind: 'custom', foodId: 'custom:usr-basmati' },
      },
    ],
    steps: [''],
    imageCell: 0,
    foodOverrides: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const migrated = migrateAppData(JSON.parse(JSON.stringify(data)));
  assert.equal(migrated.customFoods[0]?.gramsPerUnit?.tasse, 180);
  assert.deepEqual(migrated.recipeDrafts[0]?.ingredients[0]?.foodLink, {
    kind: 'custom',
    foodId: 'custom:usr-basmati',
  });
});

test('migriert manuelle V3-Nährwerte mit unverlierbarer Nutzer-Herkunft', () => {
  const legacy = JSON.parse(JSON.stringify(createSeedData())) as Record<
    string,
    unknown
  >;
  legacy.schemaVersion = 3;
  delete legacy.foodOverrides;
  const settings = legacy.nutritionSettings as Record<string, unknown>;
  delete settings.automaticEstimates;
  const recipes = legacy.recipes as Array<Record<string, unknown>>;
  recipes[0].nutrition = {
    wholeRecipe: { proteinG: { value: 42, quality: 'estimated' } },
    enteredAs: 'per-serving',
    updatedAt: '2026-09-03T10:00:00.000Z',
  };

  const migrated = migrateAppData(legacy);
  assert.equal(migrated.schemaVersion, APP_SCHEMA_VERSION);
  assert.deepEqual(
    migrated.recipes[0].nutrition?.wholeRecipe.proteinG?.source,
    {
      kind: 'user',
    },
  );
  assert.equal(migrated.nutritionSettings.automaticEstimates, false);
  assert.deepEqual(migrated.foodOverrides, {});
});

test('migriert V4-Zutaten auf stabile IDs und verwirft mehrdeutige Alt-Zuordnungen', () => {
  const legacy = JSON.parse(JSON.stringify(createSeedData())) as Record<
    string,
    unknown
  >;
  legacy.schemaVersion = 4;
  legacy.foodOverrides = {
    haferdrink: { kind: 'whole-ingredient', nutrients: { proteinG: 3 } },
  };
  const recipes = legacy.recipes as Array<{
    ingredients: Array<Record<string, unknown>>;
  }>;
  for (const recipe of recipes)
    for (const ingredient of recipe.ingredients) delete ingredient.id;

  const migrated = migrateAppData(legacy);
  assert.equal(migrated.schemaVersion, APP_SCHEMA_VERSION);
  assert.deepEqual(migrated.foodOverrides, {});
  for (const recipe of migrated.recipes) {
    const ids = recipe.ingredients.map((ingredient) => ingredient.id);
    assert.equal(ids.every(Boolean), true);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('bewahrt eindeutige V5-Zutatenkorrekturen beim V6-Upgrade', () => {
  const legacy = JSON.parse(JSON.stringify(createSeedData())) as Record<
    string,
    unknown
  >;
  legacy.schemaVersion = 5;
  legacy.foodOverrides = {
    'recipe-stable-fingerprint': {
      kind: 'food',
      foodId: 'bls-4.0:H730000',
    },
  };
  const migrated = migrateAppData(legacy);
  assert.deepEqual(migrated.foodOverrides, legacy.foodOverrides);
  assert.deepEqual(migrated.customFoods, []);
  assert.deepEqual(migrated.recipeDrafts, []);
});

test('begrenzt Zutatenfelder auf die auch im Editor erlaubte Arbeitsmenge', () => {
  const oversized = createSeedData();
  oversized.recipes[0].ingredients[0].name = 'x'.repeat(501);
  assert.throws(() => migrateAppData(oversized), /INVALID_APP_DATA/);
});

test('migriert einen echten V2-Zustand defensiv auf lokale V3-Felder', () => {
  const legacy = JSON.parse(JSON.stringify(createSeedData())) as Record<
    string,
    unknown
  >;
  legacy.schemaVersion = 2;
  delete legacy.installedSamplePacks;
  delete legacy.nutritionSettings;
  for (const recipe of legacy.recipes as Array<Record<string, unknown>>) {
    delete recipe.shareId;
    delete recipe.nutrition;
  }
  for (const day of legacy.plan as Array<{
    meals: Array<Record<string, unknown>>;
  }>)
    for (const meal of day.meals) {
      delete meal.servings;
      delete meal.trackedServings;
    }
  for (const item of legacy.shopping as Array<Record<string, unknown>>) {
    delete item.origin;
    delete item.needsReview;
  }

  const migrated = migrateAppData(legacy);
  assert.equal(migrated.schemaVersion, APP_SCHEMA_VERSION);
  assert.ok(
    migrated.recipes.every((recipe) => recipe.shareId.startsWith('local:')),
  );
  assert.ok(
    migrated.plan.every((day) =>
      day.meals.every(
        (meal) => meal.servings > 0 && meal.trackedServings === undefined,
      ),
    ),
  );
  assert.ok(migrated.shopping.every((item) => item.origin.kind === 'manual'));
  assert.equal(migrated.nutritionSettings.enabled, false);
});

test('überschreibt keine unbekannte zukünftige Schemaversion', () => {
  assert.throws(
    () => migrateAppData({ ...createSeedData(), schemaVersion: 999 }),
    /UNSUPPORTED_SCHEMA_VERSION/,
  );
});

test('weist doppelte Einkaufslisten-IDs zurück', () => {
  const data = createSeedData();
  data.shopping = [
    {
      id: 'doppelt',
      name: 'Paprika',
      category: 'Gemüse & Obst',
      checked: false,
      origin: { kind: 'manual' },
    },
    {
      id: 'doppelt',
      name: 'Reis',
      category: 'Vorrat',
      checked: false,
      origin: { kind: 'manual' },
    },
  ];
  assert.throws(() => migrateAppData(data), /INVALID_APP_DATA/);
});
