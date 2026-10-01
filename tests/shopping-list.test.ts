import assert from 'node:assert/strict';
import test from 'node:test';

import type { Recipe, ShoppingItem } from '../lib/model.ts';
import {
  completeAisleOrder,
  createManualItem,
  findDuplicate,
  formatShoppingListText,
  groupShoppingItems,
  recipeShoppingItems,
} from '../lib/shopping-list.ts';

const item = (overrides: Partial<ShoppingItem>): ShoppingItem => ({
  id: overrides.id ?? overrides.name ?? 'x',
  name: 'Artikel',
  category: 'sonstiges',
  checked: false,
  origin: { kind: 'manual' },
  ...overrides,
});

test('legt manuelle Artikel mit Menge, Kategorie und Lebensmittel an', () => {
  const milk = createManualItem('2 l Hafermilch', 'id-1');
  assert.deepEqual(milk, {
    id: 'id-1',
    name: 'Hafermilch',
    quantity: '2 l',
    foodId: 'haferdrink',
    category: 'kuehlregal',
    checked: false,
    origin: { kind: 'manual' },
  });
  const plain = createManualItem('Cherrytomaten', 'id-2');
  assert.equal(plain.category, 'obst-gemuese');
  assert.equal(plain.quantity, undefined);
  const unknown = createManualItem('Glühbirne', 'id-3');
  assert.equal(unknown.category, 'sonstiges');
  assert.equal(unknown.foodId, undefined);
});

test('erkennt, wenn ein Lebensmittel schon offen auf der Liste steht', () => {
  const list = [
    item({
      id: 'a',
      name: 'Cherrytomaten',
      foodId: 'cherrytomate',
      quantity: '4 Schalen à 250 g',
    }),
    item({ id: 'b', name: 'Feta', foodId: 'feta', checked: true }),
  ];
  assert.equal(
    findDuplicate(list, createManualItem('Kirschtomaten', 'n'))?.id,
    'a',
  );
  assert.equal(findDuplicate(list, createManualItem('Feta', 'n')), undefined);
  assert.equal(
    findDuplicate(list, createManualItem('Zauberwurz', 'n')),
    undefined,
  );
  assert.equal(
    findDuplicate(
      [item({ id: 'c', name: 'Zauberwurz' })],
      createManualItem('zauberwurz', 'n'),
    )?.id,
    'c',
  );
});

test('erzeugt Einzelrezept-Artikel mit derselben Logik wie der Wocheneinkauf', () => {
  const recipe: Recipe = {
    id: 'r',
    shareId: 'local:r',
    name: 'Feta-Pasta',
    description: '',
    minutes: 30,
    servings: 4,
    tags: [],
    steps: [],
    imageCell: 0,
    ingredients: [
      { amount: '500', unit: 'g', name: 'Nudeln' },
      { amount: '200', unit: 'g', name: 'Feta', scaleWithServings: false },
      { amount: '', unit: '', name: 'Salz und Pfeffer' },
    ],
  };
  const items = recipeShoppingItems(
    { pantry: { salz: 'always', pfeffer: 'check' }, foodAliases: {} },
    recipe,
    2,
    (index) => `id-${index}`,
  );
  assert.deepEqual(
    items.map((entry) => [
      entry.name,
      entry.quantity,
      entry.pantryCheck ?? false,
    ]),
    [
      ['Feta', '1 Packung (200 g)', false],
      ['Nudeln', '1 Packung (500 g)', false],
      ['Pfeffer', undefined, true],
    ],
  );
  assert.ok(items.every((entry) => entry.origin.kind === 'recipe'));
  assert.equal(items[1].detail, '250 g für Feta-Pasta');
});

test('gruppiert nach Ladenlauf, offene zuerst und Vorrat getrennt', () => {
  const groups = groupShoppingItems([
    item({ id: '1', name: 'Zucker', category: 'backen', pantryCheck: true }),
    item({ id: '2', name: 'Paprika', category: 'obst-gemuese', checked: true }),
    item({ id: '3', name: 'Apfel', category: 'obst-gemuese' }),
    item({ id: '4', name: 'Feta', category: 'kuehlregal' }),
  ]);
  assert.deepEqual(
    groups.sections.map((section) => [
      section.aisle,
      section.items.map((entry) => entry.name),
    ]),
    [
      ['obst-gemuese', ['Apfel', 'Paprika']],
      ['kuehlregal', ['Feta']],
    ],
  );
  assert.deepEqual(
    groups.pantry.map((entry) => entry.name),
    ['Zucker'],
  );
});

test('formatiert offene Artikel als teilbaren Text', () => {
  const text = formatShoppingListText(
    [
      item({
        id: '1',
        name: 'Cherrytomaten',
        quantity: '2 Schalen à 250 g',
        category: 'obst-gemuese',
      }),
      item({
        id: '2',
        name: 'Feta',
        quantity: '1 Packung (200 g)',
        category: 'kuehlregal',
      }),
      item({ id: '3', name: 'Milch', category: 'kuehlregal', checked: true }),
      item({ id: '4', name: 'Salz', category: 'wuerzen', pantryCheck: true }),
      item({ id: '5', name: 'Mais', category: 'konserven', optional: true }),
    ],
    'Einkauf KW 40',
  );
  assert.equal(
    text,
    [
      'Einkauf KW 40',
      '',
      'Obst & Gemüse',
      '☐ Cherrytomaten – 2 Schalen à 250 g',
      '',
      'Milch & Kühlregal',
      '☐ Feta – 1 Packung (200 g)',
      '',
      'Konserven & Gläser',
      '☐ Mais (optional)',
      '',
      'Vorrat prüfen',
      '☐ Salz',
    ].join('\n'),
  );
});

test('sortiert Bereiche nach der eigenen Ladenreihenfolge, Rest dahinter', () => {
  const groups = groupShoppingItems(
    [
      item({ id: '1', name: 'Apfel', category: 'obst-gemuese' }),
      item({ id: '2', name: 'Brot', category: 'brot' }),
      item({ id: '3', name: 'Feta', category: 'kuehlregal' }),
    ],
    completeAisleOrder(['kuehlregal', 'brot']),
  );
  assert.deepEqual(
    groups.sections.map((section) => section.aisle),
    ['kuehlregal', 'brot', 'obst-gemuese'],
  );
});

test('versteht „2x Milch“ beim Hinzufügen', () => {
  const entry = createManualItem('2x Milch', 'id');
  assert.equal(entry.name, 'Milch');
  assert.equal(entry.quantity, '2');
});
