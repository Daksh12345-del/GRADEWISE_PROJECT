// Live-content loader — DB is the only source of truth.
//
// How it works: src/lib/gradesData.js, resourcesData.js, subjectKB.js and
// loginFormData.js export EMPTY constants at build time (no hardcoded
// content in the bundle). On app startup, this module fetches every row
// from the `site_content` table in Supabase and — for each key it
// recognizes — overwrites the *contents* of the matching exported
// array/object in place (same reference, new data), then bumps a version
// counter. Every page reads these constants directly in their render
// bodies, so a single re-render at the app root (see LiveContentGate) is
// enough for the whole app to pick up the fresh data.
//
// There is no bundled fallback. If Supabase is unreachable, or a key's
// row doesn't exist yet, that data stays empty — LiveContentGate is
// responsible for blocking the UI behind a loading/error screen rather
// than letting pages silently render with missing data.
//
// To edit content after deploying: Supabase Dashboard → Table Editor →
// site_content → edit the `value` (jsonb) cell for the relevant key →
// save. No redeploy needed — next page load picks it up.

import { supabase } from './supabase'
import { SEMESTERS } from './gradesData'
import { VIDEO_DATA, PYQ_LINKS, SUBJECT_NOTES } from './resourcesData'
import { SUBJECT_KB } from './subjectKB'
import { COLLEGES_BY_CITY, BRANCHES, DOMAIN_GROUPS } from './loginFormData'

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

let loadPromise = null
let version = 0
let lastStatus = 'idle' // 'idle' | 'loading' | 'ready' | 'error'
let lastError = null
const listeners = new Set()

function notify() {
  listeners.forEach(fn => fn({ version, status: lastStatus, error: lastError }))
}

export function subscribeLiveContent(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getLiveContentVersion() {
  return version
}

export function getLiveContentStatus() {
  return { status: lastStatus, error: lastError }
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
    const { data, error } = await supabase.from('site_content').select('key, value')

    if (error) {
      lastStatus = 'error'
      lastError = error.message || 'Could not reach the database.'
      loadPromise = null // allow retry
      notify()
      throw error
    }

    const rows = data || []
    const foundKeys = new Set()
    for (const row of rows) {
      const apply = APPLIERS[row.key]
      if (apply && row.value != null) {
        apply(row.value)
        foundKeys.add(row.key)
      }
    }

    const missing = REQUIRED_KEYS.filter(k => !foundKeys.has(k))
    if (missing.length > 0) {
      lastStatus = 'error'
      lastError = `Missing content in Supabase: ${missing.join(', ')}. Run the seed SQL in Supabase → SQL Editor.`
      loadPromise = null // allow retry
      notify()
      throw new Error(lastError)
    }

    lastStatus = 'ready'
    lastError = null
    version += 1
    notify()
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
