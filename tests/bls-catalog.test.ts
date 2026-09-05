import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { BLS_MANIFEST, blsCatalog } from '../lib/bls-catalog.ts';
import {
  calculateRecipeFromIngredients,
  foodDisplayName,
} from '../lib/food-nutrition.ts';

test('lädt den vollständig lokal gebündelten BLS 4.0 mit Attribution', () => {
  assert.equal(BLS_MANIFEST.dataset, 'BLS');
  assert.equal(BLS_MANIFEST.version, '4.0');
  assert.equal(BLS_MANIFEST.license, 'CC BY 4.0');
  assert.match(BLS_MANIFEST.attribution, /Max Rubner-Institut/);
  assert.equal(BLS_MANIFEST.sourceSha256.length, 64);
  assert.equal(blsCatalog.length, 7140);
});

test('übernimmt repräsentative BLS-Werte pro 100 g ohne stille Nullwerte', () => {
  const redLentils = blsCatalog.find(
    (food) => food.source.recordId === 'H730000',
  );
  assert.equal(redLentils?.name, 'Linse rot reif');
  assert.equal(redLentils?.nutrientsPer100g.energyKcal, 334);
  assert.equal(redLentils?.nutrientsPer100g.proteinG, 25.6);

  const feta = blsCatalog.find((food) => food.source.recordId === 'M012200');
  assert.equal(feta?.nutrientsPer100g.fiberG, undefined);
  assert.equal(feta?.nutrientsPer100g.carbohydratesG, 0);
});

test('zeigt häufige Lebensmittel mit natürlichen deutschen Namen', () => {
  const expected = new Map([
    ['E111100', 'Ei'],
    ['G312100', 'Brokkoli'],
    ['V416100', 'Hähnchenbrust'],
    ['M111300', 'Vollmilch'],
  ]);
  for (const [recordId, displayName] of expected) {
    const food = blsCatalog.find((entry) => entry.source.recordId === recordId);
    assert.ok(food);
    assert.equal(foodDisplayName(food), displayName);
  }
});

test('enthält nur endliche und physikalisch begrenzte Laufzeitwerte', () => {
  for (const food of blsCatalog) {
    assert.ok(food.id.startsWith('bls-4.0:'));
    assert.ok(food.name.length > 0 && food.name.length <= 500);
    for (const [key, value] of Object.entries(food.nutrientsPer100g)) {
      assert.ok(Number.isFinite(value), `${food.id}:${key}`);
      assert.ok(value >= 0, `${food.id}:${key}`);
      assert.ok(
        value <= (key === 'energyKcal' ? 1_000 : 100),
        `${food.id}:${key}`,
      );
    }
  }
});

test('bindet das vollständige erzeugte Datenpaket an einen geprüften Digest', async () => {
  const bytes = await readFile(
    new URL('../lib/data/bls-4.0.min.json', import.meta.url),
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    BLS_MANIFEST.runtimeSha256,
  );
});

test('berechnet ein echtes Gramm-Rezept vollständig aus dem Laufzeitkatalog', () => {
  const calculation = calculateRecipeFromIngredients(
    {
      id: 'bls-integration',
      ingredients: [
        { amount: '200', unit: 'g', name: 'Rote Linsen' },
        { amount: '100', unit: 'g', name: 'Reis' },
      ],
    },
    blsCatalog,
  );

  assert.equal(calculation.complete, true);
  assert.equal(calculation.resolvedIngredients, 2);
  assert.equal(calculation.totalIngredients, 2);
  assert.equal(calculation.wholeRecipe.proteinG?.source.kind, 'dataset');
  assert.equal(calculation.wholeRecipe.proteinG?.value, 59.131);
});
