import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cropSelection,
  fitCropScene,
  resizeCrop,
  setCropFormat,
  zoomCropImage,
  panCropImage,
  validateCropSelection,
  type CropCorner,
  type CropSelection,
  type CropFormat,
} from '../lib/image-crop.ts';
import { validateImageFrame } from '../lib/image-frame.ts';
import {
  createEmptyData,
  createSampleRecipes,
  migrateAppData,
} from '../lib/model.ts';

const selection: CropSelection = {
  x: 0.1,
  y: 0.15,
  width: 0.7,
  height: 0.6,
  sourceAspect: 1.5,
  format: 'free',
};
const near = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('repeated format switches preserve zoom for portrait, landscape and already zoomed images', () => {
  for (const sourceAspect of [0.5, 1, 1.5, 2.5]) {
    for (const fraction of [1, 0.4, 0.125, 1 / 13.23]) {
      let scene = fitCropScene(
        {
          x: (1 - fraction) / 2,
          y: (1 - fraction) / 2,
          width: fraction,
          height: fraction,
          sourceAspect,
          format: 'original',
        },
        384,
        452,
      );
      const sequence: CropFormat[] = [
        'free',
        'square',
        '4:3',
        'original',
        '4:3',
        'square',
      ];
      for (let cycle = 0; cycle < 40; cycle++) {
        for (const format of sequence) {
          const changed = setCropFormat(scene, format);
          scene = fitCropScene(cropSelection(changed, format), 384, 452);
          near(
            Math.max(
              scene.crop.width / scene.image.width,
              scene.crop.height / scene.image.height,
            ),
            fraction,
          );
          const normalized = cropSelection(scene, format);
          assert.doesNotThrow(() => validateCropSelection(normalized));
          near(normalized.x + normalized.width / 2, 0.5);
          near(normalized.y + normalized.height / 2, 0.5);
        }
      }
    }
  }
});

test('format changes near image edges keep the full selection inside the source without zooming', () => {
  for (const x of [0, 0.6]) {
    for (const y of [0, 0.6]) {
      const scene = fitCropScene(
        {
          x,
          y,
          width: 0.4,
          height: 0.4,
          sourceAspect: 1.5,
          format: 'original',
        },
        384,
        452,
      );
      for (const format of ['original', 'square', '4:3'] as CropFormat[]) {
        const result = cropSelection(setCropFormat(scene, format), format);
        near(Math.max(result.width, result.height), 0.4);
        assert.doesNotThrow(() => validateCropSelection(result));
      }
      assert.strictEqual(setCropFormat(scene, 'free'), scene);
    }
  }
});

test('normalized selection survives screen resizing without changing source pixels', () => {
  for (const [width, height] of [
    [384, 360],
    [320, 300],
    [412, 600],
  ]) {
    const restored = cropSelection(
      fitCropScene(selection, width, height),
      'free',
    );
    for (const key of ['x', 'y', 'width', 'height', 'sourceAspect'] as const)
      near(restored[key], selection[key]);
  }
});

test('all four corners keep the opposite corner fixed and enforce square proportions', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se'] as CropCorner[]) {
    const scene = fitCropScene(selection, 384, 360);
    const c = scene.crop;
    const point = {
      x: c.x + (corner.includes('e') ? c.width - 35 : 35),
      y: c.y + (corner.includes('s') ? c.height - 25 : 25),
    };
    const result = resizeCrop(
      scene,
      corner,
      point,
      { width: 384, height: 360 },
      1,
    );
    near(result.crop.width, result.crop.height);
    near(
      result.crop.x + (corner.includes('w') ? result.crop.width : 0),
      c.x + (corner.includes('w') ? c.width : 0),
    );
    near(
      result.crop.y + (corner.includes('n') ? result.crop.height : 0),
      c.y + (corner.includes('n') ? c.height : 0),
    );
    assert.deepEqual(result.image, scene.image);
  }
});

test('free resizing changes aspect; formats lock ratios and extreme gestures stay inside image', () => {
  const scene = fitCropScene(selection, 384, 360);
  const resized = resizeCrop(
    scene,
    'se',
    { x: scene.crop.x + 100, y: scene.crop.y + 160 },
    { width: 384, height: 360 },
  );
  near(resized.crop.width / resized.crop.height, 100 / 160);
  for (const [format, ratio] of [
    ['original', 1.5],
    ['square', 1],
    ['4:3', 4 / 3],
  ] as const) {
    const formatted = setCropFormat(resized, format);
    near(formatted.crop.width / formatted.crop.height, ratio);
  }
  for (const point of [
    { x: -10000, y: -10000 },
    { x: 10000, y: 10000 },
  ]) {
    for (const corner of ['nw', 'ne', 'sw', 'se'] as CropCorner[]) {
      const result = resizeCrop(scene, corner, point, {
        width: 384,
        height: 360,
      });
      assert.doesNotThrow(() =>
        validateCropSelection(cropSelection(result, 'free')),
      );
      assert.ok(result.crop.width >= 48 && result.crop.height >= 48);
    }
  }
});

test('zoom and pan never expose empty pixels within the crop', () => {
  const original = fitCropScene(selection, 384, 360);
  for (const factor of [0.0001, 1, 2, 999]) {
    const scene = panCropImage(
      zoomCropImage(original, factor, { x: 150, y: 160 }),
      9999,
      -9999,
    );
    assert.ok(scene.image.width + 1e-8 >= scene.crop.width);
    assert.ok(scene.image.height + 1e-8 >= scene.crop.height);
    assert.ok(scene.image.x <= scene.crop.x + 1e-8);
    assert.ok(scene.image.y <= scene.crop.y + 1e-8);
    assert.ok(
      scene.image.x + scene.image.width + 1e-8 >=
        scene.crop.x + scene.crop.width,
    );
    assert.ok(
      scene.image.y + scene.image.height + 1e-8 >=
        scene.crop.y + scene.crop.height,
    );
  }
});

test('crop survives recipe and draft persistence while legacy frames still work', () => {
  const frame = { x: 0.5, y: 0.5, zoom: 1, crop: selection };
  const recipe = { ...createSampleRecipes()[0], imageFrame: frame };
  const { shareId: _, ...draft } = recipe;
  const restored = migrateAppData({
    ...createEmptyData(),
    recipes: [recipe],
    recipeDrafts: [
      {
        ...draft,
        foodOverrides: {},
        createdAt: '2026-09-13T00:00:00Z',
        updatedAt: '2026-09-13T00:00:00Z',
      },
    ],
  });
  assert.deepEqual(restored.recipes[0].imageFrame, frame);
  assert.deepEqual(restored.recipeDrafts[0].imageFrame, frame);
  assert.deepEqual(validateImageFrame({ x: 0.2, y: 0.3, zoom: 2 }), {
    x: 0.2,
    y: 0.3,
    zoom: 2,
  });
  for (const crop of [
    null,
    {},
    { ...selection, x: -1 },
    { ...selection, width: 3 },
    { ...selection, sourceAspect: Infinity },
    { ...selection, format: 'unknown' },
  ])
    assert.throws(() => validateImageFrame({ ...frame, crop }));
});
