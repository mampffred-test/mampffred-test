import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

type TestWorkerEvent = {
  data?: { type: string };
  ports?: { postMessage: (data: unknown) => void }[];
  request?: {
    method: string;
    mode?: string;
    destination?: string;
    url: string;
  };
  respondWith?: (work: Promise<unknown>) => void;
  waitUntil: (work: Promise<void>) => void;
};

function harness(source: string, retainedAsset = false) {
  const listeners: Record<string, (event: TestWorkerEvent) => void> = {};
  const puts: string[] = [],
    deleted: string[] = [],
    navigated: string[] = [];
  let unregistered = false;
  let activated = 0;
  const downloads: Request[] = [];
  const cache = {
    addAll: async (requests: Request[]) => {
      downloads.push(...requests);
    },
    put: async (key: string) => {
      puts.push(key);
    },
    match: async () =>
      retainedAsset ? undefined : new Response('offline app'),
  };
  const self = {
    registration: {
      scope: 'https://example.test/app/',
      unregister: async () => {
        unregistered = true;
      },
    },
    skipWaiting: async () => {
      activated++;
    },
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
    Request,
    caches: {
      match: async () =>
        retainedAsset ? new Response('retained release chunk') : undefined,
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
    downloads,
    get activated() {
      return activated;
    },
    get unregistered() {
      return unregistered;
    },
  };
}

test('Navigation überschreibt keine vorbereitete Release-Shell mit fremden oder neuen HTML-Dateien', async () => {
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
  assert.deepEqual(h.puts, []);
});

test('Installation lädt frische vollständige Assets, aktiviert aber erst nach Bestätigung', async () => {
  const h = harness(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
  );
  const work: Promise<void>[] = [];
  h.listeners.install({
    waitUntil: (promise) => {
      work.push(promise);
    },
  });
  await Promise.all(work);
  assert.equal(h.downloads.length, 1);
  assert.equal(h.downloads[0].cache, 'reload');
  assert.equal(h.activated, 0);
  h.listeners.message({
    data: { type: 'MAMPFFRED_ACTIVATE' },
    waitUntil: (promise) => {
      work.push(promise);
    },
  });
  await Promise.all(work);
  assert.equal(h.activated, 1);
});

test('Worker beantwortet Versionsabfragen ohne Nutzerdaten oder Netzwerkzugriff', () => {
  const source = readFileSync(
    new URL('../public/sw.js', import.meta.url),
    'utf8',
  ).replace('__MAMPFFRED_BUILD__', '123456abcdef');
  const h = harness(source);
  let response: unknown;
  h.listeners.message({
    data: { type: 'MAMPFFRED_VERSION' },
    ports: [
      {
        postMessage: (data) => {
          response = data;
        },
      },
    ],
    waitUntil: () => {},
  });
  assert.equal(
    JSON.stringify(response),
    JSON.stringify({ buildId: '123456abcdef' }),
  );
});

test('offene alte App-Fenster können ihre behaltenen Module auch nach Aktivierung nachladen', async () => {
  const h = harness(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    true,
  );
  let response: Promise<unknown> | undefined;
  const work: Promise<void>[] = [];
  h.listeners.fetch({
    request: {
      method: 'GET',
      destination: 'script',
      url: 'https://example.test/app/assets/old-version.js',
    },
    respondWith(promise) {
      response = promise;
    },
    waitUntil(promise) {
      work.push(promise);
    },
  });
  assert.equal(
    await ((await response) as Response).text(),
    'retained release chunk',
  );
  await Promise.all(work);
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
