import assert from 'node:assert/strict';
import test from 'node:test';
import { scaledIngredientAmount } from '../lib/ingredient-amount.ts';

test('unbestimmte Mengen werden nicht als null angezeigt oder eingekauft', () => {
  for (const amount of ['', 'nach Belieben', '1–2', '½']) {
    assert.equal(scaledIngredientAmount(amount, 2), amount);
  }
});

test('deutsche Dezimalmengen werden für Portionen und Einkauf korrekt skaliert', () => {
  assert.equal(scaledIngredientAmount('0,5', 2), '1');
  assert.equal(scaledIngredientAmount('0,5', 0.5), '0,25');
  assert.equal(scaledIngredientAmount('1.000', 2), '2000');
  assert.equal(scaledIngredientAmount('250', 0.5), '125');
  assert.equal(scaledIngredientAmount('0', 2), '0');
});
