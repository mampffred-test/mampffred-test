import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppData, Recipe, ShoppingItem } from '../lib/model.ts';
import { reconcileWeekShopping } from '../lib/week-shopping.ts';

const weekStart = '2026-08-31';

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'recipe-a',
    shareId: 'share-a',
    name: 'Testgericht',
    description: '',
    minutes: 20,
    servings: 2,
    tags: [],
    ingredients: [],
    steps: [],
    imageCell: 0,
    ...overrides,
  };
}

function input(
  recipes: Recipe[],
  shopping: ShoppingItem[] = [],
): Pick<AppData, 'recipes' | 'plan' | 'shopping'> {
  return {
    recipes,
    plan: [
      {
        date: weekStart,
        meals: [{ slot: 'Abendessen', recipeId: recipes[0].id, servings: 2 }],
      },
    ],
    shopping,
  };
}

test('aggregiert skalierte Massen, Volumen und identische sonstige Einheiten', () => {
  const first = recipe({
    ingredients: [
      { amount: '500', unit: 'g', name: 'Kartoffeln' },
      { amount: '0,5', unit: 'l', name: 'Brühe' },
      { amount: '1', unit: 'EL', name: 'Öl' },
      { amount: 'nach Geschmack', unit: '', name: 'Salz' },
    ],
  });
  const second = recipe({
    id: 'recipe-b',
    shareId: 'share-b',
    name: 'Zweites Gericht',
    servings: 4,
    ingredients: [
      { amount: '1', unit: 'kg', name: 'Kartoffeln' },
      { amount: '250', unit: 'ml', name: 'Brühe' },
      { amount: '2', unit: 'el', name: 'Öl' },
      { amount: 'nach Geschmack', unit: '', name: 'Salz' },
    ],
  });
  const data = input([first, second]);
  data.plan[0].meals.push({
    slot: 'Mittagessen',
    recipeId: second.id,
    servings: 2,
  });

  const result = reconcileWeekShopping(data, weekStart);

  assert.ok(result.shopping.some((item) => item.name === '1.000 g Kartoffeln'));
  assert.ok(result.shopping.some((item) => item.name === '625 ml Brühe'));
  assert.ok(result.shopping.some((item) => item.name === '2 EL Öl'));
  assert.equal(
    result.shopping.filter((item) => item.name === 'nach Geschmack Salz')
      .length,
    2,
  );
  assert.equal(result.preview.generatedItemCount, 5);
});

test('liefert bei wiederholtem Abgleich denselben Zustand', () => {
  const data = input([
    recipe({
      ingredients: [{ amount: '200', unit: 'g', name: 'Reis' }],
    }),
  ]);
  const first = reconcileWeekShopping(data, weekStart);
  const second = reconcileWeekShopping(
    { ...data, shopping: first.shopping },
    weekStart,
  );

  assert.deepEqual(second.shopping, first.shopping);
  assert.equal(second.preview.addedItemCount, 0);
  assert.equal(second.preview.updatedItemCount, 0);
  assert.equal(second.preview.unchangedItemCount, 1);
});

test('erhält fremde Einträge sowie ID und Checkstatus passender Wochenartikel', () => {
  const data = input([
    recipe({
      ingredients: [{ amount: '2', unit: 'Stück', name: 'Paprika' }],
    }),
  ]);
  const initial = reconcileWeekShopping(data, weekStart);
  const generated = { ...initial.shopping[0], checked: true };
  const manual: ShoppingItem = {
    id: 'manual-1',
    name: 'Kaffee',
    category: 'Vorrat',
    checked: false,
    origin: { kind: 'manual' },
  };
  const recipeItem: ShoppingItem = {
    id: 'recipe-1',
    name: 'Milch',
    category: 'Kühlregal',
    checked: true,
    origin: { kind: 'recipe', recipeId: 'other' },
  };
  const otherWeek: ShoppingItem = {
    id: 'other-week',
    name: '100 g Reis',
    category: 'Vorrat',
    checked: false,
    origin: {
      kind: 'week',
      weekStart: '2026-08-24',
      groupKey: 'reis',
      sources: [],
      fingerprint: 'number:100:g',
    },
  };

  const result = reconcileWeekShopping(
    { ...data, shopping: [manual, generated, recipeItem, otherWeek] },
    weekStart,
  );
  const reconciled = result.shopping.find((item) => item.id === generated.id);

  assert.equal(reconciled?.checked, true);
  assert.equal(reconciled?.id, generated.id);
  assert.deepEqual(result.shopping.slice(0, 3), [
    manual,
    recipeItem,
    otherWeek,
  ]);
  assert.equal(result.preview.preservedCheckedCount, 1);
  assert.equal(result.preview.preservedOtherItemCount, 3);
});

test('aktualisiert Mengen mit Review-Hinweis und entfernt veraltete Gruppen', () => {
  const data = input([
    recipe({
      ingredients: [
        { amount: '100', unit: 'g', name: 'Reis' },
        { amount: '1', unit: 'Stück', name: 'Paprika' },
      ],
    }),
  ]);
  const initial = reconcileWeekShopping(data, weekStart);
  const riceBefore = initial.shopping.find((item) =>
    item.name.includes('Reis'),
  )!;

  const changedRecipe = recipe({
    ingredients: [{ amount: '100', unit: 'g', name: 'Reis' }],
  });
  const changed = input([changedRecipe], initial.shopping);
  changed.plan[0].meals[0].servings = 4;
  const result = reconcileWeekShopping(changed, weekStart);
  const riceAfter = result.shopping.find((item) => item.name.includes('Reis'))!;

  assert.equal(riceAfter.id, riceBefore.id);
  assert.equal(riceAfter.name, '200 g Reis');
  assert.equal(riceAfter.needsReview, true);
  assert.equal(
    result.shopping.some((item) => item.name.includes('Paprika')),
    false,
  );
  assert.equal(result.preview.updatedItemCount, 1);
  assert.equal(result.preview.removedItemCount, 1);
  assert.equal(result.preview.reviewItemCount, 1);
});

test('interpretiert deutsche Tausenderpunkte nicht als Dezimalstellen', () => {
  const result = reconcileWeekShopping(
    input([
      recipe({
        ingredients: [{ amount: '1.000', unit: 'g', name: 'Kartoffeln' }],
      }),
    ]),
    weekStart,
  );
  const item = result.shopping[0];
  assert.equal(item.name, '1.000 g Kartoffeln');
  assert.match(
    item.origin.kind === 'week' ? item.origin.fingerprint : '',
    /^number:[a-z0-9]+$/,
  );
});

test('meldet, wenn erzeugte Artikel die Speichergrenze überschreiten würden', () => {
  const manualItems: ShoppingItem[] = Array.from(
    { length: 9_999 },
    (_, index) => ({
      id: `manual-${index}`,
      name: `Artikel ${index}`,
      category: 'Sonstiges',
      checked: false,
      origin: { kind: 'manual' },
    }),
  );
  const result = reconcileWeekShopping(
    input(
      [
        recipe({
          ingredients: [
            { amount: '1', unit: 'Stück', name: 'Apfel' },
            { amount: '1', unit: 'Stück', name: 'Birne' },
          ],
        }),
      ],
      manualItems,
    ),
    weekStart,
  );
  assert.equal(result.preview.overflowItemCount, 1);
});

test('entfernt veraltete Wochenartikel auch bei inzwischen leerem Plan', () => {
  const initialInput = input([
    recipe({
      ingredients: [{ amount: '1', unit: 'Stück', name: 'Paprika' }],
    }),
  ]);
  const initial = reconcileWeekShopping(initialInput, weekStart);
  const result = reconcileWeekShopping(
    { ...initialInput, plan: [], shopping: initial.shopping },
    weekStart,
  );
  assert.deepEqual(result.shopping, []);
  assert.equal(result.preview.generatedItemCount, 0);
  assert.equal(result.preview.removedItemCount, 1);
});
