import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasMeaningfulRecipeDraft,
  removeRecipeDraft,
  replaceRecipeFoodOverrides,
  upsertRecipeDraft,
} from '../lib/recipe-drafts.ts';
import { ingredientOverrideKey } from '../lib/food-nutrition.ts';
import type { RecipeDraft } from '../lib/model.ts';

const emptyDraft: RecipeDraft = {
  id: 'draft-1',
  name: '',
  description: '',
  minutes: 30,
  servings: 2,
  tags: [],
  ingredients: [{ id: 'ingredient-1', amount: '', unit: '', name: '' }],
  steps: [''],
  imageCell: 0,
  foodOverrides: {},
  createdAt: '2026-09-03T10:00:00.000Z',
  updatedAt: '2026-09-03T10:00:00.000Z',
};

test('legt erst nach einer inhaltlichen Eingabe einen Entwurf an', () => {
  assert.equal(hasMeaningfulRecipeDraft(emptyDraft), false);
  assert.equal(
    hasMeaningfulRecipeDraft({
      ...emptyDraft,
      ingredients: [{ ...emptyDraft.ingredients[0], name: 'Reis' }],
    }),
    true,
  );
});

test('aktualisiert genau einen Entwurf und kann ihn wieder entfernen', () => {
  const updated = {
    ...emptyDraft,
    name: 'Curry',
    updatedAt: '2026-09-03T11:00:00.000Z',
  };
  assert.deepEqual(upsertRecipeDraft([emptyDraft], updated), [updated]);
  assert.deepEqual(removeRecipeDraft([updated], 'draft-1'), []);
});

test('ersetzt nur Korrekturen des fertigen Rezepts und erhält neuere fremde Werte', () => {
  const ownKey = ingredientOverrideKey('rezept-a', 'zutat-a');
  const foreignKey = ingredientOverrideKey('rezept-b', 'zutat-b');
  const result = replaceRecipeFoodOverrides(
    {
      [ownKey]: { kind: 'ignored' },
      [foreignKey]: {
        kind: 'whole-ingredient',
        nutrients: { proteinG: 7 },
      },
    },
    'rezept-a',
    [{ id: 'zutat-a', amount: '1', unit: 'g', name: 'A' }],
    [{ id: 'zutat-a', amount: '2', unit: 'g', name: 'A' }],
    {
      [ownKey]: { kind: 'whole-ingredient', nutrients: { proteinG: 3 } },
      [foreignKey]: { kind: 'ignored' },
    },
  );
  assert.equal(result[foreignKey]?.kind, 'whole-ingredient');
  assert.deepEqual(result[ownKey], {
    kind: 'whole-ingredient',
    nutrients: { proteinG: 3 },
  });
});

test('bewahrt unvollständige Entwürfe ohne Namen und vollständige Zutaten auf', () => {
  for (const partial of [
    { description: 'Idee für später' },
    { steps: ['Gemüse anbraten.'] },
    { ingredients: [{ ...emptyDraft.ingredients[0], amount: '250' }] },
    { ingredients: [{ ...emptyDraft.ingredients[0], unit: 'g' }] },
    { servings: 4 },
    { minutes: 45 },
    { tags: ['Vegetarisch'] },
    { imageKey: 'draft-photo' },
  ]) {
    const draft = { ...emptyDraft, ...partial };
    assert.equal(
      hasMeaningfulRecipeDraft(draft),
      true,
      JSON.stringify(partial),
    );
    assert.deepEqual(upsertRecipeDraft([], draft), [draft]);
    assert.equal(draft.name, '');
  }
});

test('legt für unveränderte Standardwerte oder Leerzeichen keinen leeren Entwurf an', () => {
  assert.equal(
    hasMeaningfulRecipeDraft({
      ...emptyDraft,
      name: '  ',
      description: '\n',
      steps: ['  '],
      ingredients: [{ ...emptyDraft.ingredients[0], amount: ' ', unit: ' ' }],
    }),
    false,
  );
});
