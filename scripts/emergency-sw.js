// Incident-only replacement for the deployed sw.js; never part of a normal build.
// Keep the exact existing worker URL and scope when deploying this file.
const emergencyScope = new URL(self.registration.scope);
const emergencyPrefix = `mampffred-${encodeURIComponent(emergencyScope.pathname)}-`;
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === emergencyScope.origin &&
    url.pathname === `${emergencyScope.pathname}receive-share`
  )
    event.respondWith(
      Promise.resolve(
        new Response('Mampffred wird gewartet. Bitte später erneut teilen.', {
          status: 503,
        }),
      ),
    );
});
self.addEventListener('install', (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(emergencyPrefix))
          .map((key) => caches.delete(key)),
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      await Promise.all(
        clients
          .filter((client) => {
            const url = new URL(client.url);
            return (
              url.origin === emergencyScope.origin &&
              url.pathname.startsWith(emergencyScope.pathname)
            );
          })
          .map((client) =>
            client.navigate(new URL('recovery.html', emergencyScope).href),
          ),
      );
    })(),
  );
});
