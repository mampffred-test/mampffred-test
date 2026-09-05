import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

type TestWorkerEvent = {
  request?: {
    method: string;
    mode?: string;
    destination?: string;
    url: string;
  };
  respondWith?: (work: Promise<unknown>) => void;
  waitUntil: (work: Promise<void>) => void;
};

function harness(source: string) {
  const listeners: Record<string, (event: TestWorkerEvent) => void> = {};
  const puts: string[] = [],
    deleted: string[] = [],
    navigated: string[] = [];
  let unregistered = false;
  const cache = {
    addAll: async () => {},
    put: async (key: string) => {
      puts.push(key);
    },
    match: async () => new Response('offline app'),
  };
  const self = {
    registration: {
      scope: 'https://example.test/app/',
      unregister: async () => {
        unregistered = true;
      },
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () =>
        [
          'https://example.test/app/',
          'https://example.test/other/',
          'https://foreign.test/app/',
        ].map((url) => ({
          url,
          navigate: async (target: string) => {
            navigated.push(target);
          },
        })),
    },
    addEventListener: (type: string, cb: (event: TestWorkerEvent) => void) => {
      listeners[type] = cb;
    },
  };
  const context = {
    self,
    URL,
    Response,
    caches: {
      open: async () => cache,
      keys: async () => [
        'mampffred-%2Fapp%2F-old',
        'mampffred-%2Fother%2F-current',
        'unrelated',
      ],
      delete: async (key: string) => {
        deleted.push(key);
      },
    },
    fetch: async () => new Response('online', { status: 200 }),
    __MAMPFFRED_PRECACHE__: [''],
  };
  vm.runInNewContext(source, context);
  return {
    listeners,
    puts,
    deleted,
    navigated,
    get unregistered() {
      return unregistered;
    },
  };
}

test('nur die exakte App-Wurzel aktualisiert die Offline-Shell', async () => {
  const h = harness(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
  );
  for (const url of [
    'https://example.test/app/docs.html',
    'https://example.test/app/?other',
    'https://example.test/app/',
  ]) {
    const work: Promise<unknown>[] = [];
    h.listeners.fetch({
      request: { method: 'GET', mode: 'navigate', url },
      respondWith(p: Promise<unknown>) {
        work.push(p);
      },
      waitUntil(p: Promise<unknown>) {
        work.push(p);
      },
    });
    await Promise.all(work);
  }
  assert.deepEqual(h.puts, ['https://example.test/app/']);
});

test('Notfall-Worker räumt nur den eigenen Cache und eigene Clients auf', async () => {
  const h = harness(
    readFileSync(
      new URL('../scripts/emergency-sw.js', import.meta.url),
      'utf8',
    ),
  );
  let complete: Promise<void> = Promise.resolve();
  h.listeners.activate({
    waitUntil(p: Promise<void>) {
      complete = p;
    },
  });
  await complete;
  assert.deepEqual(h.deleted, ['mampffred-%2Fapp%2F-old']);
  assert.deepEqual(h.navigated, ['https://example.test/app/recovery.html']);
  assert.equal(h.unregistered, true);
});

test('nachgeladene Bilder werden weiterhin für Offline-Nutzung gespeichert', async () => {
  const h = harness(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
  );
  const work: Promise<unknown>[] = [];
  h.listeners.fetch({
    request: {
      method: 'GET',
      destination: 'image',
      url: 'https://example.test/app/assets/extra.png',
    },
    respondWith(p: Promise<unknown>) {
      work.push(p);
    },
    waitUntil(p: Promise<unknown>) {
      work.push(p);
    },
  });
  await Promise.all(work);
  await Promise.all(work);
  assert.equal(h.puts.length, 1);
});
