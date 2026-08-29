// Caches whether the current user has a tutor profile (and its approval
// status) in sessionStorage, so Sidebar — which remounts on every page
// navigation — doesn't hit the backend on every single page load just to
// decide whether to show the "Tutor Dashboard" nav item. Same pattern as
// jobListingsCache.js, just a much shorter TTL since this should reflect
// admin-approval changes reasonably soon.
const TTL_MS = 2 * 60 * 1000 // 2 minutes

function key(userId) {
  return `tutorStatus:${userId}`
}

export function getCachedTutorStatus(userId) {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(key(userId))
    if (!raw) return null
    const { data, savedAt } = JSON.parse(raw)
    if (Date.now() - savedAt > TTL_MS) return null
    return data
  } catch {
    return null
  }
}

export function setCachedTutorStatus(userId, data) {
  if (!userId) return
  try {
    sessionStorage.setItem(key(userId), JSON.stringify({ data, savedAt: Date.now() }))
  } catch {
    // sessionStorage full or unavailable — non-fatal, just skip caching
  }
}
