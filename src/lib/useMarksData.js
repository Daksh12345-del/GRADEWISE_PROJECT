import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { getClerkUserId } from './useAuthUser'
import { SEMESTERS } from './gradesData'

const LS_KEY = 'aktu_marks'

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
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

async function loadMarksFromSupabase() {
  const userId = getClerkUserId()
  if (!userId) return null
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

  // One-time hydration from Supabase (source of truth) on mount, merged
  // over the local cache so a fresh device picks up existing marks.
  useEffect(() => {
    let cancelled = false
    loadMarksFromSupabase().then(remote => {
      if (cancelled || !remote) return
      setMarksData(prev => ({ ...remote.marksData, ...prev }))
      setBackData(prev => ({ ...remote.backData, ...prev }))
      setElectiveChoices(prev => ({ ...remote.electiveChoices, ...prev }))
    })
    return () => { cancelled = true }
  }, [])

  const persistLocal = useCallback((nextMarks, nextBack, nextElectives) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ marks: nextMarks, back: nextBack, electives: nextElectives }))
    } catch (e) {
      console.error('localStorage save failed:', e)
    }
  }, [])

  // Debounced Supabase sync — avoids firing a network call on every keystroke
  const scheduleSync = useCallback((nextMarks, nextBack, nextElectives) => {
    setSyncStatus('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await upsertMarksToSupabase(nextMarks, nextBack, nextElectives)
        setSyncStatus('saved')
      } catch (e) {
        console.error('Marks sync failed:', e)
        setSyncStatus('error')
      }
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
