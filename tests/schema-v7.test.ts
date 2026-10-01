import assert from 'node:assert/strict';
import test from 'node:test';

import { CATALOG_PANTRY_PRESET } from '../lib/food-catalog.ts';
import {
  APP_SCHEMA_VERSION,
  createEmptyData,
  createSeedData,
  migrateAppData,
} from '../lib/model.ts';

function v6State() {
  const data = createSeedData() as unknown as Record<string, unknown>;
  return {
    ...data,
    schemaVersion: 6,
    shopping: [
      {
        id: 'a',
        name: '950 g Cherrytomaten',
        category: 'Gemüse & Obst',
        checked: false,
        origin: { kind: 'manual' },
      },
      {
        id: 'b',
        name: '600 ml Kokosmilch',
        category: 'Kühlregal',
        checked: true,
        origin: { kind: 'manual' },
      },
      {
        id: 'c',
        name: 'Gnocchi (ungekocht, aus dem Kühlregal)',
        category: 'Sonstiges',
        checked: false,
        origin: { kind: 'manual' },
      },
      {
        id: 'd',
        name: 'Glühbirne',
        category: 'Vorrat',
        checked: false,
        origin: { kind: 'manual' },
      },
    ],
    customFoods: [
      {
        id: 'eigen',
        name: 'Mein Brot',
        aliases: [],
        nutrientsPer100g: { proteinG: 9 },
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    recipeDrafts: [
      {
        id: 'entwurf',
        name: 'Halb fertig',
        description: '',
        minutes: 10,
        servings: 2,
        tags: [],
        ingredients: [],
        steps: [],
        imageCell: 0,
        foodOverrides: {},
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    nutritionSettings: {
      enabled: true,
      automaticEstimates: true,
      promptDismissed: false,
      defaultTrackedServings: 1,
      goals: [
        { nutrient: 'proteinG', period: 'week', minimum: 420, enabled: true },
      ],
    },
  };
}

test('hebt Daten auf Version 7 und behält eigene Lebensmittel und Entwürfe', () => {
  const migrated = migrateAppData(v6State());
  assert.equal(APP_SCHEMA_VERSION, 7);
  assert.equal(migrated.schemaVersion, 7);
  assert.equal(migrated.customFoods.length, 1);
  assert.equal(migrated.customFoods[0].name, 'Mein Brot');
  assert.equal(migrated.recipeDrafts.length, 1);
});

test('sortiert alte Einkaufsartikel in die neuen Ladenkategorien ein', () => {
  const migrated = migrateAppData(v6State());
  const category = (id: string) =>
    migrated.shopping.find((item) => item.id === id)?.category;
  assert.equal(category('a'), 'obst-gemuese');
  assert.equal(category('b'), 'konserven');
  assert.equal(category('c'), 'kuehlregal');
  assert.equal(category('d'), 'sonstiges');
  assert.equal(
    migrated.shopping.find((item) => item.id === 'b')?.checked,
    true,
  );
  assert.equal(
    migrated.shopping.find((item) => item.id === 'a')?.name,
    '950 g Cherrytomaten',
  );
});

test('rechnet ein Wochenziel einmalig in ein Tagesziel pro Person um', () => {
  const migrated = migrateAppData(v6State());
  assert.deepEqual(migrated.nutritionSettings.goals, [
    { nutrient: 'proteinG', period: 'day', minimum: 60, enabled: true },
  ]);
  const again = migrateAppData(migrated);
  assert.deepEqual(
    again.nutritionSettings.goals,
    migrated.nutritionSettings.goals,
  );
});

test('belegt den Vorratsschrank beim Update und für neue Nutzer klein vor', () => {
  const migrated = migrateAppData(v6State());
  assert.deepEqual(
    Object.keys(migrated.pantry).sort(),
    [...CATALOG_PANTRY_PRESET].sort(),
  );
  assert.ok(Object.values(migrated.pantry).every((state) => state === 'check'));
  assert.deepEqual(
    Object.keys(createEmptyData().pantry).sort(),
    [...CATALOG_PANTRY_PRESET].sort(),
  );
  assert.deepEqual(createEmptyData().foodAliases, {});
});

test('bewahrt Notiz, Optional-Kennzeichen und Katalogbezug von Zutaten', () => {
  const data = createEmptyData();
  data.recipes = [
    {
      id: 'r',
      shareId: 'local:r',
      name: 'Test',
      description: '',
      minutes: 10,
      servings: 2,
      tags: [],
      steps: [],
      imageCell: 0,
      ingredients: [
        {
          id: 'i1',
          amount: '2',
          unit: 'Zehe',
          name: 'Knoblauch',
          note: 'fein gehackt',
          optional: true,
          foodLink: { kind: 'catalog', foodId: 'mf:knoblauch' },
        },
      ],
    },
  ];
  const migrated = migrateAppData(data);
  assert.deepEqual(
    migrated.recipes[0].ingredients[0],
    data.recipes[0].ingredients[0],
  );
});

test('bewahrt neue Felder von Einkaufsartikeln, Vorrat und gelernte Zuordnungen', () => {
  const data = createEmptyData();
  data.shopping = [
    {
      id: 's',
      name: 'Cherrytomaten',
      quantity: '4 Schalen à 250 g',
      detail: '950 g · 4 Rezepte',
      foodId: 'cherrytomate',
      category: 'obst-gemuese',
      optional: true,
      pantryCheck: false,
      checked: false,
      origin: { kind: 'manual' },
    },
  ];
  data.pantry = { salz: 'always', olivenoel: 'check' };
  data.foodAliases = { 'mein spezialkase': 'mf:feta' };
  const migrated = migrateAppData(data);
  assert.deepEqual(migrated.shopping, data.shopping);
  assert.deepEqual(migrated.pantry, data.pantry);
  assert.deepEqual(migrated.foodAliases, data.foodAliases);
});

test('weist unbekannte Kategorien, Vorratszustände und Zutatenbezüge zurück', () => {
  const bad = (mutate: (data: ReturnType<typeof createEmptyData>) => void) => {
    const data = createEmptyData();
    mutate(data);
    return () => migrateAppData(data);
  };
  assert.throws(
    bad((data) => {
      data.pantry = { salz: 'vielleicht' as 'always' };
    }),
    /INVALID_APP_DATA/,
  );
  assert.throws(
    bad((data) => {
      data.shopping = [
        {
          id: 'x',
          name: 'x',
          category: 'irgendwo' as 'sonstiges',
          checked: false,
          origin: { kind: 'manual' },
        },
      ];
    }),
    /INVALID_APP_DATA/,
  );
});

test('speichert eine eigene Reihenfolge der Ladenbereiche', () => {
  const data = createEmptyData();
  data.aisleOrder = ['brot', 'obst-gemuese', 'kuehlregal'];
  assert.deepEqual(migrateAppData(data).aisleOrder, data.aisleOrder);
  assert.equal(migrateAppData(createEmptyData()).aisleOrder, undefined);
  assert.throws(
    () =>
      migrateAppData({
        ...createEmptyData(),
        aisleOrder: ['brot', 'brot'],
      }),
    /INVALID_APP_DATA/,
  );
  assert.throws(
    () =>
      migrateAppData({
        ...createEmptyData(),
        aisleOrder: ['nirgendwo'],
      }),
    /INVALID_APP_DATA/,
  );
});

test('bewahrt den Einkaufszeitraum an Wochenartikeln', () => {
  const data = createEmptyData();
  data.shopping = [
    {
      id: 'w',
      name: 'Paprika',
      category: 'obst-gemuese',
      checked: false,
      origin: {
        kind: 'week',
        weekStart: '2026-08-31',
        groupKey: 'food:paprika',
        sources: [],
        fingerprint: 'v7:x',
        from: '2026-09-02',
        to: '2026-09-04',
      },
    },
  ];
  assert.deepEqual(migrateAppData(data).shopping, data.shopping);
});
