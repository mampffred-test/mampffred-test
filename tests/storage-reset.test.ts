import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData } from '../lib/model.ts';
import {
  installStandardRecipes,
  newStandardImageKeys,
} from '../lib/standard-recipes.ts';
import { loadStandardRecipeImages } from '../lib/standard-recipe-images.ts';
import { queueReplaceAllData } from '../lib/storage.ts';

// Exercise the real replacement queue against a transactional in-memory IDB adapter.
const stores = {
  app: new Map<string, unknown>(),
  images: new Map<string, unknown>(),
};
let failNext = false;
const fakeDatabase = {
  close() {},
  transaction() {
    const draft = { app: new Map(stores.app), images: new Map(stores.images) };
    const fail = failNext;
    failNext = false;
    const tx = {
      error: new Error('TEST_TRANSACTION_ABORT'),
      oncomplete: undefined as (() => void) | undefined,
      onabort: undefined as (() => void) | undefined,
      objectStore(name: 'app' | 'images') {
        return {
          clear() {
            draft[name].clear();
          },
          put(value: unknown, key: string) {
            draft[name].set(key, value);
          },
        };
      },
    };
    setTimeout(() => {
      if (fail) tx.onabort?.();
      else {
        stores.app = draft.app;
        stores.images = draft.images;
        tx.oncomplete?.();
      }
    }, 0);
    return tx;
  },
};
Object.defineProperty(globalThis, 'indexedDB', {
  configurable: true,
  value: {
    open() {
      const request = {
        result: fakeDatabase,
        onsuccess: undefined as (() => void) | undefined,
      };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    },
  },
});

test('Reset ersetzt alle persönlichen Metadaten und Bilder erst nach vollständiger Vorbereitung', async () => {
  stores.app.set('legacy-personal-data', { private: true });
  stores.images.set('private-photo', new Blob(['private']));
  const fresh = installStandardRecipes(createEmptyData());
  const images = await loadStandardRecipeImages(
    newStandardImageKeys(createEmptyData(), fresh),
  );
  await queueReplaceAllData(fresh, images);
  assert.deepEqual([...stores.app.keys()], ['state']);
  assert.equal(stores.images.has('private-photo'), false);
  assert.equal(stores.images.size, 4);
  assert.equal((stores.app.get('state') as typeof fresh).recipes.length, 4);
});

test('fehlendes Bild oder abgebrochene Transaktion lässt den vorhandenen Datenbestand erhalten', async () => {
  const before = stores.app.get('state');
  const beforeImages = new Map(stores.images);
  const fresh = installStandardRecipes(createEmptyData());
  await assert.rejects(queueReplaceAllData(fresh, {}), /IMAGE_MISSING/);
  assert.strictEqual(stores.app.get('state'), before);
  failNext = true;
  await assert.rejects(
    queueReplaceAllData(createEmptyData(), {}),
    /TRANSACTION_ABORT/,
  );
  assert.strictEqual(stores.app.get('state'), before);
  assert.deepEqual(stores.images, beforeImages);
});

test('vorherige Schreibaufträge können den Reset nicht nachträglich überschreiben', async () => {
  const old = { ...createEmptyData(), onboardingDone: true };
  const fresh = installStandardRecipes(createEmptyData());
  const images = await loadStandardRecipeImages(
    newStandardImageKeys(createEmptyData(), fresh),
  );
  const earlier = queueReplaceAllData(old, {});
  const reset = queueReplaceAllData(fresh, images);
  await Promise.all([earlier, reset]);
  const saved = stores.app.get('state') as typeof fresh;
  assert.equal(saved.onboardingDone, false);
  assert.equal(saved.recipes.length, 4);
});
