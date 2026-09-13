import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultImageFrame,
  panImageFrame,
  validateImageFrame,
  zoomImageFrame,
} from '../lib/image-frame.ts';

test('pinch zoom keeps the image point under the moving midpoint', () => {
  const result = zoomImageFrame(
    { x: 0.5, y: 0.5, zoom: 1 },
    2,
    { x: 100, y: 75 },
    { x: 120, y: 90 },
    400,
    300,
    400,
    300,
  );
  assert.deepEqual(result, { zoom: 2, x: 0.2, y: 0.2 });
  // Image coordinate (100, 75) now appears exactly at the new midpoint.
  assert.equal(100 * result.zoom - 400 * result.x, 120);
  assert.equal(75 * result.zoom - 300 * result.y, 90);
});

test('zoom clamps portrait and landscape images to filled crop boundaries', () => {
  for (const [iw, ih] of [
    [300, 900],
    [900, 300],
  ]) {
    for (const zoom of [0.01, 1, 2, 100]) {
      const result = zoomImageFrame(
        { x: 0, y: 1, zoom: 2 },
        zoom,
        { x: 0, y: 0 },
        { x: 999, y: -999 },
        iw,
        ih,
        384,
        288,
      );
      assert.doesNotThrow(() => validateImageFrame(result));
    }
  }
  assert.deepEqual(
    zoomImageFrame(
      defaultImageFrame,
      2,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      0,
      0,
      384,
      288,
    ),
    defaultImageFrame,
  );
});
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
