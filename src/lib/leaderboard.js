import { supabase } from './supabase'
import { getClerkUserId } from './clerkUser'

const OPT_IN_KEY_CGPA = 'gw_leaderboard_opted_in_cgpa'
const OPT_IN_KEY_DSA = 'gw_leaderboard_opted_in_dsa'

export function isOptedIntoCgpaLeaderboard() {
  try { return localStorage.getItem(OPT_IN_KEY_CGPA) === '1' } catch { return false }
}
export function isOptedIntoDsaLeaderboard() {
  try { return localStorage.getItem(OPT_IN_KEY_DSA) === '1' } catch { return false }
}

// ── CGPA leaderboard ───────────────────────────────────────────────────
export async function fetchCgpaLeaderboard() {
  const { data, error } = await supabase
    .from('cgpa_leaderboard_entries')
    .select('user_id, display_name, cgpa, credits_completed, semesters_done, updated_at')
    .order('cgpa', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function upsertCgpaLeaderboardEntry({ displayName, cgpa, creditsCompleted, semestersDone }) {
  const userId = getClerkUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase.from('cgpa_leaderboard_entries').upsert({
    user_id: userId,
    display_name: displayName.trim().slice(0, 40) || 'Anonymous Student',
    cgpa: Math.round(cgpa * 100) / 100,
    credits_completed: creditsCompleted,
    semesters_done: semestersDone,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
  try { localStorage.setItem(OPT_IN_KEY_CGPA, '1') } catch { /* ignore */ }
}

export async function leaveCgpaLeaderboard() {
  const userId = getClerkUserId()
  if (!userId) return
  const { error } = await supabase.from('cgpa_leaderboard_entries').delete().eq('user_id', userId)
  if (error) throw error
  try { localStorage.setItem(OPT_IN_KEY_CGPA, '0') } catch { /* ignore */ }
}

// ── DSA leaderboard (same table, two sort orders used by the UI) ──────
export async function fetchDsaLeaderboard(sortBy = 'consistency_score') {
  const col = sortBy === 'total_solved' ? 'total_solved' : 'consistency_score'
  const { data, error } = await supabase
    .from('dsa_leaderboard_entries')
    .select('user_id, display_name, consistency_score, total_solved, best_streak, platforms_linked, updated_at')
    .order(col, { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function upsertDsaLeaderboardEntry({ displayName, consistencyScore, totalSolved, bestStreak, platformsLinked }) {
  const userId = getClerkUserId()
  if (!userId) throw new Error('Not signed in')
  const { error } = await supabase.from('dsa_leaderboard_entries').upsert({
    user_id: userId,
    display_name: displayName.trim().slice(0, 40) || 'Anonymous Student',
    consistency_score: Math.round(consistencyScore),
    total_solved: Math.round(totalSolved),
    best_streak: Math.round(bestStreak),
    platforms_linked: Math.round(platformsLinked),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
  try { localStorage.setItem(OPT_IN_KEY_DSA, '1') } catch { /* ignore */ }
}

export async function leaveDsaLeaderboard() {
  const userId = getClerkUserId()
  if (!userId) return
  const { error } = await supabase.from('dsa_leaderboard_entries').delete().eq('user_id', userId)
  if (error) throw error
  try { localStorage.setItem(OPT_IN_KEY_DSA, '0') } catch { /* ignore */ }
}

// ── DSA snapshots (private history, not a leaderboard) ─────────────────
export async function saveDsaSnapshot({ totalSolved, bestStreak, consistencyScore }) {
  const userId = getClerkUserId()
  if (!userId) return
  const { error } = await supabase.from('dsa_snapshots').insert({
    user_id: userId,
    total_solved: Math.round(totalSolved),
    best_streak: Math.round(bestStreak),
    consistency_score: Math.round(consistencyScore),
  })
  if (error) console.error('Failed to save DSA snapshot:', error)
}

// Returns the most recent snapshot at least `daysAgo` days old, or null if
// none exists yet (e.g. this is the first-ever fetch). Used to show a real
// "vs N days ago" delta, never an estimated/interpolated one.
export async function fetchDsaSnapshotFromDaysAgo(daysAgo = 7) {
  const userId = getClerkUserId()
  if (!userId) return null
  const cutoff = new Date(Date.now() - daysAgo * 86400000).toISOString()
  const { data, error } = await supabase
    .from('dsa_snapshots')
    .select('total_solved, best_streak, consistency_score, captured_at')
    .eq('user_id', userId)
    .lte('captured_at', cutoff)
    .order('captured_at', { ascending: false })
    .limit(1)
  if (error || !data || data.length === 0) return null
  return data[0]
}
