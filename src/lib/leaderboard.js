import { supabase } from './supabase'
import { getClerkUserId } from './clerkUser'

// ── CGPA leaderboard — auto-synced, always-on. Once a user's CGPA is
// computed (semestersDone > 0), their row is upserted automatically; there
// is no opt-in step and no way to remove the row from the UI (by design,
// per product decision — every real result becomes a visible entry).
export async function fetchCgpaLeaderboard() {
  const { data, error } = await supabase
    .from('cgpa_leaderboard_entries')
    .select('user_id, display_name, cgpa, credits_completed, semesters_done, updated_at')
    .order('cgpa', { ascending: false })
    .limit(200)
  if (error) throw error
  return data || []
}

export async function upsertCgpaLeaderboardEntry({ displayName, cgpa, creditsCompleted, semestersDone }) {
  const userId = getClerkUserId()
  if (!userId) return
  const { error } = await supabase.from('cgpa_leaderboard_entries').upsert({
    user_id: userId,
    display_name: (displayName || 'Student').trim().slice(0, 40) || 'Student',
    cgpa: Math.round(cgpa * 100) / 100,
    credits_completed: creditsCompleted,
    semesters_done: semestersDone,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) console.error('Failed to sync CGPA leaderboard entry:', error)
}

// ── DSA leaderboard (same table, two sort orders used by the UI) — also
// auto-synced, same always-on model as above.
export async function fetchDsaLeaderboard(sortBy = 'consistency_score') {
  const col = sortBy === 'total_solved' ? 'total_solved' : 'consistency_score'
  const { data, error } = await supabase
    .from('dsa_leaderboard_entries')
    .select('user_id, display_name, consistency_score, total_solved, best_streak, platforms_linked, updated_at')
    .order(col, { ascending: false })
    .limit(200)
  if (error) throw error
  return data || []
}

export async function upsertDsaLeaderboardEntry({ displayName, consistencyScore, totalSolved, bestStreak, platformsLinked }) {
  const userId = getClerkUserId()
  if (!userId) return
  const { error } = await supabase.from('dsa_leaderboard_entries').upsert({
    user_id: userId,
    display_name: (displayName || 'Student').trim().slice(0, 40) || 'Student',
    consistency_score: Math.round(consistencyScore),
    total_solved: Math.round(totalSolved),
    best_streak: Math.round(bestStreak),
    platforms_linked: Math.round(platformsLinked),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) console.error('Failed to sync DSA leaderboard entry:', error)
}

// Reads back just this student's own already-synced rows — used by the
// "Ask GradeWallah AI" context builder so it can ground answers in real
// DSA numbers without re-fetching all 6 coding platforms from scratch.
// Returns null if the student hasn't fetched any DSA profile yet (their
// leaderboard row won't exist), not a fabricated zero.
export async function fetchMyDsaStats() {
  const userId = getClerkUserId()
  if (!userId) return null
  const { data, error } = await supabase
    .from('dsa_leaderboard_entries')
    .select('total_solved, consistency_score, best_streak, platforms_linked')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('Failed to read own DSA stats:', error); return null }
  return data
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
