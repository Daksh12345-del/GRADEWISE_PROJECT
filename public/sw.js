// GradeWallah service worker — runtime app-shell caching.
//
// This does NOT precache a hardcoded list of hashed build filenames
// (Vite renames every JS/CSS bundle on each build, so a static list would
// go stale immediately). Instead it caches opportunistically as the app
// is used, which is enough to make a repeat visit — including a fully
// offline one, e.g. re-opening the app in a hostel-Wi-Fi dead zone —
// load the shell instantly instead of showing the browser's offline page.
//
// Strategy by request type:
//   - Navigations (loading /dashboard, /app, etc. directly): network-first,
//     falling back to the cached index.html so client-side routing can
//     still take over once React mounts.
//   - Same-origin built assets (JS/CSS/fonts/images under /assets, icons):
//     stale-while-revalidate — serve the cached copy instantly if present,
//     and refresh the cache in the background for next time.
//   - Everything cross-origin (Supabase REST calls, Clerk, Google Fonts,
//     the pdf.js CDN, etc.): left completely alone. Caching API responses
//     here would risk serving a student stale/wrong marks or auth state;
//     that offline story is handled at the app level instead, in
//     src/lib/liveContent.js (IndexedDB) and src/lib/useMarksData.js
//     (localStorage), which know the actual freshness rules for that data.

const CACHE_NAME = 'gradewallah-shell-v1'
const OFFLINE_URL = '/index.html'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
      await self.clients.claim()
    })()
  )
})

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

// Static, versioned build output — safe to cache aggressively.
function isCacheableAsset(url) {
  if (!isSameOrigin(url)) return false
  return (
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Navigations — network-first, offline fallback to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(CACHE_NAME)
          cache.put(OFFLINE_URL, fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cache = await caches.open(CACHE_NAME)
          const cached = await cache.match(OFFLINE_URL)
          return cached || Response.error()
        }
      })()
    )
    return
  }

  // Built assets — stale-while-revalidate.
  if (isCacheableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME)
        const cached = await cache.match(request)
        const networkFetch = fetch(request)
          .then((fresh) => {
            if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {})
            return fresh
          })
          .catch(() => null)
        return cached || (await networkFetch) || Response.error()
      })()
    )
    return
  }

  // Anything else (cross-origin APIs, Supabase, Clerk, fonts CDN, pdf.js
  // CDN): don't intercept — normal network fetch, no caching here.
})
