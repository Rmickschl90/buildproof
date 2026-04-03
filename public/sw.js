const CACHE_NAME = "buildproof-app-shell-v3";
const APP_SHELL_URLS = [
  "/",
  "/dashboard",
  "/login",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try {
          const fresh = await fetch(request);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const exactMatch = await cache.match(request, {
            ignoreSearch: false,
          });
          if (exactMatch) return exactMatch;

          const pathOnlyMatch = await cache.match(url.pathname);
          if (pathOnlyMatch) return pathOnlyMatch;

          const cachedDashboard = await cache.match("/dashboard");
          if (cachedDashboard) return cachedDashboard;

          const cachedRoot = await cache.match("/");
          if (cachedRoot) return cachedRoot;

          throw new Error("Offline and no cached app shell available.");
        }
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request)
            .then((response) => {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              return response;
            })
            .catch(() => cached)
        );
      })
    );
  }
});