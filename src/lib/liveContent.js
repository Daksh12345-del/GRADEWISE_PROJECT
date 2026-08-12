// Live-content loader — Supabase is the source of truth, IndexedDB is a
// stale-while-revalidate cache on top of it.
//
// How it works: src/lib/gradesData.js, resourcesData.js, subjectKB.js and
// loginFormData.js export EMPTY constants at build time (no hardcoded
// content in the bundle). On app startup, this module:
//
//   1. Immediately applies whatever snapshot is sitting in IndexedDB from
//      the last successful load (if any) — synchronously, before any
//      network round trip — and reports status 'ready' with `stale: true`.
//      This is what makes a cold start on flaky campus/hostel Wi-Fi (or a
//      fully offline reopen of the app) show the student's last-known
//      CGPA and notes instantly instead of a blocked loading screen.
//   2. Kicks off a real fetch from the `site_content` table in Supabase in
//      the background. On success, it overwrites the *contents* of the
//      matching exported array/object in place (same reference, new
//      data), bumps a version counter, persists the fresh snapshot back
//      to IndexedDB, and reports status 'ready' with `stale: false`.
//   3. If that fetch fails and a cached snapshot was already applied in
//      step 1, status stays 'ready' with `stale: true` — the UI shows an
//      "offline / showing cached data" indicator rather than blocking.
//      Only when there is NEITHER a cache NOR a successful fetch does
//      status become 'error' and the full-page retry screen show.
//
// To edit content after deploying: Supabase Dashboard → Table Editor →
// site_content → edit the `value` (jsonb) cell for the relevant key →
// save. No redeploy needed — next online page load picks it up and
// refreshes every device's cache.

import { supabase } from './supabase'
import { idbGet, idbSet } from './offlineCache'
import { SEMESTERS } from './gradesData'
import { VIDEO_DATA, PYQ_LINKS, SUBJECT_NOTES } from './resourcesData'
import { SUBJECT_KB } from './subjectKB'
import { COLLEGES_BY_CITY, BRANCHES, DOMAIN_GROUPS } from './loginFormData'

const CACHE_KEY = 'site_content_v1'

function replaceArrayContents(arr, newArr) {
  if (!Array.isArray(newArr)) return
  arr.length = 0
  arr.push(...newArr)
}

function replaceObjectContents(obj, newObj) {
  if (!newObj || typeof newObj !== 'object' || Array.isArray(newObj)) return
  Object.keys(obj).forEach(k => delete obj[k])
  Object.assign(obj, newObj)
}

// key in the `site_content` table -> how to apply its value
const APPLIERS = {
  SEMESTERS: v => replaceArrayContents(SEMESTERS, v),
  VIDEO_DATA: v => replaceObjectContents(VIDEO_DATA, v),
  PYQ_LINKS: v => replaceObjectContents(PYQ_LINKS, v),
  SUBJECT_NOTES: v => replaceObjectContents(SUBJECT_NOTES, v),
  SUBJECT_KB: v => replaceObjectContents(SUBJECT_KB, v),
  COLLEGES_BY_CITY: v => replaceArrayContents(COLLEGES_BY_CITY, v),
  BRANCHES: v => replaceObjectContents(BRANCHES, v),
  DOMAIN_GROUPS: v => replaceArrayContents(DOMAIN_GROUPS, v),
}

const REQUIRED_KEYS = Object.keys(APPLIERS)

// Applies a { key: value, ... } map (same shape whether it came from
// Supabase rows or an IndexedDB snapshot) to the live exported constants.
// Returns the list of required keys that were NOT present in `map`.
function applyContentMap(map) {
  const foundKeys = new Set()
  for (const key of Object.keys(map)) {
    const apply = APPLIERS[key]
    if (apply && map[key] != null) {
      apply(map[key])
      foundKeys.add(key)
    }
  }
  return REQUIRED_KEYS.filter(k => !foundKeys.has(k))
}

let loadPromise = null
let version = 0
let lastStatus = 'idle' // 'idle' | 'loading' | 'ready' | 'error'
let lastError = null
let lastStale = false // true when the currently-applied data came from the IndexedDB cache, not a fresh fetch
let cacheAppliedAt = null
const listeners = new Set()

function notify() {
  listeners.forEach(fn => fn({ version, status: lastStatus, error: lastError, stale: lastStale, cacheAppliedAt }))
}

export function subscribeLiveContent(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getLiveContentVersion() {
  return version
}

export function getLiveContentStatus() {
  return { status: lastStatus, error: lastError, stale: lastStale, cacheAppliedAt }
}

// Attempts to apply whatever's in the IndexedDB cache right now. Returns
// true if a usable (complete) snapshot was found and applied.
async function tryApplyCache() {
  try {
    const cached = await idbGet(CACHE_KEY)
    if (!cached || !cached.map) return false
    const missing = applyContentMap(cached.map)
    if (missing.length > 0) return false // partial/corrupt cache — don't trust it
    cacheAppliedAt = cached.savedAt || null
    return true
  } catch {
    return false
  }
}

// Fetches live content from Supabase. Call reload() to force a retry after
// a failure — regular calls to loadLiveContent() reuse the in-flight or
// completed promise so multiple mounts don't refetch.
export function loadLiveContent() {
  if (loadPromise) return loadPromise
  lastStatus = 'loading'
  lastError = null
  notify()

  loadPromise = (async () => {
    // Step 1 — apply cache immediately (stale-while-revalidate), so the UI
    // can render right away instead of waiting on the network call below.
    const hadCache = await tryApplyCache()
    if (hadCache) {
      lastStatus = 'ready'
      lastStale = true
      lastError = null
      version += 1
      notify()
    }

    // Step 2 — fetch fresh data in the background.
    const { data, error } = await supabase.from('site_content').select('key, value')

    if (error) {
      if (hadCache) {
        // Keep showing the cached data; just leave `stale: true` in place
        // so the UI can surface a small "offline — showing cached data"
        // indicator instead of the full-page error/retry screen.
        loadPromise = null // allow a manual retry to try the network again
        notify()
        return true
      }
      lastStatus = 'error'
      lastError = error.message || 'Could not reach the database.'
      loadPromise = null
      notify()
      throw error
    }

    const rows = data || []
    const map = {}
    rows.forEach(row => { map[row.key] = row.value })
    const missing = applyContentMap(map)

    if (missing.length > 0) {
      if (hadCache) {
        // Fresh fetch came back incomplete (e.g. a row got deleted by
        // mistake) — safer to keep serving the last complete cached
        // snapshot than to apply a partial one.
        loadPromise = null
        notify()
        return true
      }
      lastStatus = 'error'
      lastError = `Missing content in Supabase: ${missing.join(', ')}. Run the seed SQL in Supabase → SQL Editor.`
      loadPromise = null
      notify()
      throw new Error(lastError)
    }

    lastStatus = 'ready'
    lastStale = false
    lastError = null
    cacheAppliedAt = Date.now()
    version += 1
    notify()

    // Persist the fresh, complete snapshot for next time.
    idbSet(CACHE_KEY, { map, savedAt: cacheAppliedAt }).catch(() => {
      /* non-fatal — worst case, next cold start just has no cache */
    })

    return true
  })()

  return loadPromise
}

// Clears the memoized promise/status so the next loadLiveContent() call
// actually retries against Supabase instead of reusing a failed result.
export function reloadLiveContent() {
  loadPromise = null
  lastStatus = 'idle'
  lastError = null
  return loadLiveContent()
}
