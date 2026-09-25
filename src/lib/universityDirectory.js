// University -> College -> Branch directory (Supabase-driven, nothing hardcoded).
//
// Tables: universities -> colleges -> college_branches
// Schema/seed: gradewise-backend/supabase_universities_schema.sql / _seed.sql
//
// fetchUniversityDirectory() is called by liveContent.js; the selectors below
// are what the Login page uses to fill its dependent dropdowns.

import { supabase } from './supabase'
import { UNIVERSITY_DIRECTORY } from './loginFormData'

const bySortThenName = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name ?? a.branch).localeCompare(String(b.name ?? b.branch))

// Turns the nested PostgREST response into the compact shape the UI needs.
// Inactive rows are dropped (RLS already hides them; this is a second guard),
// and a college with no active branches is dropped entirely.
function normalize(rows) {
  return (rows || [])
    .filter(u => u.is_active !== false)
    .map(u => ({
      code: u.code,
      name: u.name,
      colleges: (u.colleges || [])
        .filter(c => c.is_active !== false)
        .sort(bySortThenName)
        .map(c => ({
          name: c.name,
          city: c.city || 'Other',
          branches: (c.college_branches || [])
            .filter(b => b.is_active !== false)
            .sort(bySortThenName)
            .map(b => ({ course: b.course, branch: b.branch })),
        }))
        .filter(c => c.branches.length > 0),
    }))
}

// Resolves to { data, error } — same contract as a supabase-js call.
export async function fetchUniversityDirectory() {
  const { data, error } = await supabase
    .from('universities')
    .select(
      'code, name, sort_order, is_active, ' +
      'colleges ( name, city, sort_order, is_active, ' +
      'college_branches ( course, branch, sort_order, is_active ) )'
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return { data: null, error }
  const normalized = normalize((data || []).slice().sort(bySortThenName))
  return { data: normalized, error: null }
}

// ── Selectors (read the live, in-place-updated UNIVERSITY_DIRECTORY) ─────────

function findUniversity(code) {
  return UNIVERSITY_DIRECTORY.find(u => u.code === code)
}

// [{ code, label }] for the University <select>
export function getUniversityOptions() {
  return UNIVERSITY_DIRECTORY.map(u => ({ code: u.code, label: `${u.code} (${u.name})` }))
}

// [{ city, colleges: [name, ...] }] — only colleges that offer `course`
// (if `course` is empty, any course).
export function getCollegesByCity(universityCode, course) {
  const uni = findUniversity(universityCode)
  if (!uni) return []
  const groups = new Map()
  for (const c of uni.colleges) {
    if (course && !c.branches.some(b => b.course === course)) continue
    if (!groups.has(c.city)) groups.set(c.city, [])
    groups.get(c.city).push(c.name)
  }
  return [...groups.entries()].map(([city, colleges]) => ({ city, colleges }))
}

// [branch, ...] offered by one college for `course` (if empty, any course).
export function getBranches(universityCode, collegeName, course) {
  const college = findUniversity(universityCode)?.colleges.find(c => c.name === collegeName)
  if (!college) return []
  return college.branches
    .filter(b => !course || b.course === course)
    .map(b => b.branch)
}
