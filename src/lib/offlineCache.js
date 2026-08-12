// ============================================================
// Minimal IndexedDB key/value cache — no external dependency.
//
// Used by liveContent.js to persist the last-known-good `site_content`
// snapshot (SEMESTERS, VIDEO_DATA, PYQ_LINKS, etc.) so campus/hostel
// Wi-Fi dropping doesn't leave a student staring at a full-page error
// screen. IndexedDB (not localStorage) on purpose: the snapshot includes
// video/notes/resource data which can comfortably exceed the ~5MB
// localStorage ceiling on some browsers, and IndexedDB writes don't
// block the main thread.
// ============================================================

const DB_NAME = 'gradewallah-cache'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    // Old/locked-down browsers, some in-app webviews, or private-mode
    // Safari with storage disabled — degrade to "no cache" rather than throw.
    return Promise.resolve(null)
  }
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null) // caller treats null as "cache unavailable"
  })
  return dbPromise
}

export async function idbGet(key) {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function idbSet(key, value) {
  const db = await openDb()
  if (!db) return false
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}
