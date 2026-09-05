const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname;
const CACHE_PREFIX = `mampffred-${encodeURIComponent(scopePath)}-`;
const CACHE = `${CACHE_PREFIX}__MAMPFFRED_CACHE__`;
const scopedUrl = (path = '') => new URL(path, scopeUrl).href;
const APP_SHELL = __MAMPFFRED_PRECACHE__.map((path) => scopedUrl(path));

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
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin !== scopeUrl.origin ||
    !requestUrl.pathname.startsWith(scopePath)
  )
    return;

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
