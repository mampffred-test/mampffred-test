import assert from 'node:assert/strict';
import test from 'node:test';

import { validateImageFile } from '../lib/storage.ts';

function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: 'image/png' });
}

test('weist extreme Bildabmessungen vor dem Raster-Decoding zurück', async () => {
  await assert.rejects(
    () => validateImageFile(pngHeader(9_000, 4_000)),
    /INVALID_IMAGE_DIMENSIONS/,
  );
});

test('weist Dateien mit falscher MIME-Signatur zurück', async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
    type: 'image/png',
  });
  await assert.rejects(() => validateImageFile(blob), /INVALID_IMAGE_FILE/);
});
