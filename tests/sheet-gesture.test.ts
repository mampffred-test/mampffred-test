import assert from 'node:assert/strict';
import test from 'node:test';

import {
  rubberBand,
  shouldDismissDraggedSheet,
  shouldDismissSheet,
} from '../lib/sheet-gesture.ts';

test('schließt ein Sheet erst nach einer klaren Abwärtsgeste', () => {
  assert.equal(
    shouldDismissSheet({ distance: 110, elapsedMs: 500, viewportHeight: 844 }),
    true,
  );
  assert.equal(
    shouldDismissSheet({ distance: 50, elapsedMs: 500, viewportHeight: 844 }),
    false,
  );
  assert.equal(
    shouldDismissSheet({ distance: -120, elapsedMs: 120, viewportHeight: 844 }),
    false,
  );
});
test('akzeptiert einen kurzen schnellen Swipe, aber kein versehentliches Tippen', () => {
  assert.equal(
    shouldDismissSheet({ distance: 42, elapsedMs: 50, viewportHeight: 844 }),
    true,
  );
  assert.equal(
    shouldDismissSheet({ distance: 18, elapsedMs: 20, viewportHeight: 844 }),
    false,
  );
  assert.equal(
    shouldDismissSheet({ distance: 42, elapsedMs: 0, viewportHeight: 844 }),
    false,
  );
});

test('gezogene Sheets schließen per Schwung oder nach einem Drittel', () => {
  const sheet = { sheetHeight: 600 };
  assert.equal(
    shouldDismissDraggedSheet({ ...sheet, distance: 30, releaseVelocity: 0.8 }),
    true,
  );
  assert.equal(
    shouldDismissDraggedSheet({
      ...sheet,
      distance: 120,
      releaseVelocity: 0.1,
    }),
    false,
  );
  assert.equal(
    shouldDismissDraggedSheet({ ...sheet, distance: 200, releaseVelocity: 0 }),
    true,
  );
  // Flicking back up keeps the sheet open, even far down.
  assert.equal(
    shouldDismissDraggedSheet({
      ...sheet,
      distance: 300,
      releaseVelocity: -0.5,
    }),
    false,
  );
  assert.equal(
    shouldDismissDraggedSheet({ ...sheet, distance: 0, releaseVelocity: 2 }),
    false,
  );
});

test('Ziehen nach oben wird gebremst', () => {
  assert.equal(rubberBand(40), 40);
  assert.ok(rubberBand(-16) < 0 && rubberBand(-16) > -16);
  assert.equal(rubberBand(-10_000), -28);
});
