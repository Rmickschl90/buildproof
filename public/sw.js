const CACHE_NAME = "buildproof-static-v2";
const APP_SHELL_URLS = [
  "/dashboard",
  "/buildproof-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL_URLS);
      await self.skipWaiting();
    })()
  );
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
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Handle full page navigations (offline app shell)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put("/dashboard", response.clone());
          return response;
        } catch {
          const cachedDashboard = await caches.match("/dashboard");
          if (cachedDashboard) return cachedDashboard;

          const cachedRoot = await caches.match("/");
          if (cachedRoot) return cachedRoot;

          return new Response("Offline", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    const accept = request.headers.get("accept") || "";
    const isRscRequest =
      url.searchParams.has("_rsc") ||
      accept.includes("text/x-component");

    const isStaticAsset =
      request.destination === "style" ||
      request.destination === "script" ||
      request.destination === "image" ||
      request.destination === "font";

    if (!isStaticAsset || isRscRequest) {
      return;
    }

    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
          return response;
        } catch {
          return cached;
        }
      })()
    );
  }
});