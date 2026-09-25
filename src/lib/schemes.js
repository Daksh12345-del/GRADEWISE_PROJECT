// Active grading scheme switcher (Supabase-driven, nothing hardcoded per university).
//
// A "scheme" = grading scale + credit/marks rules + semesters for one
// university (table `university_schemes`). After login, SchemeGate calls
// setActiveScheme(university, branch); this module then rewrites, in place,
// the shared GRADING / GRADE_RULES / SEMESTERS / SCHEME_INFO objects that the
// rest of the app already imports — so Grades, Dashboard, Analyser, planner
// and report all see the right university's system without further changes.
//
// AKTU's semesters live in site_content (key SEMESTERS) — that is the "base"
// used whenever a scheme row has semesters = NULL.

import { supabase } from './supabase'
import {
  SEMESTERS, GRADING, GRADE_RULES, DEFAULT_GRADING, DEFAULT_RULES,
  SCHEME_INFO, UNIVERSITY_SCHEMES,
} from './gradesData'
import { UNIVERSITY_DIRECTORY } from './loginFormData'

let baseSemesters = []
let requested = { university: '', branch: '' }
let dataVersion = 0
let appliedSig = null

function replaceArray(target, next) {
  target.length = 0
  next.forEach((x) => target.push(x))
}

function replaceObject(target, next) {
  Object.keys(target).forEach((k) => { delete target[k] })
  Object.assign(target, next)
}

// Resolves to { data, error } — same contract as a supabase-js call.
export async function fetchUniversitySchemes() {
  const { data, error } = await supabase
    .from('university_schemes')
    .select('university_code, label, branches, grading, rules, semesters, is_active')
    .eq('is_active', true)
    .order('id', { ascending: true })
  if (error) return { data: null, error }
  return { data: (data || []).filter((r) => r.is_active !== false), error: null }
}

function pickRow(university, branch) {
  const rows = UNIVERSITY_SCHEMES.filter((r) => r.university_code === university)
  if (rows.length === 0) return { row: null, approximate: false }
  const exact = rows.find((r) => Array.isArray(r.branches) && r.branches.includes(branch))
  if (exact) return { row: exact, approximate: false }
  const generic = rows.find((r) => !r.branches || r.branches.length === 0)
  if (generic) return { row: generic, approximate: false }
  return { row: rows[0], approximate: true } // same university, other branch
}

function mergeRules(overrides) {
  const r = overrides || {}
  return {
    ...DEFAULT_RULES,
    ...r,
    grace: 'grace' in r ? r.grace : DEFAULT_RULES.grace, // explicit null = no grace rule
    marks: { ...DEFAULT_RULES.marks, ...(r.marks || {}) },
    thresholds: { ...DEFAULT_RULES.thresholds, ...(r.thresholds || {}) },
    features: { ...DEFAULT_RULES.features, ...(r.features || {}) },
  }
}

function reapply() {
  const sig = `${requested.university}|${requested.branch}|${dataVersion}`
  if (sig === appliedSig) return currentKey()
  appliedSig = sig

  const { row, approximate } = pickRow(requested.university, requested.branch)

  replaceArray(SEMESTERS, row?.semesters?.length ? row.semesters : baseSemesters)
  replaceArray(GRADING, (row?.grading?.length ? row.grading : DEFAULT_GRADING).map((g) => ({ ...g })))
  replaceObject(GRADE_RULES, mergeRules(row?.rules))

  const uni = UNIVERSITY_DIRECTORY.find((u) => u.code === requested.university)
  replaceObject(SCHEME_INFO, {
    universityCode: requested.university,
    universityName: uni?.name || '',
    label: row?.label || '',
    branch: requested.branch,
    approximate,
    missing: !row && !!requested.university,
  })
  return currentKey()
}

function currentKey() {
  return `${SCHEME_INFO.universityCode || 'default'}:${SCHEME_INFO.label || 'base'}`
}

// ── called by liveContent.js when data (re)loads ─────────────────────────────
export function setBaseSemesters(v) {
  baseSemesters = Array.isArray(v) ? v : []
  dataVersion++
  reapply()
}

export function setSchemeRows(rows) {
  replaceArray(UNIVERSITY_SCHEMES, Array.isArray(rows) ? rows : [])
  dataVersion++
  reapply()
}

// ── called by SchemeGate once the student's profile is known ─────────────────
// Returns a string key that changes whenever a different scheme becomes active.
export function setActiveScheme(university, branch) {
  requested = { university: university || '', branch: branch || '' }
  return reapply()
}

// One-line "how does this university grade?" text for the login/profile forms.
export function getSchemeSummary(universityCode) {
  const row = UNIVERSITY_SCHEMES.find((r) => r.university_code === universityCode)
  return row?.rules?.summary || ''
}
