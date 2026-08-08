import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { getClerkUserId } from './clerkUser'
import { SEMESTERS } from './gradesData'

const LS_KEY_PREFIX = 'aktu_marks_'

// Scoped per signed-in user so two different students on the same shared
// or lab computer can never read/overwrite each other's cached marks, even
// if one of them closes the tab instead of explicitly logging out. Falls
// back to a generic bucket only in the (practically unreachable, since
// this hook only ever mounts behind an auth-gated route) case where no
// user id is available yet.
function getLsKey() {
  const userId = getClerkUserId()
  return `${LS_KEY_PREFIX}${userId || 'anon'}`
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(getLsKey())
    if (!raw) return { marksData: {}, backData: {}, electiveChoices: {} }
    const parsed = JSON.parse(raw)
    return {
      marksData: parsed.marks || {},
      backData: parsed.back || {},
      electiveChoices: parsed.electives || {},
    }
  } catch {
    return { marksData: {}, backData: {}, electiveChoices: {} }
  }
}

// Fixes a real data-loss bug from the original app: it used to
// `DELETE all rows for this user` then `INSERT fresh rows` to save marks.
// If the network dropped between those two calls, every saved mark for
// that user was gone for good. This uses a single upsert (insert-or-update
// keyed on user_id + subject_code) instead — one atomic call, nothing is
// ever deleted as a side effect of saving.
async function upsertMarksToSupabase(marksData, backData, electiveChoices) {
  const userId = getClerkUserId()
  if (!userId) return

  const rows = []
  SEMESTERS.forEach((sem, si) => {
    sem.subjects.forEach((subj, ji) => {
      const entry = marksData[si]?.[ji]
      const electiveChoice = subj.options ? (electiveChoices[si]?.[ji] || null) : null
      const hasMarks = entry && (entry.internal !== '' || entry.external !== '')
      if (!hasMarks && !electiveChoice) return
      const internal_marks = entry?.internal !== '' && entry?.internal !== undefined ? parseInt(entry.internal, 10) : null
      const external_marks = entry?.external !== '' && entry?.external !== undefined ? parseInt(entry.external, 10) : null
      const total = (internal_marks || 0) + (external_marks || 0)
      const backValue = backData[si]?.[ji] ?? null
      rows.push({
        user_id: userId,
        semester: sem.sem,
        subject_code: subj.code,
        subject_name: subj.name,
        internal_marks,
        external_marks,
        total,
        back_marks: backValue !== '' ? backValue : null,
        elective_choice: electiveChoice,
      })
    })
  })
  if (rows.length === 0) return

  const { error } = await supabase
    .from('marks')
    .upsert(rows, { onConflict: 'user_id,subject_code' })
  if (error) console.error('Supabase upsert error:', error)
}

// Memoized per signed-in user for the browser session. GradesProvider (and
// this hook) remounts FRESH on every route navigation — Dashboard, Grades,
// Analyser, and Resources each wrap their own separate <ContentProtectedRoute>
// in App.jsx, so React unmounts/remounts the whole provider tree on every
// nav. Without this cache, every single navigation re-fetched from Supabase
// from scratch and rendered only the localStorage snapshot in the meantime
// — which is exactly the "Dashboard looks empty/stale on first visit, but
// fine after I go to Grades and come back" bug: Dashboard just happened to
// be whichever page rendered before that page's own fetch resolved.
// Caching the in-flight/completed promise means only the very first mount
// this session actually waits on the network; every page after that reuses
// the already-resolved data immediately, with no flash.
let remoteFetchPromise = null
let remoteFetchUserId = null

// Called after a successful save so the NEXT page navigation's hydration
// fetches fresh (including what was just saved) instead of merging in a
// stale pre-save snapshot from the cache above.
function invalidateMarksCache() {
  remoteFetchPromise = null
}

async function loadMarksFromSupabase() {
  const userId = getClerkUserId()
  if (!userId) return null

  if (remoteFetchUserId !== userId) {
    remoteFetchUserId = userId
    remoteFetchPromise = null
  }
  if (remoteFetchPromise) return remoteFetchPromise

  remoteFetchPromise = (async () => {
    const { data, error } = await supabase.from('marks').select('*').eq('user_id', userId)
    if (error || !data || data.length === 0) return null

  const marksData = {}
  const backData = {}
  const electiveChoices = {}
  data.forEach(row => {
    const si = SEMESTERS.findIndex(s => s.sem === row.semester)
    if (si < 0) return
    const ji = SEMESTERS[si].subjects.findIndex(s => s.code === row.subject_code)
    if (ji < 0) return
    if (!marksData[si]) marksData[si] = {}
    marksData[si][ji] = {
      internal: row.internal_marks !== null ? String(row.internal_marks) : '',
      external: row.external_marks !== null ? String(row.external_marks) : '',
    }
    if (row.back_marks !== null && row.back_marks !== undefined) {
      if (!backData[si]) backData[si] = {}
      backData[si][ji] = String(row.back_marks)
    }
    if (row.elective_choice) {
      if (!electiveChoices[si]) electiveChoices[si] = {}
      electiveChoices[si][ji] = row.elective_choice
    }
  })
  return { marksData, backData, electiveChoices }
  })()

  return remoteFetchPromise
}

// Used by useLogout() — clears only the signed-in user's own cached marks
// (must be called before signOut(), while getClerkUserId() still resolves).
export function clearCurrentUserMarksCache() {
  try {
    localStorage.removeItem(getLsKey())
  } catch {
    // ignore — nothing to clean up if storage is unavailable
  }
}

// Deep-merges Supabase data (the source of truth) over the local cache,
// per semester -> subject, instead of a shallow top-level spread.
//
// Fixes two bugs in the old `{...remote, ...local}` merge:
//   1. Priority was backwards — the local cache always won over Supabase
//      for any overlapping subject, so a stale cache on one device could
//      mask real data saved from another device.
//   2. The merge was too shallow — since it only spread at the semester
//      level, if the local cache had *any* entry for a semester, that
//      entire semester's object from Supabase (every other subject in it)
//      was discarded wholesale, not just the one overlapping subject.
//
// Local entries are still kept for any semester/subject that only exists
// locally (not yet synced to Supabase), so nothing typed before hydration
// finishes gets lost.
function mergeRemoteOverLocal(remote, local) {
  const result = {}
  const semesterKeys = new Set([...Object.keys(remote || {}), ...Object.keys(local || {})])
  semesterKeys.forEach(si => {
    result[si] = { ...(local?.[si] || {}), ...(remote?.[si] || {}) }
  })
  return result
}

// Central hook for marks state — local-first (instant UI), debounced
// background sync to Supabase so typing never feels laggy and a flaky
// connection never loses data.
export function useMarksData() {
  const [marksData, setMarksData] = useState(() => loadFromLocalStorage().marksData)
  const [backData, setBackData] = useState(() => loadFromLocalStorage().backData)
  const [electiveChoices, setElectiveChoices] = useState(() => loadFromLocalStorage().electiveChoices)
  const [syncStatus, setSyncStatus] = useState('idle') // idle | saving | saved | error
  const saveTimer = useRef(null)
  // Every scheduled save is chained onto this promise instead of firing
  // independently, so if the user types again before a save completes, the
  // two upsert calls run one after another (in the order they were
  // scheduled) instead of as two concurrent requests that could resolve
  // out of order and let older data overwrite newer data in Supabase.
  const saveChain = useRef(Promise.resolve())
  // Guards the setSyncStatus calls below so a save that finishes after the
  // component (e.g. the page it lives on) has unmounted doesn't try to
  // update state that's no longer there.
  const isMounted = useRef(true)
  useEffect(() => () => { isMounted.current = false }, [])

  // One-time hydration from Supabase (source of truth) on mount. Supabase
  // data wins per-subject over the local cache; local-only entries not yet
  // synced anywhere are preserved. See mergeRemoteOverLocal() above.
  useEffect(() => {
    let cancelled = false
    loadMarksFromSupabase().then(remote => {
      if (cancelled || !remote) return
      setMarksData(prev => mergeRemoteOverLocal(remote.marksData, prev))
      setBackData(prev => mergeRemoteOverLocal(remote.backData, prev))
      setElectiveChoices(prev => mergeRemoteOverLocal(remote.electiveChoices, prev))
    })
    return () => { cancelled = true }
  }, [])

  const persistLocal = useCallback((nextMarks, nextBack, nextElectives) => {
    try {
      localStorage.setItem(getLsKey(), JSON.stringify({ marks: nextMarks, back: nextBack, electives: nextElectives }))
    } catch (e) {
      console.error('localStorage save failed:', e)
    }
  }, [])

  // Debounced Supabase sync — avoids firing a network call on every keystroke.
  // Deliberately does NOT cancel a pending save on unmount: if the user
  // navigates away mid-typing, we still want that last debounced save to
  // actually reach Supabase instead of silently dropping their edits.
  const scheduleSync = useCallback((nextMarks, nextBack, nextElectives) => {
    setSyncStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveChain.current = saveChain.current
        .catch(() => {}) // a previous save's failure shouldn't block this one
        .then(() => upsertMarksToSupabase(nextMarks, nextBack, nextElectives))
        .then(() => {
          invalidateMarksCache()
          if (isMounted.current) setSyncStatus('saved')
        })
        .catch((e) => {
          console.error('Marks sync failed:', e)
          if (isMounted.current) setSyncStatus('error')
        })
    }, 800)
  }, [])

  const setMarks = useCallback((si, ji, field, value) => {
    setMarksData(prev => {
      const next = {
        ...prev,
        [si]: {
          ...(prev[si] || {}),
          [ji]: { ...(prev[si]?.[ji] || { internal: '', external: '' }), [field]: value },
        },
      }
      persistLocal(next, backData, electiveChoices)
      scheduleSync(next, backData, electiveChoices)
      return next
    })
  }, [backData, electiveChoices, persistLocal, scheduleSync])

  const setBackMark = useCallback((si, ji, value) => {
    setBackData(prev => {
      const next = { ...prev, [si]: { ...(prev[si] || {}), [ji]: value } }
      persistLocal(marksData, next, electiveChoices)
      scheduleSync(marksData, next, electiveChoices)
      return next
    })
  }, [marksData, electiveChoices, persistLocal, scheduleSync])

  const setElective = useCallback((si, ji, value) => {
    setElectiveChoices(prev => {
      const next = { ...prev, [si]: { ...(prev[si] || {}), [ji]: value } }
      persistLocal(marksData, backData, next)
      scheduleSync(marksData, backData, next)
      return next
    })
  }, [marksData, backData, persistLocal, scheduleSync])

  // Bulk replace (used by the PDF scan feature — applies many subjects at once
  // instead of firing one state update + one sync per field).
  const bulkApply = useCallback((nextMarks, nextBack, nextElectives) => {
    setMarksData(nextMarks)
    setBackData(nextBack)
    const electivesToUse = nextElectives !== undefined ? nextElectives : electiveChoices
    if (nextElectives !== undefined) setElectiveChoices(nextElectives)
    persistLocal(nextMarks, nextBack, electivesToUse)
    scheduleSync(nextMarks, nextBack, electivesToUse)
  }, [electiveChoices, persistLocal, scheduleSync])

  return { marksData, backData, electiveChoices, setMarks, setBackMark, setElective, bulkApply, syncStatus }
}
