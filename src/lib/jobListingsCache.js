// Small in-memory cache so navigating away from Internships/Placements and
// back doesn't refetch from the Python backend every single time. The
// backend itself can cold-start (free tier — see api.js), so an avoidable
// refetch can mean a real wait even when the data hasn't changed.
//
// Deliberately module-level (not localStorage) — it only needs to survive
// for the current browser session/tab, and resetting on a full page reload
// is the correct behavior (a hard refresh should show current data).
//
// A manual "Refresh" button (already present on both pages) bypasses this
// entirely via forceRefresh, so users always have a way to get fresh data
// immediately rather than waiting out the TTL.
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

const cache = new Map() // key -> { items, timestamp }

export function getCachedListings(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null
  return entry.items
}

export function setCachedListings(key, items) {
  cache.set(key, { items, timestamp: Date.now() })
}
