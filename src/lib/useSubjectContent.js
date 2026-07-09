import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'

// In-memory cache (per page session) so switching between subjects/units
// doesn't re-query Supabase every time — content is the same for every
// student, so it's safe to cache for the lifetime of the tab.
const resourceCache = new Map() // subject_code -> array of unit rows
const kbCache = new Map()       // subject_code -> kb row

// Subject codes in SEMESTERS can be slash-variants ("BCS502/BCDS501") or
// hyphenated ("BAS-104"). The content tables are keyed by a single
// normalized code, so we try a few variants — same matching strategy the
// original getKB()/getCSVData() used, just against Supabase instead of an
// in-memory object.
function codeCandidates(rawCode) {
  const parts = rawCode.replace(/\*/g, '').split('/').map(c => c.trim()).filter(Boolean)
  const out = new Set()
  parts.forEach(p => {
    out.add(p)
    out.add(p.replace(/-/g, ''))
    out.add(p.replace(/^([A-Z]+)(\d)/, '$1-$2'))
  })
  return Array.from(out)
}

// Fetches all unit resources (videos + notes) for a subject code.
export function useSubjectResources(rawCode) {
  const [data, setData] = useState(() => resourceCache.get(rawCode) || null)
  const [loading, setLoading] = useState(!resourceCache.has(rawCode))
  const fetchedRef = useRef(rawCode)

  useEffect(() => {
    fetchedRef.current = rawCode
    if (!rawCode) { setData(null); setLoading(false); return }
    if (resourceCache.has(rawCode)) {
      setData(resourceCache.get(rawCode))
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    async function load() {
      const candidates = codeCandidates(rawCode)
      let rows = null
      for (const code of candidates) {
        const { data: res, error } = await supabase
          .from('subject_resources')
          .select('*')
          .eq('subject_code', code)
          .order('unit_number', { ascending: true })
        if (!error && res && res.length > 0) { rows = res; break }
      }
      if (cancelled || fetchedRef.current !== rawCode) return
      resourceCache.set(rawCode, rows || [])
      setData(rows || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [rawCode])

  return { units: data || [], loading }
}

// Fetches the analyser knowledge base entry for a subject.
export function useSubjectKB(rawCode) {
  const [data, setData] = useState(() => kbCache.get(rawCode) || null)
  const [loading, setLoading] = useState(!kbCache.has(rawCode))
  const fetchedRef = useRef(rawCode)

  useEffect(() => {
    fetchedRef.current = rawCode
    if (!rawCode) { setData(null); setLoading(false); return }
    if (kbCache.has(rawCode)) {
      setData(kbCache.get(rawCode))
      setLoading(false)
      return
    }
    setLoading(true)
    let cancelled = false
    async function load() {
      const candidates = codeCandidates(rawCode)
      let row = null
      for (const code of candidates) {
        const { data: res, error } = await supabase
          .from('subject_kb')
          .select('*')
          .eq('subject_code', code)
          .maybeSingle()
        if (!error && res) { row = res; break }
      }
      if (cancelled || fetchedRef.current !== rawCode) return
      kbCache.set(rawCode, row)
      setData(row)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [rawCode])

  return { kb: data, loading }
}
