const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname;
const CACHE_PREFIX = `mampffred-${encodeURIComponent(scopePath)}-`;
const CACHE = `${CACHE_PREFIX}__MAMPFFRED_CACHE__`;
const scopedUrl = (path = '') => new URL(path, scopeUrl).href;
const APP_SHELL = __MAMPFFRED_PRECACHE__.map((path) => scopedUrl(path));
const INBOX = `${CACHE_PREFIX}inbox`;
let incomingQueue = Promise.resolve();

self.addEventListener('message', (event) => {
  if (
    event.data?.type !== 'focus-incoming' ||
    !/^[a-f0-9-]{36}$/u.test(event.data.id || '')
  )
    return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window' })
      .then(async (clients) => {
        for (const client of clients) {
          if (client.id === event.source?.id) continue;
          const url = new URL(client.url);
          if (
            url.origin === scopeUrl.origin &&
            url.pathname === scopePath &&
            url.searchParams.get('incoming') === event.data.id
          ) {
            await client.focus();
            return;
          }
        }
      })
      .catch(() => undefined),
  );
});

async function receiveRecipe(request) {
  try {
    // Bound the entire multipart body before parsing, including unknown fields.
    const limit = 2_100_000;
    if (Number(request.headers.get('Content-Length')) > limit)
      throw new Error('SIZE');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('EMPTY');
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) throw new Error('SIZE');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const form = await new Response(new Blob(chunks), {
      headers: { 'Content-Type': request.headers.get('Content-Type') || '' },
    }).formData();
    const entries = [...form.entries()];
    const file = form.get('recipe');
    if (
      entries.length !== 1 ||
      !(file instanceof File) ||
      !file.size ||
      file.size > 2_000_000
    )
      throw new Error('INVALID_FILE');
    const cache = await caches.open(INBOX);
    const keys = await cache.keys();
    for (const key of keys) {
      const entry = await cache.match(key);
      if (
        !entry ||
        Date.now() - Number(entry.headers.get('X-Received-At')) > 86_400_000
      )
        await cache.delete(key);
    }
    // Refuse excess pending imports instead of overwriting another open preview.
    if ((await cache.keys()).length >= 5) throw new Error('INBOX_FULL');
    const id = crypto.randomUUID();
    await cache.put(
      scopedUrl(`__share_inbox__/${id}`),
      new Response(file, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Received-At': String(Date.now()),
        },
      }),
    );
    return Response.redirect(scopedUrl(`?incoming=${id}`), 303);
  } catch {
    // Never forward the POST, its contents or an error payload to the network.
    return Response.redirect(scopedUrl('?incoming=error'), 303);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) && key !== CACHE && key !== INBOX,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin !== scopeUrl.origin ||
    !requestUrl.pathname.startsWith(scopePath)
  )
    return;

  if (requestUrl.pathname === `${scopePath}receive-share`) {
    if (event.request.method === 'POST') {
      incomingQueue = incomingQueue.then(() => receiveRecipe(event.request));
      event.respondWith(incomingQueue);
      return;
    }
    event.respondWith(
      Promise.resolve(Response.redirect(scopedUrl('?incoming=error'), 303)),
    );
    return;
  }
  if (event.request.method !== 'GET') return;
  if (requestUrl.pathname.startsWith(`${scopePath}__share_inbox__/`)) {
    event.respondWith(
      Promise.resolve(new Response('Not found', { status: 404 })),
    );
    return;
  }
  if (
    requestUrl.pathname === scopePath &&
    requestUrl.searchParams.has('incoming')
  ) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(scopedUrl())) ||
            new Response(
              'Mampffred bitte einmal öffnen und danach erneut teilen.',
              { status: 503 },
            ),
        ),
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (
            response.ok &&
            !response.redirected &&
            requestUrl.href === scopedUrl()
          )
            event.waitUntil(
              caches
                .open(CACHE)
                .then((cache) => cache.put(scopedUrl(), response.clone())),
            );
          return response;
        })
        .catch(() =>
          caches.open(CACHE).then((cache) => cache.match(scopedUrl())),
        ),
    );
    return;
  }

  if (
    !['script', 'style', 'image', 'font', 'manifest'].includes(
      event.request.destination,
    )
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const refresh = fetch(event.request)
        .then((response) => {
          if (response.ok && !response.redirected)
            event.waitUntil(cache.put(event.request, response.clone()));
          return response;
        })
        .catch((error) => {
          if (cached) return cached;
          throw error;
        });
      if (cached) event.waitUntil(refresh.then(() => undefined));
      return cached || refresh;
    }),
  );
});
