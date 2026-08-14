/**
 * Service worker for the installed app.
 *
 * The page already carries its data, styles and script inline, so caching the
 * document is enough to make the whole app work with no signal at all — which
 * is the normal state of a school gym.
 *
 * VERSION is replaced at build time with a hash of the built page, so a deploy
 * produces a new cache and the old one is dropped on activation.
 */
const VERSION = "__VERSION__";
const CACHE = `drill-draw-${VERSION}`;

// "./" is what a launch from the home screen requests; the rest keep the icons
// and manifest available offline so the install does not degrade.
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(takeOver());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only this app's own GETs; anything else is left to the network.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(fromCacheThenUpdate(request));
});

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(ASSETS);
  // Skip waiting so a coach who reopens the app gets the new version promptly.
  await self.skipWaiting();
}

async function takeOver() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
  await self.clients.claim();
}

/**
 * Answers from the cache immediately and refreshes it in the background, so the
 * app opens instantly and offline, and picks up a new deploy on the next launch.
 */
async function fromCacheThenUpdate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });

  const update = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const fresh = await update;
  if (fresh) return fresh;

  // Offline and never cached: hand back the app shell for a page request.
  if (request.mode === "navigate") {
    const shell = await cache.match("./index.html");
    if (shell) return shell;
  }

  return Response.error();
}
