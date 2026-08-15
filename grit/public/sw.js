/**
 * Cache everything the game asks for, then serve from the cache first.
 *
 * The whole game is three files and no data ever leaves the device, so there is
 * nothing to keep fresh and nothing to invalidate beyond a version bump.
 */
// Both of these lines are rewritten by scripts/build-sw.mjs at build time with
// the real, content-hashed asset names. The defaults keep `vite dev` happy.
const CACHE = 'grit-dev'
const PRECACHE = ['./', './index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request)
          .then((response) => {
            const copy = response.clone()
            caches.open(CACHE).then((c) => c.put(request, copy))
            return response
          })
          // Offline and never seen before: fall back to the app shell.
          .catch(() => caches.match('./index.html')),
    ),
  )
})
