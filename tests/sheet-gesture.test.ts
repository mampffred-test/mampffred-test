import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldDismissSheet } from '../lib/sheet-gesture.ts';

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
