import assert from 'node:assert/strict';
import test from 'node:test';

import { tabTransitionDirection } from '../lib/navigation-motion.ts';

test('bestimmt die Navigationsrichtung stabil aus der Tab-Reihenfolge', () => {
  assert.equal(tabTransitionDirection('today', 'week'), 'forward');
  assert.equal(tabTransitionDirection('today', 'shopping'), 'forward');
  assert.equal(tabTransitionDirection('shopping', 'more'), 'forward');
  assert.equal(tabTransitionDirection('more', 'today'), 'backward');
  assert.equal(tabTransitionDirection('shopping', 'recipes'), 'backward');
  assert.equal(tabTransitionDirection('recipes', 'recipes'), 'none');
});
