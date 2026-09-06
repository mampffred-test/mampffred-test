import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function worker() {
  const entries = new Map<string, Response>();
  const network: string[] = [];
  let failWrite = false;
  let fetchHandler: (event: {
    request: Request;
    respondWith: (p: Promise<Response>) => void;
  }) => void;
  const cache = {
    keys: async () => [...entries.keys()],
    match: async (key: string) => entries.get(key)?.clone(),
    delete: async (key: string) => entries.delete(key),
    put: async (key: string, response: Response) => {
      if (failWrite) throw new Error('QUOTA');
      entries.set(key, response);
    },
  };
  vm.runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    {
      self: {
        registration: { scope: 'https://example.test/app/' },
        addEventListener: (name: string, fn: typeof fetchHandler) => {
          if (name === 'fetch') fetchHandler = fn;
        },
      },
      URL,
      Response,
      Blob,
      File,
      crypto,
      caches: { open: async () => cache },
      fetch: async (request: Request) => {
        network.push(request.url);
        return new Response('network');
      },
      __MAMPFFRED_PRECACHE__: [''],
    },
  );
  return {
    entries,
    network,
    failWrite: () => {
      failWrite = true;
    },
    receive: (request: Request) => {
      let response: Promise<Response> | undefined;
      fetchHandler({
        request,
        respondWith: (p) => {
          response = p;
        },
      });
      assert.ok(response);
      return response;
    },
  };
}
function upload(size = 20, count = 1) {
  const body = new FormData();
  for (let i = 0; i < count; i++)
    body.append(
      'recipe',
      new File(
        [
          JSON.stringify({
            format: 'mampffred-recipe',
            version: 2,
            padding: 'x'.repeat(size),
          }),
        ],
        'recipe.txt',
        { type: 'text/plain' },
      ),
    );
  return new Request('https://example.test/app/receive-share', {
    method: 'POST',
    body,
  });
}

test('Share Target speichert lokal, begrenzt den Eingang und sendet niemals POSTs weiter', async () => {
  const h = worker();
  for (let i = 0; i < 5; i++) {
    const response = await h.receive(upload());
    assert.equal(response.status, 303);
    assert.match(
      response.headers.get('Location')!,
      /^https:\/\/example.test\/app\/\?incoming=[a-f0-9-]{36}$/,
    );
  }
  assert.equal(h.entries.size, 5);
  assert.equal(
    (await h.receive(upload())).headers.get('Location'),
    'https://example.test/app/?incoming=error-INBOX_FULL',
  );
  assert.deepEqual(h.network, []);
});

test('Dateigröße, Mehrfachdateien und Speicherfehler bleiben lokal', async () => {
  const h = worker();
  for (const [request, code] of [
    [upload(2_000_001), 'SIZE'],
    [upload(20, 2), 'MULTIPLE'],
    [upload(2_100_001), 'SIZE'],
    [
      new Request('https://example.test/app/receive-share', {
        method: 'POST',
        body: 'invalid',
      }),
      'TRANSPORT',
    ],
  ] as const) {
    assert.equal(
      (await h.receive(request)).headers.get('Location'),
      `https://example.test/app/?incoming=error-${code}`,
    );
  }
  h.failWrite();
  assert.equal(
    (await h.receive(upload())).headers.get('Location'),
    'https://example.test/app/?incoming=error-STORAGE',
  );
  assert.equal(h.entries.size, 0);
  assert.deepEqual(h.network, []);
});

test('Eingangsseite und interne Cache-Adressen lösen auch bei Cacheverlust keine Netzabfrage aus', async () => {
  const h = worker();
  assert.equal(
    (await h.receive(new Request('https://example.test/app/?incoming=error')))
      .status,
    503,
  );
  assert.equal(
    (
      await h.receive(
        new Request('https://example.test/app/__share_inbox__/private'),
      )
    ).status,
    404,
  );
  assert.deepEqual(h.network, []);
});

test('abgelaufene Eingänge werden vor dem nächsten Empfang entfernt', async () => {
  const h = worker();
  h.entries.set(
    'https://example.test/app/__share_inbox__/old',
    new Response('old', { headers: { 'X-Received-At': '1' } }),
  );
  await h.receive(upload());
  assert.equal(h.entries.size, 1);
  assert.equal(
    h.entries.has('https://example.test/app/__share_inbox__/old'),
    false,
  );
});

test('gleichzeitige Eingänge umgehen das Limit nicht', async () => {
  const h = worker();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => h.receive(upload())),
  );
  assert.equal(h.entries.size, 5);
  assert.equal(
    responses.filter((response) =>
      response.headers.get('Location')?.endsWith('=error-INBOX_FULL'),
    ).length,
    3,
  );
  assert.deepEqual(h.network, []);
});

test('Begleittext und alte Android-WebAPK-Captiondateien verändern die Rezeptdatei nicht', async () => {
  const recipe = JSON.stringify({
    format: 'mampffred-recipe',
    version: 2,
    recipe: { name: 'Test' },
  });
  for (const mime of [
    'text/plain',
    'application/json',
    'application/octet-stream',
  ]) {
    for (const mode of [
      'fields',
      'caption-first',
      'caption-last',
      'json-caption',
    ]) {
      const h = worker();
      const body = new FormData();
      const caption = () =>
        body.append(
          'recipe',
          new File(['Rezept für Mampffred – Anleitung'], 'shared.txt', {
            type: 'text/plain',
          }),
        );
      if (mode === 'caption-first') caption();
      if (mode === 'json-caption')
        body.append(
          'recipe',
          new File(['{"Hinweis":"Guten Appetit"}'], 'shared.txt', {
            type: 'text/plain',
          }),
        );
      // Filename and MIME are not reliable identifiers of recipe contents.
      body.append('recipe', new File([recipe], 'shared.txt', { type: mime }));
      if (mode === 'caption-last') caption();
      if (mode === 'fields') {
        body.append('text', 'Rezept für Mampffred');
        body.append('title', 'Nachricht');
      }
      const response = await h.receive(
        new Request('https://example.test/app/receive-share', {
          method: 'POST',
          body,
        }),
      );
      assert.match(
        response.headers.get('Location')!,
        /incoming=[a-f0-9-]{36}$/u,
      );
      assert.equal(await [...h.entries.values()][0].text(), recipe);
      assert.deepEqual(h.network, []);
    }
  }
});

test('fehlende Dateien, reiner Text und ungültige Anhänge haben eigene begrenzte Fehler', async () => {
  const cases: Array<[FormData, string]> = [];
  cases.push([new FormData(), 'NO_FILE']);
  const text = new FormData();
  text.append('text', 'Begleittext');
  cases.push([text, 'NO_FILE']);
  for (const [contents, code] of [
    ['Begleittext', 'NO_RECIPE'],
    ['{kaputt', 'INVALID_FILE'],
    ['{}', 'INVALID_FILE'],
    ['x'.repeat(16_001), 'INVALID_FILE'],
  ]) {
    const body = new FormData();
    body.append(
      'recipe',
      new File([contents], 'shared.txt', { type: 'text/plain' }),
    );
    cases.push([body, code]);
  }
  const excess = new FormData();
  for (let i = 0; i < 9; i++) excess.append('text', 'caption');
  cases.push([excess, 'INVALID_FILE']);
  for (const [body, code] of cases) {
    const h = worker();
    const response = await h.receive(
      new Request('https://example.test/app/receive-share', {
        method: 'POST',
        body,
      }),
    );
    assert.equal(
      response.headers.get('Location'),
      `https://example.test/app/?incoming=error-${code}`,
    );
    assert.equal(h.entries.size, 0);
    assert.deepEqual(h.network, []);
  }
});
