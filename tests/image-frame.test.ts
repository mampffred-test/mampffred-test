import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultImageFrame,
  panImageFrame,
  validateImageFrame,
} from '../lib/image-frame.ts';
import {
  createEmptyData,
  createSampleRecipes,
  migrateAppData,
} from '../lib/model.ts';

test('erhält den Bildausschnitt in gespeicherten Rezepten und Entwürfen', () => {
  const frame = { x: 0.2, y: 0.7, zoom: 2 };
  const recipe = { ...createSampleRecipes()[0], imageFrame: frame };
  const { shareId: _, ...draft } = recipe;
  const data = migrateAppData({
    ...createEmptyData(),
    recipes: [recipe],
    recipeDrafts: [
      {
        ...draft,
        foodOverrides: {},
        createdAt: '2026-09-06T00:00:00Z',
        updatedAt: '2026-09-06T00:00:00Z',
      },
    ],
  });
  assert.deepEqual(data.recipes[0].imageFrame, frame);
  assert.deepEqual(data.recipeDrafts[0].imageFrame, frame);
});

test('weist ungültige Ausschnitte aus Importen zurück', () => {
  for (const value of [
    null,
    [],
    { x: -0.1, y: 0.5, zoom: 1 },
    { x: 0.5, y: 2, zoom: 1 },
    { x: 0.5, y: 0.5, zoom: 0 },
    { x: NaN, y: 0, zoom: 1 },
    { x: 0, y: 0, zoom: Infinity },
  ])
    assert.throws(() => validateImageFrame(value), /INVALID_IMAGE_FRAME/);
});

test('verschiebt nur verfügbaren Bildüberhang und hält den Rahmen gefüllt', () => {
  assert.deepEqual(
    panImageFrame(defaultImageFrame, 100, 100, 400, 300, 400, 300),
    defaultImageFrame,
  );
  assert.deepEqual(
    panImageFrame({ x: 0.5, y: 0.5, zoom: 2 }, 100, 75, 400, 300, 400, 300),
    { x: 0.25, y: 0.25, zoom: 2 },
  );
  assert.deepEqual(
    panImageFrame({ x: 0.5, y: 0.5, zoom: 2 }, 9999, -9999, 400, 300, 400, 300),
    { x: 0, y: 1, zoom: 2 },
  );
});
