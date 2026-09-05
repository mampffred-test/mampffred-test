import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShoppingItem } from '../lib/model.ts';
import {
  removeShoppingItems,
  restoreShoppingItems,
} from '../lib/shopping-undo.ts';

const items: ShoppingItem[] = ['A', 'B', 'C'].map((name) => ({
  id: name,
  name,
  category: 'Sonstiges',
  checked: name !== 'B',
  origin: { kind: 'manual' },
}));

test('stellt einzeln oder gesammelt entfernte Einkaufsartikel in Reihenfolge wieder her', () => {
  const deletion = removeShoppingItems(items, new Set(['A', 'C']));
  assert.deepEqual(
    deletion.next.map((item) => item.id),
    ['B'],
  );
  assert.deepEqual(
    restoreShoppingItems(deletion.next, deletion.removed).map(
      (item) => item.id,
    ),
    ['A', 'B', 'C'],
  );
});

test('dupliziert beim Rückgängigmachen keine bereits vorhandenen IDs', () => {
  const deletion = removeShoppingItems(items, new Set(['B']));
  assert.deepEqual(
    restoreShoppingItems(items, deletion.removed).map((item) => item.id),
    ['A', 'B', 'C'],
  );
});
